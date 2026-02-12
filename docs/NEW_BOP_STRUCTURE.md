# 새로운 BOP 데이터 구조 설계 문서

## 개요

기존의 복잡한 Process → Operations 계층 구조를 제거하고, **Process 중심의 단순한 구조**로 재설계합니다.

## 핵심 설계 원칙

1. **Process가 핵심 단위** - Operation 제거, 공정만 유지
2. **마스터-디테일 패턴** - Equipment/Worker/Material은 마스터 데이터로 분리
3. **중간 테이블(ProcessResource)** - 공정과 리소스를 연결하며 상대 좌표 관리
4. **절대 좌표 vs 상대 좌표**
   - Process: 전체 화면 기준 절대 좌표
   - ProcessResource: 공정 내부 상대 좌표
5. **선후관계 그래프** - predecessor/successor로 공정 흐름 관리

## 데이터 구조 다이어그램

```
┌─────────────────────────────────────────────────┐
│                    BOPData                       │
│  - project_title                                │
│  - target_uph                                   │
│  - processes: List[Process]                     │
│  - equipments: List[Equipment]  (마스터)        │
│  - workers: List[Worker]        (마스터)        │
│  - materials: List[Material]    (마스터)        │
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
   ┌─────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐
   │ Process │  │Equipment │  │ Worker │  │Material  │
   └─────────┘  └──────────┘  └────────┘  └──────────┘
        │
        │ 1:N
        ▼
 ┌──────────────────┐
 │ ProcessResource  │  (중간 테이블 - 상대 좌표 포함)
 └──────────────────┘
```

## 상세 데이터 모델

### 1. BOPData (최상위 구조)

```typescript
{
  "project_title": "자전거 제조 라인",
  "target_uph": 60,
  "processes": [...],      // Process 배열
  "equipments": [...],     // Equipment 마스터 배열
  "workers": [...],        // Worker 마스터 배열
  "materials": [...]       // Material 마스터 배열
}
```

### 2. Process (공정)

```typescript
{
  "process_id": "P001",                  // 공정 ID
  "name": "용접",                        // 공정명
  "description": "프레임 용접 공정",     // 공정 설명
  "cycle_time_sec": 120.0,              // 사이클 타임 (초)
  "parallel_count": 2,                  // 병렬 라인 수
  "location": {                         // 절대 좌표 (전체 화면 기준)
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "predecessor_ids": ["P000"],          // 선행 공정 ID 리스트
  "successor_ids": ["P002", "P003"],    // 후속 공정 ID 리스트
  "resources": [...]                    // ProcessResource 배열
}
```

**필드 설명:**
- `process_id`: 고유 식별자
- `cycle_time_sec`: 이 공정의 기본 사이클 타임
- `parallel_count`: 병렬로 운영되는 라인 수 (1이면 단일 라인)
- `location`: 공정의 절대 위치 (3D 시각화에서 공정 중심점)
- `predecessor_ids`: 이 공정 이전에 완료되어야 하는 공정들
- `successor_ids`: 이 공정 이후에 시작되는 공정들
- `resources`: 이 공정에서 사용하는 리소스들 (설비, 작업자, 자재)

### 3. ProcessResource (공정-리소스 연결)

```typescript
{
  "resource_type": "equipment",         // "equipment" | "worker" | "material"
  "resource_id": "EQ-ROBOT-01",        // 마스터 데이터 ID 참조
  "quantity": 1.0,                     // 사용 수량
  "relative_location": {               // 공정 내 상대 좌표
    "x": 0.0,
    "y": 0.0,
    "z": 0.0
  },
  "role": "주 용접 로봇"                // 역할/용도 (선택적)
}
```

**실제 위치 계산:**
```
실제 위치 = Process.location + ProcessResource.relative_location
```

**예시:**
- Process P001 위치: (10, 0, 5)
- Equipment의 상대 위치: (2, 0, 1)
- **실제 Equipment 위치: (12, 0, 6)**

### 4. Equipment (설비 마스터)

```typescript
{
  "equipment_id": "EQ-ROBOT-01",
  "name": "6축 용접 로봇",
  "type": "robot",                    // "robot" | "machine" | "manual_station"
  "specifications": {                 // 선택적
    "manufacturer": "KUKA",
    "model": "KR-210"
  }
}
```

**특징:**
- 전역적으로 관리되는 마스터 데이터
- 여러 공정에서 재사용 가능
- 공정별 위치는 ProcessResource에서 관리

### 5. Worker (작업자 마스터)

```typescript
{
  "worker_id": "W001",
  "name": "김철수",
  "skill_level": "Senior",           // 선택적
  "certifications": ["용접기능사"]    // 선택적
}
```

### 6. Material (자재 마스터)

```typescript
{
  "material_id": "M-STEEL-001",
  "name": "Steel Plate A3",
  "unit": "kg",
  "specifications": {                // 선택적
    "grade": "SS400",
    "thickness": "5mm"
  }
}
```

### 7. Location (위치)

```typescript
{
  "x": 0.0,    // X축 좌표 (m)
  "y": 0.0,    // Y축 좌표 (m, 일반적으로 0 - 바닥 기준)
  "z": 0.0     // Z축 좌표 (m, 공정 흐름 방향)
}
```

## 병렬 처리 방식

### 개념
- `parallel_count = 2`이면 동일한 공정이 2개 라인으로 운영됨
- 총 사이클 타임은 동일하지만, 처리량이 2배

### UI 표시
- BOP 테이블에서 2개 행으로 표시
- 첫 번째 행: 전체 정보 표시
- 두 번째 행: "(병렬 라인 #2)" 표시

### 사이클 타임 계산
```
Effective Cycle Time = cycle_time_sec / parallel_count
```

### 3D 시각화
- 원본 공정: `location`
- 병렬 라인 #2: `location + (0, 0, 5)` (z축으로 5m 이동)
- 병렬 라인 #3: `location + (0, 0, 10)`
- ...

## 선후관계 관리

### 공정 흐름 그래프

```
    P001 (시작)
      ↓
    P002
      ↓
   ┌──┴──┐
  P003  P004 (병렬 분기)
   └──┬──┘
     P005 (합류)
      ↓
    P006 (종료)
```

### 데이터 표현

```typescript
// P001 (시작)
{
  "process_id": "P001",
  "predecessor_ids": [],
  "successor_ids": ["P002"]
}

// P002
{
  "process_id": "P002",
  "predecessor_ids": ["P001"],
  "successor_ids": ["P003", "P004"]
}

// P003
{
  "process_id": "P003",
  "predecessor_ids": ["P002"],
  "successor_ids": ["P005"]
}

// P004
{
  "process_id": "P004",
  "predecessor_ids": ["P002"],
  "successor_ids": ["P005"]
}

// P005 (합류)
{
  "process_id": "P005",
  "predecessor_ids": ["P003", "P004"],
  "successor_ids": ["P006"]
}
```

### 검증 규칙
1. 순환 참조 금지 (DAG 구조)
2. 시작 노드: `predecessor_ids`가 비어있음
3. 종료 노드: `successor_ids`가 비어있음
4. 모든 노드는 연결되어야 함 (고립된 노드 없음)

## 시각화 테이블

### 1. 메인 테이블: BOP (공정 목록)

| Process ID | Name | Description | Cycle Time | Parallel | Effective Time | Location | Predecessors | Resources |
|------------|------|-------------|------------|----------|----------------|----------|--------------|-----------|
| P001       | 용접  | 프레임 용접  | 120s       | 2        | 60s           | (0,0,0)  | -            | 로봇×1, 작업자×1, Steel×2.5kg |
| P001-#2    | (병렬) | -          | -          | -        | -             | (0,0,5)  | -            | - |
| P002       | 조립  | 부품 조립   | 90s        | 1        | 90s           | (0,0,10) | P001         | 기계×2, 작업자×2 |

**컬럼 설명:**
- `Effective Time`: `cycle_time_sec / parallel_count`
- `Resources`: 요약 표시 (상세는 드릴다운 또는 별도 뷰)

### 2. 서브 테이블: Equipment 마스터

| Equipment ID | Name | Type | Specifications | Used In Processes |
|--------------|------|------|----------------|-------------------|
| EQ-ROBOT-01  | 6축 용접 로봇 | robot | KUKA KR-210 | P001, P003 |
| EQ-MACHINE-01 | CNC 밀링 머신 | machine | Haas VF-2 | P002 |

### 3. 서브 테이블: Worker 마스터

| Worker ID | Name | Skill Level | Certifications | Used In Processes |
|-----------|------|-------------|----------------|-------------------|
| W001      | 김철수 | Senior | 용접기능사 | P001, P002, P004 |
| W002      | 이영희 | Junior | - | P002, P005 |

### 4. 서브 테이블: Material 마스터

| Material ID | Name | Unit | Specifications | Used In Processes |
|-------------|------|------|----------------|-------------------|
| M-STEEL-001 | Steel Plate A3 | kg | SS400, 5mm | P001, P003 |
| M-BOLT-001  | M8 Bolt | ea | Grade 8.8 | P002, P004 |

### 5. 상세 뷰: Process Resources (드릴다운)

**Process P001의 Resources:**

| Resource Type | Resource ID | Name | Quantity | Relative Location | Role |
|---------------|-------------|------|----------|-------------------|------|
| Equipment     | EQ-ROBOT-01 | 6축 용접 로봇 | 1 | (0, 0, 0) | 주 용접 로봇 |
| Worker        | W001        | 김철수 | 1 | (2, 0, 1) | 검사자 |
| Material      | M-STEEL-001 | Steel Plate | 2.5 | (-1, 0, 0.5) | 입고 자재 |

## 3D 시각화 규칙

### 공정 표시
- 위치: `Process.location`
- 크기: 고정 (예: 4m × 2m × 3m 박스)
- 색상: 공정 타입별 (용접=파랑, 조립=초록, 검사=노랑)
- 병렬 라인: z축으로 5m 간격 복제

### 리소스 표시
- 위치: `Process.location + ProcessResource.relative_location`
- Equipment:
  - robot: 파란색 원기둥 (높이 2m, 반지름 0.5m)
  - machine: 빨간색 박스 (1.5m × 1m × 1.2m)
  - manual_station: 초록색 박스 (1m × 1m × 0.8m)
- Worker: 녹색 캡슐 (높이 1.7m, 반지름 0.3m)
- Material: 주황색 작은 박스 (0.5m × 0.5m × 0.3m)

### 공정 흐름 표시
- 화살표로 predecessor → successor 연결
- 화살표 색상: 회색 (#888888)
- 화살표 두께: 2px

## 데이터 검증 규칙

### 1. BOPData 레벨
- `project_title`: 비어있지 않음
- `target_uph`: 양수
- `processes`: 1개 이상
- `equipments`, `workers`, `materials`: 비어있을 수 있음

### 2. Process 레벨
- `process_id`: 고유해야 함
- `cycle_time_sec`: 양수
- `parallel_count`: 1 이상
- `predecessor_ids`, `successor_ids`: 순환 참조 금지

### 3. ProcessResource 레벨
- `resource_id`: 해당 마스터 데이터에 존재해야 함
  - `equipment` → `equipments` 목록
  - `worker` → `workers` 목록
  - `material` → `materials` 목록
- `quantity`: 양수

### 4. 참조 무결성
- ProcessResource의 `resource_id`는 반드시 해당 마스터 테이블에 존재
- predecessor/successor ID는 반드시 processes에 존재

## 마이그레이션 가이드

### 기존 구조 → 새 구조 변환

**기존 구조:**
```typescript
{
  "processes": [
    {
      "process_id": "P1",
      "operations": [
        {
          "operation_id": "P1-OP1",
          "equipment_id": "EQ1",
          "worker_ids": ["W1"],
          ...
        }
      ]
    }
  ],
  "equipments": [...],
  "workers": [...]
}
```

**새 구조:**
```typescript
{
  "processes": [
    {
      "process_id": "P1",
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ1",
          "relative_location": {...}
        },
        {
          "resource_type": "worker",
          "resource_id": "W1",
          "relative_location": {...}
        }
      ]
    }
  ],
  "equipments": [...],
  "workers": [...],
  "materials": []
}
```

**변환 로직:**
1. Operations를 Process로 통합
2. Operation의 equipment_id → ProcessResource (equipment)
3. Operation의 worker_ids → ProcessResource (worker) × N개
4. Equipment/Worker의 location → ProcessResource의 relative_location
5. predecessor/successor는 수동 지정 또는 순차 연결

## 예시: 완전한 BOP 데이터

```json
{
  "project_title": "자전거 제조 라인",
  "target_uph": 60,
  "processes": [
    {
      "process_id": "P001",
      "name": "프레임 용접",
      "description": "자전거 프레임 메인 용접",
      "cycle_time_sec": 120.0,
      "parallel_count": 2,
      "location": {"x": 0.0, "y": 0.0, "z": 0.0},
      "predecessor_ids": [],
      "successor_ids": ["P002"],
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ-ROBOT-01",
          "quantity": 1,
          "relative_location": {"x": 0.0, "y": 0.0, "z": 0.0},
          "role": "메인 용접"
        },
        {
          "resource_type": "worker",
          "resource_id": "W001",
          "quantity": 1,
          "relative_location": {"x": 2.0, "y": 0.0, "z": 1.0},
          "role": "용접 검사"
        },
        {
          "resource_type": "material",
          "resource_id": "M-STEEL-001",
          "quantity": 3.5,
          "relative_location": {"x": -2.0, "y": 0.0, "z": 0.0},
          "role": "프레임 소재"
        }
      ]
    },
    {
      "process_id": "P002",
      "name": "부품 조립",
      "description": "휠, 페달, 핸들 조립",
      "cycle_time_sec": 90.0,
      "parallel_count": 1,
      "location": {"x": 0.0, "y": 0.0, "z": 10.0},
      "predecessor_ids": ["P001"],
      "successor_ids": ["P003"],
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ-STATION-01",
          "quantity": 1,
          "relative_location": {"x": 0.0, "y": 0.0, "z": 0.0},
          "role": "조립 스테이션"
        },
        {
          "resource_type": "worker",
          "resource_id": "W002",
          "quantity": 2,
          "relative_location": {"x": 1.5, "y": 0.0, "z": 0.5},
          "role": "조립 작업자"
        }
      ]
    },
    {
      "process_id": "P003",
      "name": "최종 검사",
      "description": "품질 검사 및 포장",
      "cycle_time_sec": 60.0,
      "parallel_count": 1,
      "location": {"x": 0.0, "y": 0.0, "z": 20.0},
      "predecessor_ids": ["P002"],
      "successor_ids": [],
      "resources": [
        {
          "resource_type": "worker",
          "resource_id": "W003",
          "quantity": 1,
          "relative_location": {"x": 0.0, "y": 0.0, "z": 0.0},
          "role": "검사자"
        }
      ]
    }
  ],
  "equipments": [
    {
      "equipment_id": "EQ-ROBOT-01",
      "name": "6축 용접 로봇",
      "type": "robot",
      "specifications": {
        "manufacturer": "KUKA",
        "model": "KR-210"
      }
    },
    {
      "equipment_id": "EQ-STATION-01",
      "name": "수동 조립 스테이션",
      "type": "manual_station"
    }
  ],
  "workers": [
    {
      "worker_id": "W001",
      "name": "김철수",
      "skill_level": "Senior",
      "certifications": ["용접기능사"]
    },
    {
      "worker_id": "W002",
      "name": "이영희",
      "skill_level": "Junior"
    },
    {
      "worker_id": "W003",
      "name": "박민수",
      "skill_level": "Senior",
      "certifications": ["품질관리기사"]
    }
  ],
  "materials": [
    {
      "material_id": "M-STEEL-001",
      "name": "Steel Tube A3",
      "unit": "kg",
      "specifications": {
        "grade": "SS400",
        "diameter": "25mm"
      }
    }
  ]
}
```

## 장점 요약

1. **단순성**: Operation 계층 제거로 구조 단순화
2. **재사용성**: 마스터 데이터로 리소스 중복 제거
3. **유연성**: ProcessResource로 공정별 리소스 조합 자유롭게
4. **확장성**: Material, Specifications 등 쉽게 확장 가능
5. **추적성**: predecessor/successor로 공정 흐름 명확화
6. **시각화**: 절대/상대 좌표로 3D 배치 정확하게 표현
7. **병렬 처리**: parallel_count로 간단하게 병렬 라인 표현

## 다음 단계

1. ✅ 데이터 구조 설계 문서 작성
2. ⬜ Pydantic 모델 구현 (models.py)
3. ⬜ AI 프롬프트 업데이트 (prompts.py)
4. ⬜ 검증 로직 구현 (llm_service.py)
5. ⬜ API 엔드포인트 수정 (main.py)
6. ⬜ 프론트엔드 적용 (React 컴포넌트)
