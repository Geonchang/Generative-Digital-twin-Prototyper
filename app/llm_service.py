import json
import logging
import os
import requests
import time
from typing import Tuple, Optional
from dotenv import load_dotenv
from app.prompts import SYSTEM_PROMPT, MODIFY_PROMPT_TEMPLATE, UNIFIED_CHAT_PROMPT_TEMPLATE
from app.models import BOPData

# .env 파일 로드
load_dotenv()

# 로거 설정
log = logging.getLogger(__name__)

# Gemini API 키 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY")


def validate_bop_data(bop_data: dict) -> Tuple[bool, str]:
    """
    BOP 데이터의 유효성을 검증합니다.

    Args:
        bop_data: 검증할 BOP 데이터

    Returns:
        Tuple[bool, str]: (검증 성공 여부, 에러 메시지)
    """
    try:
        # Pydantic 모델로 파싱 (기본 필드 검증)
        bop = BOPData(**bop_data)

        # 참조 무결성 검증
        is_valid, error_msg = bop.validate_references()
        if not is_valid:
            return False, error_msg

        # 순환 참조 검증
        is_valid, error_msg = bop.detect_cycles()
        if not is_valid:
            return False, error_msg

        return True, ""

    except Exception as e:
        return False, f"검증 중 오류 발생: {str(e)}"


async def generate_bop_from_text(user_input: str) -> dict:
    """
    사용자 입력을 받아 Gemini API를 통해 BOP JSON을 생성합니다.

    Args:
        user_input: 사용자의 생산 라인 요청 텍스트

    Returns:
        dict: 파싱된 BOP JSON 데이터

    Raises:
        Exception: API 호출 실패 또는 JSON 파싱 실패 시
    """
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_key_here":
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")

    # System prompt + user input 결합
    full_prompt = f"{SYSTEM_PROMPT}\n\nUser request: {user_input}"

    # JSON 파싱 재시도 (최대 3번)
    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            # Gemini API REST 호출
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

            headers = {
                'Content-Type': 'application/json'
            }

            payload = {
                "contents": [{
                    "parts": [{
                        "text": full_prompt
                    }]
                }]
            }

            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()

            result = response.json()
            response_text = result['candidates'][0]['content']['parts'][0]['text'].strip()

            # 마크다운 코드 블록 제거 (```json ... ``` 형태)
            if response_text.startswith("```"):
                lines = response_text.split('\n')
                # 첫 줄과 마지막 줄 제거
                response_text = '\n'.join(lines[1:-1])

            # JSON 파싱
            bop_data = json.loads(response_text)

            # BOP 검증
            is_valid, error_msg = validate_bop_data(bop_data)
            if not is_valid:
                raise ValueError(f"BOP 검증 실패: {error_msg}")

            # processes가 비어있지 않은지 확인
            if len(bop_data["processes"]) == 0:
                raise ValueError("processes는 비어있지 않아야 합니다.")

            return bop_data

        except requests.exceptions.HTTPError as e:
            # Rate Limit 에러 처리
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2  # 2, 4, 8초
                last_error = f"Rate Limit 초과 (시도 {attempt + 1}/{max_retries}). {wait_time}초 대기 후 재시도..."
                log.warning(last_error)
                if attempt < max_retries - 1:
                    time.sleep(wait_time)
                continue
            else:
                last_error = f"API 호출 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
                log.error(last_error)
                if attempt < max_retries - 1:
                    time.sleep(1)
                continue

        except json.JSONDecodeError as e:
            last_error = f"JSON 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error(last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

        except Exception as e:
            last_error = f"BOP 생성 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error(last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

    # 모든 재시도 실패
    raise Exception(f"BOP 생성 실패: {last_error}")


async def modify_bop(current_bop: dict, user_message: str) -> dict:
    """
    현재 BOP와 사용자 수정 요청을 받아 업데이트된 BOP를 생성합니다.

    Args:
        current_bop: 현재 BOP 데이터 (dict)
        user_message: 사용자의 수정 요청 메시지

    Returns:
        dict: 업데이트된 BOP JSON 데이터

    Raises:
        Exception: API 호출 실패 또는 JSON 파싱 실패 시
    """
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_key_here":
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")

    # 현재 BOP를 JSON 문자열로 변환 (들여쓰기 포함)
    current_bop_json = json.dumps(current_bop, indent=2, ensure_ascii=False)

    # 수정 프롬프트 구성
    full_prompt = MODIFY_PROMPT_TEMPLATE.format(
        current_bop_json=current_bop_json,
        user_message=user_message
    )

    # JSON 파싱 재시도 (최대 3번)
    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            # Gemini API REST 호출
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

            headers = {
                'Content-Type': 'application/json'
            }

            payload = {
                "contents": [{
                    "parts": [{
                        "text": full_prompt
                    }]
                }]
            }

            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()

            result = response.json()
            response_text = result['candidates'][0]['content']['parts'][0]['text'].strip()

            # 마크다운 코드 블록 제거 (```json ... ``` 형태)
            if response_text.startswith("```"):
                lines = response_text.split('\n')
                # 첫 줄과 마지막 줄 제거
                response_text = '\n'.join(lines[1:-1])

            # JSON 파싱
            updated_bop = json.loads(response_text)

            # BOP 검증
            is_valid, error_msg = validate_bop_data(updated_bop)
            if not is_valid:
                raise ValueError(f"BOP 검증 실패: {error_msg}")

            return updated_bop

        except requests.exceptions.HTTPError as e:
            # Rate Limit 에러 처리
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2  # 2, 4, 8초
                last_error = f"Rate Limit 초과 (시도 {attempt + 1}/{max_retries}). {wait_time}초 대기 후 재시도..."
                log.warning(last_error)
                if attempt < max_retries - 1:
                    time.sleep(wait_time)
                continue
            else:
                last_error = f"API 호출 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
                log.error(last_error)
                if attempt < max_retries - 1:
                    time.sleep(1)
                continue

        except json.JSONDecodeError as e:
            last_error = f"JSON 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error(last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

        except Exception as e:
            last_error = f"BOP 수정 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error(last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

    # 모든 재시도 실패
    raise Exception(f"BOP 수정 실패: {last_error}")


async def unified_chat(user_message: str, current_bop: dict = None) -> dict:
    """
    통합 채팅 엔드포인트: BOP 생성, 수정, QA를 모두 처리합니다.

    Args:
        user_message: 사용자 메시지
        current_bop: 현재 BOP 데이터 (없으면 None)

    Returns:
        dict: {
            "message": str,  # 사용자에게 보여줄 응답 메시지
            "bop_data": dict  # (선택) BOP가 생성/수정된 경우
        }

    Raises:
        Exception: API 호출 실패 또는 JSON 파싱 실패 시
    """
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_key_here":
        raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")

    # 컨텍스트 구성
    if current_bop:
        current_bop_json = json.dumps(current_bop, indent=2, ensure_ascii=False)
        context = f"Current BOP:\n{current_bop_json}"
    else:
        context = "No current BOP exists yet."

    # 프롬프트 구성
    full_prompt = UNIFIED_CHAT_PROMPT_TEMPLATE.format(
        context=context,
        user_message=user_message
    )

    # JSON 파싱 재시도 (최대 3번)
    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            # Gemini API REST 호출
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

            headers = {
                'Content-Type': 'application/json'
            }

            payload = {
                "contents": [{
                    "parts": [{
                        "text": full_prompt
                    }]
                }]
            }

            response = requests.post(url, headers=headers, json=payload, timeout=60)
            response.raise_for_status()

            result = response.json()
            response_text = result['candidates'][0]['content']['parts'][0]['text'].strip()

            # 마크다운 코드 블록 제거 (```json ... ``` 형태)
            if response_text.startswith("```"):
                lines = response_text.split('\n')
                # 첫 줄과 마지막 줄 제거
                response_text = '\n'.join(lines[1:-1])

            # JSON 파싱
            response_data = json.loads(response_text)

            # 디버깅: 응답 내용 출력
            log.info(f"[unified_chat] LLM Response: {json.dumps(response_data, indent=2, ensure_ascii=False)[:1000]}...")

            # 필수 필드 검증
            if "message" not in response_data:
                raise ValueError("응답에 'message' 필드가 없습니다.")

            # bop_data가 있으면 검증
            if "bop_data" in response_data:
                bop_data = response_data["bop_data"]

                # 공정별 리소스 매핑 상세 로그
                processes = bop_data.get("processes", [])
                log.info(f"[unified_chat] BOP 공정 수: {len(processes)}")
                for proc in processes:
                    proc_id = proc.get("process_id", "unknown")
                    resources = proc.get("resources", [])
                    log.info(f"[unified_chat] {proc_id}: resources={len(resources)}개")

                # BOP 검증
                is_valid, error_msg = validate_bop_data(bop_data)
                if not is_valid:
                    log.error(f"[unified_chat] BOP 검증 실패: {error_msg}")
                    log.error(f"[unified_chat] 받은 BOP 데이터: {json.dumps(bop_data, indent=2, ensure_ascii=False)[:2000]}...")
                    raise ValueError(f"BOP 검증 실패: {error_msg}")

                log.info(f"[unified_chat] BOP 검증 성공")

            return response_data

        except requests.exceptions.HTTPError as e:
            # Rate Limit 에러 처리
            if e.response.status_code == 429:
                wait_time = (2 ** attempt) * 2  # 2, 4, 8초
                last_error = f"Rate Limit 초과 (시도 {attempt + 1}/{max_retries}). {wait_time}초 대기 후 재시도..."
                log.warning(last_error)
                if attempt < max_retries - 1:
                    time.sleep(wait_time)
                continue
            else:
                last_error = f"API 호출 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
                log.error(last_error)
                if attempt < max_retries - 1:
                    time.sleep(1)
                continue

        except json.JSONDecodeError as e:
            last_error = f"JSON 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error(last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

        except Exception as e:
            last_error = f"Unified chat 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            log.error(last_error)
            if attempt < max_retries - 1:
                time.sleep(1)
            continue

    # 모든 재시도 실패
    raise Exception(f"Unified chat 실패: {last_error}")
