import json
import re
import shutil
from pathlib import Path
from typing import List, Optional

from app.tools.tool_models import ToolMetadata, AdapterCode, ToolRegistryEntry, ToolListItem

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # project root
REGISTRY_DIR = BASE_DIR / "data" / "tool_registry"
UPLOADS_DIR = BASE_DIR / "uploads" / "scripts"
WORKDIR_BASE = BASE_DIR / "uploads" / "workdir"
LOGS_DIR = BASE_DIR / "data" / "tool_logs"


def _ensure_dirs():
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    WORKDIR_BASE.mkdir(parents=True, exist_ok=True)
    LOGS_DIR.mkdir(parents=True, exist_ok=True)


def generate_tool_id(tool_name: str) -> str:
    slug = re.sub(r'[^a-zA-Z0-9_]', '_', tool_name.lower()).strip('_')
    slug = re.sub(r'_+', '_', slug)
    if not slug:
        slug = "tool"
    base_slug = slug
    counter = 1
    while (REGISTRY_DIR / slug).exists():
        slug = f"{base_slug}_{counter}"
        counter += 1
    return slug


def save_tool(metadata: ToolMetadata, adapter: AdapterCode, source_code: str) -> str:
    _ensure_dirs()
    tool_dir = REGISTRY_DIR / metadata.tool_id
    tool_dir.mkdir(parents=True, exist_ok=True)

    with open(tool_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata.model_dump(), f, indent=2, ensure_ascii=False)

    with open(tool_dir / "adapter.json", "w", encoding="utf-8") as f:
        json.dump(adapter.model_dump(), f, indent=2, ensure_ascii=False)

    script_dir = UPLOADS_DIR / metadata.tool_id
    script_dir.mkdir(parents=True, exist_ok=True)

    # 줄바꿈 정규화: \r\n, \r을 모두 \n으로 통일
    normalized_code = source_code.replace('\r\n', '\n').replace('\r', '\n')

    # newline='' 사용: 줄바꿈 자동 변환 비활성화 (원본 그대로 저장)
    with open(script_dir / metadata.file_name, "w", encoding="utf-8", newline='') as f:
        f.write(normalized_code)

    return metadata.tool_id


def list_tools() -> List[ToolListItem]:
    _ensure_dirs()
    tools = []
    if not REGISTRY_DIR.exists():
        return tools
    for tool_dir in sorted(REGISTRY_DIR.iterdir()):
        if tool_dir.is_dir():
            meta_file = tool_dir / "metadata.json"
            if meta_file.exists():
                with open(meta_file, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                tools.append(ToolListItem(
                    tool_id=meta["tool_id"],
                    tool_name=meta["tool_name"],
                    description=meta["description"],
                    execution_type=meta["execution_type"],
                    created_at=meta.get("created_at", ""),
                    params_schema=meta.get("params_schema"),
                ))
    return tools


def get_tool(tool_id: str) -> Optional[ToolRegistryEntry]:
    tool_dir = REGISTRY_DIR / tool_id
    meta_file = tool_dir / "metadata.json"
    adapter_file = tool_dir / "adapter.json"

    if not meta_file.exists() or not adapter_file.exists():
        return None

    with open(meta_file, "r", encoding="utf-8") as f:
        metadata = ToolMetadata(**json.load(f))
    with open(adapter_file, "r", encoding="utf-8") as f:
        adapter = AdapterCode(**json.load(f))

    return ToolRegistryEntry(metadata=metadata, adapter=adapter)


def delete_tool(tool_id: str) -> bool:
    tool_dir = REGISTRY_DIR / tool_id
    script_dir = UPLOADS_DIR / tool_id

    deleted = False
    if tool_dir.exists():
        shutil.rmtree(tool_dir)
        deleted = True
    if script_dir.exists():
        shutil.rmtree(script_dir)
        deleted = True
    return deleted


def get_script_path(tool_id: str, file_name: str) -> Optional[Path]:
    path = UPLOADS_DIR / tool_id / file_name
    return path if path.exists() else None
