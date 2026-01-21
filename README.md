# BOP Generator

AI 기반 제조 공정 계획(Bill of Process) 자동 생성 및 관리 시스템

## 📋 프로젝트 소개

BOP Generator는 Google Gemini AI를 활용하여 제조 공정을 자동으로 생성하고 관리하는 웹 애플리케이션입니다. 자연어로 요청하면 AI가 현실적인 제조 공정을 설계하고, 3D로 시각화하며, 대화형 인터페이스를 통해 수정할 수 있습니다.

## ✨ 주요 기능

### 1. AI 기반 BOP 생성
- 자연어 입력으로 제조 공정 자동 생성
- 현실적인 사이클 타임 및 리소스 배정
- 4-8개의 논리적으로 정렬된 공정 단계

### 2. 통합 AI 어시스턴트
- GPT/Gemini 웹과 유사한 대화형 인터페이스
- BOP 생성, 수정, QA를 하나의 세션에서 처리
- 대화 히스토리 자동 저장 및 스크롤 지원

### 3. 3D 시각화
- Three.js 기반 실시간 3D 렌더링
- 리소스 타입별 색상 구분 (로봇/기계/사람)
- 클릭 동기화: 테이블과 3D 뷰 간 선택 동기화

### 4. 인터랙티브 BOP 테이블
- 전체 공정 단계 표시
- 클릭으로 3D 뷰와 동기화
- 요약 정보 (총 단계 수, 최대 사이클 타임)

### 5. 데이터 내보내기
- Excel (.xlsx) 형식으로 내보내기
- 3D 좌표 포함 JSON 내보내기

## 🛠️ 기술 스택

### Frontend
- **React 19** - UI 프레임워크
- **Vite** - 빌드 도구
- **Three.js** - 3D 그래픽
- **@react-three/fiber** - React용 Three.js 래퍼
- **@react-three/drei** - Three.js 헬퍼
- **Zustand** - 상태 관리

### Backend
- **FastAPI** - Python 웹 프레임워크
- **Pydantic** - 데이터 검증
- **Google Gemini 2.5 Flash** - AI 모델
- **openpyxl** - Excel 파일 생성
- **python-dotenv** - 환경 변수 관리

## 📦 설치 방법

### 사전 요구사항
- Node.js 18+
- Python 3.8+
- Google Gemini API 키

### 1. 저장소 클론
```bash
git clone <repository-url>
cd 26_gen_dt
```

### 2. 백엔드 설정
```bash
# 가상환경 생성 (권장)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 의존성 설치
pip install -r requirements.txt
```

### 3. 프론트엔드 설정
```bash
cd src
npm install
```

## ⚙️ 환경 설정

프로젝트 루트에 `.env` 파일을 생성하고 Gemini API 키를 입력하세요:

```env
GEMINI_API_KEY=your_api_key_here
```

**중요:**
- API 키는 따옴표 없이 입력
- [Google AI Studio](https://makersuite.google.com/app/apikey)에서 무료 API 키 발급 가능

## 🚀 실행 방법

### 1. 백엔드 서버 시작
```bash
# 프로젝트 루트에서
uvicorn app.main:app --reload
```
→ http://localhost:8000 에서 실행

### 2. 프론트엔드 서버 시작
```bash
# src 디렉토리에서
npm run dev
```
→ http://localhost:5173 에서 실행

### 3. 브라우저 열기
http://localhost:5173 접속

## 💡 사용 방법

### BOP 생성
1. 오른쪽 AI 어시스턴트 패널에 요청 입력
   ```
   예: "자전거 제조 라인 BOP 만들어줘"
   예: "전기차 배터리 조립 라인 생성해줘, 목표 UPH 100"
   ```
2. AI가 자동으로 BOP 생성
3. 왼쪽 테이블과 중앙 3D 뷰에서 확인

### BOP 수정
대화형으로 수정 요청:
```
"3번 공정 삭제해줘"
"검사 공정 추가해줘"
"용접 시간을 60초로 변경해줘"
"2번 공정에 로봇 1대 더 추가해줘"
```

### BOP 질문 (QA)
```
"현재 bottleneck이 뭐야?"
"총 사이클 타임은?"
"로봇이 사용되는 공정은?"
```

### 3D 뷰 조작
- **좌클릭 드래그**: 회전
- **우클릭 드래그**: 이동
- **스크롤**: 줌
- **박스 클릭**: 해당 공정 선택

### 데이터 내보내기
BOP 테이블 하단의 내보내기 버튼 사용:
- **📊 Excel**: 전체 BOP 데이터를 Excel 파일로 저장
- **🎨 3D JSON**: 3D 좌표 포함 JSON 파일로 저장

## 📁 프로젝트 구조

```
26_gen_dt/
├── app/                      # 백엔드
│   ├── main.py              # FastAPI 앱 및 엔드포인트
│   ├── models.py            # Pydantic 모델
│   ├── prompts.py           # AI 프롬프트 템플릿
│   └── llm_service.py       # Gemini API 통신
├── src/                      # 프론트엔드
│   ├── components/
│   │   ├── BopTable.jsx     # BOP 테이블 + 내보내기
│   │   ├── Viewer3D.jsx     # 3D 시각화
│   │   └── UnifiedChatPanel.jsx  # AI 어시스턴트
│   ├── services/
│   │   └── api.js           # API 통신
│   ├── store/
│   │   └── bopStore.js      # Zustand 상태 관리
│   ├── App.jsx              # 메인 앱
│   └── main.jsx             # 엔트리 포인트
├── .env                      # 환경 변수 (API 키)
├── requirements.txt          # Python 의존성
└── README.md                # 이 파일
```

## 🔌 API 엔드포인트

### POST /api/chat/unified
통합 채팅 엔드포인트 (생성/수정/QA)

**Request:**
```json
{
  "message": "자전거 제조 라인 BOP 만들어줘",
  "current_bop": null  // 또는 기존 BOP 데이터
}
```

**Response:**
```json
{
  "message": "자전거 제조 라인 BOP를 생성했습니다...",
  "bop_data": {  // 선택적 (BOP 생성/수정 시만)
    "project_title": "Bicycle Factory",
    "target_uph": 60,
    "steps": [...]
  }
}
```

### POST /api/export/excel
BOP를 Excel 파일로 내보내기

**Request:** BOPData JSON
**Response:** .xlsx 파일

### POST /api/export/3d
BOP를 3D JSON으로 내보내기

**Request:** BOPData JSON
**Response:** .json 파일 (3D 좌표 포함)

## 🎨 리소스 타입 및 색상

| 리소스 타입 | 설명 | 3D 색상 |
|------------|------|---------|
| robot | 자동화 로봇 | 🟦 파란색 (#4a90e2) |
| human | 수작업 | 🟩 초록색 (#50c878) |
| machine | 반자동 기계 | 🟥 빨간색 (#ff6b6b) |

## 🔧 개발 팁

### API 키 문제 해결
```bash
# .env 파일 확인 (따옴표 없이)
GEMINI_API_KEY=AIzaSy...

# 백엔드 서버 재시작
uvicorn app.main:app --reload
```

### CORS 오류 시
`app/main.py`에서 프론트엔드 포트 확인:
```python
allow_origins=["http://localhost:5173", ...]
```

### 3D 뷰가 안 보일 때
- 브라우저 콘솔에서 에러 확인
- React 버전이 19인지 확인 (`package.json`)
- WebGL 지원 브라우저 사용

## 📝 데이터 모델

### ProcessStep
```typescript
{
  step_id: number,           // 공정 ID (1부터 시작)
  name: string,              // 공정 이름
  description: string,       // 공정 설명
  cycle_time_sec: number,    // 사이클 타임 (초)
  resource_type: "robot" | "machine" | "human",
  resource_count: number     // 리소스 개수
}
```

### BOPData
```typescript
{
  project_title: string,     // 프로젝트 제목
  target_uph: number,        // 목표 시간당 생산량
  steps: ProcessStep[]       // 공정 단계 배열
}
```

## 🤝 기여

이슈 및 PR 환영합니다!

## 📄 라이선스

MIT License

## 👨‍💻 개발자

- AI 모델: Google Gemini 2.5 Flash
- 프레임워크: FastAPI, React, Three.js

---

**Happy Manufacturing! 🏭**
