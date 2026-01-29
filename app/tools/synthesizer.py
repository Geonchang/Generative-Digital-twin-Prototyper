import json
import os
import time
import logging
import requests
from dotenv import load_dotenv
from app.tools.tool_prompts import ADAPTER_SYNTHESIS_PROMPT
from app.tools.tool_models import ToolMetadata, AdapterCode

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
