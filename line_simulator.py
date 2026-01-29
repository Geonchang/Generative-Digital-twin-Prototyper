#!/usr/bin/env python3
"""
line_simulator.py — 결정적 이산 시뮬레이션 기반 라인 분석 도구

공정별 부하율(Utilization), 대기율(Starving), 정체율(Blocking)을 산출한다.
DAG 위상정렬로 공정 순서를 결정하고, 제품을 순차 투입하여
각 공정의 병렬 서버(parallel_count)에 배정하며 시뮬레이션한다.

Usage:
    python line_simulator.py --input input.json --output output.json
    python line_simulator.py --input input.json --output output.json --log-level DEBUG
"""

import argparse
import collections
import json
import logging
import sys
from typing import Any, Dict, List

log = logging.getLogger("line_simulator")


# ── DAG 위상정렬 ──────────────────────────────────────────
def topological_sort(processes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """predecessor_ids 기반 Kahn 알고리즘 위상정렬."""
    id_to_proc = {p["process_id"]: p for p in processes}
    in_degree: Dict[str, int] = {p["process_id"]: 0 for p in processes}
    children: Dict[str, List[str]] = {p["process_id"]: [] for p in processes}

    for p in processes:
        for pred_id in p.get("predecessor_ids", []):
            children[pred_id].append(p["process_id"])
            in_degree[p["process_id"]] += 1

    queue = collections.deque(pid for pid, deg in in_degree.items() if deg == 0)
    ordered: List[Dict[str, Any]] = []

    while queue:
        pid = queue.popleft()
        ordered.append(id_to_proc[pid])
        for child in children[pid]:
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    if len(ordered) != len(processes):
        raise ValueError("공정 그래프에 사이클이 존재합니다.")

    return ordered


# ── 시뮬레이션 엔진 ───────────────────────────────────────
def simulate(data: Dict[str, Any]) -> Dict[str, Any]:
    """결정적 이산 시뮬레이션 실행."""
    processes = data["processes"]
    num_products: int = data.get("num_products", 100)
    warmup_products: int = data.get("warmup_products", 10)

    if num_products <= warmup_products:
        raise ValueError("num_products must be greater than warmup_products")

    ordered = topological_sort(processes)
    num_procs = len(ordered)
    proc_ids = [p["process_id"] for p in ordered]
    proc_index = {pid: i for i, pid in enumerate(proc_ids)}

    cycle_times = [float(p["cycle_time_sec"]) for p in ordered]
    parallel_counts = [int(p.get("parallel_count", 1)) for p in ordered]
    queue_capacities = [pc * 2 for pc in parallel_counts]

    servers = [[0.0] * parallel_counts[i] for i in range(num_procs)]
    queue_lengths = [0] * num_procs

    stats_working = [[0.0] * parallel_counts[i] for i in range(num_procs)]
    stats_starving = [[0.0] * parallel_counts[i] for i in range(num_procs)]
    stats_blocking = [[0.0] * parallel_counts[i] for i in range(num_procs)]
    stats_max_queue = [0] * num_procs
    stats_total_wait = [0.0] * num_procs
    stats_wait_count = [0] * num_procs

    successors: Dict[str, List[str]] = {p["process_id"]: [] for p in processes}
    for p in processes:
        for pred_id in p.get("predecessor_ids", []):
            successors[pred_id].append(p["process_id"])

    product_finish: List[Dict[str, float]] = []
    measure_start_time = None
    measure_end_time = None

    for prod_idx in range(num_products):
        prod_finish: Dict[str, float] = {}
        is_measured = prod_idx >= warmup_products

        for step_idx in range(num_procs):
            proc = ordered[step_idx]
            pid = proc["process_id"]
            ct = cycle_times[step_idx]
            preds = proc.get("predecessor_ids", [])

            if preds:
                earliest_arrival = max(prod_finish[pred] for pred in preds)
            else:
                earliest_arrival = 0.0

            srv = servers[step_idx]
            best_srv_idx = 0
            best_srv_time = srv[0]
            for s_idx in range(1, len(srv)):
                if srv[s_idx] < best_srv_time:
                    best_srv_time = srv[s_idx]
                    best_srv_idx = s_idx

            start_time = max(earliest_arrival, best_srv_time)
            wait_time = start_time - earliest_arrival

            finish_time = start_time + ct
            blocking_delay = 0.0

            succ_ids = successors.get(pid, [])
            if succ_ids:
                for succ_id in succ_ids:
                    succ_step = proc_index[succ_id]
                    if queue_lengths[succ_step] >= queue_capacities[succ_step]:
                        next_srv = servers[succ_step]
                        earliest_next = min(next_srv)
                        delay = max(0.0, earliest_next - finish_time)
                        blocking_delay = max(blocking_delay, delay)

            actual_finish = finish_time + blocking_delay

            if is_measured:
                if measure_start_time is None:
                    measure_start_time = start_time

                if best_srv_time <= earliest_arrival:
                    actual_starving = earliest_arrival - best_srv_time
                else:
                    actual_starving = 0.0

                stats_working[step_idx][best_srv_idx] += ct
                stats_starving[step_idx][best_srv_idx] += actual_starving
                stats_blocking[step_idx][best_srv_idx] += blocking_delay
                stats_total_wait[step_idx] += wait_time
                stats_wait_count[step_idx] += 1

            for succ_id in succ_ids:
                succ_step = proc_index[succ_id]
                queue_lengths[succ_step] = min(
                    queue_lengths[succ_step] + 1,
                    queue_capacities[succ_step],
                )
            if queue_lengths[step_idx] > 0:
                queue_lengths[step_idx] -= 1

            if queue_lengths[step_idx] > stats_max_queue[step_idx]:
                stats_max_queue[step_idx] = queue_lengths[step_idx]

            servers[step_idx][best_srv_idx] = actual_finish
            prod_finish[pid] = actual_finish

        product_finish.append(prod_finish)

        if is_measured:
            last_finish = max(prod_finish.values())
            measure_end_time = last_finish

    # ── 결과 집계 ─────────────────────────────────────────
    measured_products = num_products - warmup_products
    if measure_start_time is None:
        measure_start_time = 0.0
    if measure_end_time is None:
        measure_end_time = 0.0
    total_time = measure_end_time - measure_start_time
    throughput_uph = (measured_products / total_time * 3600.0) if total_time > 0 else 0.0

    process_analysis: List[Dict[str, Any]] = []
    total_utilization = 0.0

    for step_idx in range(num_procs):
        proc = ordered[step_idx]
        pc = parallel_counts[step_idx]

        total_working = sum(stats_working[step_idx])
        total_starving_time = sum(stats_starving[step_idx])
        total_blocking_time = sum(stats_blocking[step_idx])

        total_observed = total_working + total_starving_time + total_blocking_time
        if total_observed > 0:
            util_pct = (total_working / total_observed) * 100.0
            starv_pct = (total_starving_time / total_observed) * 100.0
            block_pct = (total_blocking_time / total_observed) * 100.0
        else:
            util_pct = 0.0
            starv_pct = 0.0
            block_pct = 0.0

        avg_wait = (
            stats_total_wait[step_idx] / stats_wait_count[step_idx]
            if stats_wait_count[step_idx] > 0
            else 0.0
        )

        process_analysis.append({
            "process_id": proc["process_id"],
            "name": proc.get("name", ""),
            "cycle_time_sec": float(proc["cycle_time_sec"]),
            "parallel_count": pc,
            "utilization_pct": round(util_pct, 2),
            "starving_pct": round(starv_pct, 2),
            "blocking_pct": round(block_pct, 2),
            "avg_wait_time_sec": round(avg_wait, 2),
            "max_queue_length": stats_max_queue[step_idx],
        })
        total_utilization += util_pct

    avg_utilization = total_utilization / num_procs if num_procs > 0 else 0.0

    return {
        "simulation_summary": {
            "total_products": num_products,
            "warmup_products": warmup_products,
            "measured_products": measured_products,
            "total_time_sec": round(total_time, 2),
            "throughput_uph": round(throughput_uph, 2),
            "avg_utilization_pct": round(avg_utilization, 2),
        },
        "process_analysis": process_analysis,
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
        log.debug("[pre_process]   공정 %s (%s): CT=%s, parallel=%s, predecessors=%s",
                  p.get("process_id"), p.get("name"),
                  p.get("cycle_time_sec"), p.get("parallel_count"),
                  p.get("predecessor_ids"))

    num_products = params.get("num_products", 100)
    warmup_products = params.get("warmup_products", 10)
    log.info("[pre_process] num_products=%s (params: %s), warmup_products=%s (params: %s)",
             num_products, "제공됨" if "num_products" in params else "기본값",
             warmup_products, "제공됨" if "warmup_products" in params else "기본값")

    tool_input = {
        "processes": processes,
        "num_products": num_products,
        "warmup_products": warmup_products,
    }
    log.info("[pre_process] 도구 입력 생성 완료 (공정 %d개, num_products=%d, warmup=%d)",
             len(processes), num_products, warmup_products)
    return tool_input


def post_process(bop_json: Dict[str, Any], result: Dict[str, Any]) -> Dict[str, Any]:
    """시뮬레이션 결과를 BOP에 첨부 (BOP 구조 변경 없음)."""
    log.info("[post_process] 호출됨")
    log.info("[post_process] result 키: %s", list(result.keys()))

    summary = result.get("simulation_summary", {})
    log.info("[post_process] simulation_summary: throughput=%.2f UPH, "
             "measured=%d개, total_time=%.1fs",
             summary.get("throughput_uph", 0),
             summary.get("measured_products", 0),
             summary.get("total_time_sec", 0))

    analysis = result.get("process_analysis", [])
    log.info("[post_process] process_analysis 항목 수: %d", len(analysis))
    for pa in analysis:
        log.debug("[post_process]   [%s] %s — 부하=%.1f%% 대기=%.1f%% 정체=%.1f%%",
                  pa.get("process_id"), pa.get("name"),
                  pa.get("utilization_pct", 0),
                  pa.get("starving_pct", 0),
                  pa.get("blocking_pct", 0))

    bop_json["_simulation_result"] = result
    log.info("[post_process] bop_json['_simulation_result'] 키 첨부 완료")
    log.info("[post_process] BOP 공정 구조 변경: 없음 (읽기 전용 도구)")
    log.info("[post_process] 반환 bop_json 최상위 키: %s", list(bop_json.keys()))

    return bop_json


# ── CLI ───────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="Line Simulator — 부하율/대기율/정체율 분석")
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

    result = simulate(data)
    log.info("[CLI] simulate() 완료 — throughput: %.2f UPH",
             result.get("simulation_summary", {}).get("throughput_uph", 0))

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    log.info("[CLI] 출력 파일 저장 완료: %s", args.output)


if __name__ == "__main__":
    main()
