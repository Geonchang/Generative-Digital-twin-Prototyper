from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from enum import Enum
from datetime import datetime


class ExecutionType(str, Enum):
    PYTHON = "python"
    EXECUTABLE = "executable"


class SchemaType(str, Enum):
    CSV = "csv"
    JSON = "json"
    ARGS = "args"
    STDIN = "stdin"


class InputSchema(BaseModel):
    type: SchemaType = Field(..., description="입력 형식 타입")
    columns: Optional[List[str]] = Field(default=None, description="CSV: 컬럼명 목록")
    fields: Optional[List[str]] = Field(default=None, description="JSON: 필드명 목록")
    args_format: Optional[str] = Field(default=None, description="ARGS: 인수 패턴")
    description: str = Field(..., description="입력 형식 설명")


class OutputSchema(BaseModel):
    type: SchemaType = Field(..., description="출력 형식 타입")
    columns: Optional[List[str]] = Field(default=None, description="CSV: 컬럼명 목록")
    fields: Optional[List[str]] = Field(default=None, description="JSON: 필드명 목록")
    description: str = Field(..., description="출력 형식 설명")


class ParamDef(BaseModel):
    key: str = Field(..., description="파라미터 키")
    label: str = Field(..., description="표시 라벨")
    type: str = Field(default="number", description="입력 타입 (number, text, select 등)")
    default: Optional[Any] = Field(default=None, description="기본값")
    required: bool = Field(default=False, description="필수 여부")
    description: str = Field(default="", description="파라미터 설명")


class ToolMetadata(BaseModel):
    tool_id: str = Field(..., description="고유 도구 식별자 (slug)")
    tool_name: str = Field(..., description="도구 표시 이름")
    description: str = Field(..., description="도구 설명")
    execution_type: ExecutionType = Field(..., description="python 또는 executable")
    file_name: str = Field(..., description="업로드된 원본 파일명")
    input_schema: InputSchema
    output_schema: OutputSchema
    params_schema: Optional[List[ParamDef]] = Field(default=None, description="도구별 추가 파라미터 정의")
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())


class AdapterCode(BaseModel):
    tool_id: str
    pre_process_code: str = Field(..., description="convert_bop_to_input(bop_json) -> str")
    post_process_code: str = Field(..., description="apply_result_to_bop(bop_json, tool_output) -> dict")


class ToolRegistryEntry(BaseModel):
    metadata: ToolMetadata
    adapter: AdapterCode
    script_code: Optional[str] = Field(default=None, description="도구 스크립트 코드")


# === API Request/Response ===

class AnalyzeRequest(BaseModel):
    source_code: str = Field(..., description="분석할 소스 코드")
    file_name: str = Field(default="script.py", description="원본 파일명")
    sample_input: Optional[str] = Field(default=None, description="예제 입력 데이터")


class AnalyzeResponse(BaseModel):
    tool_name: str
    description: str
    execution_type: ExecutionType
    input_schema: InputSchema
    output_schema: OutputSchema
    params_schema: Optional[List[ParamDef]] = None


class RegisterRequest(BaseModel):
    tool_name: str
    description: str
    execution_type: ExecutionType
    file_name: str
    source_code: str
    input_schema: InputSchema
    output_schema: OutputSchema
    params_schema: Optional[List[ParamDef]] = None
    sample_input: Optional[str] = None


class RegisterResponse(BaseModel):
    tool_id: str
    tool_name: str
    message: str
    adapter_preview: Optional[Dict[str, str]] = None


class ExecuteRequest(BaseModel):
    tool_id: str
    bop_data: Dict[str, Any] = Field(..., description="현재 BOP JSON 데이터")
    params: Optional[Dict[str, Any]] = Field(default=None, description="도구별 추가 파라미터")


class ExecuteResponse(BaseModel):
    success: bool
    message: str
    updated_bop: Optional[Dict[str, Any]] = None
    tool_input: Optional[str] = None  # 도구에 전달된 입력 데이터
    tool_output: Optional[str] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    execution_time_sec: Optional[float] = None
    auto_repair_attempted: Optional[bool] = None
    auto_repaired: Optional[bool] = None
    error_diagnosis: Optional[Dict[str, Any]] = None


class ToolListItem(BaseModel):
    tool_id: str
    tool_name: str
    description: str
    execution_type: ExecutionType
    created_at: str
    params_schema: Optional[List[ParamDef]] = None


class GenerateScriptRequest(BaseModel):
    description: str = Field(..., description="원하는 도구 기능 설명")


class GenerateScriptResponse(BaseModel):
    success: bool
    tool_name: Optional[str] = None
    description: Optional[str] = None
    script_code: Optional[str] = None
    suggested_params: Optional[List[ParamDef]] = None
    message: Optional[str] = None


class ExecutionContext(BaseModel):
    success: bool = False
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    tool_output: Optional[str] = None


class ImproveRequest(BaseModel):
    user_feedback: str = Field(..., description="사용자의 개선 요청 내용")
    execution_context: Optional[ExecutionContext] = None
    modify_adapter: bool = Field(default=True, description="어댑터 코드 수정 여부")
    modify_params: bool = Field(default=True, description="파라미터 스키마 수정 여부")
    modify_script: bool = Field(default=False, description="스크립트 코드 수정 여부")


class ImproveResponse(BaseModel):
    success: bool
    message: str
    explanation: Optional[str] = None
    changes_summary: Optional[List[str]] = None
    preview: Optional[Dict[str, Any]] = None  # pre_process_code, post_process_code, params_schema, script_code


class ApplyImprovementRequest(BaseModel):
    pre_process_code: Optional[str] = None
    post_process_code: Optional[str] = None
    params_schema: Optional[List[ParamDef]] = None
    script_code: Optional[str] = None
    create_new_version: bool = Field(default=True, description="새 버전으로 등록할지 여부")
