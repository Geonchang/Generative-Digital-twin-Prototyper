import json
import os
import requests
from dotenv import load_dotenv
from app.prompts import SYSTEM_PROMPT, MODIFY_PROMPT_TEMPLATE, UNIFIED_CHAT_PROMPT_TEMPLATE

# .env 파일 로드
load_dotenv()

# Gemini API 키 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


def validate_hierarchical_bop(bop_data: dict) -> tuple[bool, str]:
    """
    계층적 BOP 데이터의 유효성을 검증합니다.

    Args:
        bop_data: 검증할 BOP 데이터

    Returns:
        tuple[bool, str]: (검증 성공 여부, 에러 메시지)
    """
    try:
        # 필수 필드 검증
        required_fields = ["project_title", "target_uph", "processes", "equipments", "workers"]
        for field in required_fields:
            if field not in bop_data:
                return False, f"필수 필드 '{field}'가 누락되었습니다."

        # processes는 리스트여야 함
        if not isinstance(bop_data["processes"], list):
            return False, "processes는 리스트여야 합니다."

        # equipments와 workers는 리스트여야 함
        if not isinstance(bop_data["equipments"], list):
            return False, "equipments는 리스트여야 합니다."

        if not isinstance(bop_data["workers"], list):
            return False, "workers는 리스트여야 합니다."

        # Equipment IDs 수집
        equipment_ids = set()
        for eq in bop_data["equipments"]:
            if "equipment_id" not in eq:
                return False, "Equipment에 equipment_id 필드가 없습니다."
            equipment_ids.add(eq["equipment_id"])

        # Worker IDs 수집
        worker_ids = set()
        for worker in bop_data["workers"]:
            if "worker_id" not in worker:
                return False, "Worker에 worker_id 필드가 없습니다."
            worker_ids.add(worker["worker_id"])

        # Process ID와 Operation ID 중복 체크
        process_ids = set()
        operation_ids = set()

        for process in bop_data["processes"]:
            # Process 필수 필드
            if "process_id" not in process:
                return False, "Process에 process_id 필드가 없습니다."

            if "operations" not in process:
                return False, f"Process {process['process_id']}에 operations 필드가 없습니다."

            # Process ID 중복 체크
            if process["process_id"] in process_ids:
                return False, f"중복된 process_id: {process['process_id']}"
            process_ids.add(process["process_id"])

            # Operations 검증
            if not isinstance(process["operations"], list):
                return False, f"Process {process['process_id']}의 operations는 리스트여야 합니다."

            for operation in process["operations"]:
                # Operation 필수 필드
                if "operation_id" not in operation:
                    return False, f"Process {process['process_id']}의 Operation에 operation_id가 없습니다."

                # Operation ID 중복 체크
                if operation["operation_id"] in operation_ids:
                    return False, f"중복된 operation_id: {operation['operation_id']}"
                operation_ids.add(operation["operation_id"])

                # Equipment 참조 무결성 검증
                if "equipment_id" in operation and operation["equipment_id"] is not None:
                    if operation["equipment_id"] not in equipment_ids:
                        return False, f"Operation {operation['operation_id']}이 참조하는 equipment_id '{operation['equipment_id']}'가 equipments 목록에 없습니다."

                # Worker 참조 무결성 검증
                if "worker_ids" in operation and operation["worker_ids"]:
                    for worker_id in operation["worker_ids"]:
                        if worker_id not in worker_ids:
                            return False, f"Operation {operation['operation_id']}이 참조하는 worker_id '{worker_id}'가 workers 목록에 없습니다."

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

            # 계층적 BOP 검증
            is_valid, error_msg = validate_hierarchical_bop(bop_data)
            if not is_valid:
                raise ValueError(f"BOP 검증 실패: {error_msg}")

            # processes가 비어있지 않은지 확인
            if len(bop_data["processes"]) == 0:
                raise ValueError("processes는 비어있지 않아야 합니다.")

            return bop_data

        except json.JSONDecodeError as e:
            last_error = f"JSON 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            # 재시도
            continue

        except Exception as e:
            last_error = f"BOP 생성 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            # 재시도
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

            # 계층적 BOP 검증
            is_valid, error_msg = validate_hierarchical_bop(updated_bop)
            if not is_valid:
                raise ValueError(f"BOP 검증 실패: {error_msg}")

            return updated_bop

        except json.JSONDecodeError as e:
            last_error = f"JSON 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            # 재시도
            continue

        except Exception as e:
            last_error = f"BOP 수정 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            # 재시도
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
            print(f"[DEBUG] LLM Response: {json.dumps(response_data, indent=2, ensure_ascii=False)[:500]}...")

            # 필수 필드 검증
            if "message" not in response_data:
                raise ValueError("응답에 'message' 필드가 없습니다.")

            # bop_data가 있으면 검증
            if "bop_data" in response_data:
                bop_data = response_data["bop_data"]

                # 계층적 BOP 검증
                is_valid, error_msg = validate_hierarchical_bop(bop_data)
                if not is_valid:
                    print(f"[ERROR] BOP 검증 실패: {error_msg}")
                    print(f"[ERROR] 받은 BOP 데이터: {json.dumps(bop_data, indent=2, ensure_ascii=False)[:1000]}...")
                    raise ValueError(f"BOP 검증 실패: {error_msg}")

                # 좌표 후처리: 모든 y값을 0으로 강제 설정
                for equipment in bop_data.get("equipments", []):
                    if "location" in equipment:
                        equipment["location"]["y"] = 0

                for worker in bop_data.get("workers", []):
                    if "location" in worker:
                        worker["location"]["y"] = 0

                print(f"[DEBUG] BOP 좌표 정규화 완료")

            return response_data

        except json.JSONDecodeError as e:
            last_error = f"JSON 파싱 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            # 재시도
            continue

        except Exception as e:
            last_error = f"Unified chat 실패 (시도 {attempt + 1}/{max_retries}): {str(e)}"
            print(last_error)
            # 재시도
            continue

    # 모든 재시도 실패
    raise Exception(f"Unified chat 실패: {last_error}")
