// Mock BOP data for development and testing
// Follows the new structure: y=0, z=0 fixed, x-axis increments of 5 (left to right)

export const mockBopData = {
  "project_title": "전기 자전거 조립 라인",
  "target_uph": 120,
  "processes": [
    {
      "process_id": "P001",
      "name": "프레임 용접",
      "description": "메인 프레임과 서브 프레임을 용접하여 기본 골격 제작",
      "cycle_time_sec": 180.0,
      "parallel_count": 2,
      "location": { "x": 0, "y": 0, "z": 0 },
      "rotation_y": 0,
      "predecessor_ids": [],
      "successor_ids": ["P002"],
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ-ROBOT-01",
          "quantity": 1,
          "parallel_line_index": 0,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Main welding robot #1"
        },
        {
          "resource_type": "worker",
          "resource_id": "W001",
          "quantity": 1,
          "parallel_line_index": 0,
          "relative_location": { "x": 1.0, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Welding operator #1"
        },
        {
          "resource_type": "equipment",
          "resource_id": "EQ-ROBOT-02",
          "quantity": 1,
          "parallel_line_index": 1,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Main welding robot #2"
        },
        {
          "resource_type": "worker",
          "resource_id": "W002",
          "quantity": 1,
          "parallel_line_index": 1,
          "relative_location": { "x": 1.0, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Welding operator #2"
        },
        {
          "resource_type": "material",
          "resource_id": "M-STEEL-001",
          "quantity": 5.2,
          "relative_location": { "x": -1.2, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Frame material"
        }
      ]
    },
    {
      "process_id": "P002",
      "name": "도장",
      "description": "프레임 표면 전처리 후 분체 도장 실시",
      "cycle_time_sec": 120.0,
      "parallel_count": 1,
      "location": { "x": 5, "y": 0, "z": 0 },
      "rotation_y": 0,
      "predecessor_ids": ["P001"],
      "successor_ids": ["P003"],
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ-MACHINE-01",
          "quantity": 1,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Powder coating booth"
        },
        {
          "resource_type": "worker",
          "resource_id": "W002",
          "quantity": 1,
          "relative_location": { "x": 1.0, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Coating operator"
        },
        {
          "resource_type": "material",
          "resource_id": "M-PAINT-001",
          "quantity": 0.8,
          "relative_location": { "x": -1.2, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Coating powder"
        }
      ]
    },
    {
      "process_id": "P003",
      "name": "전장 조립",
      "description": "배터리, 모터, 컨트롤러 등 전장 부품 조립",
      "cycle_time_sec": 240.0,
      "parallel_count": 2,
      "location": { "x": 10, "y": 0, "z": 0 },
      "rotation_y": 0,
      "predecessor_ids": ["P002"],
      "successor_ids": ["P004"],
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ-MANUAL-01",
          "quantity": 1,
          "parallel_line_index": 0,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Assembly workstation #1"
        },
        {
          "resource_type": "worker",
          "resource_id": "W003",
          "quantity": 2,
          "parallel_line_index": 0,
          "relative_location": { "x": 0.9, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Electronics assembler #1"
        },
        {
          "resource_type": "equipment",
          "resource_id": "EQ-MANUAL-03",
          "quantity": 1,
          "parallel_line_index": 1,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Assembly workstation #2"
        },
        {
          "resource_type": "worker",
          "resource_id": "W007",
          "quantity": 2,
          "parallel_line_index": 1,
          "relative_location": { "x": 0.9, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Electronics assembler #2"
        },
        {
          "resource_type": "material",
          "resource_id": "M-BATTERY-001",
          "quantity": 1,
          "relative_location": { "x": -1.0, "y": 0, "z": 0.4 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Battery pack"
        },
        {
          "resource_type": "material",
          "resource_id": "M-MOTOR-001",
          "quantity": 1,
          "relative_location": { "x": -1.0, "y": 0, "z": -0.4 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Hub motor"
        }
      ]
    },
    {
      "process_id": "P004",
      "name": "프레임 및 조립",
      "description": "바퀴, 브레이크, 핸들 등 기계 부품 조립",
      "cycle_time_sec": 200.0,
      "parallel_count": 2,
      "location": { "x": 15, "y": 0, "z": 0 },
      "rotation_y": 0,
      "predecessor_ids": ["P003"],
      "successor_ids": ["P005"],
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ-MANUAL-02",
          "quantity": 1,
          "parallel_line_index": 0,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Assembly station #1"
        },
        {
          "resource_type": "worker",
          "resource_id": "W004",
          "quantity": 2,
          "parallel_line_index": 0,
          "relative_location": { "x": 0.9, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Mechanical assembler #1"
        },
        {
          "resource_type": "equipment",
          "resource_id": "EQ-MANUAL-04",
          "quantity": 1,
          "parallel_line_index": 1,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Assembly station #2"
        },
        {
          "resource_type": "worker",
          "resource_id": "W008",
          "quantity": 2,
          "parallel_line_index": 1,
          "relative_location": { "x": 0.9, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Mechanical assembler #2"
        },
        {
          "resource_type": "material",
          "resource_id": "M-WHEEL-001",
          "quantity": 2,
          "relative_location": { "x": -1.0, "y": 0, "z": 0.4 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Wheels"
        },
        {
          "resource_type": "material",
          "resource_id": "M-BRAKE-001",
          "quantity": 2,
          "relative_location": { "x": -1.0, "y": 0, "z": -0.4 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Brake set"
        }
      ]
    },
    {
      "process_id": "P005",
      "name": "최종 검사 및 포장",
      "description": "기능 테스트, 외관 검사 후 포장 처리",
      "cycle_time_sec": 150.0,
      "parallel_count": 1,
      "location": { "x": 20, "y": 0, "z": 0 },
      "rotation_y": 0,
      "predecessor_ids": ["P004"],
      "successor_ids": [],
      "resources": [
        {
          "resource_type": "equipment",
          "resource_id": "EQ-MACHINE-02",
          "quantity": 1,
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Test equipment"
        },
        {
          "resource_type": "worker",
          "resource_id": "W005",
          "quantity": 1,
          "relative_location": { "x": 1.0, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Quality inspector"
        },
        {
          "resource_type": "worker",
          "resource_id": "W006",
          "quantity": 1,
          "relative_location": { "x": -1.0, "y": 0, "z": 0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Packaging worker"
        },
        {
          "resource_type": "material",
          "resource_id": "M-BOX-001",
          "quantity": 1,
          "relative_location": { "x": 1.2, "y": 0, "z": -0.5 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 },
          "role": "Packaging box"
        }
      ]
    }
  ],
  "equipments": [
    {
      "equipment_id": "EQ-ROBOT-01",
      "name": "6축 용접 로봇 #1",
      "type": "robot"
    },
    {
      "equipment_id": "EQ-ROBOT-02",
      "name": "6축 용접 로봇 #2",
      "type": "robot"
    },
    {
      "equipment_id": "EQ-MACHINE-01",
      "name": "분체 도장 부스",
      "type": "machine"
    },
    {
      "equipment_id": "EQ-MANUAL-01",
      "name": "전장 조립 워크스테이션 #1",
      "type": "manual_station"
    },
    {
      "equipment_id": "EQ-MANUAL-02",
      "name": "기계 조립 워크스테이션 #1",
      "type": "manual_station"
    },
    {
      "equipment_id": "EQ-MANUAL-03",
      "name": "전장 조립 워크스테이션 #2",
      "type": "manual_station"
    },
    {
      "equipment_id": "EQ-MANUAL-04",
      "name": "기계 조립 워크스테이션 #2",
      "type": "manual_station"
    },
    {
      "equipment_id": "EQ-MACHINE-02",
      "name": "기능 테스트 장비",
      "type": "machine"
    }
  ],
  "workers": [
    { "worker_id": "W001", "name": "김철수", "skill_level": "Senior" },
    { "worker_id": "W002", "name": "이영희", "skill_level": "Senior" },
    { "worker_id": "W003", "name": "박민수", "skill_level": "Senior" },
    { "worker_id": "W004", "name": "정수진", "skill_level": "Mid" },
    { "worker_id": "W005", "name": "최준호", "skill_level": "Senior" },
    { "worker_id": "W006", "name": "강미라", "skill_level": "Junior" },
    { "worker_id": "W007", "name": "홍길동", "skill_level": "Senior" },
    { "worker_id": "W008", "name": "윤지원", "skill_level": "Mid" }
  ],
  "materials": [
    { "material_id": "M-STEEL-001", "name": "알루미늄 합금 프레임", "unit": "kg" },
    { "material_id": "M-PAINT-001", "name": "분체 도료", "unit": "kg" },
    { "material_id": "M-BATTERY-001", "name": "리튬이온 배터리 팩 (48V 13Ah)", "unit": "ea" },
    { "material_id": "M-MOTOR-001", "name": "허브 모터 (500W)", "unit": "ea" },
    { "material_id": "M-WHEEL-001", "name": "26인치 휠 세트", "unit": "ea" },
    { "material_id": "M-BRAKE-001", "name": "디스크 브레이크 세트", "unit": "ea" },
    { "material_id": "M-BOX-001", "name": "포장 박스", "unit": "ea" }
  ]
};
