TOOL_ANALYSIS_PROMPT = """Analyze this Python script and extract its input/output schema.

Source Code:
```python
{source_code}
```

{sample_input_section}

## BOP Available Fields (GDP System Data)
- project_title: string
- target_uph: int
- processes[]: process_id, parallel_count, predecessor_ids[], successor_ids[], parallel_lines[], resources[]
  * parallel_lines[]: parallel_index, name, description, cycle_time_sec, location{{x,y,z}}, rotation_y
  * resources[]: resource_type, resource_id, quantity, role, relative_location{{x,y,z}}, rotation_y, scale{{x,y,z}}, parallel_line_index
  * NOTE: Process has NO "size" field. All details (name, location, etc.) are in parallel_lines, not at process level.
- equipments[]: equipment_id, name, type (robot|machine|manual_station)
- workers[]: worker_id, name, skill_level (Junior|Mid|Senior)
- materials[]: material_id, name, unit (ea|kg|m)
- obstacles[]: obstacle_id, name, type (fence|zone|pillar|wall), position{{x,y,z}}, size{{width,height,depth}}, rotation_y
  * NOTE: obstacles use "position" (not "pos"), size uses "width/height/depth" (not "x/y/z")

## Response Format (JSON only, no markdown)
{{
  "tool_name": "snake_case_name",
  "description": "Brief description",
  "execution_type": "python",
  "input_schema": {{
    "type": "csv|json|args|stdin",
    "columns": ["col1"] or null,
    "fields": ["field1"] or null,
    "structure": {{nested structure}} or null,
    "args_format": "--input {{input_file}} --output {{output_file}}" or null,
    "description": "Input format description"
  }},
  "output_schema": {{
    "type": "csv|json|stdin",
    "fields": ["field1"] or null,
    "description": "Output format description"
  }},
  "params_schema": [
    {{"key": "param_name", "label": "표시명", "type": "number|text", "default": null, "required": true|false, "description": "설명"}}
  ]
}}

## Rules
1. input_schema.type: "csv", "json", "args" (argparse), or "stdin"
2. args_format: Use {{input_file}}, {{output_file}} placeholders if script uses argparse
3. For JSON type, include nested "structure" field showing all sub-fields

## params_schema Rules (CRITICAL - READ CAREFULLY)
params_schema defines ALL user-provided input values needed to run the tool.

**Step 1: Identify ALL inputs the script requires**
- Look at the input JSON/CSV structure the script expects
- Find ALL required fields (e.g., width, length, interval, threshold, etc.)

**Step 2: For each input, decide the source**
- If value exists in BOP: set required=false, description="미입력시 BOP 값 사용"
- If value does NOT exist in BOP: set required=true with sensible default

**Step 3: Create params_schema entry for EVERY input**
- Format: key=snake_case, label=Korean, type=number|text, default=value from script comments/examples

IMPORTANT RULES:
- If script expects JSON input like {{"width": 20, "length": 15, "interval": 2.5}}, you MUST add width, length, interval to params_schema
- NEVER return empty params_schema [] if the script requires ANY input values
- Extract default values from script comments, docstrings, or example data
- Common params: width, length, interval, threshold, count, ratio, margin
- Process size params (BOP has no process size!): process_width, process_height, process_depth

Example 1 - Script that needs width/length/interval:
[
  {{"key": "width", "label": "폭 (m)", "type": "number", "default": 20.0, "required": true, "description": "공간의 가로 길이"}},
  {{"key": "length", "label": "길이 (m)", "type": "number", "default": 15.0, "required": true, "description": "공간의 세로 길이"}},
  {{"key": "interval", "label": "간격 (m)", "type": "number", "default": 2.5, "required": true, "description": "배치 간격"}}
]

Example 2 - Script that needs process size:
[
  {{"key": "target_process_id", "label": "대상 공정 ID", "type": "text", "default": null, "required": false, "description": "미입력시 첫번째 공정"}},
  {{"key": "process_width", "label": "공정 폭 (m)", "type": "number", "default": 2.0, "required": true, "description": "공정 X축 크기"}},
  {{"key": "process_height", "label": "공정 높이 (m)", "type": "number", "default": 2.5, "required": true, "description": "공정 Y축 크기"}},
  {{"key": "process_depth", "label": "공정 깊이 (m)", "type": "number", "default": 2.0, "required": true, "description": "공정 Z축 크기"}}
]

DO NOT return empty params_schema [] if tool requires ANY input values!
"""


SCRIPT_GENERATION_PROMPT = """You are a Python developer creating optimization/analysis tools for a manufacturing digital twin system (GDP).

## User Request
{user_description}

## BOP Data Structure (Available in the system)
The tool will receive input as JSON. The adapter will convert BOP data to tool input format.
Available BOP fields:
- project_title: string
- target_uph: float (units per hour)
- processes[]: process_id, parallel_count, predecessor_ids[], successor_ids[], parallel_lines[], resources[]
  * parallel_lines[]: parallel_index, name, description, cycle_time_sec, location{{x,y,z}}, rotation_y
  * resources[]: resource_type (equipment|worker|material), resource_id, quantity, role, relative_location{{x,y,z}}, rotation_y, scale{{x,y,z}}, parallel_line_index
- equipments[]: equipment_id, name, type (robot|machine|manual_station)
- workers[]: worker_id, name, skill_level (Junior|Mid|Senior)
- materials[]: material_id, name, unit (ea|kg|m)
- obstacles[]: obstacle_id, name, type (fence|zone|pillar|wall), position{{x,y,z}}, size{{width,height,depth}}, rotation_y

**IMPORTANT: rotation_y is in RADIANS, not degrees!**
- 90 degrees = math.pi / 2 (≈ 1.5708)
- 180 degrees = math.pi (≈ 3.1416)
- Use `math.radians(degrees)` to convert degrees to radians

## Script Requirements
1. Use argparse with --input and --output arguments
2. Read input from JSON file, write output to JSON file
3. Include clear docstring explaining input/output format
4. Include example input JSON in comments
5. Handle errors gracefully with informative messages
6. Use only standard library (json, argparse, math, sys, os)

## Script Template
```python
\"\"\"
[Tool Name]

Description: [Brief description]

Usage:
    python script_name.py --input input.json --output output.json

Input JSON format:
    {{
        "field1": value1,
        "field2": value2,
        ...
    }}

Output JSON format:
    {{
        "result_field1": ...,
        "result_field2": ...,
        ...
    }}
\"\"\"

import json
import argparse
import sys
import os
import math

def process_data(data):
    \"\"\"Main processing logic.\"\"\"
    # Implementation here
    result = {{}}
    return result

def main():
    parser = argparse.ArgumentParser(description="Tool description")
    parser.add_argument('--input', '-i', type=str, required=True, help='Input JSON file path')
    parser.add_argument('--output', '-o', type=str, required=True, help='Output JSON file path')
    args = parser.parse_args()

    # Read input
    if not os.path.exists(args.input):
        print(f"[Error] Input file not found: {{args.input}}")
        sys.exit(1)

    with open(args.input, 'r', encoding='utf-8') as f:
        input_data = json.load(f)

    # Process
    result = process_data(input_data)

    # Write output
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"[Success] Results saved to {{args.output}}")

if __name__ == "__main__":
    main()
```

## Response Format (JSON only, no markdown)
{{
    "tool_name": "snake_case_name",
    "description": "Brief Korean description of what the tool does",
    "script_code": "full Python script code as string",
    "suggested_params": [
        {{"key": "param_name", "label": "한글 라벨", "type": "number|text", "default": value, "required": true|false, "description": "파라미터 설명"}}
    ]
}}

Generate a complete, working Python script that fulfills the user's request."""


ADAPTER_SYNTHESIS_PROMPT = """Write two Python adapter functions to bridge GDP BOP data and an external tool.

## BOP JSON Schema
{{
  "project_title": "string",
  "target_uph": float,
  "processes": [{{
    "process_id": "P001",
    "parallel_count": int,
    "predecessor_ids": ["P000"],
    "successor_ids": ["P002"],
    "parallel_lines": [{{
      "parallel_index": 1,
      "name": "string",
      "description": "string",
      "cycle_time_sec": float,
      "location": {{"x": float, "y": float, "z": float}},
      "rotation_y": float
    }}],
    "resources": [{{
      "resource_type": "equipment|worker|material", "resource_id": "string",
      "quantity": float, "role": "string",
      "relative_location": {{"x": float, "y": float, "z": float}},
      "rotation_y": float, "scale": {{"x": float, "y": float, "z": float}},
      "parallel_line_index": int
    }}]
  }}],
  "equipments": [{{"equipment_id": "EQ-...", "name": "...", "type": "robot|machine|manual_station"}}],
  "workers": [{{"worker_id": "W001", "name": "...", "skill_level": "Junior|Mid|Senior"}}],
  "materials": [{{"material_id": "M-...", "name": "...", "unit": "ea|kg|m"}}],
  "obstacles": [{{
    "obstacle_id": "OBS001", "name": "string", "type": "fence|zone|pillar|wall",
    "position": {{"x": float, "y": 0, "z": float}}, "size": {{"width": float, "height": float, "depth": float}},
    "rotation_y": float
  }}]
}}

Key differences (BOP vs common tool formats):
- Process details (name, location, cycle_time) are in parallel_lines[], not at process level
- Process has NO "size" field → get size from params
- Obstacles: "position" (not "pos"), size uses "width/height/depth" (not "x/y/z")
- **rotation_y is in RADIANS** (90° = math.pi/2 ≈ 1.5708, 180° = math.pi ≈ 3.1416)
  If tool outputs degrees, convert: `radians = degrees * math.pi / 180`

## Tool Information
Name: {tool_name}
Description: {tool_description}

Input: {input_schema_json}
Output: {output_schema_json}

{source_code_section}

{params_schema_section}

## Required Functions

1. `convert_bop_to_input(bop_json: dict, params: dict) -> str`
   - Extract data from BOP, apply field mappings, return as string (CSV/JSON/args)
   - Use params for values not in BOP (e.g., process size)
   - For BOP-fallback params: `value = params.get('key') or bop_json.get('key')`

2. `apply_result_to_bop(bop_json: dict, tool_output: str) -> dict`
   - Parse tool output, update BOP, return complete updated BOP
   - Preserve all existing BOP fields not being updated

## Field Mapping Examples

BOP obstacles → Tool format:
```python
for obs in bop_json.get('obstacles', []):
    tool_obs = {{
        'pos': obs['position'],
        'size': {{'x': obs['size']['width'], 'y': obs['size']['height'], 'z': obs['size']['depth']}}
    }}
```

Process with size from params (NEW STRUCTURE: details in parallel_lines):
```python
target_id = params.get('target_process_id')
process = next((p for p in bop_json.get('processes', []) if p['process_id'] == target_id), None) or bop_json['processes'][0]
# Get first parallel line for location/name
first_line = process.get('parallel_lines', [{{}}])[0]
process_data = {{
    'name': first_line.get('name', ''),
    'pos': first_line.get('location', {{'x': 0, 'y': 0, 'z': 0}}),
    'size': {{'x': params.get('process_width', 1.0), 'y': params.get('process_height', 2.0), 'z': params.get('process_depth', 1.0)}}
}}
```

Iterate all parallel lines:
```python
for process in bop_json.get('processes', []):
    for line in process.get('parallel_lines', []):
        line_data = {{
            'name': line.get('name'),
            'location': line.get('location'),
            'cycle_time': line.get('cycle_time_sec')
        }}
```

## Rules
- Use only stdlib: json, csv, io, math, statistics, copy, re
- Handle edge cases (empty data, missing fields)
- Use EXACT key names from source code for tool output parsing
- Avoid f-strings with dict access → use concatenation: 'ID-' + str(data.get('id', 0))

## Response (JSON only, no markdown)
{{
  "pre_process_code": "def convert_bop_to_input(bop_json, params):\\n    ...",
  "post_process_code": "def apply_result_to_bop(bop_json, tool_output):\\n    ..."
}}
"""


ADAPTER_REPAIR_PROMPT = """You are a Python debugging expert. An adapter function failed during execution. Analyze the error and fix the code.

## Error Information
Error Type: {error_type}
Error Message: {error_message}
Traceback:
```
{traceback}
```

## Failed Code ({failed_function})
```python
{failed_code}
```

## Input Data
```json
{input_data}
```

## BOP JSON Schema (IMPORTANT - use this structure)
{{
  "project_title": "string",
  "target_uph": float,
  "processes": [{{
    "process_id": "P001",
    "parallel_count": int,
    "predecessor_ids": [],
    "successor_ids": [],
    "parallel_lines": [{{
      "parallel_index": 1,
      "name": "string",
      "description": "string",
      "cycle_time_sec": float,
      "location": {{"x": float, "y": float, "z": float}},
      "rotation_y": float
    }}],
    "resources": [...]
  }}],
  "equipments": [...],
  "workers": [...],
  "materials": [...],
  "obstacles": [{{
    "obstacle_id": "OBS001", "name": "string", "type": "fence|zone|pillar|wall",
    "position": {{"x": float, "y": 0, "z": float}},
    "size": {{"width": float, "height": float, "depth": float}},
    "rotation_y": float
  }}]
}}

IMPORTANT Notes:
- Process details (name, location, cycle_time) are in `parallel_lines[]`, NOT at process level
- Access pattern: `process['parallel_lines'][0]['location']` (NOT `process['location']`)
- Obstacles use `position` (not `pos`), size uses `width/height/depth` (not `x/y/z`)

## Task
1. Analyze the error cause
2. Fix the code to handle the correct data structure
3. Ensure the fix handles edge cases (empty arrays, missing keys)

## Response (JSON only, no markdown)
{{
  "error_analysis": "Brief explanation of what went wrong",
  "fixed_code": "def {function_name}(...):\\n    ... (complete fixed function)"
}}
"""
