#!/usr/bin/env python3
"""
parallel_optimizer.py — 목표 UPH 기반 최적 병렬 수 계산 도구

각 공정의 cycle_time과 목표 UPH로부터 takt time을 산출하고,
공정별 최적 parallel_count를 계산하여 BOP의 parallel_count를 직접 수정한다.

Usage:
    python parallel_optimizer.py --input input.json --output output.json
    python parallel_optimizer.py --input input.json --output output.json --log-level DEBUG
"""

import argparse
import json
import logging
import math
import sys
from typing import Any, Dict, List

log = logging.getLogger("parallel_optimizer")


def optimize(data: Dict[str, Any]) -> Dict[str, Any]:
    """목표 UPH 달성을 위한 공정별 최적 parallel_count 계산."""
    processes = data["processes"]
    target_uph: float = data["target_uph"]

    if target_uph <= 0:
        raise ValueError("target_uph must be positive")

    takt_time = 3600.0 / target_uph

    optimization: List[Dict[str, Any]] = []
    total_current_parallel = 0
    total_optimal_parallel = 0
    sum_optimized_eff_ct = 0.0

    for proc in processes:
        ct = float(proc["cycle_time_sec"])
        current_par = int(proc.get("parallel_count", 1))
        optimal_par = math.ceil(ct / takt_time)
        optimal_par = max(optimal_par, 1)

        current_eff_ct = ct / current_par
        optimized_eff_ct = ct / optimal_par

        changed = current_par != optimal_par

        optimization.append({
            "process_id": proc["process_id"],
            "name": proc.get("name", ""),
            "cycle_time_sec": ct,
            "current_parallel": current_par,
            "optimal_parallel": optimal_par,
            "current_eff_ct": round(current_eff_ct, 2),
            "optimized_eff_ct": round(optimized_eff_ct, 2),
            "changed": changed,
        })

        total_current_parallel += current_par
        total_optimal_parallel += optimal_par
        sum_optimized_eff_ct += optimized_eff_ct

    num_processes = len(processes)
    additional = total_optimal_parallel - total_current_parallel

    if num_processes > 0 and takt_time > 0:
        line_efficiency = (sum_optimized_eff_ct / (num_processes * takt_time)) * 100.0
    else:
        line_efficiency = 0.0

    if optimization:
        bottleneck_eff_ct = max(o["optimized_eff_ct"] for o in optimization)
        achieved_uph = 3600.0 / bottleneck_eff_ct if bottleneck_eff_ct > 0 else 0.0
    else:
        achieved_uph = 0.0

    return {
        "target_uph": target_uph,
        "takt_time_sec": round(takt_time, 4),
        "optimization": optimization,
        "summary": {
            "total_current_parallel": total_current_parallel,
            "total_optimal_parallel": total_optimal_parallel,
            "additional_lines_needed": additional,
            "achieved_uph": round(achieved_uph, 2),
            "line_efficiency_pct": round(line_efficiency, 2),
        },
    }


# ── 어댑터 ────────────────────────────────────────────────
def pre_process(bop_json: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    """BOP JSON + params → 도구 입력 형태로 변환."""
    log.info("[pre_process] 호출됨")
    log.info("[pre_process] bop_json 최상위 키: %s", list(bop_json.keys()))
    log.info("[pre_process] params 키: %s", list(params.keys()))

    processes = bop_json.get("processes")
    if processes is None:
        log.error("[pre_process] bop_json에 'processes' 키가 없습니다")
        raise KeyError("bop_json에 'processes' 키가 없습니다")

    log.info("[pre_process] 추출된 공정 수: %d", len(processes))
    for p in processes:
        log.debug("[pre_process]   공정 %s (%s): CT=%s, parallel=%s",
                  p.get("process_id"), p.get("name"),
                  p.get("cycle_time_sec"), p.get("parallel_count"))

    target_uph = params.get("target_uph")
    if target_uph is None:
        log.error("[pre_process] params에 'target_uph' 키가 없습니다")
        raise KeyError("params에 'target_uph' 키가 없습니다")
    log.info("[pre_process] target_uph = %s", target_uph)

    tool_input = {
        "processes": processes,
        "target_uph": target_uph,
    }
    log.info("[pre_process] 도구 입력 생성 완료 (공정 %d개, target_uph=%s)",
             len(processes), target_uph)
    return tool_input


def post_process(bop_json: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    """최적화 결과를 BOP에 반영: parallel_count 직접 수정 + 메타데이터 첨부."""
    log.info("[post_process] 호출됨")
    log.info("[post_process] result 키: %s", list(result.keys()))
    log.info("[post_process] 최적화 공정 수: %d", len(result.get("optimization", [])))

    opt_map = {o["process_id"]: o["optimal_parallel"] for o in result["optimization"]}
    log.debug("[post_process] optimal_parallel 매핑: %s", opt_map)

    changed_count = 0
    for proc in bop_json["processes"]:
        pid = proc["process_id"]
        if pid in opt_map:
            old_val = proc.get("parallel_count")
            new_val = opt_map[pid]
            proc["parallel_count"] = new_val
            if old_val != new_val:
                changed_count += 1
                log.info("[post_process] BOP 수정: %s parallel_count %s → %s",
                         pid, old_val, new_val)
            else:
                log.debug("[post_process] BOP 유지: %s parallel_count = %s (변경 없음)",
                          pid, old_val)
        else:
            log.warning("[post_process] result에 없는 공정: %s — BOP 미변경", pid)

    log.info("[post_process] BOP parallel_count 변경된 공정: %d / %d",
             changed_count, len(bop_json["processes"]))

    bop_json["_parallel_optimization"] = result
    log.info("[post_process] bop_json['_parallel_optimization'] 키 첨부 완료")
    log.debug("[post_process] 첨부된 summary: %s", result.get("summary"))
    log.info("[post_process] 반환 bop_json 최상위 키: %s", list(bop_json.keys()))

    return bop_json


# ── CLI ───────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Parallel Optimizer — 목표 UPH 기반 최적 병렬 수 계산")
    parser.add_argument("--input", required=True, help="입력 JSON 파일 경로")
    parser.add_argument("--output", required=True, help="출력 JSON 파일 경로")
    parser.add_argument("--log-level", default="DEBUG",
                        help="로그 레벨 (DEBUG|INFO|WARNING|ERROR, default: DEBUG)")
    args, _unknown = parser.parse_known_args()

    level = getattr(logging, args.log_level.upper(), None)
    if level is None:
        level = logging.DEBUG
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        stream=sys.stderr,
    )

    log.info("[CLI] 입력 파일: %s", args.input)
    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)
    log.info("[CLI] 입력 JSON 로드 완료 (키: %s)", list(data.keys()))

    result = optimize(data)
    log.info("[CLI] optimize() 완료 — summary: %s", result.get("summary"))

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    log.info("[CLI] 출력 파일 저장 완료: %s", args.output)


if __name__ == "__main__":
    main()
