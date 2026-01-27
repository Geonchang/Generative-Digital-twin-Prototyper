import json
import os
import time
import requests
from dotenv import load_dotenv
from app.tools.tool_prompts import TOOL_ANALYSIS_PROMPT

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")


def _strip_markdown_block(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split('\n')
        lines = lines[1:]  # remove opening ```json
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = '\n'.join(lines)
    return text.strip()


async def analyze_script(source_code: str, file_name: str, sample_input: str = None) -> dict:
    """LLM을 사용하여 스크립트의 입출력 스키마를 분석합니다."""
    if not GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다.")

    sample_section = ""
    if sample_input:
        sample_section = f"Sample Input Data:\n```\n{sample_input}\n```"

    prompt = TOOL_ANALYSIS_PROMPT.format(
        source_code=source_code,
        sample_input_section=sample_section,
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

            # 필수 필드 검증
            for field in ["tool_name", "description", "input_schema", "output_schema"]:
                if field not in data:
                    raise ValueError(f"응답에 '{field}' 필드가 없습니다.")

            if "execution_type" not in data:
                data["execution_type"] = "python"

            return data

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
            last_error = f"분석 실패: {str(e)}"
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

    raise Exception(f"스크립트 분석 실패: {last_error}")
