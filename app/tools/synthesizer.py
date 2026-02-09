import json
import os
import logging
import traceback
from dotenv import load_dotenv
from app.tools.tool_prompts import ADAPTER_SYNTHESIS_PROMPT, ADAPTER_REPAIR_PROMPT, SCRIPT_GENERATION_PROMPT, TOOL_IMPROVEMENT_PROMPT
from app.tools.tool_models import ToolMetadata, AdapterCode
from app.llm import get_provider
from typing import Optional, Dict, Any, List

log = logging.getLogger("tool_synthesizer")

load_dotenv()


def _strip_markdown_block(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split('\n')
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = '\n'.join(lines)
    return text.strip()


async def synthesize_adapter(metadata: ToolMetadata, source_code: str = None, model: str = None) -> AdapterCode:
    """LLM을 사용하여 BOP ↔ Tool 어댑터 코드를 생성합니다."""
    import time
    start_time = time.time()

    log.info("=" * 60)
    log.info("[synthesize] === 어댑터 생성 시작 ===")
    log.info("[synthesize] tool_name=%s, source_code=%s",
             metadata.tool_name, f"{len(source_code)} bytes" if source_code else "없음")

    # Get default tool model if not specified
    if not model:
        model = os.getenv("DEFAULT_TOOL_MODEL", "gemini-2.0-flash")

    log.info("[synthesize] model=%s", model)

    # Get provider for the specified model
    provider = get_provider(model)

    if source_code:
        source_code_section = (
            "## Tool Source Code (IMPORTANT — use exact key names from this code)\n"
            "```python\n"
            f"{source_code}\n"
            "```"
        )
    else:
        source_code_section = ""

    # params_schema section for user-provided parameters
    if metadata.params_schema:
        params_list = [p.model_dump() for p in metadata.params_schema]
        params_schema_section = (
            "## User-Provided Parameters (params dict)\n"
            "The following parameters will be provided by the user in the `params` dict:\n"
            f"```json\n{json.dumps(params_list, indent=2, ensure_ascii=False)}\n```\n"
            "Use these values in convert_bop_to_input(bop_json, params) by accessing params.get('key_name', default_value)"
        )
    else:
        params_schema_section = ""

    prompt = ADAPTER_SYNTHESIS_PROMPT.format(
        tool_name=metadata.tool_name,
        tool_description=metadata.description,
        input_schema_json=json.dumps(metadata.input_schema.model_dump(), indent=2, ensure_ascii=False),
        output_schema_json=json.dumps(metadata.output_schema.model_dump(), indent=2, ensure_ascii=False),
        source_code_section=source_code_section,
        params_schema_section=params_schema_section,
    )

    log.info("[synthesize] 프롬프트 준비 완료: %d bytes", len(prompt))

    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        log.info("[synthesize] LLM 호출 시도 %d/%d (model=%s)", attempt + 1, max_retries, model)
        try:
            # LLM API 호출 (provider abstraction 사용)
            data = await provider.generate_json(prompt, max_retries=1)
            import json as json_lib
            response_length = len(json_lib.dumps(data))
            log.info("[synthesize] LLM 응답 수신: %d bytes", response_length)
            log.info("[synthesize] 파싱된 JSON 타입: %s, 키: %s", type(data).__name__, list(data.keys()) if isinstance(data, dict) else "N/A")

            # Gemini가 배열로 감싸서 반환하는 경우 첫 번째 요소 추출
            if isinstance(data, list):
                log.info("[synthesize] 배열 응답 감지 - 첫 번째 요소 추출")
                if len(data) == 0:
                    raise ValueError("응답 배열이 비어 있습니다.")
                data = data[0]

            # Gemini가 "data" 키로 감싸서 반환하는 경우 언래핑
            if isinstance(data, dict) and "data" in data and isinstance(data.get("data"), dict):
                log.info("[synthesize] 'data' 래핑 감지 - 언래핑")
                data = data["data"]

            if "pre_process_code" not in data or "post_process_code" not in data:
                raise ValueError(f"응답에 pre_process_code 또는 post_process_code가 없습니다. 응답 키: {list(data.keys())}")

            elapsed = time.time() - start_time
            log.info("[synthesize] 어댑터 생성 성공 (소요 시간: %.2f초)", elapsed)
            log.info("[synthesize] pre_process_code: %d bytes, post_process_code: %d bytes",
                     len(data["pre_process_code"]), len(data["post_process_code"]))
            log.info("[synthesize] === 생성 완료 ===")
            log.info("=" * 60)

            return AdapterCode(
                tool_id=metadata.tool_id,
                pre_process_code=data["pre_process_code"],
                post_process_code=data["post_process_code"],
            )

        except Exception as e:
            last_error = f"어댑터 생성 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error("[synthesize] %s", last_error)
            if attempt < max_retries - 1:
                continue

    elapsed = time.time() - start_time
    log.error("[synthesize] 최종 실패 (소요 시간: %.2f초)", elapsed)
    log.info("=" * 60)
    raise Exception(f"어댑터 코드 생성 실패: {last_error}")


async def repair_adapter(
    failed_function: str,  # "pre_process" or "post_process"
    failed_code: str,
    error_info: Dict[str, Any],
    input_data: str,
    model: str = None,
) -> Optional[str]:
    """
    실패한 어댑터 코드를 분석하고 수정합니다.

    Args:
        failed_function: 실패한 함수 ("pre_process" or "post_process")
        failed_code: 실패한 코드
        error_info: 에러 정보 (type, message, traceback)
        input_data: 입력 데이터 (JSON 문자열)
        model: 사용할 모델 (None이면 기본 도구 모델 사용)

    Returns:
        수정된 코드 문자열, 실패 시 None
    """
    # Get default tool model if not specified
    if not model:
        model = os.getenv("DEFAULT_TOOL_MODEL", "gemini-2.0-flash")

    try:
        # Get provider for the specified model
        provider = get_provider(model)
    except Exception as e:
        log.error("[repair] Provider 생성 실패: %s", str(e))
        return None

    function_name = "convert_bop_to_input" if failed_function == "pre_process" else "apply_result_to_bop"

    prompt = ADAPTER_REPAIR_PROMPT.format(
        error_type=error_info.get("type", "Unknown"),
        error_message=error_info.get("message", "Unknown error"),
        traceback=error_info.get("traceback", "No traceback available"),
        failed_function=failed_function,
        failed_code=failed_code,
        input_data=input_data[:5000],  # 입력 데이터 크기 제한
        function_name=function_name,
    )

    max_retries = 2
    for attempt in range(max_retries):
        try:
            # LLM API 호출 (provider abstraction 사용)
            try:
                data = await provider.generate_json(prompt, max_retries=1)
            except Exception as json_err:
                # JSON 파싱 실패 시 응답 텍스트에서 직접 추출 시도
                log.warning("[repair] JSON 파싱 실패, 텍스트에서 코드 추출 시도")
                response_text = await provider.generate(prompt, max_retries=1)

                import re
                # fixed_code 필드를 정규식으로 추출
                code_match = re.search(r'"fixed_code":\s*"((?:[^"\\]|\\.)*)"', response_text, re.DOTALL)
                if code_match:
                    fixed_code = code_match.group(1)
                    # 이스케이프 시퀀스 처리
                    fixed_code = fixed_code.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"').replace('\\\\', '\\')
                    log.info("[repair] 정규식으로 코드 추출 성공 (길이: %d)", len(fixed_code))
                    return fixed_code
                else:
                    raise json_err

            if isinstance(data, list) and len(data) > 0:
                data = data[0]

            error_analysis = data.get("error_analysis", "")
            fixed_code = data.get("fixed_code", "")

            if not fixed_code:
                log.warning("[repair] 수정된 코드가 비어 있습니다.")
                return None

            log.info("[repair] 에러 분석: %s", error_analysis)
            log.info("[repair] 코드 수정 완료 (길이: %d)", len(fixed_code))

            return fixed_code

        except Exception as e:
            log.error("[repair] 예외 발생 (시도 %d/%d): %s", attempt + 1, max_retries, str(e))
            if attempt < max_retries - 1:
                continue
            return None

    return None


async def generate_schema_from_description(
    user_description: str,
    model: str = None
) -> Optional[Dict[str, Any]]:
    """
    사용자 설명을 기반으로 입출력 스키마만 생성합니다.

    Args:
        user_description: 사용자가 원하는 도구 기능 설명
        model: 사용할 모델 (None이면 기본 도구 모델 사용)

    Returns:
        생성된 스키마 정보 dict:
        {
            "tool_name": str,
            "description": str,
            "input_schema": dict,
            "output_schema": dict,
            "suggested_params": list
        }
        실패 시 None
    """
    import time
    start_time = time.time()

    log.info("=" * 60)
    log.info("[generate_schema] === 스키마 생성 시작 ===")
    log.info("[generate_schema] model=%s", model or "기본값")

    # Get default tool model if not specified
    if not model:
        model = os.getenv("DEFAULT_TOOL_MODEL", "gemini-2.0-flash")

    try:
        provider = get_provider(model)
    except Exception as e:
        log.error("[generate_schema] Provider 생성 실패: %s", str(e))
        return None

    prompt = f"""You are a BOP (Bill of Process) tool schema designer for a manufacturing digital twin system.

Given the user's description of a tool they want to create, generate ONLY the input/output schemas and parameter definitions.
DO NOT generate actual script code yet.

## User's Tool Description:
{user_description}

## Your Task:
1. **Understand the tool's purpose** - What problem does it solve?
2. **Identify tool type** - Spatial layout? Data analysis? Optimization? Calculation? Validation?
3. **Select relevant data** - Only include BOP fields needed for this specific tool
4. **Design input/output** - Simple, focused schemas that serve the tool's purpose
5. **Define parameters** - User-configurable values (thresholds, options, etc.)

## Available BOP Data Sources (Reference Only - Use What's Needed)

**Processes:**
- process_id, cycle_time_sec, parallel_count
- location {{x, y, z}} (3D position), rotation_y
- predecessor_ids[], successor_ids[]
- resources[] (equipment/worker/material assignments)

**Equipment:**
- equipment_id, name, type (robot|machine|manual_station)

**Workers:**
- worker_id, name, skill_level (Junior|Mid|Senior)

**Materials:**
- material_id, name, unit (ea|kg|m)

**Obstacles:**
- obstacle_id, type (zone|fence|pillar|wall)
- position {{x, y, z}}, size {{width, height, depth}}, rotation_y

**Project:**
- project_title, target_uph

## Tool Type Examples (Choose Relevant Pattern)

### Type 1: Spatial Layout Tools
Purpose: Relocate, arrange, or optimize 3D positions
```json
// ✅ GOOD - Obstacle avoidance
{{
  "example_input": {{
    "processes": [
      {{"process_id": "P001", "location": {{"x": 0, "y": 0, "z": 0}}, "size": {{"width": 2.0, "height": 2.5, "depth": 1.5}}}},
      {{"process_id": "P002", "location": {{"x": 2.5, "y": 0, "z": 0}}, "size": {{"width": 2.0, "height": 2.5, "depth": 1.5}}}}
    ],
    "obstacles": [
      {{"obstacle_id": "OBS001", "type": "zone", "position": {{"x": 2.0, "y": 0, "z": 0}}, "size": {{"width": 3.0, "height": 2.5, "depth": 3.0}}}}
    ],
    "min_clearance": 0.5
  }}
}}

// ❌ BAD - Wrong domain (time instead of space)
{{
  "example_input": {{
    "processes": [{{"process_id": "P001", "start_time": "10:00", "area": [[10,20], [30,20]]}}]
  }}
}}
```

### Type 2: Data Analysis Tools
Purpose: Analyze, calculate statistics, find bottlenecks
```json
// ✅ GOOD - Cycle time bottleneck analysis
{{
  "example_input": {{
    "processes": [
      {{"process_id": "P001", "cycle_time_sec": 45.0, "parallel_count": 2}},
      {{"process_id": "P002", "cycle_time_sec": 120.0, "parallel_count": 1}},
      {{"process_id": "P003", "cycle_time_sec": 30.0, "parallel_count": 3}}
    ],
    "target_uph": 100.0
  }},
  "example_output": {{
    "bottleneck_process_id": "P002",
    "bottleneck_cycle_time": 120.0,
    "required_parallel_count": 4,
    "current_uph": 60.0,
    "improvement_suggestions": ["P002 공정 병렬라인 추가 필요"]
  }}
}}

// ❌ BAD - Vague placeholders
{{
  "example_input": {{
    "data": "process information",
    "parameters": "analysis options"
  }}
}}
```

### Type 3: Resource Optimization Tools
Purpose: Assign workers, equipment, or materials optimally
```json
// ✅ GOOD - Worker assignment by skill
{{
  "example_input": {{
    "processes": [
      {{"process_id": "P001", "required_skill": "Senior", "location": {{"x": 0, "y": 0, "z": 0}}}},
      {{"process_id": "P002", "required_skill": "Mid", "location": {{"x": 5, "y": 0, "z": 0}}}}
    ],
    "available_workers": [
      {{"worker_id": "W001", "skill_level": "Senior", "assigned": false}},
      {{"worker_id": "W002", "skill_level": "Mid", "assigned": false}}
    ],
    "max_travel_distance": 10.0
  }},
  "example_output": {{
    "assignments": [
      {{"process_id": "P001", "worker_id": "W001", "distance": 0}},
      {{"process_id": "P002", "worker_id": "W002", "distance": 5.0}}
    ]
  }}
}}
```

### Type 4: Calculation/Aggregation Tools
Purpose: Calculate totals, counts, sums, averages
```json
// ✅ GOOD - Material usage calculation
{{
  "example_input": {{
    "processes": [
      {{"process_id": "P001", "materials": [{{"material_id": "M-001", "quantity_per_unit": 2.5}}]}},
      {{"process_id": "P002", "materials": [{{"material_id": "M-001", "quantity_per_unit": 1.0}}]}}
    ],
    "materials_list": [
      {{"material_id": "M-001", "name": "강판", "unit": "kg"}}
    ],
    "production_volume": 1000
  }},
  "example_output": {{
    "material_requirements": [
      {{"material_id": "M-001", "total_quantity": 3500.0, "unit": "kg"}}
    ]
  }}
}}
```

### Type 5: Validation/Check Tools
Purpose: Detect errors, conflicts, invalid configurations
```json
// ✅ GOOD - Process sequence validation
{{
  "example_input": {{
    "processes": [
      {{"process_id": "P001", "predecessor_ids": [], "successor_ids": ["P002"]}},
      {{"process_id": "P002", "predecessor_ids": ["P001"], "successor_ids": ["P003"]}},
      {{"process_id": "P003", "predecessor_ids": ["P002"], "successor_ids": ["P001"]}}
    ]
  }},
  "example_output": {{
    "has_errors": true,
    "errors": [
      {{"type": "circular_dependency", "process_ids": ["P001", "P002", "P003"]}}
    ]
  }}
}}
```

## CRITICAL Rules for Examples

### ❌ NEVER Use These:
- Generic placeholders: "value", "example", "data", "string", "array"
- Wrong domain: start_time, end_time, schedule, duration (unless explicitly time-based tool)
- Wrong field names: pos (use position/location), id (use specific_id), area (use location+size)
- Vague structures: "array of items", "list of data"

### ✅ ALWAYS Use These:
- **Concrete values**: 2.5, 120.0, "P001", "Senior", "robot"
- **Exact field names**: process_id, location, position, cycle_time_sec, skill_level
- **Realistic ranges**: distances (0.5-50m), times (10-300s), counts (1-10)
- **Minimal data**: Only fields needed for THIS tool's purpose
- **Korean labels**: "최소 간격 (m)", "목표 UPH", "스킬 레벨"

## Output Format (JSON):
```json
{{
  "tool_name": "descriptive_tool_name",
  "description": "Clear description of what the tool does",
  "input_schema": {{
    "type": "json" | "dict",
    "description": "What data the tool receives",
    "structure": {{ /* nested structure */ }} OR "fields": [ /* field list */ ]
  }},
  "output_schema": {{
    "type": "json" | "dict",
    "description": "What data the tool returns",
    "structure": {{ /* nested structure */ }} OR "return_format": {{ /* format */ }}
  }},
  "suggested_params": [
    {{"key": "param_name", "label": "한글 라벨", "type": "number"|"text", "required": true|false, "default": value, "description": "설명"}}
  ],
  "example_input": {{ /* CONCRETE example matching input_schema */ }},
  "example_output": {{ /* CONCRETE example matching output_schema */ }}
}}
```

**Remember:**
- Understand the tool's PURPOSE first
- Select ONLY the BOP fields needed
- Provide CONCRETE, REALISTIC examples
- NEVER use "args_format" field

Return ONLY the JSON object, no markdown code blocks.
"""

    log.info("[generate_schema] 프롬프트 준비 완료: %d bytes", len(prompt))

    max_retries = 3
    for attempt in range(max_retries):
        log.info("[generate_schema] LLM 호출 시도 %d/%d (model=%s)", attempt + 1, max_retries, model)
        try:
            data = await provider.generate_json(prompt, max_retries=1)
            import json as json_lib
            response_length = len(json_lib.dumps(data))
            log.info("[generate_schema] LLM 응답 수신: %d bytes", response_length)

            # 배열로 감싸진 경우 처리
            if isinstance(data, list) and len(data) > 0:
                data = data[0]

            # 필수 필드 검증
            required_fields = ["tool_name", "description", "input_schema", "output_schema"]
            for field in required_fields:
                if field not in data:
                    raise ValueError(f"응답에 {field}가 없습니다. 응답 키: {list(data.keys())}")

            # 기본값 설정
            if "suggested_params" not in data:
                data["suggested_params"] = []

            elapsed = time.time() - start_time
            log.info("[generate_schema] 스키마 생성 완료: %s (소요 시간: %.2f초)", data["tool_name"], elapsed)
            log.info("[generate_schema] input_type=%s, output_type=%s, params=%d개",
                     data["input_schema"].get("type"),
                     data["output_schema"].get("type"),
                     len(data.get("suggested_params", [])))
            log.info("[generate_schema] === 생성 완료 ===")
            log.info("=" * 60)
            return data

        except Exception as e:
            log.error("[generate_schema] 예외 발생 (시도 %d/%d): %s", attempt + 1, max_retries, str(e))
            if attempt < max_retries - 1:
                continue
            elapsed = time.time() - start_time
            log.error("[generate_schema] 최종 실패 (소요 시간: %.2f초)", elapsed)
            log.info("=" * 60)
            return None

    elapsed = time.time() - start_time
    log.error("[generate_schema] 모든 시도 실패 (소요 시간: %.2f초)", elapsed)
    log.info("=" * 60)
    return None


async def generate_tool_script(
    user_description: str,
    model: str = None,
    input_schema: Optional[Dict[str, Any]] = None,
    output_schema: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """
    사용자 설명을 기반으로 Python 도구 스크립트를 생성합니다.

    Args:
        user_description: 사용자가 원하는 도구 기능 설명
        model: 사용할 모델 (None이면 기본 도구 모델 사용)
        input_schema: 입력 스키마 (스키마 우선 방식)
        output_schema: 출력 스키마 (스키마 우선 방식)

    Returns:
        생성된 스크립트 정보 dict:
        {
            "tool_name": str,
            "description": str,
            "script_code": str,
            "suggested_params": list
        }
        실패 시 None
    """
    import time
    start_time = time.time()

    log.info("=" * 60)
    log.info("[generate_script] === 스크립트 생성 시작 ===")
    log.info("[generate_script] model=%s, 스키마 제공=%s",
             model or "기본값", "있음" if (input_schema and output_schema) else "없음")

    # Get default tool model if not specified
    if not model:
        model = os.getenv("DEFAULT_TOOL_MODEL", "gemini-2.0-flash")

    try:
        # Get provider for the specified model
        provider = get_provider(model)
    except Exception as e:
        log.error("[generate_script] Provider 생성 실패: %s", str(e))
        return None

    # 스키마 섹션 생성
    if input_schema and output_schema:
        import json as json_lib
        schema_section = f"""## Required Input/Output Schema (IMPORTANT - Follow Exactly)

**Input Schema:**
```json
{json_lib.dumps(input_schema, indent=2, ensure_ascii=False)}
```

**Output Schema:**
```json
{json_lib.dumps(output_schema, indent=2, ensure_ascii=False)}
```

**CRITICAL:** Your script MUST accept input matching the Input Schema exactly and produce output matching the Output Schema exactly.
The adapter will convert BOP data to this input format, and convert your output back to BOP format.
DO NOT expect BOP structure directly - work ONLY with the schemas above.
"""
    else:
        schema_section = ""

    prompt = SCRIPT_GENERATION_PROMPT.format(
        user_description=user_description,
        input_output_schema_section=schema_section
    )
    log.info("[generate_script] 프롬프트 준비 완료: %d bytes", len(prompt))

    max_retries = 3
    for attempt in range(max_retries):
        log.info("[generate_script] LLM 호출 시도 %d/%d (model=%s)", attempt + 1, max_retries, model)
        try:
            # LLM API 호출 (provider abstraction 사용)
            data = await provider.generate_json(prompt, max_retries=1)
            import json as json_lib
            response_length = len(json_lib.dumps(data))
            log.info("[generate_script] LLM 응답 수신: %d bytes", response_length)

            # 배열로 감싸진 경우 처리
            if isinstance(data, list) and len(data) > 0:
                data = data[0]

            # 필수 필드 검증
            if "script_code" not in data:
                raise ValueError("응답에 script_code가 없습니다.")

            # 기본값 설정
            if "tool_name" not in data:
                data["tool_name"] = "generated_tool"
            if "description" not in data:
                data["description"] = "AI 생성 도구"
            if "suggested_params" not in data:
                data["suggested_params"] = []

            elapsed = time.time() - start_time
            log.info("[generate_script] 스크립트 생성 완료: %s (소요 시간: %.2f초)", data["tool_name"], elapsed)
            log.info("[generate_script] script_code: %d bytes, params: %d개",
                     len(data.get("script_code", "")), len(data.get("suggested_params", [])))
            log.info("[generate_script] === 생성 완료 ===")
            log.info("=" * 60)
            return data

        except Exception as e:
            log.error("[generate_script] 예외 발생 (시도 %d/%d): %s", attempt + 1, max_retries, str(e))
            if attempt < max_retries - 1:
                continue
            elapsed = time.time() - start_time
            log.error("[generate_script] 최종 실패 (소요 시간: %.2f초)", elapsed)
            log.info("=" * 60)
            return None

    elapsed = time.time() - start_time
    log.error("[generate_script] 모든 시도 실패 (소요 시간: %.2f초)", elapsed)
    log.info("=" * 60)
    return None


async def improve_tool(
    tool_name: str,
    tool_description: str,
    pre_process_code: str,
    post_process_code: str,
    script_code: Optional[str],
    params_schema: list,
    user_feedback: str,
    execution_context: Dict[str, Any],
    modify_adapter: bool = True,
    modify_params: bool = True,
    modify_script: bool = False,
    model: str = None,
) -> Optional[Dict[str, Any]]:
    """
    사용자 피드백을 기반으로 도구를 개선합니다.

    Returns:
        {
            "explanation": str,
            "changes_summary": list,
            "pre_process_code": str or None,
            "post_process_code": str or None,
            "params_schema": list or None,
            "script_code": str or None
        }
        실패 시 None
    """
    # Get default tool model if not specified
    if not model:
        model = os.getenv("DEFAULT_TOOL_MODEL", "gemini-2.0-flash")

    try:
        # Get provider for the specified model
        provider = get_provider(model)
    except Exception as e:
        log.error("[improve] Provider 생성 실패: %s", str(e))
        return None

    # 현재 코드 섹션 구성
    current_code_parts = []
    if modify_adapter:
        current_code_parts.append(f"### Pre-process Code (convert_bop_to_input)\n```python\n{pre_process_code}\n```")
        current_code_parts.append(f"### Post-process Code (apply_result_to_bop)\n```python\n{post_process_code}\n```")
    if modify_script and script_code:
        current_code_parts.append(f"### Script Code\n```python\n{script_code}\n```")

    current_code_section = "\n\n".join(current_code_parts) if current_code_parts else "(No code in scope)"

    # None 값 안전하게 처리
    stdout_val = execution_context.get("stdout") or ""
    stderr_val = execution_context.get("stderr") or ""
    tool_output_val = execution_context.get("tool_output") or ""

    prompt = TOOL_IMPROVEMENT_PROMPT.format(
        tool_name=tool_name,
        tool_description=tool_description,
        current_code_section=current_code_section,
        params_schema_json=json.dumps(params_schema, indent=2, ensure_ascii=False) if params_schema else "[]",
        execution_success=execution_context.get("success", False),
        stdout=stdout_val[:2000] if stdout_val else "(empty)",
        stderr=stderr_val[:2000] if stderr_val else "(empty)",
        tool_output=tool_output_val[:2000] if tool_output_val else "(empty)",
        user_feedback=user_feedback,
        modify_adapter="Yes" if modify_adapter else "No",
        modify_params="Yes" if modify_params else "No",
        modify_script="Yes" if modify_script else "No",
    )

    log.info("=" * 60)
    log.info("[improve] === AI 개선 요청 시작 ===")
    log.info("[improve] tool_name=%s", tool_name)
    log.info("[improve] user_feedback=%s", user_feedback)
    log.info("[improve] modify_adapter=%s, modify_params=%s, modify_script=%s",
             modify_adapter, modify_params, modify_script)
    log.info("[improve] execution_context.success=%s", execution_context.get("success"))

    max_retries = 3
    for attempt in range(max_retries):
        try:
            log.info("[improve] LLM 호출 시도 %d/%d", attempt + 1, max_retries)

            # LLM API 호출 (provider abstraction 사용)
            # Note: improve_tool은 일반 텍스트로 응답을 받아서 파싱하므로 generate 사용
            response_text = await provider.generate(prompt, max_retries=1)

            log.info("[improve] LLM 응답 수신 (길이: %d)", len(response_text))

            # 마크다운 코드 블록 제거 후 JSON 파싱
            text = _strip_markdown_block(response_text)

            # JSON 파싱 시도
            try:
                data = json.loads(text)
            except json.JSONDecodeError as json_err:
                # 코드 필드의 이스케이프 문제 해결 시도
                log.warning("[improve] 표준 JSON 파싱 실패, 코드 필드 추출 시도")
                import re

                # 모든 코드 필드를 추출하고 플레이스홀더로 대체
                code_fields = {}
                modified_text = text

                for field_name in ['pre_process_code', 'post_process_code', 'script_code']:
                    # 필드 값을 추출 (간단한 방식)
                    try:
                        # "field_name": " 로 시작하는 부분 찾기
                        field_start = modified_text.find(f'"{field_name}": "')
                        if field_start == -1:
                            continue

                        # 시작 위치 이동 (": " 다음)
                        value_start = field_start + len(f'"{field_name}": "')

                        # 닫는 따옴표 찾기 (이스케이프된 따옴표는 무시)
                        i = value_start
                        code_value = ""
                        while i < len(modified_text):
                            if modified_text[i] == '\\' and i + 1 < len(modified_text):
                                # 이스케이프 시퀀스
                                code_value += modified_text[i:i+2]
                                i += 2
                            elif modified_text[i] == '"':
                                # 닫는 따옴표 발견
                                break
                            else:
                                code_value += modified_text[i]
                                i += 1

                        if i < len(modified_text):
                            code_fields[field_name] = code_value
                            # 플레이스홀더로 대체
                            before = modified_text[:field_start]
                            after = modified_text[i+1:]
                            modified_text = before + f'"{field_name}": "PLACEHOLDER_{field_name}"' + after
                    except Exception as e:
                        log.warning(f"[improve] {field_name} 추출 실패: {e}")
                        continue

                try:
                    # 플레이스홀더로 대체된 JSON 파싱
                    data = json.loads(modified_text)
                    # 코드 필드 복원 (이스케이프 해제)
                    for field_name, code_value in code_fields.items():
                        if field_name in data:
                            # 이스케이프 시퀀스 처리
                            try:
                                data[field_name] = code_value.encode('utf-8').decode('unicode_escape')
                            except:
                                # 이스케이프 실패 시 원본 사용
                                data[field_name] = code_value.replace('\\n', '\n').replace('\\t', '\t').replace('\\"', '"')
                    log.info("[improve] 코드 필드 수동 추출 및 복원 성공")
                except Exception as e2:
                    log.error("[improve] 코드 필드 추출 방법도 실패: %s", str(e2))
                    raise json_err
            log.info("[improve] JSON 파싱 성공, 키: %s", list(data.keys()) if isinstance(data, dict) else "list")

            if isinstance(data, list) and len(data) > 0:
                data = data[0]

            # 필수 필드 검증
            if "explanation" not in data:
                data["explanation"] = "개선이 적용되었습니다."
            if "changes_summary" not in data:
                data["changes_summary"] = []

            log.info("[improve] === 개선 완료 ===")
            log.info("[improve] 변경사항: %s", data.get("changes_summary", []))
            log.info("=" * 60)
            return data

        except json.JSONDecodeError as e:
            log.error("[improve] JSON 파싱 실패 (시도 %d/%d): %s", attempt + 1, max_retries, str(e))
            if attempt < max_retries - 1:
                continue
            return None

        except Exception as e:
            log.error("[improve] 예외 발생 (시도 %d/%d): %s", attempt + 1, max_retries, str(e))
            log.error("[improve] traceback:\n%s", traceback.format_exc())
            if attempt < max_retries - 1:
                continue
            return None

    log.error("[improve] 모든 재시도 실패")
    return None


async def improve_schema_from_feedback(
    tool_name: str,
    description: str,
    current_input_schema: dict,
    current_output_schema: dict,
    current_params: Optional[List[dict]],
    user_feedback: str,
    model: str = None
) -> Optional[Dict[str, Any]]:
    """
    사용자 피드백을 기반으로 스키마를 개선합니다.

    Args:
        tool_name: 도구명
        description: 도구 설명
        current_input_schema: 현재 입력 스키마
        current_output_schema: 현재 출력 스키마
        current_params: 현재 파라미터
        user_feedback: 사용자 개선 요청
        model: 사용할 모델

    Returns:
        개선된 스키마 정보 dict 또는 None
    """
    import time
    start_time = time.time()

    log.info("=" * 60)
    log.info("[improve_schema] === 스키마 개선 시작 ===")
    log.info("[improve_schema] tool_name=%s", tool_name)
    log.info("[improve_schema] user_feedback=%s", user_feedback)

    if not model:
        model = os.getenv("DEFAULT_TOOL_MODEL", "gemini-2.0-flash")

    try:
        provider = get_provider(model)
    except Exception as e:
        log.error("[improve_schema] Provider 생성 실패: %s", str(e))
        return None

    import json as json_lib
    
    prompt = f"""You are improving a BOP tool schema based on user feedback.

## Current Tool Information:
- Tool Name: {tool_name}
- Description: {description}

## Current Schemas:
Input Schema:
```json
{json_lib.dumps(current_input_schema, indent=2, ensure_ascii=False)}
```

Output Schema:
```json
{json_lib.dumps(current_output_schema, indent=2, ensure_ascii=False)}
```

Parameters:
```json
{json_lib.dumps(current_params or [], indent=2, ensure_ascii=False)}
```

## User's Improvement Request:
{user_feedback}

## Your Task:
Improve the schemas based on the user's feedback. Return the improved schemas in the same format as the original.

## Response Format (JSON only):
{{
  "input_schema": {{
    "type": "json" | "dict" | "list" | "string",
    "description": "What data the tool receives",
    "structure": {{ /* ONLY for json/dict types: nested structure as dict */ }},
    "fields": [ /* ONLY for simple dicts: array of STRING field names like ["field1", "field2"] */ ]
  }},
  "output_schema": {{
    "type": "json" | "dict" | "list" | "string",
    "description": "What data the tool returns",
    "structure": {{ /* ONLY for json/dict types: nested structure as dict */ }},
    "return_format": {{ /* Alternative to structure: describe format as dict */ }}
  }},
  "suggested_params": [
    {{
      "key": "param_name",
      "label": "User-friendly label",
      "type": "string" | "number" | "boolean",
      "required": true | false,
      "default": null | <value>,
      "description": "What this parameter controls"
    }}
  ],
  "example_input": {{
    /* Concrete, realistic example of input data that matches input_schema */
    /* Use actual values, not placeholders like "value" or "example" */
  }},
  "example_output": {{
    /* Concrete, realistic example of output data that matches output_schema */
    /* Use actual values that users can immediately understand */
  }},
  "changes_summary": [
    "변경 사항 1 (한국어로 작성)",
    "변경 사항 2 (한국어로 작성)"
  ]
}}

## CRITICAL Rules:
- **NEVER use "args_format" field** - it's only for command-line tools
- For json/dict types: use "structure" (nested dict) or "fields" (flat string array)
- **IMPORTANT**: "fields" must be an array of STRINGS, NOT objects/dicts
  - WRONG: "fields": [{{"name": "x", "type": "number"}}] ❌
  - CORRECT: "fields": ["x", "y", "z"] ✅
- "structure" is for nested objects, use dict format
  - Example: "structure": {{"position": {{"x": "number", "y": "number"}}}}
- Provide concrete, realistic examples (not placeholders)
- List all changes in changes_summary (in Korean)
- Only modify what the user requested - keep other parts unchanged

Return ONLY the JSON object, no markdown or code blocks.
"""

    log.info("[improve_schema] 프롬프트 준비 완료: %d bytes", len(prompt))

    max_retries = 3
    for attempt in range(max_retries):
        log.info("[improve_schema] LLM 호출 시도 %d/%d", attempt + 1, max_retries)
        try:
            data = await provider.generate_json(prompt, max_retries=1)
            log.info("[improve_schema] LLM 응답 수신")

            if isinstance(data, list) and len(data) > 0:
                data = data[0]

            # 필수 필드 검증
            required_fields = ["input_schema", "output_schema", "changes_summary"]
            for field in required_fields:
                if field not in data:
                    log.warning("[improve_schema] 필수 필드 누락: %s", field)
                    if field == "changes_summary":
                        data[field] = ["스키마가 개선되었습니다."]

            # tool_name과 description 추가 (endpoint에서 필요)
            data["tool_name"] = tool_name
            data["description"] = description

            elapsed = time.time() - start_time
            log.info("[improve_schema] === 스키마 개선 완료 ===")
            log.info("[improve_schema] 소요 시간: %.2f초", elapsed)
            log.info("[improve_schema] 변경 사항: %s", data.get("changes_summary", []))
            log.info("=" * 60)
            return data

        except Exception as e:
            log.error("[improve_schema] 예외 발생 (시도 %d/%d): %s", attempt + 1, max_retries, str(e))
            if attempt < max_retries - 1:
                continue
            return None

    log.error("[improve_schema] 모든 재시도 실패")
    return None
