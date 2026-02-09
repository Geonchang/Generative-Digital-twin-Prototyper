import subprocess
import json
import os
import sys
import time
import shutil
import builtins
import re
import copy
import inspect
import traceback
import logging
import math
from pathlib import Path
from typing import Tuple, Optional, Dict, Any

from datetime import datetime
from app.tools.registry import get_tool, get_script_path, WORKDIR_BASE, LOGS_DIR, update_tool_adapter, update_tool_metadata
from app.tools.synthesizer import repair_adapter

log = logging.getLogger("tool_executor")

SUBPROCESS_TIMEOUT_SEC = 60
MAX_AUTO_REPAIR_ATTEMPTS = 0  # 자동 복구 비활성화
MAX_SCRIPT_REPAIR_ATTEMPTS = 0  # 스크립트 실행 오류 자동 복구 비활성화


def _sanitize_json_floats(obj):
    """
    JSON에서 지원하지 않는 float 값(NaN, Infinity, -Infinity)을 정리합니다.

    - NaN → null
    - Infinity, -Infinity → null

    Returns:
        정리된 객체와 변경 여부
    """
    changed = False

    if isinstance(obj, dict):
        cleaned = {}
        for key, value in obj.items():
            cleaned_value, value_changed = _sanitize_json_floats(value)
            cleaned[key] = cleaned_value
            if value_changed:
                changed = True
        return cleaned, changed

    elif isinstance(obj, list):
        cleaned = []
        for item in obj:
            cleaned_item, item_changed = _sanitize_json_floats(item)
            cleaned.append(cleaned_item)
            if item_changed:
                changed = True
        return cleaned, changed

    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            log.warning("[sanitize] Invalid float detected: %s → null", obj)
            return None, True
        return obj, False

    else:
        return obj, False


def _detect_args_format_error(stderr: str) -> Optional[Dict[str, Any]]:
    """
    argparse 오류 패턴을 감지하고 분석합니다.
    Returns: {"type": "invalid_placeholder", "placeholder": "wall_thickness"} 또는 None
    """
    if not stderr:
        return None

    # Pattern: invalid float value: '{placeholder}'
    import re
    match = re.search(r"invalid (\w+) value: '\{(\w+)\}'", stderr)
    if match:
        return {
            "type": "unsubstituted_placeholder",
            "value_type": match.group(1),
            "placeholder": match.group(2),
        }

    # Pattern: argument --xxx: expected one argument
    match = re.search(r"argument (--\w+): expected", stderr)
    if match:
        return {
            "type": "missing_argument",
            "argument": match.group(1),
        }

    return None


def _capture_error_info(e: Exception) -> Dict[str, Any]:
    """예외에서 상세 에러 정보를 추출합니다."""
    return {
        "type": type(e).__name__,
        "message": str(e),
        "traceback": traceback.format_exc(),
    }


def _save_execution_log(tool_id: str, log_data: dict):
    """실행 로그를 JSON 파일로 저장."""
    try:
        tool_log_dir = LOGS_DIR / tool_id
        tool_log_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        log_file = tool_log_dir / f"{timestamp}.json"

        with open(log_file, "w", encoding="utf-8") as f:
            json.dump(log_data, f, indent=2, ensure_ascii=False, default=str)
    except Exception:
        pass  # 로그 저장 실패는 실행에 영향을 주지 않음


def _safe_builtins():
    """어댑터 코드 실행을 위한 제한된 builtins."""
    allowed = [
        'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter',
        'float', 'format', 'int', 'isinstance', 'len', 'list', 'map',
        'max', 'min', 'next', 'print', 'range', 'round', 'set', 'sorted',
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


def _run_preprocessor(code: str, bop_data: dict, params: Optional[Dict[str, Any]] = None) -> str:
    # Use a single dict for globals so that functions defined in exec()
    # can access module-level imports (import puts names into globals).
    namespace = {"__builtins__": _safe_builtins()}
    # Pre-inject common stdlib modules that adapters typically need
    import json as json_mod
    import csv as csv_mod
    import io as io_mod
    import math as math_mod
    namespace["json"] = json_mod
    namespace["csv"] = csv_mod
    namespace["io"] = io_mod
    namespace["math"] = math_mod
    exec(code, namespace)
    fn = namespace.get("convert_bop_to_input")
    if not fn:
        raise ValueError("Pre-processor에 'convert_bop_to_input' 함수가 정의되어 있지 않습니다.")

    # Pre-processor는 반드시 2개 파라미터(bop_json, params)를 받아야 함
    sig = inspect.signature(fn)
    if len(sig.parameters) < 2:
        raise ValueError("Pre-processor 'convert_bop_to_input'는 반드시 2개의 파라미터(bop_json, params)를 받아야 합니다.")

    result = fn(bop_data, params or {})
    if not isinstance(result, str):
        result = json.dumps(result, ensure_ascii=False)
    return result


def _run_postprocessor(code: str, bop_data: dict, tool_output: str) -> dict:
    namespace = {"__builtins__": _safe_builtins()}
    # Pre-inject common stdlib modules that adapters typically need
    import json as json_mod
    import csv as csv_mod
    import io as io_mod
    import math as math_mod
    namespace["json"] = json_mod
    namespace["csv"] = csv_mod
    namespace["io"] = io_mod
    namespace["math"] = math_mod
    exec(code, namespace)
    fn = namespace.get("apply_result_to_bop")
    if not fn:
        raise ValueError("Post-processor에 'apply_result_to_bop' 함수가 정의되어 있지 않습니다.")

    # tool_output을 dict로 파싱하여 전달 (adapter 코드 단순화)
    parsed_output = tool_output
    if isinstance(tool_output, str):
        try:
            parsed_output = json_mod.loads(tool_output)
        except json_mod.JSONDecodeError:
            parsed_output = {"raw_output": tool_output}

    result = fn(bop_data, parsed_output)
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
    params: Optional[Dict[str, Any]] = None,
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

        # === 핵심 수정: params도 치환 대상에 추가 ===
        if params:
            for key, val in params.items():
                if val is not None:
                    substitutions[key] = str(val)

        # Replace {placeholder} in args_format
        args_str = args_format
        for key, val in substitutions.items():
            args_str = args_str.replace(f"{{{key}}}", val)

        log.debug("[build_command] args_format: %s -> %s", args_format, args_str)

        # 치환되지 않은 placeholder 검출 (자가 진단)
        import re
        remaining_placeholders = re.findall(r'\{(\w+)\}', args_str)
        if remaining_placeholders:
            log.warning("[build_command] 치환되지 않은 placeholder 발견: %s", remaining_placeholders)

        # Split into individual arguments
        # Use shlex-like splitting but handle -- flags properly
        parts = args_str.split()
        cmd.extend(parts)
    else:
        # Fallback: pass input and output files as positional args
        cmd.append(str(input_file))
        cmd.append(str(output_file))

    log.info("[build_command] 최종 명령어: %s", ' '.join(cmd[:5]) + ('...' if len(cmd) > 5 else ''))
    return cmd


def _execute_subprocess(
    script_path: Path,
    work_dir: Path,
    input_file: Path,
    output_file: Path,
    execution_type: str,
    args_format: Optional[str],
    bop_data: dict,
    params: Optional[Dict[str, Any]] = None,
) -> Tuple[str, str, int]:
    cmd = _build_command(script_path, input_file, output_file, execution_type, args_format, bop_data, params)

    env = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONPATH": "",
        "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),  # Windows needs this
    }

    # NOTE: 파라미터는 pre-processor에서 JSON에 포함되어 전달됩니다.
    # 환경변수를 통한 파라미터 전달은 사용하지 않습니다.

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


async def execute_tool(tool_id: str, bop_data: dict, params: Optional[Dict[str, Any]] = None) -> dict:
    """
    도구 실행 파이프라인 (자동 복구 기능 포함):
    1. 레지스트리에서 도구 로드
    2. Pre-processor 실행 (BOP → 도구 입력)
    3. 외부 스크립트 실행 (subprocess)
    4. Post-processor 실행 (도구 출력 → BOP 업데이트)

    어댑터 오류 발생 시 Gemini를 통해 자동 복구 시도
    """
    start_time = time.time()

    # Deep copy to prevent mutation of the original dict
    bop_data = copy.deepcopy(bop_data)

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

    log.info("=" * 60)
    log.info("[execute] === 도구 실행 시작 ===")
    log.info("[execute] tool_id=%s, tool_name=%s", tool_id, metadata.tool_name)
    log.info("[execute] params=%s", json.dumps(params, ensure_ascii=False) if params else "None")
    log.info("[execute] args_format=%s", metadata.input_schema.args_format if metadata.input_schema else "None")

    # 로그 수집용 변수
    exec_log = {
        "tool_id": tool_id,
        "tool_name": metadata.tool_name,
        "executed_at": datetime.now().isoformat(),
        "params": params,
        "input": None,
        "output": None,
        "stdout": None,
        "stderr": None,
        "return_code": None,
        "success": False,
        "message": None,
        "execution_time_sec": None,
        "auto_repair_attempts": 0,
        "auto_repair_success": False,
        "script_repair_info": None,
    }

    # 현재 사용할 어댑터 코드 (복구 시 업데이트됨)
    current_pre_code = adapter.pre_process_code
    current_post_code = adapter.post_process_code

    try:
        # === Pre-processor 실행 (자동 복구 포함) ===
        tool_input = None
        pre_error = None

        for attempt in range(MAX_AUTO_REPAIR_ATTEMPTS + 1):
            try:
                tool_input = _run_preprocessor(current_pre_code, bop_data, params)
                break  # 성공
            except Exception as e:
                pre_error = e
                if attempt < MAX_AUTO_REPAIR_ATTEMPTS:
                    log.info("[execute] Pre-processor 오류 - 자동 복구 시도 %d/%d", attempt + 1, MAX_AUTO_REPAIR_ATTEMPTS)
                    exec_log["auto_repair_attempts"] += 1

                    error_info = _capture_error_info(e)
                    bop_json_str = json.dumps(bop_data, ensure_ascii=False, indent=2)

                    fixed_code = await repair_adapter(
                        failed_function="pre_process",
                        failed_code=current_pre_code,
                        error_info=error_info,
                        input_data=bop_json_str,
                    )

                    if fixed_code:
                        log.info("[execute] Pre-processor 코드 수정 완료 - 재시도")
                        current_pre_code = fixed_code
                    else:
                        log.warning("[execute] Pre-processor 자동 복구 실패")
                        break

        if tool_input is None:
            exec_log["message"] = f"Pre-processor 실행 오류: {str(pre_error)}"
            exec_log["execution_time_sec"] = time.time() - start_time
            log.error("[execute] Pre-processor 최종 실패: %s", exec_log["message"])
            log.error("[execute] Pre-processor 에러 상세: %s", str(pre_error))
            return {
                "success": False,
                "message": exec_log["message"],
                "execution_time_sec": exec_log["execution_time_sec"],
                "auto_repair_attempted": exec_log["auto_repair_attempts"] > 0,
            }

        exec_log["input"] = tool_input

        # 5. 입력/출력 파일 경로 결정
        input_suffix_map = {"csv": ".csv", "json": ".json", "args": ".csv", "stdin": ".txt"}
        input_suffix = input_suffix_map.get(metadata.input_schema.type, ".txt")
        input_file = work_dir / f"input_data{input_suffix}"
        with open(input_file, "w", encoding="utf-8") as f:
            f.write(tool_input)

        # 입력 파일 내용 로깅 (디버깅용)
        log.info("[execute] 입력 파일 작성 완료: %s (길이: %d bytes)", input_file.name, len(tool_input))
        if len(tool_input) == 0:
            log.error("[execute] 경고: 입력 파일이 비어 있습니다!")
        elif len(tool_input) < 200:
            log.info("[execute] 입력 파일 내용: %s", tool_input)
        else:
            log.info("[execute] 입력 파일 미리보기: %s...", tool_input[:200])

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
        log.info("[execute] 스크립트 실행 시작: %s (args_format=%s)", metadata.file_name, args_format)
        try:
            stdout, stderr, return_code = _execute_subprocess(
                script_path, work_dir, input_file, output_file,
                metadata.execution_type, args_format, bop_data, params,
            )
            log.info("[execute] 스크립트 실행 완료: return_code=%d", return_code)
        except TimeoutError as e:
            exec_log["message"] = str(e)
            exec_log["execution_time_sec"] = time.time() - start_time
            return {"success": False, "message": exec_log["message"], "execution_time_sec": exec_log["execution_time_sec"]}

        exec_log["stdout"] = stdout
        exec_log["stderr"] = stderr
        exec_log["return_code"] = return_code

        if return_code != 0:
            log.warning("[execute] 스크립트 오류 발생: return_code=%d", return_code)
            log.warning("[execute] stderr: %s", stderr[:500] if stderr else "None")
            log.warning("[execute] stdout: %s", stdout[:1000] if stdout else "None")

            # === 스크립트 오류 자가 진단 ===
            args_error = _detect_args_format_error(stderr)
            if args_error:
                log.info("[execute] argparse 오류 감지: %s", args_error)
                exec_log["script_repair_info"] = args_error

                if args_error["type"] == "unsubstituted_placeholder":
                    placeholder = args_error["placeholder"]
                    # params에 해당 값이 있는지 확인
                    if params and placeholder in params:
                        log.error(
                            "[execute] 치환 실패: params에 '%s'=%s 가 있지만 args_format에서 치환되지 않음",
                            placeholder, params[placeholder]
                        )
                        exec_log["message"] = (
                            f"스크립트 인자 오류: '{placeholder}' 파라미터가 전달되지 않았습니다. "
                            f"(값: {params[placeholder]}). 시스템 버그일 수 있습니다."
                        )
                    else:
                        log.error(
                            "[execute] params에 '%s' 키가 없음. params_schema 또는 args_format 확인 필요",
                            placeholder
                        )
                        exec_log["message"] = (
                            f"스크립트 인자 오류: '{placeholder}' 파라미터가 정의되지 않았습니다. "
                            f"도구를 다시 등록하거나 params_schema를 확인해 주세요."
                        )
            else:
                exec_log["message"] = f"스크립트가 오류 코드 {return_code}로 종료되었습니다."

            exec_log["execution_time_sec"] = time.time() - start_time

            # 최종 실패 메시지 로깅
            log.error("[execute] 최종 실패: %s", exec_log["message"])

            return {
                "success": False,
                "message": exec_log["message"],
                "stdout": stdout[:2000] if stdout else None,
                "stderr": stderr[:2000] if stderr else None,
                "execution_time_sec": exec_log["execution_time_sec"],
                "error_diagnosis": args_error,
            }

        # 7. 도구 출력 수집 (output file에서 읽기)
        tool_output = None
        if output_file.exists():
            try:
                with open(output_file, "r", encoding="utf-8") as f:
                    tool_output = f.read()
                log.info("[execute] Output 파일 읽기 완료: %s (%d bytes)", output_file.name, len(tool_output))
            except Exception as e:
                log.error("[execute] Output 파일 읽기 실패: %s", str(e))
                tool_output = None

        # Fallback: output 파일이 없으면 stdout 사용 (하위 호환성)
        if not tool_output:
            log.warning("[execute] Output 파일 없음 - stdout 사용 (하위 호환)")
            tool_output = stdout

        exec_log["output"] = tool_output

        # 로그에 input/output 내용 기록
        log.info("[execute] === Input/Output 내용 ===")
        if len(tool_input) < 500:
            log.info("[execute] Input: %s", tool_input)
        else:
            log.info("[execute] Input (처음 500자): %s...", tool_input[:500])

        if tool_output and len(tool_output) < 500:
            log.info("[execute] Output: %s", tool_output)
        elif tool_output:
            log.info("[execute] Output (처음 500자): %s...", tool_output[:500])
        else:
            log.warning("[execute] Output 없음")
        log.info("[execute] =========================")

        # === Post-processor 실행 (자동 복구 포함) ===
        updated_bop = None
        post_error = None

        for attempt in range(MAX_AUTO_REPAIR_ATTEMPTS + 1):
            try:
                updated_bop = _run_postprocessor(current_post_code, bop_data, tool_output)
                break  # 성공
            except Exception as e:
                post_error = e
                if attempt < MAX_AUTO_REPAIR_ATTEMPTS:
                    log.info("[execute] Post-processor 오류 - 자동 복구 시도 %d/%d", attempt + 1, MAX_AUTO_REPAIR_ATTEMPTS)
                    exec_log["auto_repair_attempts"] += 1

                    error_info = _capture_error_info(e)

                    fixed_code = await repair_adapter(
                        failed_function="post_process",
                        failed_code=current_post_code,
                        error_info=error_info,
                        input_data=tool_output[:5000] if tool_output else "",
                    )

                    if fixed_code:
                        log.info("[execute] Post-processor 코드 수정 완료 - 재시도")
                        current_post_code = fixed_code
                    else:
                        log.warning("[execute] Post-processor 자동 복구 실패")
                        break

        if updated_bop is None:
            exec_log["message"] = f"Post-processor 실행 오류: {str(post_error)}"
            exec_log["execution_time_sec"] = time.time() - start_time

            # Post-processor 오류 시에도 상세 정보 반환 (AI 개선 시 사용)
            import traceback
            error_details = ''.join(traceback.format_exception(type(post_error), post_error, post_error.__traceback__))

            return {
                "success": False,
                "message": exec_log["message"],
                "stdout": stdout[:2000] if stdout else None,
                "stderr": (stderr[:2000] if stderr else "") + f"\n\n[Post-processor Error]\n{error_details[:1000]}",
                "tool_output": tool_output[:2000] if tool_output else None,
                "execution_time_sec": exec_log["execution_time_sec"],
                "auto_repair_attempted": exec_log["auto_repair_attempts"] > 0,
            }

        # === JSON 직렬화 불가능한 값 정리 (NaN, Infinity 등) ===
        updated_bop, sanitized = _sanitize_json_floats(updated_bop)
        if sanitized:
            log.warning("[execute] BOP에서 유효하지 않은 float 값이 발견되어 정리되었습니다 (NaN/Infinity → null)")
            exec_log["message"] = "도구 실행이 완료되었습니다. (일부 값이 정리되었습니다)"
            exec_log["sanitized_invalid_floats"] = True

        # JSON 직렬화 가능 여부 테스트
        try:
            json.dumps(updated_bop)
        except (ValueError, TypeError) as e:
            log.error("[execute] JSON 직렬화 실패: %s", str(e))
            log.error("[execute] updated_bop (처음 1000자):\n%s", str(updated_bop)[:1000])
            exec_log["message"] = f"JSON 직렬화 실패: {str(e)}"
            exec_log["execution_time_sec"] = time.time() - start_time
            return {
                "success": False,
                "message": exec_log["message"],
                "execution_time_sec": exec_log["execution_time_sec"],
            }

        # === 자동 복구된 코드가 있으면 레지스트리 업데이트 ===
        if current_pre_code != adapter.pre_process_code or current_post_code != adapter.post_process_code:
            from app.tools.tool_models import AdapterCode as AC
            updated_adapter = AC(
                tool_id=tool_id,
                pre_process_code=current_pre_code,
                post_process_code=current_post_code,
            )
            if update_tool_adapter(tool_id, updated_adapter):
                log.info("[execute] 자동 복구된 어댑터 코드가 레지스트리에 저장되었습니다.")
                exec_log["auto_repair_success"] = True

        exec_log["success"] = True
        exec_log["message"] = "도구 실행이 완료되었습니다."
        if exec_log["auto_repair_attempts"] > 0:
            exec_log["message"] += f" (자동 복구 {exec_log['auto_repair_attempts']}회 수행)"
        exec_log["execution_time_sec"] = time.time() - start_time

        log.info("[execute] === 실행 완료 ===")
        log.info("[execute] tool_input (처음 500자):\n%s", tool_input[:500] if tool_input else "None")
        log.info("[execute] tool_output (처음 500자):\n%s", tool_output[:500] if tool_output else "None")
        log.info("=" * 60)

        return {
            "success": True,
            "message": exec_log["message"],
            "updated_bop": updated_bop,
            "tool_input": tool_input if tool_input else None,  # 전체 표시
            "tool_output": tool_output if tool_output else None,  # 전체 표시
            "stdout": stdout[:2000] if stdout else None,
            "stderr": stderr[:500] if stderr else None,
            "execution_time_sec": exec_log["execution_time_sec"],
            "auto_repaired": exec_log["auto_repair_success"],
        }

    except Exception as e:
        exec_log["message"] = f"실행 오류: {str(e)}"
        exec_log["execution_time_sec"] = time.time() - start_time
        return {
            "success": False,
            "message": exec_log["message"],
            "execution_time_sec": exec_log["execution_time_sec"],
        }
    finally:
        # 실행 로그 저장
        _save_execution_log(tool_id, exec_log)

        try:
            shutil.rmtree(work_dir)
        except Exception:
            pass
