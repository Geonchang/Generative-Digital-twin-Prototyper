# 최적화 도구 등록 및 사용 가이드

## 개요

GDP(Generative Digital-twin Prototyper) 시스템에서 외부 Python 스크립트를 최적화 도구로 등록하고 BOP 데이터에 적용하는 방법을 설명합니다.

---

## 1. 도구 등록 과정

### 1.1 등록 흐름

```
Python 스크립트 업로드
    ↓
Gemini API 분석 (input/output 스키마 추출)
    ↓
Adapter 코드 자동 생성
    ↓
사용자 파라미터 입력 (필요시)
    ↓
도구 등록 완료
```

### 1.2 스크립트 요구사항

도구로 등록할 Python 스크립트는 다음 형식을 지원해야 합니다:

| 입력 타입 | 설명 | 예시 |
|-----------|------|------|
| `json` | JSON 파일 입력 | `--input input.json --output output.json` |
| `csv` | CSV 파일 입력 | `--input data.csv --output result.csv` |
| `args` | 명령줄 인자 | `--width 10 --length 20` |
| `stdin` | 표준 입력 | 파이프라인 입력 |

### 1.3 분석 결과 스키마

```json
{
  "tool_name": "column_planner",
  "description": "기둥 위치 계산 도구",
  "execution_type": "python",
  "input_schema": {
    "type": "json",
    "fields": ["width", "length", "interval"],
    "description": "공간 크기와 간격 정보"
  },
  "output_schema": {
    "type": "json",
    "fields": ["columns"],
    "description": "기둥 위치 배열"
  },
  "params_schema": [
    {"key": "width", "label": "폭 (m)", "type": "number", "default": 10, "required": true},
    {"key": "length", "label": "길이 (m)", "type": "number", "default": 20, "required": true},
    {"key": "interval", "label": "간격 (m)", "type": "number", "default": 5, "required": true}
  ]
}
```

---

## 2. BOP 데이터 구조

### 2.1 전체 구조

```json
{
  "project_title": "프로젝트명",
  "target_uph": 60,
  "processes": [...],
  "equipments": [...],
  "workers": [...],
  "materials": [...],
  "obstacles": [...]
}
```

### 2.2 공정 (processes) 구조

**중요:** 공정의 상세 정보(name, location 등)는 `parallel_lines[]` 안에 정의됩니다.

```json
{
  "process_id": "P001",
  "parallel_count": 2,
  "predecessor_ids": [],
  "successor_ids": ["P002"],
  "parallel_lines": [
    {
      "parallel_index": 1,
      "name": "조립 공정",
      "description": "메인 라인",
      "cycle_time_sec": 60.0,
      "location": { "x": 0, "y": 0, "z": 0 },
      "rotation_y": 0
    },
    {
      "parallel_index": 2,
      "name": "조립 공정",
      "description": "보조 라인",
      "cycle_time_sec": 65.0,
      "location": { "x": 0, "y": 0, "z": 5 },
      "rotation_y": 0
    }
  ],
  "resources": [
    {
      "resource_type": "equipment",
      "resource_id": "EQ-ROBOT-01",
      "quantity": 1,
      "role": "용접",
      "relative_location": { "x": 0.5, "y": 0, "z": 0 },
      "rotation_y": 0,
      "scale": { "x": 1, "y": 1, "z": 1 },
      "parallel_line_index": 0
    }
  ]
}
```

### 2.3 장비/작업자/자재

```json
// 장비
{ "equipment_id": "EQ-ROBOT-01", "name": "용접 로봇", "type": "robot" }

// 작업자
{ "worker_id": "W001", "name": "작업자1", "skill_level": "Senior" }

// 자재
{ "material_id": "M001", "name": "철판", "unit": "ea" }
```

### 2.4 장애물 (obstacles)

```json
{
  "obstacle_id": "OBS001",
  "name": "안전 펜스",
  "type": "fence",
  "position": { "x": 5, "y": 0, "z": 0 },
  "size": { "width": 3, "height": 1.5, "depth": 0.1 },
  "rotation_y": 0
}
```

---

## 3. Adapter 코드

### 3.1 역할

Adapter는 BOP 데이터와 외부 도구 사이의 변환을 담당합니다:

```
BOP 데이터 → [convert_bop_to_input] → 도구 입력
도구 출력 → [apply_result_to_bop] → BOP 데이터 업데이트
```

### 3.2 convert_bop_to_input 예시

```python
def convert_bop_to_input(bop_json, params):
    """BOP 데이터를 도구 입력 형식으로 변환"""
    import json

    # params에서 값 가져오기 (BOP에 없는 값)
    width = params.get('width', 10)
    length = params.get('length', 20)
    interval = params.get('interval', 5)

    # 공정 정보 접근 (새 구조: parallel_lines 사용)
    processes = bop_json.get('processes', [])
    if processes:
        first_process = processes[0]
        first_line = first_process.get('parallel_lines', [{}])[0]
        location = first_line.get('location', {'x': 0, 'y': 0, 'z': 0})

    input_data = {
        'width': width,
        'length': length,
        'interval': interval
    }

    return json.dumps(input_data)
```

### 3.3 apply_result_to_bop 예시

```python
def apply_result_to_bop(bop_json, tool_output):
    """도구 출력을 BOP에 반영"""
    import json
    import copy

    result = json.loads(tool_output)
    updated_bop = copy.deepcopy(bop_json)

    # 결과를 obstacles로 추가
    columns = result.get('columns', [])
    existing_obstacles = updated_bop.get('obstacles', [])

    for i, col in enumerate(columns):
        obstacle = {
            'obstacle_id': 'OBS' + str(len(existing_obstacles) + i + 1).zfill(3),
            'name': '기둥',
            'type': 'pillar',
            'position': {'x': col['x'], 'y': 0, 'z': col['z']},
            'size': {'width': 0.5, 'height': 3, 'depth': 0.5},
            'rotation_y': 0
        }
        existing_obstacles.append(obstacle)

    updated_bop['obstacles'] = existing_obstacles
    return updated_bop
```

---

## 4. 도구 실행

### 4.1 실행 흐름

```
1. 사용자가 도구 선택 및 파라미터 입력
2. convert_bop_to_input() 실행 → 입력 파일 생성
3. Python 스크립트 실행 (subprocess)
4. apply_result_to_bop() 실행 → BOP 업데이트
5. 3D 뷰어에 결과 반영
```

### 4.2 파일 구조

```
uploads/
├── scripts/
│   └── column_planner/
│       └── column_maker.py
└── workdir/
    └── column_planner_1234567890/
        ├── input_data.json
        └── output_data.json
```

---

## 5. params_schema 규칙

### 5.1 BOP에 없는 값

도구가 필요로 하지만 BOP에 없는 값은 `params_schema`로 정의합니다:

```json
{
  "key": "process_width",
  "label": "공정 폭 (m)",
  "type": "number",
  "default": 2.0,
  "required": true,
  "description": "공정 X축 크기"
}
```

### 5.2 BOP 값 오버라이드

BOP에 있는 값을 오버라이드할 수 있게 하려면:

```json
{
  "key": "target_uph",
  "label": "목표 UPH",
  "type": "number",
  "default": null,
  "required": false,
  "description": "미입력시 BOP 값 사용"
}
```

Adapter에서:
```python
target_uph = params.get('target_uph') or bop_json.get('target_uph', 60)
```

---

## 6. 주의사항

### 6.1 새 BOP 구조

- 공정의 `name`, `description`, `cycle_time_sec`, `location`, `rotation_y`는 **process 레벨이 아닌 `parallel_lines[]` 안에** 정의됩니다.
- 모든 공정은 `parallel_lines[]` 배열을 가집니다 (parallel_count=1이어도).

```python
# 잘못된 접근 (이전 구조)
process['location']
process['name']

# 올바른 접근 (새 구조)
process['parallel_lines'][0]['location']
process['parallel_lines'][0]['name']
```

### 6.2 장애물 필드명

```python
# 잘못된 접근
obstacle['pos']
obstacle['size']['x']

# 올바른 접근
obstacle['position']
obstacle['size']['width']  # width, height, depth 사용
```

### 6.3 도구 재등록

BOP 구조가 변경된 경우, 기존 도구의 adapter 코드가 맞지 않을 수 있습니다.
→ **도구를 삭제하고 다시 등록**하면 새 구조에 맞는 adapter가 생성됩니다.

---

## 7. 자동 에러 복구 (Auto-Repair)

### 7.1 개요

도구 실행 중 어댑터 코드 오류가 발생하면, 시스템이 자동으로 Gemini API를 호출하여 코드를 분석하고 수정합니다.

```
도구 실행 시작
    ↓
Pre-processor 실행
    ↓
오류 발생? ─── No ──→ 스크립트 실행
    ↓ Yes
에러 정보 수집 (타입, 메시지, 트레이스백)
    ↓
Gemini API 호출 (에러 분석 + 코드 수정)
    ↓
수정된 코드로 재시도 (최대 2회)
    ↓
성공? ─── Yes ──→ 수정된 코드를 레지스트리에 저장
    ↓ No
사용자에게 오류 반환
```

### 7.2 자동 복구 대상

| 오류 유형 | 자동 복구 | 예시 |
|-----------|----------|------|
| Pre-processor 오류 | ✅ | `KeyError`, `TypeError`, 잘못된 BOP 필드 접근 |
| Post-processor 오류 | ✅ | 출력 파싱 오류, BOP 업데이트 오류 |
| 스크립트 실행 오류 | ❌ | 외부 스크립트 자체 버그 (사용자 영역) |
| 타임아웃 | ❌ | 60초 초과 |
| 환경 오류 | ❌ | Python 버전, 패키지 미설치 |

### 7.3 복구 프로세스

1. **에러 정보 수집**
   - 에러 타입 (`TypeError`, `KeyError` 등)
   - 에러 메시지
   - 전체 트레이스백
   - 입력 데이터 (BOP JSON 또는 도구 출력)

2. **Gemini API 호출**
   - 에러 분석 요청
   - 새 BOP 구조 정보 제공
   - 수정된 코드 생성 요청

3. **코드 수정 및 재시도**
   - 수정된 코드로 함수 재실행
   - 최대 2회 시도

4. **레지스트리 업데이트**
   - 성공 시 수정된 어댑터 코드를 레지스트리에 저장
   - 다음 실행부터는 수정된 코드 사용

### 7.4 응답 필드

자동 복구가 수행된 경우 응답에 추가 필드가 포함됩니다:

```json
{
  "success": true,
  "message": "도구 실행이 완료되었습니다. (자동 복구 1회 수행)",
  "updated_bop": {...},
  "auto_repaired": true
}
```

### 7.5 로그 확인

자동 복구 시도는 실행 로그에 기록됩니다:

```
data/tool_logs/{tool_id}/{timestamp}.json
```

```json
{
  "tool_id": "column_planner",
  "auto_repair_attempts": 1,
  "auto_repair_success": true,
  ...
}
```

---

## 8. 트러블슈팅

### 7.1 TypeError: 'NoneType' object is not subscriptable

**원인:** Adapter가 이전 BOP 구조를 기준으로 작성됨

**해결:**
1. 도구 삭제 후 재등록
2. 또는 adapter 코드 수동 수정 (parallel_lines 접근으로 변경)

### 7.2 병렬 공정이 겹쳐서 배치됨

**원인:** 새 병렬 라인의 위치가 첫 번째 라인 기준으로 계산되지 않음

**해결:** `expandParallelProcesses` 함수에서 Z축 오프셋 적용 확인

### 7.3 도구 실행 후 결과가 반영되지 않음

**원인:** `apply_result_to_bop`이 BOP를 올바르게 업데이트하지 않음

**해결:**
1. 도구 출력 형식 확인
2. adapter의 `apply_result_to_bop` 코드 확인
3. 반드시 전체 BOP를 반환해야 함 (변경된 부분만 X)

---

## 8. 예제: 기둥 배치 도구

### 8.1 스크립트 (column_maker.py)

```python
import json
import argparse

def calculate_positions(data):
    width = float(data['width'])
    length = float(data['length'])
    interval = float(data['interval'])

    columns = []
    x = 0
    while x <= width:
        z = 0
        while z <= length:
            columns.append({'x': x, 'z': z})
            z += interval
        x += interval

    return {'columns': columns}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    with open(args.input, 'r') as f:
        input_data = json.load(f)

    result = calculate_positions(input_data)

    with open(args.output, 'w') as f:
        json.dump(result, f, indent=2)

if __name__ == '__main__':
    main()
```

### 8.2 등록 시 params_schema

```json
[
  {"key": "width", "label": "폭 (m)", "type": "number", "default": 10, "required": true},
  {"key": "length", "label": "길이 (m)", "type": "number", "default": 20, "required": true},
  {"key": "interval", "label": "간격 (m)", "type": "number", "default": 5, "required": true}
]
```

### 8.3 실행 결과

기둥이 obstacles로 추가되어 3D 뷰어에 표시됩니다.

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|-----------|
| 2024-02 | 초기 문서 작성 |
| 2024-02 | BOP 구조 변경 (parallel_lines 도입) |
