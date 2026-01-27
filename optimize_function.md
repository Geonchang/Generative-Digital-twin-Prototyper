

---

# **Feature Specification: Dynamic Solver Onboarding Framework**

## **1. 개요 (Overview)**

* **목표:** 사용자가 업로드한 외부 최적화 스크립트(.py)나 실행 파일(.exe)을 시스템이 자동으로 분석하여, GDP 시스템의 BOP(Bill of Process) 데이터와 연동되는 **'실행 가능한 도구(Executable Tool)'**로 등록한다.
* **핵심 가치:** 레거시 최적화 도구의 **Code-less Integration** (별도의 인터페이스 개발 없이 AI가 어댑터 코드를 자동 합성).

## **2. 사용자 워크플로우 (User Flow)**

1. **Upload:** 사용자가 `최적화_스크립트.py`와 (선택사항) `예제_입력_데이터.csv`를 업로드한다.
2. **Analyze:** 시스템(LLM)이 코드를 분석하여 **"필요한 입력 변수(Input Schema)"**와 **"출력 결과(Output Schema)"**를 추출하고 사용자에게 확인받는다.
3. **Synthesize:** 사용자가 승인하면, 시스템은 BOP JSON 데이터를 스크립트 입력 포맷으로 변환하는 **Adapter Code**를 자동 생성한다.
4. **Register:** 해당 도구가 `My_Optimization_Tool`이라는 이름으로 시스템에 등록된다.
5. **Execute:** 채팅창에서 "내 툴로 최적화해줘"라고 하면 해당 스크립트가 실행되고, 결과가 3D 공장에 반영된다.

---

## **3. 상세 기능 요구사항 (Functional Requirements)**

### **FR-1. 도구 분석기 (Tool Analyzer)**

* **입력:** 소스 코드(String) 또는 실행 파일 + 예제 입출력 파일.
* **동작:** LLM을 사용하여 해당 스크립트가 실행되기 위해 필요한 Arguments나 Input File 구조를 파악한다.
* **출력:** `ToolMetadata` JSON (아래 데이터 구조 참조).

### **FR-2. 어댑터 합성기 (Adapter Synthesizer)**

* **입력:** `ToolMetadata` (분석된 입출력 구조) + `Current BOP Schema` (현재 공장 데이터 구조).
* **동작:**
* **Pre-processor 생성:** GDP의 BOP JSON에서 데이터를 추출하여, 최적화 도구가 요구하는 Input format(예: CSV, args)으로 변환하는 Python 함수 생성.
* **Post-processor 생성:** 최적화 도구의 Output 결과(예: CSV, console log)를 파싱하여, GDP의 BOP JSON을 업데이트하는 Python 함수 생성.


* **제약:** 생성된 코드는 샌드박스 형태나 격리된 함수로 실행 가능해야 함.

### **FR-3. 도구 레지스트리 (Tool Registry)**

* **동작:** 분석된 메타데이터와 생성된 어댑터 코드를 로컬 스토리지(JSON 파일 등)에 저장하여 영속화한다.
* **관리:** 등록된 도구 목록 조회, 삭제 기능을 제공한다.

### **FR-4. 실행 오케스트레이터 (Execution Orchestrator)**

* **동작:** Chat Agent가 도구 사용을 요청하면 다음 순서로 실행한다.
1. 현재 BOP 데이터 로드.
2. `Pre-processor` 실행 → 외부 도구 Input 생성.
3. `External Script` 실행 (Subprocess 등 활용).
4. `Post-processor` 실행 → BOP 데이터 업데이트.
5. 업데이트된 BOP를 클라이언트로 반환.



---

## **4. 데이터 구조 (Data Structures)**

개발 시 다음 JSON 스키마를 준수하여 구현할 것.

### **4.1. Tool Metadata (도구 정의서)**

```json
{
  "tool_name": "line_balancer_v1",
  "description": "Calculates optimal worker count based on cycle time.",
  "execution_type": "python", // or "executable"
  "file_path": "./uploads/optimizer.py",
  "input_schema": {
    "type": "csv",
    "columns": ["process_id", "cycle_time"],
    "description": "Requires a CSV file with process IDs and their cycle times."
  },
  "output_schema": {
    "type": "json",
    "fields": ["optimized_worker_count"],
    "description": "Returns a JSON with the suggested worker count."
  }
}

```

### **4.2. Adapter Logic (생성된 어댑터 코드 저장소)**

```json
{
  "tool_id": "line_balancer_v1",
  "pre_process_code": "def convert_bop_to_input(bop_json): ... returns csv_string",
  "post_process_code": "def apply_result_to_bop(bop_json, tool_output): ... returns new_bop_json"
}

```

---

## **5. 프롬프트 엔지니어링 가이드 (Prompt Specs)**

LLM에게 어댑터 생성을 요청할 때 다음 논리를 포함해야 한다.

### **Prompt: Adapter Synthesis**

```text
Role: You are a Python Integration Expert.

Task: Write two Python functions to bridge 'GDP BOP Data' and 'External Tool'.

Context 1 (Source Data): The GDP BOP JSON structure is:
{ "steps": [ { "id": 1, "name": "Welding", "cycle_time": 120, "resource_count": 1 } ] }

Context 2 (Target Tool Requirement):
The tool requires a CSV file with columns: "id, time".

Request:
1. Write `pre_process(bop_data)`: Extracts 'id' and 'cycle_time' from BOP and returns a CSV string.
2. Write `post_process(bop_data, tool_output)`: Parses the tool output and updates 'resource_count' in the BOP data.

Output: Provide ONLY the Python code block.

```

---

## **6. 개발 체크리스트 (Acceptance Criteria)**

1. [ ] `.py` 파일을 업로드하면 LLM이 입출력을 분석하여 요약해주는가?
2. [ ] 등록 버튼을 누르면 어댑터 코드가 자동 생성되어 저장되는가?
3. [ ] 채팅창에서 등록된 도구를 호출하면, 실제 파일이 실행되고 BOP 데이터(예: 작업자 수)가 변경되는가?
4. [ ] 실행 중 에러(문법 오류 등) 발생 시 사용자에게 알림이 가는가?