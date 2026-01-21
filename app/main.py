from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from app.models import GenerateRequest, ChatRequest, BOPData, UnifiedChatRequest, UnifiedChatResponse
from app.llm_service import generate_bop_from_text, modify_bop, unified_chat
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from io import BytesIO
import json

app = FastAPI(title="Backend API", version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Backend Ready"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/api/generate")
async def generate_bop(req: GenerateRequest) -> BOPData:
    """
    사용자 입력을 받아 Gemini API를 통해 BOP를 생성합니다.
    """
    try:
        # LLM 서비스를 통해 BOP 생성
        bop_dict = await generate_bop_from_text(req.user_input)

        # Pydantic 모델로 validation
        bop_data = BOPData(**bop_dict)

        return bop_data

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BOP 생성 실패: {str(e)}")


@app.post("/api/chat")
async def chat(req: ChatRequest) -> BOPData:
    """
    현재 BOP와 사용자 메시지를 받아 수정된 BOP를 반환합니다.
    """
    try:
        # current_bop을 dict로 변환
        current_bop_dict = req.current_bop.model_dump()

        # LLM 서비스를 통해 BOP 수정
        updated_bop_dict = await modify_bop(current_bop_dict, req.message)

        # Pydantic 모델로 validation
        updated_bop = BOPData(**updated_bop_dict)

        return updated_bop

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"BOP 수정 실패: {str(e)}")


@app.post("/api/chat/unified")
async def unified_chat_endpoint(req: UnifiedChatRequest) -> UnifiedChatResponse:
    """
    통합 채팅 엔드포인트: BOP 생성, 수정, QA를 모두 처리합니다.
    """
    try:
        # current_bop을 dict로 변환 (있는 경우)
        current_bop_dict = req.current_bop.model_dump() if req.current_bop else None

        # LLM 서비스를 통해 통합 처리
        response_data = await unified_chat(req.message, current_bop_dict)

        # bop_data가 있으면 Pydantic 모델로 validation
        bop_data = None
        if "bop_data" in response_data:
            bop_data = BOPData(**response_data["bop_data"])

        # UnifiedChatResponse 반환
        return UnifiedChatResponse(
            message=response_data["message"],
            bop_data=bop_data
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat 실패: {str(e)}")


@app.post("/api/export/excel")
async def export_excel(bop: BOPData):
    """
    계층적 BOP 데이터를 Excel 파일로 내보냅니다.

    Sheet 1: Project Info + Equipment List + Worker List
    Sheet 2: Hierarchical BOP (Processes & Operations)
    """
    try:
        wb = Workbook()

        # ==================== Sheet 1: Overview ====================
        ws_overview = wb.active
        ws_overview.title = "Overview"

        # Project Info
        ws_overview.append(["Project Information"])
        ws_overview['A1'].font = Font(bold=True, size=14)
        ws_overview.append(["Project Title", bop.project_title])
        ws_overview.append(["Target UPH", bop.target_uph])
        ws_overview.append([])

        # Equipment List
        ws_overview.append(["Equipment List"])
        ws_overview[f'A{ws_overview.max_row}'].font = Font(bold=True, size=12)
        ws_overview.append(["Equipment ID", "Name", "Type", "Location (X, Y, Z)"])
        header_row = ws_overview.max_row
        for col in range(1, 5):
            ws_overview.cell(header_row, col).font = Font(bold=True)
            ws_overview.cell(header_row, col).fill = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")

        for eq in bop.equipments:
            ws_overview.append([
                eq.equipment_id,
                eq.name,
                eq.type,
                f"({eq.location.x}, {eq.location.y}, {eq.location.z})"
            ])

        ws_overview.append([])

        # Worker List
        ws_overview.append(["Worker List"])
        ws_overview[f'A{ws_overview.max_row}'].font = Font(bold=True, size=12)
        ws_overview.append(["Worker ID", "Name", "Location (X, Y, Z)"])
        header_row = ws_overview.max_row
        for col in range(1, 4):
            ws_overview.cell(header_row, col).font = Font(bold=True)
            ws_overview.cell(header_row, col).fill = PatternFill(start_color="CCCCCC", end_color="CCCCCC", fill_type="solid")

        for worker in bop.workers:
            ws_overview.append([
                worker.worker_id,
                worker.name,
                f"({worker.location.x}, {worker.location.y}, {worker.location.z})"
            ])

        # ==================== Sheet 2: BOP Hierarchy ====================
        ws_bop = wb.create_sheet("BOP Hierarchy")

        # Header
        ws_bop.append([
            "Process ID", "Process Name", "Parallel", "Operation ID",
            "Operation Name", "Cycle Time (s)", "Equipment", "Workers", "Input Materials", "Output Materials"
        ])
        header_row = 1
        for col in range(1, 11):
            ws_bop.cell(header_row, col).font = Font(bold=True)
            ws_bop.cell(header_row, col).fill = PatternFill(start_color="4a90e2", end_color="4a90e2", fill_type="solid")
            ws_bop.cell(header_row, col).font = Font(bold=True, color="FFFFFF")
            ws_bop.cell(header_row, col).alignment = Alignment(horizontal="center", vertical="center")

        # Data
        for process in bop.processes:
            # Process header row
            process_start_row = ws_bop.max_row + 1

            # Calculate total and effective cycle times
            total_cycle_time = sum(op.cycle_time_sec for op in process.operations)
            effective_cycle_time = total_cycle_time / process.parallel_count if process.parallel_count > 0 else total_cycle_time

            for idx, operation in enumerate(process.operations):
                # Get equipment name
                equipment_name = "-"
                if operation.equipment_id:
                    eq = next((e for e in bop.equipments if e.equipment_id == operation.equipment_id), None)
                    equipment_name = eq.name if eq else operation.equipment_id

                # Get worker names
                worker_names = []
                for worker_id in operation.worker_ids:
                    worker = next((w for w in bop.workers if w.worker_id == worker_id), None)
                    worker_names.append(worker.name if worker else worker_id)
                workers_str = ", ".join(worker_names) if worker_names else "-"

                # Format materials
                input_materials_str = ", ".join([f"{m.name} ({m.quantity}{m.unit})" for m in operation.input_materials]) if operation.input_materials else "-"
                output_materials_str = ", ".join([f"{m.name} ({m.quantity}{m.unit})" for m in operation.output_materials]) if operation.output_materials else "-"

                if idx == 0:
                    # First operation row includes process info
                    ws_bop.append([
                        process.process_id,
                        process.name,
                        process.parallel_count,
                        operation.operation_id,
                        operation.name,
                        operation.cycle_time_sec,
                        equipment_name,
                        workers_str,
                        input_materials_str,
                        output_materials_str
                    ])
                else:
                    # Subsequent operation rows have empty process columns
                    ws_bop.append([
                        "",
                        "",
                        "",
                        operation.operation_id,
                        operation.name,
                        operation.cycle_time_sec,
                        equipment_name,
                        workers_str,
                        input_materials_str,
                        output_materials_str
                    ])

            # Merge process columns for this process group
            process_end_row = ws_bop.max_row
            if process_end_row > process_start_row:
                ws_bop.merge_cells(f'A{process_start_row}:A{process_end_row}')
                ws_bop.merge_cells(f'B{process_start_row}:B{process_end_row}')
                ws_bop.merge_cells(f'C{process_start_row}:C{process_end_row}')

            # Style process cells
            for row in range(process_start_row, process_end_row + 1):
                ws_bop.cell(row, 1).alignment = Alignment(horizontal="center", vertical="center")
                ws_bop.cell(row, 2).alignment = Alignment(horizontal="center", vertical="center")
                ws_bop.cell(row, 3).alignment = Alignment(horizontal="center", vertical="center")

            # Fill process rows with color
            process_fill = PatternFill(start_color="f0f0f0", end_color="f0f0f0", fill_type="solid")
            for row in range(process_start_row, process_end_row + 1):
                for col in range(1, 4):
                    ws_bop.cell(row, col).fill = process_fill
                    ws_bop.cell(row, col).font = Font(bold=True)

        # Adjust column widths
        ws_overview.column_dimensions['A'].width = 20
        ws_overview.column_dimensions['B'].width = 30
        ws_overview.column_dimensions['C'].width = 20
        ws_overview.column_dimensions['D'].width = 25

        ws_bop.column_dimensions['A'].width = 12
        ws_bop.column_dimensions['B'].width = 25
        ws_bop.column_dimensions['C'].width = 10
        ws_bop.column_dimensions['D'].width = 15
        ws_bop.column_dimensions['E'].width = 30
        ws_bop.column_dimensions['F'].width = 15
        ws_bop.column_dimensions['G'].width = 25
        ws_bop.column_dimensions['H'].width = 25
        ws_bop.column_dimensions['I'].width = 35
        ws_bop.column_dimensions['J'].width = 35

        # Save to buffer
        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        # Generate filename
        safe_filename = "".join(c for c in bop.project_title if c.isalnum() or c in (' ', '_', '-')).strip()
        if not safe_filename:
            safe_filename = "BOP"

        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={safe_filename}.xlsx"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel export 실패: {str(e)}")


def _get_color_for_equipment_type(equipment_type: str) -> str:
    """Equipment type에 따라 색상 반환"""
    color_map = {
        "robot": "#4a90e2",
        "machine": "#ff6b6b",
        "manual_station": "#50c878"
    }
    return color_map.get(equipment_type, "#888888")


@app.post("/api/export/3d")
async def export_3d(bop: BOPData):
    """
    계층적 BOP 데이터를 3D 시각화용 JSON으로 내보냅니다.
    Equipment 위치 기반으로 Operation을 배치합니다.
    """
    try:
        export_data = {
            "project_title": bop.project_title,
            "target_uph": bop.target_uph,
            "equipments": [],
            "workers": [],
            "operations": []
        }

        # Equipment 정보
        for equipment in bop.equipments:
            export_data["equipments"].append({
                "equipment_id": equipment.equipment_id,
                "name": equipment.name,
                "type": equipment.type,
                "position": {
                    "x": equipment.location.x,
                    "y": equipment.location.y,
                    "z": equipment.location.z
                },
                "color": _get_color_for_equipment_type(equipment.type)
            })

        # Worker 정보
        for worker in bop.workers:
            export_data["workers"].append({
                "worker_id": worker.worker_id,
                "name": worker.name,
                "position": {
                    "x": worker.location.x,
                    "y": worker.location.y,
                    "z": worker.location.z
                },
                "color": "#50c878"
            })

        # Operation 정보 (Equipment 위치 기반)
        for process in bop.processes:
            for operation in process.operations:
                # Find equipment for this operation
                equipment = next((eq for eq in bop.equipments if eq.equipment_id == operation.equipment_id), None)

                if equipment:
                    # parallel_count만큼 복제
                    for parallel_idx in range(process.parallel_count):
                        operation_obj = {
                            "operation_id": operation.operation_id,
                            "process_id": process.process_id,
                            "name": operation.name,
                            "cycle_time_sec": operation.cycle_time_sec,
                            "parallel_index": parallel_idx,
                            "position": {
                                "x": equipment.location.x + parallel_idx * 2,
                                "y": equipment.location.y + 1.2,
                                "z": equipment.location.z
                            },
                            "size": {
                                "width": 0.8,
                                "height": 0.5,
                                "depth": 0.8
                            },
                            "color": _get_color_for_equipment_type(equipment.type),
                            "equipment_id": operation.equipment_id,
                            "equipment_name": equipment.name
                        }
                        export_data["operations"].append(operation_obj)

        # JSON으로 변환
        json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
        buffer = BytesIO(json_str.encode('utf-8'))
        buffer.seek(0)

        # 파일명 생성
        safe_filename = "".join(c for c in bop.project_title if c.isalnum() or c in (' ', '_', '-')).strip()
        if not safe_filename:
            safe_filename = "BOP"

        return StreamingResponse(
            buffer,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={safe_filename}_3d.json"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"3D export 실패: {str(e)}")
