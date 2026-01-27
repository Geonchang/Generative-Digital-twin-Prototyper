TOOL_ANALYSIS_PROMPT = """You are a software analysis expert. Analyze the following Python script and determine:

1. What it does (brief description)
2. A suggested tool name (snake_case, e.g., "line_balancer_v1")
3. What input data it requires (file format, columns/fields, command-line arguments)
4. What output data it produces (format, fields)

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
    "args_format": "--input {{file}}" or null,
    "description": "Description of expected input format"
  }},
  "output_schema": {{
    "type": "csv" or "json" or "args" or "stdin",
    "columns": null,
    "fields": ["field1", "field2"] or null,
    "description": "Description of output format"
  }}
}}

Rules:
- input_schema.type: "csv" if it reads CSV, "json" if JSON, "args" if command-line arguments, "stdin" for standard input
- output_schema.type: "json" if it outputs JSON, "csv" for CSV, "stdin" for plain text stdout
- For CSV type, include column names if identifiable
- For JSON type, include top-level field names
- tool_name must be snake_case, concise, and descriptive
"""


ADAPTER_SYNTHESIS_PROMPT = """You are a Python Integration Expert. Write two Python functions to bridge GDP BOP Data and an External Tool.

## BOP JSON Schema (Source Data)
The GDP system uses this BOP JSON structure:
{{
  "project_title": "string",
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
  "materials": [{{"material_id": "M-...", "name": "...", "unit": "ea|kg|m"}}]
}}

## External Tool Information
Tool Name: {tool_name}
Description: {tool_description}

Input Requirement:
{input_schema_json}

Output Format:
{output_schema_json}

## Task
Write two Python functions:

1. `convert_bop_to_input(bop_json: dict) -> str`
   - Extracts relevant data from the BOP JSON
   - Converts it to the format required by the external tool
   - Returns the data as a string (CSV string, JSON string, or argument string)

2. `apply_result_to_bop(bop_json: dict, tool_output: str) -> dict`
   - Parses the tool's output string
   - Updates the relevant fields in the BOP JSON
   - Returns the complete updated BOP JSON
   - MUST preserve all existing BOP fields that are not being updated
   - MUST maintain referential integrity

## Rules
- Use only Python standard library (json, csv, io, etc.)
- Functions must be self-contained (no imports outside stdlib)
- Handle edge cases (empty data, missing fields)
- convert_bop_to_input should extract ONLY what the tool needs
- apply_result_to_bop MUST return the complete BOP dict, not just changed parts

Respond with ONLY a JSON object (no markdown):
{{
  "pre_process_code": "def convert_bop_to_input(bop_json):\\n    ...",
  "post_process_code": "def apply_result_to_bop(bop_json, tool_output):\\n    ..."
}}
"""
