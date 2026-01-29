TOOL_ANALYSIS_PROMPT = """You are a software analysis expert. Analyze the following Python script and determine:

1. What it does (brief description)
2. A suggested tool name (snake_case, e.g., "line_balancer_v1")
3. What input data it requires (file format, columns/fields, command-line arguments)
4. What output data it produces (format, fields)
5. What additional parameters the user needs to provide (not from BOP data)

Source Code:
```python
{source_code}
```

{sample_input_section}

Respond with ONLY a JSON object (no markdown, no code blocks):
{{
  "tool_name": "suggested_tool_name",
  "description": "Brief description of what this tool does",
  "execution_type": "python",
  "input_schema": {{
    "type": "csv" or "json" or "args" or "stdin",
    "columns": ["col1", "col2"] or null,
    "fields": ["field1"] or null,
    "args_format": "--input {{input_file}} --output {{output_file}}" or null,
    "description": "Description of expected input format"
  }},
  "output_schema": {{
    "type": "csv" or "json" or "args" or "stdin",
    "columns": null,
    "fields": ["field1", "field2"] or null,
    "description": "Description of output format"
  }},
  "params_schema": [
    {{
      "key": "param_name",
      "label": "Display Label",
      "type": "number" or "text",
      "default": null,
      "required": true or false,
      "description": "What this parameter is for"
    }}
  ] or null
}}

Rules:
- input_schema.type: "csv" if it reads CSV, "json" if JSON, "args" if command-line arguments, "stdin" for standard input
- output_schema.type: "json" if it outputs JSON, "csv" for CSV, "stdin" for plain text stdout
- For CSV type, include column names if identifiable
- For JSON type, include top-level field names
- tool_name must be snake_case, concise, and descriptive

IMPORTANT - args_format rules:
- If the script uses argparse with --input and --output arguments, set args_format to "--input {{input_file}} --output {{output_file}}"
- Use EXACTLY these placeholders: {{input_file}} and {{output_file}}
- Look for patterns like: parser.add_argument('--input', ...) or parser.add_argument('-i', ...)
- If both -i/--input and -o/--output are found, use: "-i {{input_file}} -o {{output_file}}" or "--input {{input_file}} --output {{output_file}}"

IMPORTANT - params_schema rules:
- params_schema defines USER-PROVIDED values that are NOT in BOP data
- Carefully analyze what data the tool's input file/JSON requires
- BOP data contains: processes, equipments, workers, materials, obstacles, project_title, target_uph
- Any input field NOT in BOP data must be added to params_schema

CRITICAL - How to detect params:
1. Look at what JSON keys the tool reads from input (e.g., json.load, data['key'])
2. Look at what the tool expects in its input structure
3. Common user params: width, length, interval, threshold, target, count, ratio, margin, spacing, offset
4. If a script reads {{"width": ..., "length": ..., "interval": ...}}, ALL THREE must be in params_schema

params_schema format:
- key: snake_case variable name (e.g., "width")
- label: Korean display name (e.g., "폭 (m)")
- type: "number" for numeric values, "text" for strings
- default: reasonable default value (e.g., 10.0 for width)
- required: true if the tool cannot run without it, false if it can fallback to BOP data
- description: brief Korean explanation (add "미입력시 BOP 값 사용" if fallback available)

IMPORTANT - BOP fallback params:
- If a param key matches a BOP field (e.g., target_uph), set required: false
- Add "미입력시 BOP의 [field] 사용" to the description
- Example: target_uph exists in BOP, so:
  {{"key": "target_uph", "label": "목표 UPH", "type": "number", "default": null, "required": false, "description": "목표 생산량. 미입력시 BOP의 target_uph 사용"}}

Example - if tool reads width, length, interval from input JSON:
"params_schema": [
  {{"key": "width", "label": "폭 (m)", "type": "number", "default": 20.0, "required": true, "description": "영역의 폭"}},
  {{"key": "length", "label": "길이 (m)", "type": "number", "default": 15.0, "required": true, "description": "영역의 길이"}},
  {{"key": "interval", "label": "간격 (m)", "type": "number", "default": 5.0, "required": true, "description": "배치 간격"}}
]

DO NOT set params_schema to null if the tool requires any non-BOP input data!
"""


ADAPTER_SYNTHESIS_PROMPT = """You are a Python Integration Expert. Write two Python functions to bridge GDP BOP Data and an External Tool.

## BOP JSON Schema (Source Data)
The GDP system uses this BOP JSON structure:
{{
  "project_title": "string",
  "target_uph": float,
  "processes": [
    {{
      "process_id": "P001",
      "name": "string",
      "description": "string",
      "cycle_time_sec": float,
      "parallel_count": int,
      "location": {{"x": float, "y": float, "z": float}},
      "predecessor_ids": ["P000"],
      "successor_ids": ["P002"],
      "resources": [
        {{
          "resource_type": "equipment | worker | material",
          "resource_id": "string",
          "quantity": float,
          "role": "string",
          "relative_location": {{"x": float, "y": float, "z": float}}
        }}
      ]
    }}
  ],
  "equipments": [{{"equipment_id": "EQ-...", "name": "...", "type": "robot|machine|manual_station"}}],
  "workers": [{{"worker_id": "W001", "name": "...", "skill_level": "Junior|Mid|Senior"}}],
  "materials": [{{"material_id": "M-...", "name": "...", "unit": "ea|kg|m"}}],
  "obstacles": [{{"obstacle_id": "OBS001", "name": "...", "type": "fence|zone|pillar|wall", "position": {{"x": float, "y": 0, "z": float}}, "size": {{"width": float, "height": float, "depth": float}}, "rotation_y": float}}]
}}

## External Tool Information
Tool Name: {tool_name}
Description: {tool_description}

Input Requirement:
{input_schema_json}

Output Format:
{output_schema_json}

{source_code_section}

{params_schema_section}

## Task
Write two Python functions:

1. `convert_bop_to_input(bop_json: dict, params: dict) -> str`
   - Extracts relevant data from the BOP JSON
   - Uses additional user-provided parameters from `params` dict (e.g., width, length, interval)
   - Converts it to the format required by the external tool
   - Returns the data as a string (CSV string, JSON string, or argument string)
   - MUST read dynamic values from bop_json and params instead of hardcoding
   - The `params` dict contains user-input values defined in params_schema
   - IMPORTANT: If a param also exists in BOP (e.g., target_uph), use params as override, fallback to bop_json:
     `value = params.get('key') or bop_json.get('key')`

2. `apply_result_to_bop(bop_json: dict, tool_output: str) -> dict`
   - Parses the tool's output string
   - Updates the relevant fields in the BOP JSON
   - Returns the complete updated BOP JSON
   - MUST preserve all existing BOP fields that are not being updated
   - MUST maintain referential integrity
   - If the tool generates position data (x, y coordinates), consider adding them to the "obstacles" array with appropriate type (e.g., "pillar" for columns)

## Rules
- Use only Python standard library (json, csv, io, etc.)
- Functions must be self-contained (no imports outside stdlib)
- Handle edge cases (empty data, missing fields)
- convert_bop_to_input should extract ONLY what the tool needs
- apply_result_to_bop MUST return the complete BOP dict, not just changed parts
- CRITICAL: When referencing tool output keys, use the EXACT key names from the source code. Do NOT guess or rephrase key names.
- IMPORTANT: convert_bop_to_input takes TWO arguments: bop_json and params. Always include both.
- AVOID f-strings with dict access inside - use string concatenation instead:
  - BAD: f'ID-{{data["id"]}}'  (quote conflict causes syntax error)
  - GOOD: 'ID-' + str(data.get('id', 0))

Respond with ONLY a JSON object (no markdown):
{{
  "pre_process_code": "def convert_bop_to_input(bop_json, params):\\n    ...",
  "post_process_code": "def apply_result_to_bop(bop_json, tool_output):\\n    ..."
}}
"""
