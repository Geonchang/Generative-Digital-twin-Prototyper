from fastapi import APIRouter, HTTPException
from typing import List

from app.tools.tool_models import (
    AnalyzeRequest, AnalyzeResponse,
    RegisterRequest, RegisterResponse,
    ExecuteRequest, ExecuteResponse,
    ToolListItem, ToolRegistryEntry,
    ToolMetadata, AdapterCode,
)
from app.tools.analyzer import analyze_script
from app.tools.synthesizer import synthesize_adapter
from app.tools.registry import list_tools, get_tool, delete_tool, save_tool, generate_tool_id
from app.tools.executor import execute_tool

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_tool(req: AnalyzeRequest):
    """FR-1: 업로드된 스크립트의 입출력 스키마를 분석합니다."""
    try:
        result = await analyze_script(
            source_code=req.source_code,
            file_name=req.file_name,
            sample_input=req.sample_input,
        )
        return AnalyzeResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 실패: {str(e)}")


@router.post("/register", response_model=RegisterResponse)
async def register_tool(req: RegisterRequest):
    """FR-2 + FR-3: 어댑터 코드를 생성하고 도구를 등록합니다."""
    try:
        tool_id = generate_tool_id(req.tool_name)

        metadata = ToolMetadata(
            tool_id=tool_id,
            tool_name=req.tool_name,
            description=req.description,
            execution_type=req.execution_type,
            file_name=req.file_name,
            input_schema=req.input_schema,
            output_schema=req.output_schema,
        )

        # LLM으로 어댑터 코드 자동 생성
        adapter = await synthesize_adapter(metadata)

        # 레지스트리에 저장
        save_tool(metadata, adapter, req.source_code)

        return RegisterResponse(
            tool_id=tool_id,
            tool_name=req.tool_name,
            message=f"도구 '{req.tool_name}'이(가) 등록되었습니다.",
            adapter_preview={
                "pre_process_code": adapter.pre_process_code[:500],
                "post_process_code": adapter.post_process_code[:500],
            },
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"등록 실패: {str(e)}")


@router.get("/", response_model=List[ToolListItem])
async def list_all_tools():
    """FR-3: 등록된 모든 도구를 조회합니다."""
    return list_tools()


@router.get("/{tool_id}", response_model=ToolRegistryEntry)
async def get_tool_detail(tool_id: str):
    """FR-3: 특정 도구의 상세 정보를 조회합니다."""
    entry = get_tool(tool_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"도구 '{tool_id}'를 찾을 수 없습니다.")
    return entry


@router.delete("/{tool_id}")
async def delete_tool_endpoint(tool_id: str):
    """FR-3: 등록된 도구를 삭제합니다."""
    deleted = delete_tool(tool_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"도구 '{tool_id}'를 찾을 수 없습니다.")
    return {"message": f"도구 '{tool_id}'가 삭제되었습니다."}


@router.post("/execute", response_model=ExecuteResponse)
async def execute_tool_endpoint(req: ExecuteRequest):
    """FR-4: 등록된 도구를 BOP 데이터에 대해 실행합니다."""
    try:
        result = await execute_tool(req.tool_id, req.bop_data)
        return ExecuteResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"실행 실패: {str(e)}")
