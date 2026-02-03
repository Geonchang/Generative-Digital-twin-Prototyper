from fastapi import APIRouter, HTTPException
from typing import List
import traceback
import logging

log = logging.getLogger("tool_router")

from app.tools.tool_models import (
    AnalyzeRequest, AnalyzeResponse,
    RegisterRequest, RegisterResponse,
    ExecuteRequest, ExecuteResponse,
    ToolListItem, ToolRegistryEntry,
    ToolMetadata, AdapterCode, ParamDef,
    GenerateScriptRequest, GenerateScriptResponse,
)
from app.tools.analyzer import analyze_script
from app.tools.synthesizer import synthesize_adapter, generate_tool_script
from app.tools.registry import list_tools, get_tool, delete_tool, save_tool, generate_tool_id
from app.tools.executor import execute_tool

router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_tool(req: AnalyzeRequest):
    """FR-1: 업로드된 스크립트의 입출력 스키마를 분석합니다."""
    log.info("[analyze] 스크립트 분석 시작: %s (코드 길이: %d)", req.file_name, len(req.source_code))
    try:
        result = await analyze_script(
            source_code=req.source_code,
            file_name=req.file_name,
            sample_input=req.sample_input,
        )
        log.info("[analyze] 분석 완료: tool_name=%s, input_type=%s, params=%d개",
                 result.get("tool_name"),
                 result.get("input_schema", {}).get("type"),
                 len(result.get("params_schema") or []))
        return AnalyzeResponse(**result)
    except Exception as e:
        log.error("[analyze] 오류:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"분석 실패: {str(e)}")


@router.post("/register", response_model=RegisterResponse)
async def register_tool(req: RegisterRequest):
    """FR-2 + FR-3: 어댑터 코드를 생성하고 도구를 등록합니다."""
    try:
        log.info("[register] 시작 - tool_name=%s", req.tool_name)
        tool_id = generate_tool_id(req.tool_name)

        metadata = ToolMetadata(
            tool_id=tool_id,
            tool_name=req.tool_name,
            description=req.description,
            execution_type=req.execution_type,
            file_name=req.file_name,
            input_schema=req.input_schema,
            output_schema=req.output_schema,
            params_schema=req.params_schema,
        )
        log.info("[register] metadata 생성 완료")

        # LLM으로 어댑터 코드 자동 생성
        log.info("[register] synthesize_adapter 호출")
        adapter = await synthesize_adapter(metadata, source_code=req.source_code)
        log.info("[register] adapter 생성 완료")

        # 레지스트리에 저장
        save_tool(metadata, adapter, req.source_code)
        log.info("[register] 저장 완료")

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
        log.error("[register] 오류 발생:\n%s", traceback.format_exc())
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
    import json
    log.info("[execute API] 도구 실행 요청: tool_id=%s", req.tool_id)
    log.info("[execute API] params=%s", json.dumps(req.params, ensure_ascii=False) if req.params else "None")
    log.info("[execute API] BOP 데이터: processes=%d, obstacles=%d",
             len(req.bop_data.get("processes", [])),
             len(req.bop_data.get("obstacles", [])))
    try:
        result = await execute_tool(req.tool_id, req.bop_data, req.params)
        log.info("[execute API] 실행 결과: success=%s, message=%s",
                 result.get("success"), result.get("message", "")[:100])
        return ExecuteResponse(**result)
    except Exception as e:
        log.error("[execute API] 오류:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"실행 실패: {str(e)}")


@router.post("/generate-script", response_model=GenerateScriptResponse)
async def generate_script_endpoint(req: GenerateScriptRequest):
    """AI로 도구 스크립트를 생성합니다."""
    try:
        result = await generate_tool_script(req.description)
        if result is None:
            return GenerateScriptResponse(
                success=False,
                message="스크립트 생성에 실패했습니다. 다시 시도해 주세요."
            )

        # suggested_params를 ParamDef 모델로 변환
        suggested_params = None
        if result.get("suggested_params"):
            suggested_params = [
                ParamDef(**p) for p in result["suggested_params"]
            ]

        return GenerateScriptResponse(
            success=True,
            tool_name=result.get("tool_name"),
            description=result.get("description"),
            script_code=result.get("script_code"),
            suggested_params=suggested_params,
            message="스크립트가 생성되었습니다."
        )
    except Exception as e:
        log.error("[generate-script] 오류:\n%s", traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"생성 실패: {str(e)}")
