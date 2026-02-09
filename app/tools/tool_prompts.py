TOOL_ANALYSIS_PROMPT = """Analyze this Python script and extract its input/output schema.

Source Code:
```python
{source_code}
```

{sample_input_section}

**Analysis Instructions:**
- If sample input data is provided, use it to understand the actual data structure
- If schema hints are provided, validate them against the code and improve if needed
- Priority: Sample data > Schema hints > Code analysis
- Always verify the schema matches what the code actually expects/produces

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
2. args_format: **CRITICAL** - Command-line argument format specification:
   - **MUST be a STRING or null** - NEVER use dict/object!
   - If script uses `argparse`, `ArgumentParser`, or `add_argument()`: Set args_format as STRING
   - Common patterns to detect:
     * `parser.add_argument('--input', '-i')` → args_format = "--input {{input_file}} --output {{output_file}}"
     * `parser.add_argument('input')` (positional) → args_format = "{{input_file}}"
     * No argparse → args_format = null
   - **ALWAYS check for argparse usage before setting args_format to null**
   - Use exact flag names from the script (--input, -i, --file, etc.)
   - Include ALL required arguments (--input, --output, custom params)
   - **WRONG**: args_format = {{"param": {{"type": "..."}}}}  ❌
   - **CORRECT**: args_format = "--param {{param_value}}"  ✅
3. For JSON type, use "structure" field (NOT args_format) showing all sub-fields
4. For dict/json input types, args_format MUST be null

**argparse Detection Checklist:**
- [ ] Does script import argparse?
- [ ] Does script call ArgumentParser()?
- [ ] Does script use add_argument()?
- [ ] What are the exact argument names? (--input? -i? positional?)
- [ ] Are there required arguments besides input/output?

Example args_format values:
- Script with `--input` and `--output`: "--input {{input_file}} --output {{output_file}}"
- Script with `-i` and `-o`: "-i {{input_file}} -o {{output_file}}"
- Script with positional args: "{{input_file}}"
- Script with custom params: "--input {{input_file}} --output {{output_file}} --threshold {{threshold}}"
- Script without argparse: null

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

{input_output_schema_section}

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
1. Read input from a JSON file path passed as first positional argument (sys.argv[1])
2. Write output to a JSON file path passed as second positional argument (sys.argv[2])
3. **ALL data and parameters are in the input JSON** - adapters merge BOP data + user params
4. **Output results to the output JSON file** - NOT stdout
5. Include clear docstring explaining input/output format
6. Include example input JSON in comments
7. Handle errors gracefully with informative messages
8. Use only standard library (json, math, sys, os)
9. **DO NOT use argparse** - Only input/output file paths as arguments
10. **DO NOT use os.getenv()** - Everything is in the JSON

## Script Template
```python
\"\"\"
[Tool Name]

Description: [Brief description]

Usage:
    python script_name.py <input.json> <output.json>

Input JSON format (from file):
    {{
        "field1": value1,
        "field2": value2,
        ...
    }}

Output JSON format (to file):
    {{
        "result_field1": ...,
        "result_field2": ...,
        ...
    }}
\"\"\"

import json
import sys
import os
import math

def process_data(data):
    \"\"\"Main processing logic.

    Args:
        data: Input JSON containing both BOP data and user parameters
              Example structure:
              {{
                  "process_locations": [...],  // from BOP
                  "wall_offset": 1.0,          // from user params
                  "wall_thickness": 0.2        // from user params
              }}
    \"\"\"
    # Extract parameters from input JSON
    offset = data.get('wall_offset', 1.0)
    thickness = data.get('wall_thickness', 0.2)

    # Extract BOP data
    locations = data.get('process_locations', [])

    # Implementation here
    result = {{}}
    return result

def main():
    # Check arguments
    if len(sys.argv) < 3:
        error = {{"error": "Usage: python script.py <input.json> <output.json>"}}
        print(json.dumps(error))
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    # Read input JSON (contains both BOP data and user parameters)
    if not os.path.exists(input_file):
        error = {{"error": f"Input file not found: {{input_file}}"}}
        print(json.dumps(error))
        sys.exit(1)

    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
    except Exception as e:
        error = {{"error": f"Failed to read input: {{str(e)}}"}}
        print(json.dumps(error))
        sys.exit(1)

    # Process
    try:
        result = process_data(input_data)
    except Exception as e:
        error = {{"error": f"Processing failed: {{str(e)}}"}}
        print(json.dumps(error))
        sys.exit(1)

    # Write output to file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
    except Exception as e:
        error = {{"error": f"Failed to write output: {{str(e)}}"}}
        print(json.dumps(error))
        sys.exit(1)

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
   - **MANDATORY SIGNATURE**: Must accept exactly 2 parameters (bop_json, params)
   - Extract data from BOP, apply field mappings
   - **CRITICAL: Include ALL user parameters in the tool input JSON/CSV**
   - The tool script will read parameters from the input data, NOT from environment variables
   - Example: If params has {{"wall_offset": 1.0}}, include it in tool input as a field
   - params dict contains all user-configurable parameters from the UI
   - Use params for values not in BOP (e.g., process size, thresholds, offsets)
   - For BOP-fallback params: `value = params.get('key') or bop_json.get('key')`
   - Return as string (CSV/JSON/args)

2. `apply_result_to_bop(bop_json: dict, tool_output: dict) -> dict`
   - **CRITICAL**: tool_output is ALREADY PARSED as dict by the executor
   - **DO NOT call json.loads(tool_output)** - it will cause an error!
   - tool_output is already a Python dict, use it directly
   - Update BOP with tool results, return complete updated BOP
   - Preserve all existing BOP fields not being updated

## Field Mapping Examples

**Including user parameters in tool input** (CRITICAL):
```python
def convert_bop_to_input(bop_json, params):
    # Extract BOP data
    locations = [line.get('location') for p in bop_json.get('processes', [])
                 for line in p.get('parallel_lines', [])]

    # Build tool input with BOTH BOP data AND user parameters
    tool_input = {{
        # BOP data
        'process_locations': locations,
        'obstacles': bop_json.get('obstacles', []),

        # User parameters (ALL params should be included!)
        'wall_offset': params.get('wall_offset', 1.0),
        'wall_thickness': params.get('wall_thickness', 0.2),
        'wall_height': params.get('wall_height', 2.5),
        'min_segment_length': params.get('min_segment_length', 0.5)
    }}

    return json.dumps(tool_input, ensure_ascii=False)
```

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

**Post-processor example** (CRITICAL - tool_output is already dict):
```python
def apply_result_to_bop(bop_json, tool_output):
    # ❌ WRONG - DO NOT DO THIS:
    # result = json.loads(tool_output)  # ERROR! tool_output is already dict!

    # ✅ CORRECT - tool_output is already parsed dict:
    updated_processes = tool_output.get('processes', [])

    # Update BOP processes with new locations
    for updated_proc in updated_processes:
        proc_id = updated_proc.get('process_id')
        new_location = updated_proc.get('location')

        for proc in bop_json.get('processes', []):
            if proc.get('process_id') == proc_id:
                for line in proc.get('parallel_lines', []):
                    line['location'] = new_location

    return bop_json
```

## Rules
- **CRITICAL - Forbidden modules**: Do NOT import or use: logging, os, sys, subprocess, pathlib, datetime
  * Adapter code runs in a restricted environment without these modules
  * If you need logging, use print() instead
  * If you need paths, use string operations only
- **Allowed stdlib modules ONLY**: json, csv, io, math, statistics, copy, re
- Handle edge cases (empty data, missing fields)
- Use EXACT key names from source code for tool output parsing
- Avoid f-strings with dict access → use concatenation: 'ID-' + str(data.get('id', 0))

## Response (JSON only, no markdown)
{{
  "pre_process_code": "def convert_bop_to_input(bop_json, params):\\n    ...",
  "post_process_code": "def apply_result_to_bop(bop_json, tool_output):\\n    ..."
}}
"""


TOOL_IMPROVEMENT_PROMPT = """You are an expert at improving data processing tools for a manufacturing digital twin system.

## Current Tool Information
Tool Name: {tool_name}
Description: {tool_description}

## Current Code
{current_code_section}

## Current Parameters Schema
{params_schema_json}

## Last Execution Context
Success: {execution_success}
stdout:
```
{stdout}
```
stderr:
```
{stderr}
```
Tool Output (first 2000 chars):
```
{tool_output}
```

## User's Improvement Request
{user_feedback}

## Modification Scope (only modify what's checked)
- Adapter Code: {modify_adapter}
- Parameters Schema: {modify_params}
- Script Code: {modify_script}

## BOP JSON Schema Reference
- rotation_y is in RADIANS (90° = π/2 ≈ 1.5708)
- obstacles[]: obstacle_id, name, type, position{{x,y,z}}, size{{width,height,depth}}, rotation_y
- processes[].parallel_lines[]: location{{x,y,z}}, cycle_time_sec, etc.

## Instructions
1. Analyze the user's feedback and execution context
2. Only modify the components that are in scope
3. **CRITICAL - Adapter code restrictions:**
   - FORBIDDEN modules: logging, os, sys, subprocess, pathlib, datetime
   - ALLOWED modules ONLY: json, csv, io, math, statistics, copy, re
   - Use print() instead of logging
   - Adapter runs in restricted environment
4. For adapter code: ensure proper BOP field access and data transformation
5. **CRITICAL - Parameter Handling:**
   - Pre-processor (convert_bop_to_input) MUST include ALL user parameters in the tool input JSON
   - Scripts read parameters FROM THE INPUT JSON, NOT from environment variables or CLI args
   - Example pre-processor: `tool_input = {{"locations": [...], "wall_offset": params.get("wall_offset", 1.0)}}`
   - Example script: `offset = data.get("wall_offset", 1.0)`
   - DO NOT use os.getenv() in scripts
   - DO NOT use argparse for parameters
6. **CRITICAL - Post-processor (apply_result_to_bop):**
   - **tool_output parameter is ALREADY A DICT** (parsed by executor)
   - **DO NOT call json.loads(tool_output)** - this will cause "JSON object must be str" error
   - Correct: `result = tool_output.get('key')`
   - Wrong: `result = json.loads(tool_output)` ❌
   - The executor automatically parses JSON output before passing to post-processor
7. For params_schema: add/remove/modify parameters as requested
8. For script code: improve the core logic as requested
9. **CRITICAL - Check args_format issues:**
   - If stderr shows "error: the following arguments are required: --input/-i, --output/-o"
   - This means the script uses argparse but args_format is missing/incorrect
   - Since args_format cannot be modified through improvement API, you MUST:
     * Include clear instructions in your "explanation" field
     * Tell the user the EXACT args_format string they need to set manually
     * Example explanation: "스크립트가 --input과 --output 인자를 요구합니다. 도구 설정에서 args_format을 '--input {{input_file}} --output {{output_file}}'로 수정해주세요."
   - Common args_format patterns:
     * Script expects `--input` and `--output`: "--input {{input_file}} --output {{output_file}}"
     * Script expects `-i` and `-o`: "-i {{input_file}} -o {{output_file}}"
     * Script expects positional args: "{{input_file}}"
     * With custom parameters: "--input {{input_file}} --threshold {{threshold}}"
10. Explain what you changed and why

## Response Format (JSON only, no markdown)
{{
  "explanation": "Korean explanation of what was changed and why",
  "changes_summary": ["변경1", "변경2", ...],
  "pre_process_code": "updated code or null if not modified",
  "post_process_code": "updated code or null if not modified",
  "params_schema": [updated params array] or null if not modified,
  "script_code": "updated script or null if not modified"
}}

**CRITICAL - params_schema format (MUST follow this exact structure):**
{{
  "params_schema": [
    {{
      "key": "param_name",           // REQUIRED - snake_case parameter name
      "label": "한글 표시명",         // REQUIRED - Korean display name
      "type": "number" or "text",    // REQUIRED - parameter type
      "default": value or null,      // REQUIRED - default value
      "required": true or false,     // REQUIRED - is this parameter mandatory?
      "description": "설명"           // REQUIRED - parameter description
    }}
  ]
}}

DO NOT use "name" field - MUST use "key" field!
ALL fields (key, label, type, default, required, description) are REQUIRED!

If a field is not in modification scope or doesn't need changes, set it to null.

**CRITICAL JSON FORMATTING RULES:**
1. All string fields containing code MUST properly escape special characters:
   - Backslash: \\ → \\\\
   - Double quote: " → \\"
   - Newline: actual newline → \\n
   - Tab: actual tab → \\t
   - Curly braces in f-strings: f"{{variable}}" is OK (no escaping needed in JSON strings)
2. For script_code field, ensure ALL newlines are escaped as \\n
3. Test your JSON is valid before responding
4. Do NOT wrap response in markdown code blocks"""


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
4. **CRITICAL - Post-processor specific:**
   - If fixing `apply_result_to_bop`: tool_output parameter is ALREADY A DICT
   - Common error: "JSON object must be str, bytes or bytearray, not dict"
   - Cause: Calling `json.loads(tool_output)` when tool_output is already parsed
   - Fix: Remove json.loads() and use tool_output directly as dict
   - Correct: `result = tool_output.get('key')`
   - Wrong: `result = json.loads(tool_output)` ❌
5. **CRITICAL - Forbidden modules**: NEVER import or use: logging, os, sys, subprocess, pathlib, datetime
   - Adapter code runs in a restricted environment
   - Use print() instead of logging
   - Only allowed modules: json, csv, io, math, statistics, copy, re

## Response Format
Return ONLY valid JSON (no markdown, no code blocks, no extra text).
The "fixed_code" must be a properly escaped JSON string.

{{
  "error_analysis": "Brief explanation of what went wrong",
  "fixed_code": "def {function_name}(...):\\n    ... (complete fixed function with \\\\n for newlines)"
}}

CRITICAL JSON Escaping Rules:
- Backslash: \\\\ (double backslash)
- Newline: \\n
- Tab: \\t
- Quote: \\"
- No raw strings or triple quotes

Example:
{{
  "error_analysis": "Missing comma in dictionary",
  "fixed_code": "def convert_bop_to_input(bop_json, params):\\n    data = {{\\n        'key': 'value'\\n    }}\\n    return data"
}}
"""
