import json
import os
from typing import Tuple, Optional
from dotenv import load_dotenv
from app.prompts import SYSTEM_PROMPT, MODIFY_PROMPT_TEMPLATE, UNIFIED_CHAT_PROMPT_TEMPLATE
from app.models import BOPData
from app.llm import get_provider

# .env 파일 로드
load_dotenv()


def ensure_manual_stations(bop_data: dict) -> dict:
    """
    작업자나 로봇이 있는 공정에 수작업대(manual_station)가 없으면 자동으로 추가합니다.

    규칙:
    - 공정에 worker가 있으면 manual_station 1개 이상 필수
    - 공정에 robot이 있으면 manual_station 1개 권장 (감독용)

    Args:
        bop_data: BOP 데이터

    Returns:
        dict: manual_station이 보장된 BOP 데이터
    """
    print("[ENSURE-MANUAL-STATIONS] 수작업대 검증 시작")

    equipments = bop_data.get("equipments", [])
    processes = bop_data.get("processes", [])

    # Equipment ID별 타입 매핑
    equipment_type_map = {eq["equipment_id"]: eq["type"] for eq in equipments}

    # 다음 Equipment ID 생성을 위한 카운터
    max_eq_num = 0
    for eq in equipments:
        match = __import__('re').match(r'EQ(\d+)', eq["equipment_id"])
        if match:
            max_eq_num = max(max_eq_num, int(match.group(1)))

    added_count = 0

    for process in processes:
        resources = process.get("resources", [])

        # 현재 공정의 리소스 분석
        has_worker = False
        has_robot = False
        has_manual_station = False

        for resource in resources:
            if resource["resource_type"] == "worker":
                has_worker = True
            elif resource["resource_type"] == "equipment":
                eq_type = equipment_type_map.get(resource["resource_id"])
                if eq_type == "robot":
                    has_robot = True
                elif eq_type == "manual_station":
                    has_manual_station = True

        # 작업자나 로봇이 있는데 수작업대가 없으면 추가
        if (has_worker or has_robot) and not has_manual_station:
            # 새 manual_station 생성
            max_eq_num += 1
            new_eq_id = f"EQ{max_eq_num:03d}"

            # Equipment 마스터에 추가
            new_equipment = {
                "equipment_id": new_eq_id,
                "name": f"작업대 {max_eq_num}",
                "type": "manual_station"
            }
            equipments.append(new_equipment)
            equipment_type_map[new_eq_id] = "manual_station"

            # 공정 리소스에 추가
            new_resource = {
                "resource_type": "equipment",
                "resource_id": new_eq_id,
                "quantity": 1,
                "role": "작업대"
            }
            resources.append(new_resource)

            added_count += 1
            print(f"  - Process {process['process_id']}: manual_station 추가 ({new_eq_id})")

    if added_count > 0:
        print(f"[ENSURE-MANUAL-STATIONS] 완료: {added_count}개 수작업대 자동 추가")
    else:
        print(f"[ENSURE-MANUAL-STATIONS] 완료: 모든 공정에 수작업대 존재")

    bop_data["equipments"] = equipments
    return bop_data


def sort_resources_order(bop_data: dict) -> dict:
    """
    공정 내 리소스를 정렬합니다.

    정렬 순서:
    1. Equipment - robot
    2. Equipment - machine
    3. Equipment - manual_station
    4. Worker
    5. Material

    Args:
        bop_data: BOP 데이터

    Returns:
        dict: 리소스가 정렬된 BOP 데이터
    """
    print("[SORT-RESOURCES] 리소스 정렬 시작")

    equipments = bop_data.get("equipments", [])
    processes = bop_data.get("processes", [])

    # Equipment ID별 타입 매핑
    equipment_type_map = {eq["equipment_id"]: eq["type"] for eq in equipments}

    def get_sort_key(resource):
        """리소스의 정렬 키를 반환합니다."""
        resource_type = resource["resource_type"]

        if resource_type == "equipment":
            eq_type = equipment_type_map.get(resource["resource_id"], "unknown")
            if eq_type == "robot":
                return (1, resource["resource_id"])  # 1순위: robot
            elif eq_type == "machine":
                return (2, resource["resource_id"])  # 2순위: machine
            elif eq_type == "manual_station":
                return (3, resource["resource_id"])  # 3순위: manual_station
            else:
                return (4, resource["resource_id"])  # 4순위: 기타 equipment
        elif resource_type == "worker":
            return (5, resource["resource_id"])  # 5순위: worker
        elif resource_type == "material":
            return (6, resource["resource_id"])  # 6순위: material
        else:
            return (7, resource.get("resource_id", ""))  # 7순위: 기타

    # 각 공정의 리소스 정렬
    sorted_count = 0
    for process in processes:
        resources = process.get("resources", [])
        if len(resources) > 1:
            original_order = [r["resource_id"] for r in resources]
            resources.sort(key=get_sort_key)
            new_order = [r["resource_id"] for r in resources]

            if original_order != new_order:
                sorted_count += 1
                print(f"  - Process {process['process_id']}: {' → '.join(original_order)} → {' → '.join(new_order)}")

    if sorted_count > 0:
        print(f"[SORT-RESOURCES] 완료: {sorted_count}개 공정 리소스 정렬")
    else:
        print(f"[SORT-RESOURCES] 완료: 정렬 필요 없음")

    return bop_data


def apply_automatic_layout(bop_data: dict) -> dict:
    """
    BOP 데이터에 자동 좌표 배치를 적용합니다.

    좌표 체계:
    - 공정(Process): X축 방향으로 순차 배치 (0, 5, 10, 15, ...)
    - 리소스(Resource): 공정 내부에서 Z축 방향으로 순차 배치 (상대 좌표)

    Args:
        bop_data: 좌표가 없는 BOP 데이터

    Returns:
        dict: 좌표가 적용된 BOP 데이터
    """
    print("[AUTO-LAYOUT] 자동 좌표 배치 시작")

    processes = bop_data.get("processes", [])

    # 공정 좌표 배치 (X축 순차)
    for i, process in enumerate(processes):
        # 공정 위치: X축으로 3m 간격
        process["location"] = {
            "x": i * 3,
            "y": 0,
            "z": 0
        }

        # 리소스 좌표 배치 (Z축 순차)
        resources = process.get("resources", [])
        total_resources = len(resources)

        if total_resources > 0:
            # Auto-layout: Z축 수직 배치 (공정 중심 기준 상대 좌표)
            step = 0.9  # depth(0.6) + spacing(0.3)

            for j, resource in enumerate(resources):
                # 중심을 기준으로 위아래로 분산 배치
                z = j * step - (total_resources - 1) * step / 2

                resource["relative_location"] = {
                    "x": 0,
                    "y": 0,
                    "z": z
                }

        print(f"  - Process {process['process_id']}: location={process['location']}, resources={total_resources}개")

    print(f"[AUTO-LAYOUT] 완료: {len(processes)}개 공정 배치")
    return bop_data


def preserve_existing_layout(new_bop: dict, current_bop: dict) -> dict:
    """
    기존 BOP의 좌표를 새 BOP에 보존합니다.

    Args:
        new_bop: 새로 생성된 BOP (좌표 없음)
        current_bop: 기존 BOP (좌표 있음)

    Returns:
        dict: 기존 좌표가 보존된 새 BOP
    """
    # 기존 공정 좌표를 process_id로 매핑
    existing_process_locations = {}
    for process in current_bop.get("processes", []):
        if "location" in process:
            existing_process_locations[process["process_id"]] = process["location"]

    # 기존 리소스 좌표를 (process_id, resource_id)로 매핑
    existing_resource_locations = {}
    for process in current_bop.get("processes", []):
        for resource in process.get("resources", []):
            if "relative_location" in resource:
                key = (process["process_id"], resource["resource_id"])
                existing_resource_locations[key] = resource["relative_location"]

    # 새 BOP에 기존 좌표 적용
    new_processes = []
    for process in new_bop.get("processes", []):
        process_id = process["process_id"]

        # 기존 공정 좌표가 있으면 보존
        if process_id in existing_process_locations:
            process["location"] = existing_process_locations[process_id]

        # 리소스 좌표 보존
        for resource in process.get("resources", []):
            key = (process_id, resource["resource_id"])
            if key in existing_resource_locations:
                resource["relative_location"] = existing_resource_locations[key]

        new_processes.append(process)

    new_bop["processes"] = new_processes
    return new_bop


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

            # 수작업대 보장
            bop_data = ensure_manual_stations(bop_data)

            # 리소스 정렬 (robot → machine → manual_station → worker → material)
            bop_data = sort_resources_order(bop_data)

            # 자동 좌표 배치 적용
            bop_data = apply_automatic_layout(bop_data)

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

            # 수작업대 보장
            updated_bop = ensure_manual_stations(updated_bop)

            # 리소스 정렬 (robot → machine → manual_station → worker → material)
            updated_bop = sort_resources_order(updated_bop)

            # 기존 좌표 보존하면서 새로운 요소에만 자동 배치 적용
            updated_bop = preserve_existing_layout(updated_bop, current_bop)

            # 좌표가 없는 새 공정/리소스가 있으면 자동 배치
            needs_layout = False
            for process in updated_bop.get("processes", []):
                if "location" not in process:
                    needs_layout = True
                    break
                for resource in process.get("resources", []):
                    if "relative_location" not in resource:
                        needs_layout = True
                        break

            if needs_layout:
                print("[MODIFY] 새 요소 발견, 자동 좌표 배치 적용")
                updated_bop = apply_automatic_layout(updated_bop)

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

                # 수작업대 보장
                bop_data = ensure_manual_stations(bop_data)

                # 리소스 정렬 (robot → machine → manual_station → worker → material)
                bop_data = sort_resources_order(bop_data)

                # 기존 BOP가 있으면 좌표 보존, 없으면 자동 배치
                if current_bop:
                    # 기존 좌표 보존
                    bop_data = preserve_existing_layout(bop_data, current_bop)

                    # 좌표가 없는 새 요소가 있으면 자동 배치
                    needs_layout = False
                    for process in bop_data.get("processes", []):
                        if "location" not in process:
                            needs_layout = True
                            break
                        for resource in process.get("resources", []):
                            if "relative_location" not in resource:
                                needs_layout = True
                                break

                    if needs_layout:
                        print("[UNIFIED] 새 요소 발견, 자동 좌표 배치 적용")
                        bop_data = apply_automatic_layout(bop_data)
                else:
                    # 신규 생성: 자동 좌표 배치
                    bop_data = apply_automatic_layout(bop_data)

                # 업데이트된 bop_data를 response_data에 다시 할당
                response_data["bop_data"] = bop_data

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
