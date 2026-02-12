# BOP Generator - 시스템 아키텍처 문서

## 📋 목차

1. [시스템 개요](#1-시스템-개요)
2. [전체 아키텍처](#2-전체-아키텍처)
3. [데이터 구조](#3-데이터-구조)
4. [백엔드 아키텍처](#4-백엔드-아키텍처)
5. [프론트엔드 아키텍처](#5-프론트엔드-아키텍처)
6. [데이터 흐름](#6-데이터-흐름)
7. [3D 시각화](#7-3d-시각화)
8. [상태 관리](#8-상태-관리)

---

## 1. 시스템 개요

### 1.1 프로젝트 소개

BOP Generator는 **AI 기반 제조 공정 계획(Bill of Process)** 자동 생성 및 관리 시스템입니다.

**핵심 기능:**
- 🤖 AI 기반 BOP 자동 생성 (Google Gemini)
- 💬 대화형 BOP 수정 및 질의응답
- 🎨 3D 시각화 (Three.js)
- 📊 인터랙티브 테이블 편집
- 💾 시나리오 저장/불러오기
- 📤 Excel/JSON 내보내기

### 1.2 기술 스택

**백엔드:**
- FastAPI (Python 3.8+)
- Pydantic (데이터 검증)
- Google Gemini 2.5 Flash (AI)
- openpyxl (Excel 생성)

**프론트엔드:**
- React 19
- Vite (빌드 도구)
- Three.js + @react-three/fiber (3D)
- Zustand (상태 관리)

---

## 2. 전체 아키텍처

### 2.1 시스템 구조도

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ UI Components│  │  3D Viewer  │  │  Zustand Store   │   │
│  │  - BopTable  │  │  (Three.js) │  │  (bopStore.js)   │   │
│  │  - ChatPanel │  │             │  │                  │   │
│  │  - Tables    │  │             │  │                  │   │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘   │
│         │                 │                   │              │
│         └─────────────────┴───────────────────┘              │
│                           │                                  │
│                      API Client                              │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │ HTTP/JSON
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       Backend (FastAPI)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Routers    │  │ LLM Service  │  │  Pydantic Models │  │
│  │  (main.py)   │  │ (Gemini API) │  │   (models.py)    │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │             │
│         └──────────────────┴────────────────────┘             │
│                           │                                   │
│                   Data Validation                             │
│                   & AI Processing                             │
└───────────────────────────────────────────────────────────────┘
```

### 2.2 디렉토리 구조

```
26_gen_dt/
├── app/                          # 백엔드
│   ├── main.py                  # FastAPI 앱 + API 엔드포인트
│   ├── models.py                # Pydantic 데이터 모델
│   ├── prompts.py               # AI 프롬프트 템플릿
│   ├── llm_service.py           # Gemini API 통신
│   └── tools/                   # 툴 시스템
│       ├── router.py            # 툴 API 라우터
│       ├── executor.py          # 툴 실행 엔진
│       └── ...
├── src/                          # 프론트엔드
│   ├── components/
│   │   ├── BopTable.jsx         # BOP 공정 테이블
│   │   ├── Viewer3D.jsx         # 3D 시각화
│   │   ├── UnifiedChatPanel.jsx # AI 채팅 패널
│   │   ├── EquipmentsTable.jsx  # 설비 마스터 테이블
│   │   ├── WorkersTable.jsx     # 작업자 마스터 테이블
│   │   ├── MaterialsTable.jsx   # 자재 마스터 테이블
│   │   └── ObstacleTable.jsx    # 장애물 테이블
│   ├── services/
│   │   └── api.js               # API 통신 클라이언트
│   ├── store/
│   │   └── bopStore.js          # Zustand 상태 관리
│   ├── App.jsx                  # 메인 앱 컴포넌트
│   └── main.jsx                 # 엔트리 포인트
├── docs/                         # 문서
│   ├── TOOL_GUIDE.md            # 툴 시스템 가이드
│   └── ...
├── tests/                        # 테스트
├── .env                          # 환경 변수 (API 키)
├── requirements.txt              # Python 의존성
├── package.json                  # Node.js 의존성
└── README.md                     # 프로젝트 설명
```

---

## 3. 데이터 구조

### 3.1 핵심 설계 원칙

1. **Process 중심 구조** - Operation 계층 제거, 공정만 유지
2. **마스터-디테일 패턴** - Equipment/Worker/Material은 마스터 데이터로 분리
3. **중간 테이블 (ProcessResource)** - 공정과 리소스를 연결하며 상대 좌표 관리
4. **절대 좌표 vs 상대 좌표**
   - Process: 전체 화면 기준 절대 좌표
   - ProcessResource: 공정 내부 상대 좌표 (실제 위치 = Process.location + relative_location)
5. **DAG 구조** - predecessor/successor로 공정 흐름 관리 (순환 참조 금지)

### 3.2 데이터 모델 다이어그램

```
┌─────────────────────────────────────────────────┐
│                    BOPData                       │
│  - project_title: string                        │
│  - target_uph: int                              │
│  - processes: List[Process]                     │
│  - equipments: List[Equipment]  (마스터)        │
│  - workers: List[Worker]        (마스터)        │
│  - materials: List[Material]    (마스터)        │
│  - obstacles: List[Obstacle]    (마스터)        │
└─────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        ▼             ▼             ▼             ▼
   ┌─────────┐  ┌──────────┐  ┌────────┐  ┌──────────┐
   │ Process │  │Equipment │  │ Worker │  │Material  │
   │         │  │ (마스터) │  │(마스터)│  │ (마스터) │
   └─────────┘  └──────────┘  └────────┘  └──────────┘
        │
        │ 1:N
        ▼
 ┌──────────────────┐
 │ ProcessResource  │  (중간 테이블 - 공정-리소스 연결)
 │ - resource_type  │  ("equipment" | "worker" | "material")
 │ - resource_id    │  (마스터 데이터 참조)
 │ - quantity       │
 │ - relative_location │ (상대 좌표)
 │ - role           │
 └──────────────────┘
```

### 3.3 상세 데이터 모델

#### 3.3.1 BOPData (최상위 구조)

```python
class BOPData(BaseModel):
    project_title: str              # 프로젝트 제목
    target_uph: int                 # 목표 시간당 생산량
    processes: List[Process]        # 공정 리스트
    equipments: List[Equipment]     # 설비 마스터 리스트
    workers: List[Worker]           # 작업자 마스터 리스트
    materials: List[Material]       # 자재 마스터 리스트
    obstacles: List[Obstacle]       # 장애물 리스트 (선택)
```

#### 3.3.2 Process (공정)

```python
class Process(BaseModel):
    process_id: str                      # 공정 고유 ID (예: "P001")
    name: str                            # 공정명
    description: str                     # 공정 설명
    cycle_time_sec: float                # 사이클 타임 (초)
    parallel_count: int = 1              # 병렬 라인 수
    location: Location                   # 절대 좌표 (전체 화면 기준)
    rotation_y: float = 0                # Y축 회전 (라디안)
    predecessor_ids: List[str] = []      # 선행 공정 ID 리스트
    successor_ids: List[str] = []        # 후속 공정 ID 리스트
    resources: List[ProcessResource]     # 이 공정에서 사용하는 리소스들
```

**특수 필드 (프론트엔드 전용):**
```typescript
{
  is_parent: boolean,           // 병렬 그룹의 부모 프로세스
  parent_id: string,            // 병렬 자식의 경우 부모 ID
  parallel_index: number,       // 병렬 라인 인덱스 (1부터 시작)
  children: string[]            // 부모의 자식 프로세스 ID 리스트
}
```

#### 3.3.3 ProcessResource (공정-리소스 연결)

```python
class ProcessResource(BaseModel):
    resource_type: str              # "equipment" | "worker" | "material"
    resource_id: str                # 마스터 데이터 ID 참조
    quantity: float = 1.0           # 사용 수량
    relative_location: Location     # 공정 내 상대 좌표
    rotation_y: float = 0           # Y축 회전 (프론트엔드)
    scale: dict = {x:1, y:1, z:1}  # 스케일 (프론트엔드)
    role: str = ""                  # 역할/용도 (선택)
```

**실제 위치 계산:**
```
실제 위치 = Process.location + ProcessResource.relative_location
```

#### 3.3.4 마스터 데이터 모델

**Equipment (설비):**
```python
class Equipment(BaseModel):
    equipment_id: str               # 고유 ID (예: "EQ001")
    name: str                       # 설비명
    type: str                       # "robot" | "machine" | "manual_station"
    specifications: dict = {}       # 사양 (선택)
```

**Worker (작업자):**
```python
class Worker(BaseModel):
    worker_id: str                  # 고유 ID (예: "W001")
    name: str                       # 작업자명
    skill_level: str = "Mid"        # 숙련도 (Senior/Mid/Junior)
    certifications: List[str] = []  # 보유 자격증 (선택)
```

**Material (자재):**
```python
class Material(BaseModel):
    material_id: str                # 고유 ID (예: "M001")
    name: str                       # 자재명
    unit: str = "ea"                # 단위 (kg, ea, m, L 등)
    specifications: dict = {}       # 사양 (선택)
```

**Obstacle (장애물):**
```python
class Obstacle(BaseModel):
    obstacle_id: str                # 고유 ID (예: "OBS001")
    name: str                       # 장애물명
    type: str                       # "fence" | "zone" | "pillar" | "wall"
    position: Location              # 위치
    size: dict                      # {width, height, depth}
    rotation_y: float = 0           # Y축 회전
```

#### 3.3.5 Location (위치)

```python
class Location(BaseModel):
    x: float = 0.0    # X축 좌표 (m, 가로)
    y: float = 0.0    # Y축 좌표 (m, 높이, 일반적으로 0)
    z: float = 0.0    # Z축 좌표 (m, 깊이)
```

**좌표계 규칙:**
- X축: 좌(-) → 우(+) | 공장 바닥 가로
- Y축: 하(-) → 상(+) | 지면에서 높이 (일반적으로 0)
- Z축: 앞(-) → 뒤(+) | 공장 바닥 깊이
- 단위: 1 unit = 1 meter

### 3.4 병렬 처리 구조

#### 백엔드 (JSON) - Collapsed Format
```json
{
  "process_id": "P001",
  "parallel_count": 2,
  "parallel_lines": [
    {
      "parallel_index": 1,
      "name": "용접 라인 #1",
      "description": "메인 용접",
      "cycle_time_sec": 120,
      "location": {"x": 0, "y": 0, "z": 0},
      "rotation_y": 0
    },
    {
      "parallel_index": 2,
      "name": "용접 라인 #2",
      "description": "보조 용접",
      "cycle_time_sec": 115,
      "location": {"x": 0, "y": 0, "z": 5},
      "rotation_y": 0
    }
  ],
  "resources": [
    // 리소스에 parallel_line_index 필드 추가
    {"resource_type": "equipment", "resource_id": "EQ001", "parallel_line_index": 0, ...},
    {"resource_type": "equipment", "resource_id": "EQ002", "parallel_line_index": 1, ...}
  ]
}
```

#### 프론트엔드 (Zustand) - Expanded Format
```javascript
// 부모 프로세스 (논리적 그룹)
{
  process_id: "P001",
  is_parent: true,
  children: ["P001-01", "P001-02"],
  name: "용접 라인 #1",
  cycle_time_sec: 120,
  predecessor_ids: [],
  successor_ids: ["P002"]
}

// 자식 프로세스 #1 (실제 라인)
{
  process_id: "P001-01",
  parent_id: "P001",
  parallel_index: 1,
  name: "용접 라인 #1",
  description: "메인 용접",
  cycle_time_sec: 120,
  location: {x: 0, y: 0, z: 0},
  rotation_y: 0,
  resources: [...]
}

// 자식 프로세스 #2
{
  process_id: "P001-02",
  parent_id: "P001",
  parallel_index: 2,
  name: "용접 라인 #2",
  description: "보조 용접",
  cycle_time_sec: 115,
  location: {x: 0, y: 0, z: 5},
  rotation_y: 0,
  resources: [...]
}
```

---

## 4. 백엔드 아키텍처

### 4.1 주요 컴포넌트

#### 4.1.1 main.py - FastAPI 애플리케이션

**역할:** HTTP API 엔드포인트 정의

**주요 엔드포인트:**

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/api/chat/unified` | 통합 채팅 (생성/수정/QA) |
| POST | `/api/export/excel` | Excel 내보내기 |
| POST | `/api/export/3d` | 3D JSON 내보내기 |
| GET | `/api/models` | 사용 가능한 LLM 모델 목록 |

**CORS 설정:**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite 개발 서버
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### 4.1.2 models.py - Pydantic 데이터 모델

**역할:** 데이터 검증 및 타입 안전성

**주요 모델:**
- `BOPData` - 최상위 BOP 데이터
- `Process` - 공정
- `ProcessResource` - 공정-리소스 연결
- `Equipment`, `Worker`, `Material`, `Obstacle` - 마스터 데이터
- `Location` - 3D 좌표
- `UnifiedChatRequest`, `UnifiedChatResponse` - API 요청/응답

**검증 메서드:**
- `validate_references()` - 참조 무결성 검증
- `detect_cycles()` - 순환 참조 검증 (DAG 구조)

#### 4.1.3 prompts.py - AI 프롬프트 템플릿

**역할:** Gemini API 프롬프트 관리

**주요 프롬프트:**
- `SYSTEM_PROMPT` - BOP 생성 시스템 프롬프트
- `MODIFY_PROMPT_TEMPLATE` - BOP 수정 템플릿
- `UNIFIED_CHAT_PROMPT_TEMPLATE` - 통합 채팅 템플릿

**핵심 규칙:**
```python
# 좌표계 규칙 (강제)
- ALL processes MUST have y=0, z=0
- ONLY x-axis increases for sequential processes
- Example: P001: {x:0, y:0, z:0}, P002: {x:5, y:0, z:0}, ...

# 리소스 배치 규칙
- Equipment: relative_location within (-1.5~1.5, 0, -1~1)
- Worker: (0.8, 0, 0.5) for primary operator
- Material: (-0.8, 0, 0.3) for input staging
```

#### 4.1.4 llm_service.py - Gemini API 통신

**역할:** AI 모델 호출 및 응답 처리

**주요 함수:**
- `generate_bop(user_input)` - BOP 생성
- `modify_bop(user_message, current_bop)` - BOP 수정
- `unified_chat(message, current_bop)` - 통합 채팅

**에러 핸들링:**
- JSON 파싱 에러 재시도 (최대 3회)
- API 오류 로깅
- 폴백 응답 제공

### 4.2 데이터 검증 플로우

```
User Request (JSON)
        ↓
FastAPI Endpoint
        ↓
Pydantic Validation  ← models.py
   ├─ Type checking
   ├─ Field validation
   ├─ Reference integrity  ← validate_references()
   └─ Cycle detection     ← detect_cycles()
        ↓
   [Valid] ✓
        ↓
Business Logic / AI Processing
        ↓
Response (JSON)
```

---

## 5. 프론트엔드 아키텍처

### 5.1 주요 컴포넌트

#### 5.1.1 App.jsx - 메인 애플리케이션

**레이아웃:**
```
┌────────────────────────────────────────────┐
│           Header (프로젝트명)               │
├───────────┬──────────────────┬─────────────┤
│           │                  │             │
│  Tabbed   │    Viewer3D      │  Unified    │
│  Panel    │   (Three.js)     │  ChatPanel  │
│  (Left)   │    (Center)      │  (Right)    │
│           │                  │             │
│  - BOP    │                  │  - AI 채팅  │
│  - 설비   │                  │  - 대화     │
│  - 작업자 │                  │  - 히스토리 │
│  - 자재   │                  │             │
│  - 장애물 │                  │             │
│           │                  │             │
└───────────┴──────────────────┴─────────────┘
```

#### 5.1.2 Viewer3D.jsx - 3D 시각화

**기술:** Three.js + @react-three/fiber + @react-three/drei

**주요 기능:**
- 공정 박스 렌더링 (ProcessBox)
- 리소스 마커 렌더링 (ResourceMarker)
  - Equipment: 파란색/빨간색/초록색 (robot/machine/manual_station)
  - Worker: 노란색 캡슐
  - Material: 주황색 박스
- 장애물 렌더링 (fence, zone, pillar, wall)
- 공정 흐름 화살표 (predecessor → successor)
- 카메라 컨트롤 (OrbitControls)
- 클릭 선택 동기화 (테이블 ↔ 3D)
- 드래그 이동 (TransformControls)

**3D 좌표계:**
```
Y (위)
│
│    Z (뒤)
│   ╱
│  ╱
│ ╱
└────────── X (오른쪽)
```

#### 5.1.3 BopTable.jsx - 공정 테이블

**기능:**
- 공정 목록 표시 (부모 + 자식 계층)
- 공정 추가/삭제/수정
- 병렬 라인 추가/삭제
- 공정 연결 (predecessor/successor)
- 리소스 할당/해제
- 프로젝트 설정 (제목, 목표 UPH)
- 내보내기 (Excel, JSON)

**테이블 구조:**
```
┌──────┬────────┬────────┬────────┬──────────┬──────────┐
│ ID   │ Name   │ Desc   │ Cycle  │ Location │ Actions  │
├──────┼────────┼────────┼────────┼──────────┼──────────┤
│ P001 │ 용접   │ ...    │ 120s   │ (0,0,0)  │ ⚙️ 🗑️   │
│  └─1 │ #1     │ ...    │ 120s   │ (0,0,0)  │          │
│  └─2 │ #2     │ ...    │ 115s   │ (0,0,5)  │          │
│ P002 │ 조립   │ ...    │ 90s    │ (5,0,0)  │ ⚙️ 🗑️   │
│  └─1 │ #1     │ ...    │ 90s    │ (5,0,0)  │          │
└──────┴────────┴────────┴────────┴──────────┴──────────┘
```

#### 5.1.4 UnifiedChatPanel.jsx - AI 채팅 패널

**기능:**
- AI 대화 인터페이스 (GPT/Gemini 스타일)
- BOP 생성/수정/QA 통합
- 대화 히스토리 표시
- 자동 스크롤
- 모델 선택 (Gemini/Claude/GPT)

**메시지 타입:**
```typescript
{
  role: 'user' | 'assistant',
  content: string,
  timestamp: Date
}
```

#### 5.1.5 마스터 테이블 컴포넌트

**EquipmentsTable.jsx:**
- 설비 마스터 CRUD
- 사용 공정 표시
- 타입별 색상 구분

**WorkersTable.jsx:**
- 작업자 마스터 CRUD
- 스킬 레벨 관리

**MaterialsTable.jsx:**
- 자재 마스터 CRUD
- 단위 관리

**ObstacleTable.jsx:**
- 장애물 CRUD
- Two-click 생성 모드

### 5.2 API 통신 (api.js)

**주요 함수:**
```javascript
export const api = {
  // BOP 생성/수정/QA
  unifiedChat: (message, currentBop, model) =>
    POST('/api/chat/unified', { message, current_bop: currentBop, model }),

  // 내보내기
  exportExcel: (bopData) =>
    POST('/api/export/excel', bopData, { responseType: 'blob' }),

  export3D: (bopData) =>
    POST('/api/export/3d', bopData, { responseType: 'blob' }),

  // 모델 목록
  getSupportedModels: () =>
    GET('/api/models')
}
```

---

## 6. 데이터 흐름

### 6.1 BOP 생성 플로우

```
┌─────────────┐
│ 사용자 입력 │ "전기 자전거 조립 라인 BOP 만들어줘"
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ UnifiedChatPanel    │ (Frontend)
│ - addMessage(user)  │
└──────┬──────────────┘
       │ api.unifiedChat(message, null)
       ▼
┌─────────────────────┐
│ POST /api/chat/     │ (Backend)
│      unified        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ llm_service.py      │
│ - unified_chat()    │
│ - Gemini API 호출   │
└──────┬──────────────┘
       │ 응답: { message, bop_data }
       ▼
┌─────────────────────┐
│ Pydantic 검증       │
│ - BOPData 파싱      │
│ - validate_refs()   │
│ - detect_cycles()   │
└──────┬──────────────┘
       │ ✓ Valid
       ▼
┌─────────────────────┐
│ Frontend Response   │
│ - addMessage(ai)    │
│ - setBopData()      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ bopStore.js         │
│ - expandParallel()  │ (병렬 확장: 부모+자식 구조)
│ - update state      │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ UI Re-render        │
│ - BopTable          │
│ - Viewer3D          │
│ - ChatPanel         │
└─────────────────────┘
```

### 6.2 BOP 수정 플로우

```
┌─────────────┐
│ 사용자 입력 │ "2번 공정 삭제해줘"
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│ UnifiedChatPanel    │
│ - currentBop 전달   │
└──────┬──────────────┘
       │ api.unifiedChat(message, currentBop)
       ▼
┌─────────────────────┐
│ POST /api/chat/     │
│      unified        │
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ llm_service.py      │
│ - collapseParallel()│ (병렬 축소: JSON 변환)
│ - MODIFY_PROMPT     │
│ - Gemini API 호출   │
└──────┬──────────────┘
       │ 응답: { message, bop_data }
       ▼
┌─────────────────────┐
│ Frontend Response   │
│ - setBopData()      │
│ - expandParallel()  │ (다시 확장)
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│ UI Update           │
└─────────────────────┘
```

### 6.3 병렬 처리 변환 플로우

**Backend → Frontend (Expand):**
```javascript
// Input (Backend JSON)
{
  process_id: "P001",
  parallel_count: 2,
  parallel_lines: [
    { parallel_index: 1, name: "라인#1", cycle_time_sec: 120, ... },
    { parallel_index: 2, name: "라인#2", cycle_time_sec: 115, ... }
  ],
  resources: [...]
}

// expandParallelProcesses() 실행
↓

// Output (Frontend State)
[
  { process_id: "P001", is_parent: true, children: ["P001-01", "P001-02"], ... },
  { process_id: "P001-01", parent_id: "P001", parallel_index: 1, name: "라인#1", ... },
  { process_id: "P001-02", parent_id: "P001", parallel_index: 2, name: "라인#2", ... }
]
```

**Frontend → Backend (Collapse):**
```javascript
// Input (Frontend State)
[
  { process_id: "P001", is_parent: true, ... },
  { process_id: "P001-01", parent_id: "P001", parallel_index: 1, ... },
  { process_id: "P001-02", parent_id: "P001", parallel_index: 2, ... }
]

// collapseParallelProcesses() 실행
↓

// Output (Backend JSON)
{
  process_id: "P001",
  parallel_count: 2,
  parallel_lines: [...],
  resources: [...]
}
```

---

## 7. 3D 시각화

### 7.1 렌더링 규칙

#### 공정 (ProcessBox)

**위치:** `process.location`
**크기:** 고정 (4m × 2m × 3m)
**색상:** 선택 상태에 따라
- 선택됨: `#ffd700` (골드)
- 미선택: `#4a90e2` (파란색)

**병렬 라인:**
- Line #1: `location`
- Line #2: `location + (0, 0, 5)`
- Line #N: `location + (0, 0, 5*(N-1))`

#### 리소스 (ResourceMarker)

**위치:** `process.location + resource.relative_location`

**Equipment 색상 (type별):**
- `robot`: `#4a90e2` (파란색)
- `machine`: `#ff6b6b` (빨간색)
- `manual_station`: `#50c878` (초록색)

**Worker 색상:** `#ffd700` (골드)
**Material 색상:** `#ff8c00` (주황색)

**크기:**
```javascript
// Equipment
robot:          { width: 0.6, height: 1.8, depth: 0.6 }
machine:        { width: 0.8, height: 1.2, depth: 0.8 }
manual_station: { width: 0.6, height: 1.0, depth: 0.6 }

// Worker
{ width: 0.5, height: 1.6, depth: 0.5 }

// Material
{ width: 0.4, height: 0.25, depth: 0.4 }
```

#### 공정 흐름 화살표

**연결:** `predecessor.location → successor.location`
**색상:** `#888888` (회색)
**두께:** 0.05m

#### 장애물 (Obstacle)

**타입별 기본 크기:**
```javascript
fence:  { width: 3,   height: 1.5, depth: 0.1 }
zone:   { width: 3,   height: 0.05, depth: 3 }
pillar: { width: 0.5, height: 3,   depth: 0.5 }
wall:   { width: 4,   height: 2.5, depth: 0.2 }
```

**색상:**
- `fence`: `#ff6b6b` (빨간색, 투명도 0.5)
- `zone`: `#ffff00` (노란색, 투명도 0.3)
- `pillar`: `#888888` (회색)
- `wall`: `#cccccc` (밝은 회색, 투명도 0.7)

### 7.2 카메라 설정

**초기 위치:** `[15, 15, 15]`
**타겟:** `[0, 0, 0]`
**FOV:** 50
**컨트롤:** OrbitControls (회전, 팬, 줌)

---

## 8. 상태 관리

### 8.1 Zustand Store (bopStore.js)

**상태 구조:**
```javascript
{
  // 데이터
  bopData: {
    project_title: string,
    target_uph: number,
    processes: Process[],      // Expanded format (부모+자식)
    equipments: Equipment[],
    workers: Worker[],
    materials: Material[],
    obstacles: Obstacle[]
  },

  // 선택 상태
  selectedProcessKey: string | null,    // "P001-01"
  selectedResourceKey: string | null,   // "equipment:EQ001:P001-01"
  selectedObstacleId: string | null,

  // UI 상태
  activeTab: 'bop' | 'equipments' | 'workers' | 'materials' | 'obstacles',
  use3DModels: boolean,

  // 채팅
  messages: Message[],
  selectedModel: string,

  // 장애물 생성 모드
  obstacleCreationMode: boolean,
  obstacleCreationFirstClick: {x, z} | null,
  pendingObstacleType: 'fence' | 'zone' | 'pillar' | 'wall'
}
```

### 8.2 주요 액션

**프로젝트:**
- `setBopData(data)` - BOP 데이터 설정 (자동 expand)
- `exportBopData()` - BOP 데이터 내보내기 (자동 collapse)
- `updateProjectSettings({ project_title, target_uph })`

**공정 CRUD:**
- `addProcess({ name, description, cycle_time_sec, afterProcessId })`
- `updateProcess(processId, fields)`
- `deleteProcess(processId)`
- `addParallelLine(processId)` - 병렬 라인 추가
- `removeParallelLine(processId)` - 병렬 라인 제거

**공정 연결:**
- `linkProcesses(fromId, toId)` - 공정 연결 (predecessor/successor)
- `unlinkProcesses(fromId, toId)` - 공정 연결 해제

**리소스 할당:**
- `addResourceToProcess(processId, resourceData)`
- `removeResourceFromProcess(processId, resourceType, resourceId)`
- `updateResourceInProcess(processId, resourceType, resourceId, fields)`

**위치/회전/스케일:**
- `updateProcessLocation(processId, newLocation)`
- `updateProcessRotation(processId, rotationY)`
- `updateResourceLocation(processId, resourceType, resourceId, newRelativeLocation)`
- `updateResourceRotation(processId, resourceType, resourceId, rotationY)`
- `updateResourceScale(processId, resourceType, resourceId, scale)`

**마스터 데이터 CRUD:**
- Equipment: `addEquipment()`, `updateEquipment()`, `deleteEquipment()`
- Worker: `addWorker()`, `updateWorker()`, `deleteWorker()`
- Material: `addMaterial()`, `updateMaterial()`, `deleteMaterial()`
- Obstacle: `addObstacle()`, `updateObstacle()`, `deleteObstacle()`

**선택:**
- `setSelectedProcess(processId)`
- `setSelectedResource(resourceType, resourceId, processId)`
- `setSelectedObstacle(obstacleId)`
- `clearSelection()`

**시나리오:**
- `saveScenario(name)` - localStorage에 저장 (collapsed format)
- `loadScenario(id)` - localStorage에서 불러오기 (자동 expand)
- `deleteScenario(id)`
- `listScenarios()`
- `createNewScenario()` - 빈 BOP 생성

**채팅:**
- `addMessage(role, content)`
- `clearMessages()`
- `setSelectedModel(model)`

### 8.3 정규화 (Normalization)

**normalizeProcessCenter():**
- 공정의 리소스들의 바운딩 박스 중심을 (0, 0)으로 이동
- `process.location` 조정 + 모든 `resource.relative_location` 조정
- 3D 뷰에서 공정 박스가 항상 리소스들의 중심에 위치하도록 보장

**calculateBoundingBoxCenter():**
- 공정 내 모든 리소스의 실제 위치 계산
- 회전 및 스케일 고려
- 바운딩 박스 센터 반환

---

## 9. 주요 기능 상세

### 9.1 AI 기반 BOP 생성

**트리거:** 사용자가 채팅에 "자전거 제조 라인 BOP 만들어줘" 입력

**처리:**
1. `UnifiedChatPanel` → `api.unifiedChat(message, null)`
2. Backend: `llm_service.unified_chat(message, None)`
3. AI 판단: "BOP 생성 요청" → `generate_bop()` 호출
4. Gemini API: `SYSTEM_PROMPT` + user input
5. 응답: JSON BOP 데이터
6. Pydantic 검증: `BOPData.validate_references()`, `detect_cycles()`
7. Frontend: `setBopData()` → `expandParallelProcesses()`
8. UI 렌더링: BopTable + Viewer3D

**AI 프롬프트 핵심:**
```
- 3-6개 공정 생성
- 각 공정마다 1-3 설비, 1-2 작업자, 1-3 자재 할당
- 순차적 흐름 (P001 → P002 → P003 → ...)
- 공정 위치: x축만 증가 (y=0, z=0 고정)
- 리소스 상대 좌표: 공정 내부 컴팩트하게 배치
```

### 9.2 대화형 BOP 수정

**트리거:** "2번 공정 삭제해줘", "용접 시간 60초로 변경"

**처리:**
1. `api.unifiedChat(message, currentBop)`
2. Backend: `collapseParallelProcesses(currentBop)` (JSON 변환)
3. AI 판단: "BOP 수정 요청" → `modify_bop()` 호출
4. Gemini API: `MODIFY_PROMPT_TEMPLATE` + current JSON + user request
5. 응답: 수정된 JSON BOP
6. Frontend: `setBopData(newBop)` → `expandParallelProcesses()`
7. UI 업데이트

**변환 예시:**
```javascript
// Frontend State (Expanded)
processes: [
  { process_id: "P001", is_parent: true, children: [...] },
  { process_id: "P001-01", parent_id: "P001", ... },
  { process_id: "P001-02", parent_id: "P001", ... }
]

// collapseParallelProcesses() 실행
↓

// Backend JSON (Collapsed)
{
  process_id: "P001",
  parallel_count: 2,
  parallel_lines: [
    { parallel_index: 1, name: "...", cycle_time_sec: 120, ... },
    { parallel_index: 2, name: "...", cycle_time_sec: 115, ... }
  ],
  resources: [...]
}

// AI 수정 후
↓

// expandParallelProcesses() 실행
↓

// Frontend State (Expanded)
```

### 9.3 3D 드래그 & 클릭

**공정 드래그:**
1. 3D 뷰에서 ProcessBox 클릭 → `setSelectedProcess(processId)`
2. TransformControls 활성화 (translate 모드)
3. 드래그 → `onDragEnd` → `updateProcessLocation(processId, newLocation)`
4. Zustand 상태 업데이트 → UI 리렌더

**리소스 드래그:**
1. ResourceMarker 클릭 → `setSelectedResource(type, id, processId)`
2. TransformControls 활성화
3. 드래그 → `updateResourceLocation()` → `normalizeProcessCenter()`
4. 공정 위치 자동 조정 (바운딩 박스 중심 유지)

**클릭 동기화:**
- 3D 뷰 클릭 → 테이블 행 하이라이트 + 스크롤
- 테이블 행 클릭 → 3D 뷰 카메라 이동 + 선택 표시

### 9.4 병렬 라인 관리

**추가:**
1. BopTable에서 "병렬 라인 추가" 버튼 클릭
2. `addParallelLine(processId)`
3. 첫 번째 라인의 리소스 복제 (Equipment/Worker는 새 ID, Material은 공유)
4. 새 자식 프로세스 생성: `P001-02` (Z축 +5m 오프셋)
5. UI 업데이트: 테이블에 새 행, 3D 뷰에 새 박스

**제거:**
1. "병렬 라인 제거" 버튼 클릭
2. `removeParallelLine(processId)`
3. 자식 프로세스 삭제 (최소 1개 유지)
4. 남은 자식들 재인덱싱 (P001-01, P001-02, ... 순서 유지)
5. UI 업데이트

### 9.5 시나리오 저장/불러오기

**저장:**
1. BopTable에서 "시나리오 저장" 버튼
2. 이름 입력 → `saveScenario(name)`
3. `collapseParallelProcesses(bopData)` (JSON 변환)
4. localStorage에 저장
```javascript
{
  id: "scenario-{timestamp}-{random}",
  name: "자전거 라인 v1",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  data: { ...collapsed BOP... }
}
```

**불러오기:**
1. ScenariosPanel에서 시나리오 선택
2. `loadScenario(id)`
3. localStorage에서 읽기 → `expandParallelProcesses(data)`
4. `setBopData(expanded)` → UI 렌더링

### 9.6 내보내기

**Excel:**
1. `exportBopData()` → `collapseParallelProcesses()`
2. `api.exportExcel(collapsed)` → Backend
3. `openpyxl`로 Excel 생성 (시트: 공정, 설비, 작업자, 자재)
4. `.xlsx` 파일 다운로드

**3D JSON:**
1. `exportBopData()` → collapsed JSON
2. `api.export3D(collapsed)` → Backend
3. 3D 좌표 포함 JSON 반환
4. `.json` 파일 다운로드

---

## 10. 참조 무결성 & 검증

### 10.1 참조 무결성 검증 (validate_references)

**검증 항목:**

1. **Process ID 중복 검사**
   - 모든 `process_id`가 고유한지 확인
   - 중복 발견 시 에러 반환

2. **리소스 참조 검증**
   - ProcessResource의 `resource_id`가 해당 마스터 데이터에 존재하는지 확인
   - Equipment → `equipments` 목록
   - Worker → `workers` 목록
   - Material → `materials` 목록

3. **공정 연결 검증**
   - `predecessor_ids`, `successor_ids`가 `processes` 목록에 존재하는지 확인

**예시:**
```python
# 에러 케이스 1: 존재하지 않는 Equipment 참조
Process P001 → resource_id "EQ999" (equipments에 없음)
→ ValidationError: "Process P001의 equipment_id 'EQ999'가 equipments 목록에 없습니다"

# 에러 케이스 2: 존재하지 않는 선행 공정
Process P002 → predecessor_ids ["P999"]
→ ValidationError: "Process P002의 predecessor_id 'P999'가 processes 목록에 없습니다"
```

### 10.2 순환 참조 검증 (detect_cycles)

**DAG (Directed Acyclic Graph) 구조 보장**

**알고리즘:** DFS (Depth-First Search)

**검증 로직:**
1. 모든 프로세스를 미방문(0) 상태로 초기화
2. 각 프로세스에서 DFS 시작
3. 방문 중(1) 노드를 다시 방문하면 순환 발견 → 에러
4. 완료(2) 노드는 스킵
5. 모든 노드가 완료되면 ✓ Valid

**예시:**
```python
# 순환 케이스 1: 직접 순환
P001 → P002 → P001
→ CycleError: "순환 참조 발견: P001 -> P002 -> P001"

# 순환 케이스 2: 간접 순환
P001 → P002 → P003 → P001
→ CycleError: "순환 참조 발견: P001 -> P002 -> P003 -> P001"

# 정상 케이스: DAG
P001 → P002 → P004
     ↘ P003 ↗
→ ✓ Valid
```

---

## 11. 확장 기능

### 11.1 툴 시스템 (Tools)

**위치:** `app/tools/`

**역할:** BOP 데이터 분석 및 개선 제안

**주요 툴:**
- **bottleneck_analyzer** - 병목 공정 분석
- **worker_skill_analyzer** - 작업자 스킬 매칭 분석
- **process_distance_analyzer** - 공정 간 거리 최적화

**아키텍처:**
```
User Request
     ↓
Tool Router (app/tools/router.py)
     ↓
Tool Executor (app/tools/executor.py)
     ├─ Pre-processing (adapter_pre.py)
     ├─ Analysis
     └─ Post-processing (adapter_post.py)
     ↓
Results (JSON)
```

자세한 내용은 `docs/TOOL_GUIDE.md` 참조.

### 11.2 장애물 시스템

**타입:**
- `fence` - 안전 펜스 (얇은 벽)
- `zone` - 위험 구역 (바닥 마킹)
- `pillar` - 기둥 (구조물)
- `wall` - 벽 (건물 구조)

**생성 모드:**
1. Two-Click 생성: 두 모서리 클릭으로 직사각형 장애물 생성
2. 수동 생성: 테이블에서 직접 추가 + 속성 편집

**사용 사례:**
- 안전 구역 표시
- 작업 공간 제약 시각화
- 공장 레이아웃 모델링

---

## 12. 개발 가이드

### 12.1 로컬 개발 환경 설정

**1. 백엔드 실행:**
```bash
# 가상환경 생성 및 활성화
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt

# .env 파일 생성 (API 키 입력)
echo "GEMINI_API_KEY=your_api_key" > .env

# 서버 실행
uvicorn app.main:app --reload
# → http://localhost:8000
```

**2. 프론트엔드 실행:**
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
# → http://localhost:5173
```

### 12.2 주요 개발 패턴

**새 컴포넌트 추가:**
```javascript
// src/components/MyComponent.jsx
import useBopStore from '../store/bopStore';

function MyComponent() {
  const { bopData, someAction } = useBopStore();

  // 컴포넌트 로직

  return <div>...</div>;
}

export default MyComponent;
```

**새 API 엔드포인트 추가:**
```python
# app/main.py
@app.post("/api/my-endpoint")
async def my_endpoint(request: MyRequest):
    # 로직
    return {"result": "..."}
```

**새 Zustand 액션 추가:**
```javascript
// src/store/bopStore.js
const useBopStore = create((set) => ({
  // 상태
  myState: null,

  // 액션
  myAction: (param) => set((state) => {
    // 상태 업데이트 로직
    return { myState: newValue };
  })
}));
```

### 12.3 디버깅

**백엔드 로그:**
```python
# app/llm_service.py
print(f"[DEBUG] User input: {user_input}")
print(f"[DEBUG] AI response: {response_text}")
```

**프론트엔드 로그:**
```javascript
// src/store/bopStore.js
console.log('[STORE] setBopData called with:', data);
console.log('[STORE] Expanded processes:', expandedData.processes);
```

**브라우저 개발자 도구:**
- Network 탭: API 요청/응답 확인
- Console 탭: 로그 및 에러 확인
- React DevTools: 컴포넌트 상태 확인

---

## 13. 트러블슈팅

### 13.1 일반적인 문제

**문제 1: API 키 오류**
```
Error: Gemini API key not found
```
**해결:**
- `.env` 파일에 `GEMINI_API_KEY=...` 추가 (따옴표 없이)
- 백엔드 서버 재시작

**문제 2: CORS 오류**
```
Access to fetch ... from origin ... has been blocked by CORS policy
```
**해결:**
- `app/main.py`에서 `allow_origins`에 프론트엔드 URL 추가
- 백엔드 재시작

**문제 3: 3D 뷰가 안 보임**
```
TypeError: Cannot read property 'x' of undefined
```
**해결:**
- `bopData`가 null인지 확인
- 공정에 `location` 필드가 있는지 확인
- 브라우저 콘솔에서 에러 확인

**문제 4: 병렬 프로세스 버그**
```
Process P001-02 not found
```
**해결:**
- `expandParallelProcesses()`가 제대로 실행되었는지 확인
- localStorage 클리어 후 재시도
- `collapseParallelProcesses()` 전에 데이터 검증

### 13.2 로그 확인

**백엔드 로그:**
```bash
# uvicorn 실행 시 자동으로 콘솔 출력
uvicorn app.main:app --reload --log-level debug
```

**프론트엔드 로그:**
```javascript
// bopStore.js에 로그 추가
console.log('[STORE] Current state:', useBopStore.getState());
```

---

## 14. 향후 개선 방향

### 14.1 기능 개선

- [ ] Undo/Redo 기능
- [ ] 공정 템플릿 저장/불러오기
- [ ] 자동 레이아웃 알고리즘
- [ ] 실시간 협업 (WebSocket)
- [ ] 시뮬레이션 기능 (공정 흐름 애니메이션)

### 14.2 성능 최적화

- [ ] 3D 렌더링 최적화 (LOD, Instancing)
- [ ] 대규모 BOP 처리 (가상 스크롤)
- [ ] AI 응답 캐싱
- [ ] 웹 워커 활용 (무거운 연산)

### 14.3 사용성 개선

- [ ] 온보딩 튜토리얼
- [ ] 키보드 단축키
- [ ] 다국어 지원 (i18n)
- [ ] 다크 모드
- [ ] 반응형 디자인 (모바일)

---

## 15. 참고 문서

- [NEW_BOP_STRUCTURE.md](./NEW_BOP_STRUCTURE.md) - BOP 데이터 구조 상세
- [TOOL_GUIDE.md](./docs/TOOL_GUIDE.md) - 툴 시스템 가이드
- [README.md](./README.md) - 프로젝트 개요 및 설치 가이드
- [FastAPI 공식 문서](https://fastapi.tiangolo.com/)
- [React 공식 문서](https://react.dev/)
- [Three.js 공식 문서](https://threejs.org/docs/)
- [Zustand 공식 문서](https://zustand-demo.pmnd.rs/)

---

**작성일:** 2025-01-XX
**버전:** 1.0
**작성자:** Claude Code
