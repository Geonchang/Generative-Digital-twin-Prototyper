import subprocess
import json
import os
import sys
import time
import shutil
import builtins
import re
from pathlib import Path
from typing import Tuple, Optional

from app.tools.registry import get_tool, get_script_path, WORKDIR_BASE

SUBPROCESS_TIMEOUT_SEC = 60


def _safe_builtins():
    """어댑터 코드 실행을 위한 제한된 builtins."""
    allowed = [
        'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter',
        'float', 'format', 'int', 'isinstance', 'len', 'list', 'map',
        'max', 'min', 'print', 'range', 'round', 'set', 'sorted',
        'str', 'sum', 'tuple', 'type', 'zip', 'None', 'True', 'False',
        'KeyError', 'ValueError', 'TypeError', 'IndexError', 'Exception',
    ]
    safe = {}
    for name in allowed:
        if hasattr(builtins, name):
            safe[name] = getattr(builtins, name)

    original_import = builtins.__import__
    safe_modules = {'json', 'csv', 'io', 'math', 'statistics', 'copy', 're'}

    def restricted_import(name, *args, **kwargs):
        if name not in safe_modules:
            raise ImportError(f"'{name}' 모듈은 어댑터 코드에서 사용할 수 없습니다.")
        return original_import(name, *args, **kwargs)

    safe['__import__'] = restricted_import
    return safe


def _run_preprocessor(code: str, bop_data: dict) -> str:
    # Use a single dict for globals so that functions defined in exec()
    # can access module-level imports (import puts names into globals).
    namespace = {"__builtins__": _safe_builtins()}
    exec(code, namespace)
    fn = namespace.get("convert_bop_to_input")
    if not fn:
        raise ValueError("Pre-processor에 'convert_bop_to_input' 함수가 정의되어 있지 않습니다.")
    result = fn(bop_data)
    if not isinstance(result, str):
        result = json.dumps(result, ensure_ascii=False)
    return result


def _run_postprocessor(code: str, bop_data: dict, tool_output: str) -> dict:
    namespace = {"__builtins__": _safe_builtins()}
    exec(code, namespace)
    fn = namespace.get("apply_result_to_bop")
    if not fn:
        raise ValueError("Post-processor에 'apply_result_to_bop' 함수가 정의되어 있지 않습니다.")
    result = fn(bop_data, tool_output)
    if not isinstance(result, dict):
        raise ValueError("Post-processor는 dict를 반환해야 합니다.")
    return result


def _build_command(
    script_path: Path,
    input_file: Path,
    output_file: Path,
    execution_type: str,
    args_format: Optional[str],
    bop_data: dict,
) -> list:
    """Build the subprocess command, substituting args_format placeholders."""
    if execution_type == "python":
        cmd = [sys.executable, str(script_path)]
    else:
        cmd = [str(script_path)]

    if args_format:
        # Substitute known placeholders
        substitutions = {
            "input_file": str(input_file),
            "output_file": str(output_file),
        }
        # Extract top-level BOP scalars (e.g. target_uph)
        for key, val in bop_data.items():
            if isinstance(val, (int, float, str, bool)):
                substitutions[key] = str(val)

        # Replace {placeholder} in args_format
        args_str = args_format
        for key, val in substitutions.items():
            args_str = args_str.replace(f"{{{key}}}", val)

        # Split into individual arguments
        # Use shlex-like splitting but handle -- flags properly
        parts = args_str.split()
        cmd.extend(parts)
    else:
        # Fallback: just pass input file as positional arg
        cmd.append(str(input_file))

    return cmd


def _execute_subprocess(
    script_path: Path,
    work_dir: Path,
    input_file: Path,
    output_file: Path,
    execution_type: str,
    args_format: Optional[str],
    bop_data: dict,
) -> Tuple[str, str, int]:
    cmd = _build_command(script_path, input_file, output_file, execution_type, args_format, bop_data)

    env = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": "",
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),  # Windows needs this
    }

    try:
        result = subprocess.run(
            cmd,
            cwd=str(work_dir),
            capture_output=True,
            text=True,
            timeout=SUBPROCESS_TIMEOUT_SEC,
            env=env,
        )
        return result.stdout, result.stderr, result.returncode
    except subprocess.TimeoutExpired:
        raise TimeoutError(f"스크립트 실행이 {SUBPROCESS_TIMEOUT_SEC}초를 초과했습니다.")


async def execute_tool(tool_id: str, bop_data: dict) -> dict:
    """
    도구 실행 파이프라인:
    1. 레지스트리에서 도구 로드
    2. Pre-processor 실행 (BOP → 도구 입력)
    3. 외부 스크립트 실행 (subprocess)
    4. Post-processor 실행 (도구 출력 → BOP 업데이트)
    """
    start_time = time.time()

    # 1. 도구 로드
    entry = get_tool(tool_id)
    if not entry:
        return {"success": False, "message": f"도구 '{tool_id}'를 찾을 수 없습니다."}

    metadata = entry.metadata
    adapter = entry.adapter

    # 2. 스크립트 파일 확인
    script_path = get_script_path(tool_id, metadata.file_name)
    if not script_path:
        return {"success": False, "message": f"스크립트 파일을 찾을 수 없습니다: {metadata.file_name}"}

    # 3. 격리된 작업 디렉토리 생성
    exec_id = f"{tool_id}_{int(time.time() * 1000)}"
    work_dir = WORKDIR_BASE / exec_id
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # 4. Pre-processor 실행
        try:
            tool_input = _run_preprocessor(adapter.pre_process_code, bop_data)
        except Exception as e:
            return {
                "success": False,
                "message": f"Pre-processor 실행 오류: {str(e)}",
                "execution_time_sec": time.time() - start_time,
            }

        # 5. 입력/출력 파일 경로 결정
        input_suffix_map = {"csv": ".csv", "json": ".json", "args": ".csv", "stdin": ".txt"}
        input_suffix = input_suffix_map.get(metadata.input_schema.type, ".txt")
        input_file = work_dir / f"input_data{input_suffix}"
        with open(input_file, "w", encoding="utf-8") as f:
            f.write(tool_input)

        output_suffix_map = {"csv": ".csv", "json": ".json"}
        output_suffix = output_suffix_map.get(
            metadata.output_schema.type if metadata.output_schema else None, ".csv"
        )
        output_file = work_dir / f"output_data{output_suffix}"

        # args_format 추출 (args 타입인 경우)
        args_format = None
        if metadata.input_schema and metadata.input_schema.args_format:
            args_format = metadata.input_schema.args_format

        # 6. 외부 스크립트 실행
        try:
            stdout, stderr, return_code = _execute_subprocess(
                script_path, work_dir, input_file, output_file,
                metadata.execution_type, args_format, bop_data,
            )
        except TimeoutError as e:
            return {
                "success": False,
                "message": str(e),
                "execution_time_sec": time.time() - start_time,
            }

        if return_code != 0:
            return {
                "success": False,
                "message": f"스크립트가 오류 코드 {return_code}로 종료되었습니다.",
                "stdout": stdout[:2000] if stdout else None,
                "stderr": stderr[:2000] if stderr else None,
                "execution_time_sec": time.time() - start_time,
            }

        # 7. 도구 출력 수집 (output file 우선, 없으면 stdout)
        tool_output = stdout
        if output_file.exists():
            with open(output_file, "r", encoding="utf-8") as f:
                tool_output = f.read()

        # 8. Post-processor 실행
        try:
            updated_bop = _run_postprocessor(adapter.post_process_code, bop_data, tool_output)
        except Exception as e:
            return {
                "success": False,
                "message": f"Post-processor 실행 오류: {str(e)}",
                "stdout": stdout[:2000] if stdout else None,
                "execution_time_sec": time.time() - start_time,
            }

        return {
            "success": True,
            "message": "도구 실행이 완료되었습니다.",
            "updated_bop": updated_bop,
            "stdout": stdout[:2000] if stdout else None,
            "stderr": stderr[:500] if stderr else None,
            "execution_time_sec": time.time() - start_time,
        }

    except Exception as e:
        return {
            "success": False,
            "message": f"실행 오류: {str(e)}",
            "execution_time_sec": time.time() - start_time,
        }
    finally:
        try:
            shutil.rmtree(work_dir)
        except Exception:
            pass
