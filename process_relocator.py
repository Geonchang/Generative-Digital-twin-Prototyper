"""
Filename: process_relocator.py
Description: 
    Three.js(Y-up) 좌표계 기반 공정 설비 자동 재배치 스크립트.
    AABB 알고리즘 및 나선형 탐색을 사용하여 최단 거리의 충돌 회피 좌표를 산출함.

Usage:
    python process_relocator.py --input input.json --output output.json
    python process_relocator.py --input input.json --output output.json --log-level DEBUG
"""

import json
import math
import argparse
import logging
import sys

def setup_logging(level):
    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(levelname)s - %(message)s',
        stream=sys.stdout
    )

class ProcessOptimizer:
    def __init__(self, step=0.5, max_range=20.0):
        self.step = step
        self.max_range = max_range

    def is_colliding(self, p_pos, p_size, p_rot_y, obstacles):
        """Three.js Y-up 좌표계 기준 AABB 충돌 검사"""
        # 회전(90/270도)에 따른 X, Z 크기 스왑 결정
        is_rotated = abs(math.sin(p_rot_y)) > 0.5
        actual_size = {
            'x': p_size['z'] if is_rotated else p_size['x'],
            'y': p_size['y'],
            'z': p_size['x'] if is_rotated else p_size['z']
        }

        # 공정 설비 Boundary (중심점 기준)
        p_min = {
            'x': p_pos['x'] - actual_size['x'] / 2,
            'y': p_pos['y'],
            'z': p_pos['z'] - actual_size['z'] / 2
        }
        p_max = {
            'x': p_pos['x'] + actual_size['x'] / 2,
            'y': p_pos['y'] + actual_size['y'],
            'z': p_pos['z'] + actual_size['z'] / 2
        }

        for obs in obstacles:
            o_pos, o_size = obs['pos'], obs['size']
            o_min = {
                'x': o_pos['x'] - o_size['x'] / 2,
                'y': o_pos['y'],
                'z': o_pos['z'] - o_size['z'] / 2
            }
            o_max = {
                'x': o_pos['x'] + o_size['x'] / 2,
                'y': o_pos['y'] + o_size['y'],
                'z': o_pos['z'] + o_size['z'] / 2
            }

            # 3축 동시 충돌 확인
            if (p_min['x'] < o_max['x'] and p_max['x'] > o_min['x']) and \
               (p_min['y'] < o_max['y'] and p_max['y'] > o_min['y']) and \
               (p_min['z'] < o_max['z'] and p_max['z'] > o_min['z']):
                return True
        return False

    def solve(self, process, obstacles):
        """최적 위치 탐색 (나선형 확장 방식)"""
        origin_pos = process['pos']
        # 4가지 회전 방향 고려 (Radian)
        rotations = [0, math.pi/2, math.pi, (3 * math.pi)/2]
        
        logging.debug(f"Starting search near: {origin_pos}")

        r = 0.0
        while r <= self.max_range:
            steps = int(r / self.step) if r > 0 else 0
            # 격자 탐색 (X, Z 평면)
            for ix in range(-steps, steps + 1):
                for iz in range(-steps, steps + 1):
                    # 중복 탐색 방지 (테두리 부분만 검사)
                    if r > 0 and abs(ix) < steps and abs(iz) < steps:
                        continue
                    
                    test_pos = {
                        'x': origin_pos['x'] + ix * self.step,
                        'y': origin_pos['y'],
                        'z': origin_pos['z'] + iz * self.step
                    }

                    for rot in rotations:
                        if not self.is_colliding(test_pos, process['size'], rot, obstacles):
                            logging.info(f"Optimization Success! Position: {test_pos}, Rotation: {rot}")
                            return {
                                "success": True,
                                "translate": test_pos,
                                "rotation_y": rot,
                                "distance": math.sqrt((ix * self.step)**2 + (iz * self.step)**2)
                            }
            r += self.step
        
        return {"success": False, "message": "No valid position found within max range"}

def main():
    parser = argparse.ArgumentParser(description="Process Placement Optimizer for Three.js Scenes")
    parser.add_argument("--input", required=True, help="Input JSON file path")
    parser.add_argument("--output", required=True, help="Output JSON file path")
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"], help="Log level")
    parser.add_argument("--step", type=float, default=0.5, help="Search grid step")
    parser.add_argument("--range", type=float, default=20.0, help="Max search radius")

    args = parser.parse_args()
    setup_logging(args.log_level)

    try:
        with open(args.input, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        logging.error(f"Input error: {e}")
        return

    optimizer = ProcessOptimizer(step=args.step, max_range=args.range)
    
    process = data.get('process')
    obstacles = data.get('obstacles', [])

    if not process:
        logging.error("Missing 'process' data in JSON")
        return

    result = optimizer.solve(process, obstacles)
    
    try:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=4, ensure_ascii=False)
            logging.info(f"Done! Result saved to {args.output}")
    except Exception as e:
        logging.error(f"Output error: {e}")

if __name__ == "__main__":
    main()