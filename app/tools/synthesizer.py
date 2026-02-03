import json
import os
import time
import logging
import requests
import traceback
from dotenv import load_dotenv
from app.tools.tool_prompts import ADAPTER_SYNTHESIS_PROMPT, ADAPTER_REPAIR_PROMPT, SCRIPT_GENERATION_PROMPT, TOOL_IMPROVEMENT_PROMPT
from app.tools.tool_models import ToolMetadata, AdapterCode
from typing import Optional, Dict, Any

log = logging.getLogger("tool_synthesizer")

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")


def _strip_markdown_block(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split('\n')
        lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = '\n'.join(lines)
    return text.strip()


async def synthesize_adapter(metadata: ToolMetadata, source_code: str = None) -> AdapterCode:
    """LLM을 사용하여 BOP ↔ Tool 어댑터 코드를 생성합니다."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다.")

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

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.3,
                },
            }

            response = requests.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=60,
            )
            response.raise_for_status()

            result = response.json()
            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            log.info("[synthesize] Gemini 원본 응답 (앞 1000자):\n%s", text[:1000])
            text = _strip_markdown_block(text)

            data = json.loads(text)
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

            return AdapterCode(
                tool_id=metadata.tool_id,
                pre_process_code=data["pre_process_code"],
                post_process_code=data["post_process_code"],
            )

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2
                last_error = f"Rate Limit 초과 (시도 {attempt + 1}/{max_retries})"
                if attempt < max_retries - 1:
                    time.sleep(wait_time)
                continue
            last_error = f"API 호출 실패: {str(e)}"
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            last_error = f"응답 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

        except Exception as e:
            last_error = f"어댑터 생성 실패: {str(e)}"
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

    raise Exception(f"어댑터 코드 생성 실패: {last_error}")


async def repair_adapter(
    failed_function: str,  # "pre_process" or "post_process"
    failed_code: str,
    error_info: Dict[str, Any],
    input_data: str,
) -> Optional[str]:
    """
    실패한 어댑터 코드를 분석하고 수정합니다.

    Args:
        failed_function: 실패한 함수 ("pre_process" or "post_process")
        failed_code: 실패한 코드
        error_info: 에러 정보 (type, message, traceback)
        input_data: 입력 데이터 (JSON 문자열)

    Returns:
        수정된 코드 문자열, 실패 시 None
    """
    if not GEMINI_API_KEY:
        log.error("[repair] GEMINI_API_KEY가 설정되지 않았습니다.")
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

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

    max_retries = 2
    for attempt in range(max_retries):
        try:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.2,  # 낮은 temperature로 일관된 수정
                },
            }

            response = requests.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=60,
            )
            response.raise_for_status()

            result = response.json()
            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            text = _strip_markdown_block(text)

            data = json.loads(text)

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

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2
                log.warning("[repair] Rate Limit - %d초 대기", wait_time)
                time.sleep(wait_time)
                continue
            log.error("[repair] API 호출 실패: %s", str(e))
            return None

        except (json.JSONDecodeError, KeyError) as e:
            log.error("[repair] 응답 파싱 실패: %s", str(e))
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return None

        except Exception as e:
            log.error("[repair] 예외 발생: %s", str(e))
            return None

    return None


async def generate_tool_script(user_description: str) -> Optional[Dict[str, Any]]:
    """
    사용자 설명을 기반으로 Python 도구 스크립트를 생성합니다.

    Args:
        user_description: 사용자가 원하는 도구 기능 설명

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
    if not GEMINI_API_KEY:
        log.error("[generate_script] GEMINI_API_KEY가 설정되지 않았습니다.")
        return None

    prompt = SCRIPT_GENERATION_PROMPT.format(user_description=user_description)

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

    max_retries = 3
    for attempt in range(max_retries):
        try:
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.4,
                },
            }

            response = requests.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=90,  # 스크립트 생성은 시간이 더 걸릴 수 있음
            )
            response.raise_for_status()

            result = response.json()
            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            log.info("[generate_script] Gemini 응답 수신 (길이: %d)", len(text))
            text = _strip_markdown_block(text)

            data = json.loads(text)

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

            log.info("[generate_script] 스크립트 생성 완료: %s", data["tool_name"])
            return data

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2
                log.warning("[generate_script] Rate Limit - %d초 대기", wait_time)
                time.sleep(wait_time)
                continue
            log.error("[generate_script] API 호출 실패: %s", str(e))
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return None

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            log.error("[generate_script] 응답 파싱 실패: %s", str(e))
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return None

        except Exception as e:
            log.error("[generate_script] 예외 발생: %s", str(e))
            return None

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
    if not GEMINI_API_KEY:
        log.error("[improve] GEMINI_API_KEY가 설정되지 않았습니다.")
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

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

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
            log.info("[improve] API 호출 시도 %d/%d", attempt + 1, max_retries)

            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.3,
                },
            }

            response = requests.post(
                url,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=90,
            )

            log.info("[improve] HTTP 응답 코드: %d", response.status_code)
            response.raise_for_status()

            result = response.json()

            # 안전하게 응답 추출
            candidates = result.get("candidates", [])
            if not candidates:
                log.error("[improve] 응답에 candidates가 없습니다: %s", result)
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                return None

            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                log.error("[improve] 응답에 parts가 없습니다: %s", candidates[0])
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                return None

            text = parts[0].get("text", "").strip()
            if not text:
                log.error("[improve] 응답 text가 비어있습니다")
                if attempt < max_retries - 1:
                    time.sleep(1)
                    continue
                return None

            log.info("[improve] Gemini 응답 수신 (길이: %d)", len(text))
            log.info("[improve] 응답 앞 500자:\n%s", text[:500])
            text = _strip_markdown_block(text)

            data = json.loads(text)
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

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2
                log.warning("[improve] Rate Limit - %d초 대기", wait_time)
                time.sleep(wait_time)
                continue
            log.error("[improve] API 호출 실패: %s", str(e))
            log.error("[improve] 응답 내용: %s", e.response.text[:1000] if e.response else "No response")
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return None

        except json.JSONDecodeError as e:
            log.error("[improve] JSON 파싱 실패: %s", str(e))
            log.error("[improve] 원본 텍스트: %s", text[:1000] if 'text' in dir() else "N/A")
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return None

        except (KeyError, ValueError) as e:
            log.error("[improve] 데이터 추출 실패: %s", str(e))
            log.error("[improve] traceback:\n%s", traceback.format_exc())
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return None

        except Exception as e:
            log.error("[improve] 예외 발생: %s", str(e))
            log.error("[improve] traceback:\n%s", traceback.format_exc())
            return None

    log.error("[improve] 모든 재시도 실패")
    return None
