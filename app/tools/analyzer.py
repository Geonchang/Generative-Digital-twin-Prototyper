import json
import logging
import os
import re
import time
import requests
from dotenv import load_dotenv
from app.tools.tool_prompts import TOOL_ANALYSIS_PROMPT

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")

log = logging.getLogger("tool_analyzer")


def _mask_api_key(text: str) -> str:
    """에러 메시지에서 API 키를 마스킹합니다."""
    # ?key=xxx 또는 &key=xxx 패턴 마스킹
    return re.sub(r'([?&]key=)[^&\s]+', r'\1***MASKED***', str(text))


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
    log.info("[analyze] 호출됨 — file_name=%s, source_code 길이=%d, sample_input=%s",
             file_name, len(source_code), "있음" if sample_input else "없음")

    if not GEMINI_API_KEY:
        log.error("[analyze] GEMINI_API_KEY가 설정되지 않았습니다")
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다.")

    sample_section = ""
    if sample_input:
        sample_section = f"Sample Input Data:\n```\n{sample_input}\n```"

    prompt = TOOL_ANALYSIS_PROMPT.format(
        source_code=source_code,
        sample_input_section=sample_section,
    )
    log.debug("[analyze] 프롬프트 길이: %d", len(prompt))

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}"

    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        log.info("[analyze] 시도 %d/%d", attempt + 1, max_retries)
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
            log.info("[analyze] Gemini HTTP 응답 status=%d", response.status_code)
            response.raise_for_status()

            result = response.json()
            text = result["candidates"][0]["content"]["parts"][0]["text"].strip()
            log.info("[analyze] Gemini 원본 응답 텍스트 (앞 500자):\n%s", text[:500])
            text = _strip_markdown_block(text)

            data = json.loads(text)

            # Gemini가 배열로 감싸서 반환하는 경우 첫 번째 요소 추출
            if isinstance(data, list):
                log.info("[analyze] 응답이 배열(len=%d) — 첫 번째 요소 추출", len(data))
                if len(data) == 0:
                    raise ValueError("응답 배열이 비어 있습니다.")
                data = data[0]

            log.info("[analyze] 파싱된 JSON 키: %s", list(data.keys()))

            # 필수 필드 검증
            for field in ["tool_name", "description", "input_schema", "output_schema"]:
                if field not in data:
                    log.error("[analyze] 누락 필드: '%s' — 전체 응답 키: %s", field, list(data.keys()))
                    log.error("[analyze] 전체 응답 데이터:\n%s", json.dumps(data, ensure_ascii=False, indent=2)[:2000])
                    raise ValueError(f"응답에 '{field}' 필드가 없습니다.")

            if "execution_type" not in data:
                data["execution_type"] = "python"

            log.info("[analyze] 분석 성공 — tool_name=%s", data.get("tool_name"))
            return data

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2
                last_error = f"Rate Limit 초과 (시도 {attempt + 1}/{max_retries})"
                log.warning("[analyze] %s — %d초 대기", last_error, wait_time)
                if attempt < max_retries - 1:
                    time.sleep(wait_time)
                continue
            last_error = f"API 호출 실패: {_mask_api_key(str(e))}"
            log.error("[analyze] %s", last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

        except (json.JSONDecodeError, KeyError, ValueError) as e:
            last_error = f"응답 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error("[analyze] %s", last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

        except Exception as e:
            last_error = f"분석 실패: {str(e)}"
            log.error("[analyze] %s", last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

    log.error("[analyze] 최종 실패: %s", last_error)
    raise Exception(f"스크립트 분석 실패: {last_error}")
