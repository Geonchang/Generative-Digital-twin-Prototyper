const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `당신은 제조 공정(BOP: Bill of Process) 설계 전문 AI 어시스턴트입니다.

## BOP JSON 스키마

\`\`\`json
{
  "project_title": "프로젝트 제목",
  "processes": [
    {
      "process_id": "P001",
      "name": "공정 이름",
      "description": "공정 설명",
      "cycle_time_sec": 60.0,
      "parallel_count": 1,
      "location": { "x": 0, "y": 0, "z": 0 },
      "rotation_y": 0,
      "predecessor_ids": [],
      "successor_ids": [],
      "resources": [
        {
          "resource_type": "equipment | worker | material",
          "resource_id": "EQ-ROBOT-01 | W001 | M-STEEL-001",
          "quantity": 1,
          "role": "역할 설명",
          "relative_location": { "x": 0, "y": 0, "z": 0 },
          "rotation_y": 0,
          "scale": { "x": 1, "y": 1, "z": 1 }
        }
      ]
    }
  ],
  "equipments": [
    { "equipment_id": "EQ-ROBOT-01", "name": "로봇 암", "type": "robot | machine | manual_station" }
  ],
  "workers": [
    { "worker_id": "W001", "name": "작업자1", "skill_level": "Junior | Mid | Senior" }
  ],
  "materials": [
    { "material_id": "M-STEEL-001", "name": "철강 소재", "unit": "ea | kg | m | l" }
  ]
}
\`\`\`

## ID 규칙
- process_id: P + 3자리 숫자 (P001, P002, ...)
- equipment_id: EQ- + 타입약어 + 번호 (EQ-ROBOT-01, EQ-PRESS-01, EQ-MANUAL-01)
- worker_id: W + 3자리 숫자 (W001, W002, ...)
- material_id: M- + 소재약어 + 번호 (M-STEEL-001, M-BOLT-001)

## 레이아웃 규칙
- 공정 간 X축 간격: 약 5m (location.x)
- 병렬 라인이 있는 경우(parallel_count > 1): Z축으로 5m 간격 배치
- 리소스는 공정 내 상대 위치(relative_location)로 배치 (-1 ~ 1m 범위)
- 첫 공정 location.x = 0, 이후 순서대로 증가

## 공정 연결 규칙
- predecessor_ids: 선행 공정 ID 배열
- successor_ids: 후행 공정 ID 배열
- 첫 공정은 predecessor_ids = [], 마지막 공정은 successor_ids = []
- 반드시 쌍방향 일관성을 유지 (A의 successor에 B가 있으면, B의 predecessor에 A가 있어야 함)

## 응답 형식
반드시 아래 JSON 형식으로 응답하세요:
\`\`\`json
{
  "message": "한국어 응답 메시지",
  "bop_data": { ... } 또는 null
}
\`\`\`

## 응답 규칙
1. 항상 한국어로 응답
2. BOP를 생성하거나 수정할 때: message에 설명, bop_data에 **전체** BOP JSON 반환
3. 질문(QA)에 답변할 때: message에 답변, bop_data는 null
4. BOP 수정 시 기존 데이터를 기반으로 변경하고, 변경되지 않는 부분은 그대로 유지
5. 리소스(equipment, worker, material)를 processes.resources에 배치할 때, 반드시 해당 리소스가 equipments/workers/materials 마스터 배열에도 존재해야 함
6. message는 간결하되 무엇을 했는지 명확히 설명`;

function buildContents(messages, currentBop) {
  const contents = [];

  // Inject current BOP data context as the first user message if available
  if (currentBop) {
    contents.push({
      role: 'user',
      parts: [{ text: `[현재 BOP 데이터]\n${JSON.stringify(currentBop, null, 2)}` }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: '현재 BOP 데이터를 확인했습니다. 어떤 작업을 도와드릴까요?' }]
    });
  }

  // Convert message history (limit to last MAX_HISTORY)
  const recentMessages = messages.slice(-MAX_HISTORY);
  for (const msg of recentMessages) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  return contents;
}

export async function chat(messages, currentBop) {
  if (!API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해주세요.');
  }

  const contents = buildContents(messages, currentBop);

  const requestBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7,
      maxOutputTokens: 65536
    }
  };

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
  } catch (err) {
    throw new Error(`네트워크 오류: Gemini API에 연결할 수 없습니다. (${err.message})`);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
    }
    if (response.status === 400) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData?.error?.message || '잘못된 요청';
      throw new Error(`요청 오류: ${detail}`);
    }
    throw new Error(`Gemini API 오류 (${response.status})`);
  }

  const data = await response.json();

  // Extract text from Gemini response
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API에서 빈 응답을 받았습니다.');
  }

  // Parse JSON response
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // If JSON parsing fails, treat the entire text as the message
    return { message: text, bop_data: null };
  }

  return {
    message: parsed.message || '응답을 처리했습니다.',
    bop_data: parsed.bop_data || null
  };
}
