from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any


# ============================================
# 기본 모델
# ============================================

class Location(BaseModel):
    """3D 공간 좌표"""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0


# ============================================
# 마스터 데이터 모델
# ============================================

class Equipment(BaseModel):
    """설비 마스터 데이터"""
    equipment_id: str = Field(..., description="설비 고유 ID")
    name: str = Field(..., description="설비명")
    type: str = Field(..., description="설비 타입: robot, machine, manual_station")
    specifications: Optional[Dict[str, Any]] = Field(default=None, description="설비 사양 (제조사, 모델 등)")


class Worker(BaseModel):
    """작업자 마스터 데이터"""
    worker_id: str = Field(..., description="작업자 고유 ID")
    name: str = Field(..., description="작업자명")
    skill_level: Optional[str] = Field(default=None, description="숙련도 (Senior, Junior 등)")
    certifications: Optional[List[str]] = Field(default=None, description="보유 자격증")


class Material(BaseModel):
    """자재 마스터 데이터"""
    material_id: str = Field(..., description="자재 고유 ID")
    name: str = Field(..., description="자재명")
    unit: str = Field(default="ea", description="단위 (kg, ea, m 등)")
    specifications: Optional[Dict[str, Any]] = Field(default=None, description="자재 사양")


# ============================================
# 공정-리소스 연결 모델
# ============================================

class ProcessResource(BaseModel):
    """공정에서 사용하는 리소스 (중간 테이블)"""
    resource_type: str = Field(..., description="리소스 타입: equipment, worker, material")
    resource_id: str = Field(..., description="리소스 ID (마스터 데이터 참조)")
    quantity: float = Field(default=1.0, description="사용 수량")
    relative_location: Location = Field(..., description="공정 내 상대 좌표")
    role: Optional[str] = Field(default=None, description="역할/용도 (예: 주작업자, 검사)")

    @validator('resource_type')
    def validate_resource_type(cls, v):
        allowed = ['equipment', 'worker', 'material']
        if v not in allowed:
            raise ValueError(f"resource_type은 {allowed} 중 하나여야 합니다")
        return v

    @validator('quantity')
    def validate_quantity(cls, v):
        if v <= 0:
            raise ValueError("quantity는 양수여야 합니다")
        return v


# ============================================
# 공정 모델
# ============================================

class Process(BaseModel):
    """제조 공정 (단일 작업 단위)"""
    process_id: str = Field(..., description="공정 고유 ID")
    name: str = Field(..., description="공정명")
    description: str = Field(..., description="공정 설명")
    cycle_time_sec: float = Field(..., description="사이클 타임 (초)")
    parallel_count: int = Field(default=1, description="병렬 라인 수")
    location: Location = Field(..., description="절대 좌표 (전체 화면 기준)")
    predecessor_ids: List[str] = Field(default_factory=list, description="선행 공정 ID 리스트")
    successor_ids: List[str] = Field(default_factory=list, description="후속 공정 ID 리스트")
    resources: List[ProcessResource] = Field(default_factory=list, description="이 공정에서 사용하는 리소스들")

    @validator('cycle_time_sec')
    def validate_cycle_time(cls, v):
        if v <= 0:
            raise ValueError("cycle_time_sec는 양수여야 합니다")
        return v

    @validator('parallel_count')
    def validate_parallel_count(cls, v):
        if v < 1:
            raise ValueError("parallel_count는 1 이상이어야 합니다")
        return v

    @property
    def effective_cycle_time_sec(self) -> float:
        """병렬 처리를 고려한 실제 사이클 타임"""
        return self.cycle_time_sec / self.parallel_count


# ============================================
# BOP 데이터 모델
# ============================================

class BOPData(BaseModel):
    """Bill of Process 전체 데이터"""
    project_title: str = Field(..., description="프로젝트 제목")
    target_uph: int = Field(..., description="목표 시간당 생산량")
    processes: List[Process] = Field(..., description="공정 리스트")
    equipments: List[Equipment] = Field(default_factory=list, description="설비 마스터 리스트")
    workers: List[Worker] = Field(default_factory=list, description="작업자 마스터 리스트")
    materials: List[Material] = Field(default_factory=list, description="자재 마스터 리스트")

    @validator('target_uph')
    def validate_target_uph(cls, v):
        if v <= 0:
            raise ValueError("target_uph는 양수여야 합니다")
        return v

    @validator('processes')
    def validate_processes_not_empty(cls, v):
        if len(v) == 0:
            raise ValueError("processes는 최소 1개 이상이어야 합니다")
        return v

    def validate_references(self) -> tuple:
        """참조 무결성 검증"""
        # Equipment IDs 수집
        equipment_ids = {eq.equipment_id for eq in self.equipments}
        # Worker IDs 수집
        worker_ids = {w.worker_id for w in self.workers}
        # Material IDs 수집
        material_ids = {m.material_id for m in self.materials}
        # Process IDs 수집
        process_ids = {p.process_id for p in self.processes}

        # Process ID 중복 검사
        process_id_list = [p.process_id for p in self.processes]
        if len(process_id_list) != len(set(process_id_list)):
            duplicates = [pid for pid in process_id_list if process_id_list.count(pid) > 1]
            return False, f"중복된 process_id가 있습니다: {set(duplicates)}"

        # 각 공정의 리소스 참조 검증
        for process in self.processes:
            for resource in process.resources:
                if resource.resource_type == 'equipment':
                    if resource.resource_id not in equipment_ids:
                        return False, f"Process {process.process_id}의 equipment_id '{resource.resource_id}'가 equipments 목록에 없습니다"
                elif resource.resource_type == 'worker':
                    if resource.resource_id not in worker_ids:
                        return False, f"Process {process.process_id}의 worker_id '{resource.resource_id}'가 workers 목록에 없습니다"
                elif resource.resource_type == 'material':
                    if resource.resource_id not in material_ids:
                        return False, f"Process {process.process_id}의 material_id '{resource.resource_id}'가 materials 목록에 없습니다"

            # 선행/후속 공정 ID 검증
            for pred_id in process.predecessor_ids:
                if pred_id not in process_ids:
                    return False, f"Process {process.process_id}의 predecessor_id '{pred_id}'가 processes 목록에 없습니다"

            for succ_id in process.successor_ids:
                if succ_id not in process_ids:
                    return False, f"Process {process.process_id}의 successor_id '{succ_id}'가 processes 목록에 없습니다"

        return True, ""

    def detect_cycles(self) -> tuple:
        """공정 흐름에서 순환 참조 검증 (DAG 구조 확인)"""
        # 방문 상태: 0=미방문, 1=방문중, 2=완료
        visited = {p.process_id: 0 for p in self.processes}

        def dfs(node_id: str, path: List[str]) -> tuple:
            if visited[node_id] == 1:
                # 순환 발견
                cycle_start = path.index(node_id)
                cycle = path[cycle_start:] + [node_id]
                return False, f"순환 참조 발견: {' -> '.join(cycle)}"

            if visited[node_id] == 2:
                # 이미 완료된 노드
                return True, ""

            visited[node_id] = 1  # 방문 중

            # successor들을 탐색
            process = next(p for p in self.processes if p.process_id == node_id)
            for succ_id in process.successor_ids:
                is_valid, msg = dfs(succ_id, path + [node_id])
                if not is_valid:
                    return False, msg

            visited[node_id] = 2  # 완료
            return True, ""

        # 모든 노드에서 DFS 시작
        for process in self.processes:
            if visited[process.process_id] == 0:
                is_valid, msg = dfs(process.process_id, [])
                if not is_valid:
                    return False, msg

        return True, ""


# ============================================
# API Request/Response 모델
# ============================================

class GenerateRequest(BaseModel):
    """BOP 생성 요청"""
    user_input: str


class ChatRequest(BaseModel):
    """BOP 수정 요청"""
    message: str
    current_bop: BOPData


class UnifiedChatRequest(BaseModel):
    """통합 채팅 요청 (생성/수정/QA)"""
    message: str
    current_bop: Optional[BOPData] = None


class UnifiedChatResponse(BaseModel):
    """통합 채팅 응답"""
    message: str
    bop_data: Optional[BOPData] = None
