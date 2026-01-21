from pydantic import BaseModel
from typing import List, Optional


# ============================================
# Hierarchical BOP Models
# ============================================

class Location(BaseModel):
    """3D spatial location for equipment and workers"""
    x: float
    y: float
    z: float


class Material(BaseModel):
    """Material input/output for operations"""
    material_id: str
    name: str
    quantity: float = 0
    unit: str = "ea"


class Equipment(BaseModel):
    """Manufacturing equipment (robot, machine, manual station)"""
    equipment_id: str
    name: str
    type: str  # "robot", "machine", "manual_station"
    location: Location


class Worker(BaseModel):
    """Human worker"""
    worker_id: str
    name: str
    location: Location


class Operation(BaseModel):
    """Individual work operation - lowest level unit"""
    operation_id: str
    name: str
    description: str
    cycle_time_sec: float
    equipment_id: Optional[str] = None  # Reference to Equipment (can be shared)
    worker_ids: List[str] = []          # References to Workers (multiple possible)
    input_materials: List[Material] = []
    output_materials: List[Material] = []
    sequence: int  # Order within the process


class Process(BaseModel):
    """Manufacturing process - group of operations"""
    process_id: str
    name: str
    description: str
    operations: List[Operation]
    parallel_count: int = 1  # Number of parallel lines

    @property
    def total_cycle_time(self) -> float:
        """Sum of all operation cycle times"""
        return sum(op.cycle_time_sec for op in self.operations)

    @property
    def effective_cycle_time(self) -> float:
        """Actual time considering parallel execution"""
        if self.parallel_count > 0:
            return self.total_cycle_time / self.parallel_count
        return self.total_cycle_time


class BOPData(BaseModel):
    """Complete Bill of Process data"""
    project_title: str
    target_uph: int
    processes: List[Process]
    equipments: List[Equipment]  # Global equipment list
    workers: List[Worker]        # Global worker list


# ============================================
# API Request/Response Models
# ============================================

class GenerateRequest(BaseModel):
    user_input: str


class ChatRequest(BaseModel):
    message: str
    current_bop: BOPData


class UnifiedChatRequest(BaseModel):
    message: str
    current_bop: Optional[BOPData] = None


class UnifiedChatResponse(BaseModel):
    message: str
    bop_data: Optional[BOPData] = None


# ============================================
# Migration Utility
# ============================================

def migrate_flat_to_hierarchical(old_bop: dict) -> dict:
    """
    Convert legacy flat structure to hierarchical structure.

    Old format:
    {
        "project_title": str,
        "target_uph": int,
        "steps": [
            {
                "step_id": int,
                "name": str,
                "description": str,
                "cycle_time_sec": int,
                "resource_type": str,
                "resource_count": int
            }
        ]
    }

    New format:
    {
        "project_title": str,
        "target_uph": int,
        "processes": [...],
        "equipments": [...],
        "workers": [...]
    }
    """
    processes = []
    equipments = []
    workers = []

    for idx, step in enumerate(old_bop.get('steps', [])):
        process_id = f"P{idx + 1}"

        # Create equipment for this step
        resource_type = step.get('resource_type', 'machine')
        equipment_id = f"EQ-{resource_type.upper()}-{idx + 1:02d}"

        equipments.append({
            "equipment_id": equipment_id,
            "name": f"{step['name']} Equipment",
            "type": resource_type,
            "location": {"x": 0, "y": 0, "z": -idx * 3}
        })

        # Create operation
        operation = {
            "operation_id": f"{process_id}-OP1",
            "name": step['name'],
            "description": step.get('description', ''),
            "cycle_time_sec": float(step.get('cycle_time_sec', 0)),
            "equipment_id": equipment_id,
            "worker_ids": [],
            "input_materials": [],
            "output_materials": [],
            "sequence": 1
        }

        # Create process
        processes.append({
            "process_id": process_id,
            "name": step['name'],
            "description": step.get('description', ''),
            "operations": [operation],
            "parallel_count": step.get('resource_count', 1)
        })

    return {
        "project_title": old_bop.get('project_title', 'Migrated BOP'),
        "target_uph": old_bop.get('target_uph', 60),
        "processes": processes,
        "equipments": equipments,
        "workers": workers
    }
