"""
=============================================================================
[기둥 설치 위치 계산기 - JSON 입출력 버전]

이 스크립트는 지정된 JSON 파일에서 가로, 세로, 간격 정보를 읽어와
기둥이 설치될 좌표를 계산한 후, 결과를 JSON 파일로 저장합니다.

사용법 (Command Line):
    python column_planner_json.py --input input_data.json --output result_data.json

-----------------------------------------------------------------------------
1. 입력 (Input) JSON 구조 예시:
   {
       "width": 20.0,       # 가로 길이 (float, 미터 단위)
       "length": 15.0,      # 세로 길이 (float, 미터 단위)
       "interval": 2.5      # 기둥 간격 (float, 미터 단위)
   }

2. 출력 (Output) JSON 구조 예시:
   {
       "meta": {
           "width": 20.0,
           "length": 15.0,
           "interval": 2.5
       },
       "summary": {
           "total_count": 6,
           "x_count": 3,
           "y_count": 2
       },
       "columns": [
           {"id": 1, "x": 0.0, "y": 0.0},
           {"id": 2, "x": 0.0, "y": 2.5},
           ...
       ]
   }
=============================================================================
"""

import json
import argparse
import sys
import os

def calculate_positions(data):
    """
    입력 데이터 딕셔너리를 받아 좌표를 계산하고 결과 딕셔너리를 반환합니다.
    """
    try:
        width = float(data['width'])
        length = float(data['length'])
        interval = float(data['interval'])
    except KeyError as e:
        print(f"[Error] 입력 JSON에 필수 키가 누락되었습니다: {e}")
        sys.exit(1)
    except ValueError:
        print("[Error] 입력 값은 숫자여야 합니다.")
        sys.exit(1)

    # X축(가로) 좌표 계산
    x_positions = []
    curr_x = 0.0
    while curr_x <= width:
        x_positions.append(curr_x)
        curr_x += interval

    # Y축(세로) 좌표 계산
    y_positions = []
    curr_y = 0.0
    while curr_y <= length:
        y_positions.append(curr_y)
        curr_y += interval

    # (x, y) 조합 생성
    columns = []
    count = 1
    for x in x_positions:
        for y in y_positions:
            columns.append({
                "id": count,
                "x": round(x, 4), # 부동소수점 오차 방지를 위해 반올림
                "y": round(y, 4)
            })
            count += 1

    # 결과 구조 생성
    result = {
        "meta": {
            "width": width,
            "length": length,
            "interval": interval
        },
        "summary": {
            "total_count": len(columns),
            "columns_on_width": len(x_positions),
            "columns_on_length": len(y_positions)
        },
        "columns": columns
    }
    
    return result

def main():
    # Argument Parser 설정
    parser = argparse.ArgumentParser(description="기둥 설치 좌표 계산기 (JSON 기반)")
    parser.add_argument('--input', '-i', type=str, required=True, help='입력 JSON 파일 경로')
    parser.add_argument('--output', '-o', type=str, required=True, help='출력 JSON 파일 경로')
    
    args = parser.parse_args()

    # 1. 입력 파일 읽기
    if not os.path.exists(args.input):
        print(f"[Error] 입력 파일을 찾을 수 없습니다: {args.input}")
        sys.exit(1)

    try:
        with open(args.input, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
    except json.JSONDecodeError:
        print(f"[Error] JSON 파일 형식이 올바르지 않습니다: {args.input}")
        sys.exit(1)

    print(f"Reading configuration from {args.input}...")

    # 2. 좌표 계산 로직 수행
    output_data = calculate_positions(input_data)

    # 3. 출력 파일 저장
    try:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=4, ensure_ascii=False)
        print(f"Successfully saved {output_data['summary']['total_count']} column positions to {args.output}")
    except IOError as e:
        print(f"[Error] 파일을 저장하는 중 오류가 발생했습니다: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()