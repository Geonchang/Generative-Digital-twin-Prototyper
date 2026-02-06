import json
import os
from typing import Tuple, Optional
from dotenv import load_dotenv
from app.prompts import SYSTEM_PROMPT, MODIFY_PROMPT_TEMPLATE, UNIFIED_CHAT_PROMPT_TEMPLATE
from app.models import BOPData
from app.llm import get_provider

# .env 파일 로드
load_dotenv()


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


async def generate_bop_from_text(user_input: str, model: str = None) -> dict:
    """
    사용자 입력을 받아 LLM을 통해 BOP JSON을 생성합니다.

    Args:
        user_input: 사용자의 생산 라인 요청 텍스트
        model: 사용할 모델 (None이면 기본 모델 사용)

    Returns:
        dict: 파싱된 BOP JSON 데이터

    Raises:
        Exception: API 호출 실패 또는 JSON 파싱 실패 시
    """
    # Get default model if not specified
    if not model:
        model = os.getenv("DEFAULT_MODEL", "gemini-2.5-flash")

    # Get provider for the specified model
    provider = get_provider(model)

    # System prompt + user input 결합
    full_prompt = f"{SYSTEM_PROMPT}\n\nUser request: {user_input}"

    # JSON 파싱 재시도 (최대 3번)
    max_retries = 3
    last_error = None

    for attempt in range(max_retries):
        try:
            # LLM API 호출 (provider abstraction 사용)
            bop_data = await provider.generate_json(full_prompt, max_retries=1)

            # BOP 검증
            is_valid, error_msg = validate_bop_data(bop_data)
            if not is_valid:
                raise ValueError(f"BOP 검증 실패: {error_msg}")

            # processes가 비어있지 않은지 확인
            if len(bop_data["processes"]) == 0:
                raise ValueError("processes는 비어있지 않아야 합니다.")

            return bop_data

        except Exception as e:
            last_error = f"BOP 생성 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            if attempt < max_retries - 1:
                continue

    # 모든 재시도 실패
    raise Exception(f"BOP 생성 실패: {last_error}")


async def modify_bop(current_bop: dict, user_message: str, model: str = None) -> dict:
    """
    현재 BOP와 사용자 수정 요청을 받아 업데이트된 BOP를 생성합니다.

    Args:
        current_bop: 현재 BOP 데이터 (dict)
        user_message: 사용자의 수정 요청 메시지
        model: 사용할 모델 (None이면 기본 모델 사용)

    Returns:
        dict: 업데이트된 BOP JSON 데이터

    Raises:
        Exception: API 호출 실패 또는 JSON 파싱 실패 시
    """
    # Get default model if not specified
    if not model:
        model = os.getenv("DEFAULT_MODEL", "gemini-2.5-flash")

    # Get provider for the specified model
    provider = get_provider(model)

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
            # LLM API 호출 (provider abstraction 사용)
            updated_bop = await provider.generate_json(full_prompt, max_retries=1)

            # BOP 검증
            is_valid, error_msg = validate_bop_data(updated_bop)
            if not is_valid:
                raise ValueError(f"BOP 검증 실패: {error_msg}")

            return updated_bop

        except Exception as e:
            last_error = f"BOP 수정 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            if attempt < max_retries - 1:
                continue

    # 모든 재시도 실패
    raise Exception(f"BOP 수정 실패: {last_error}")


async def unified_chat(user_message: str, current_bop: dict = None, model: str = None) -> dict:
    """
    통합 채팅 엔드포인트: BOP 생성, 수정, QA를 모두 처리합니다.

    Args:
        user_message: 사용자 메시지
        current_bop: 현재 BOP 데이터 (없으면 None)
        model: 사용할 모델 (None이면 기본 모델 사용)

    Returns:
        dict: {
            "message": str,  # 사용자에게 보여줄 응답 메시지
            "bop_data": dict  # (선택) BOP가 생성/수정된 경우
        }

    Raises:
        Exception: API 호출 실패 또는 JSON 파싱 실패 시
    """
    # Get default model if not specified
    if not model:
        model = os.getenv("DEFAULT_MODEL", "gemini-2.5-flash")

    # Get provider for the specified model
    provider = get_provider(model)

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
            # LLM API 호출 (provider abstraction 사용)
            response_data = await provider.generate_json(full_prompt, max_retries=1)

            # 디버깅: 응답 내용 출력
            print(f"[DEBUG] LLM Response: {json.dumps(response_data, indent=2, ensure_ascii=False)[:500]}...")

            # 필수 필드 검증
            if "message" not in response_data:
                raise ValueError("응답에 'message' 필드가 없습니다.")

            # bop_data가 있으면 검증
            if "bop_data" in response_data:
                bop_data = response_data["bop_data"]

                # BOP 검증
                is_valid, error_msg = validate_bop_data(bop_data)
                if not is_valid:
                    print(f"[ERROR] BOP 검증 실패: {error_msg}")
                    print(f"[ERROR] 받은 BOP 데이터: {json.dumps(bop_data, indent=2, ensure_ascii=False)[:1000]}...")
                    raise ValueError(f"BOP 검증 실패: {error_msg}")

                print(f"[DEBUG] BOP 검증 성공")

            return response_data

        except Exception as e:
            last_error = f"Unified chat 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            if attempt < max_retries - 1:
                continue

    # 모든 재시도 실패
    raise Exception(f"Unified chat 실패: {last_error}")
