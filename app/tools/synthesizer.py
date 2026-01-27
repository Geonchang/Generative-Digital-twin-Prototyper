import json
import os
import time
import requests
from dotenv import load_dotenv
from app.tools.tool_prompts import ADAPTER_SYNTHESIS_PROMPT
from app.tools.tool_models import ToolMetadata, AdapterCode

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


async def synthesize_adapter(metadata: ToolMetadata) -> AdapterCode:
    """LLM을 사용하여 BOP ↔ Tool 어댑터 코드를 생성합니다."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다.")

    prompt = ADAPTER_SYNTHESIS_PROMPT.format(
        tool_name=metadata.tool_name,
        tool_description=metadata.description,
        input_schema_json=json.dumps(metadata.input_schema.model_dump(), indent=2, ensure_ascii=False),
        output_schema_json=json.dumps(metadata.output_schema.model_dump(), indent=2, ensure_ascii=False),
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
            text = _strip_markdown_block(text)

            data = json.loads(text)

            if "pre_process_code" not in data or "post_process_code" not in data:
                raise ValueError("응답에 pre_process_code 또는 post_process_code가 없습니다.")

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
