import { chat as geminiChat } from './gemini.js';
import * as XLSX from 'xlsx';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  /**
   * 통합 채팅 API 호출 (생성/수정/QA 통합)
   * @param {string} message - 사용자 메시지 (unused, kept for API compatibility)
   * @param {Object|null} currentBop - 현재 BOP 데이터 (collapsed 형식)
   * @param {Array} messages - 대화 히스토리 배열
   * @returns {Promise<Object>} { message: string, bop_data: Object|null }
   */
  async unifiedChat(message, currentBop = null, messages = []) {
    return geminiChat(messages, currentBop);
  },

  /**
   * Excel 내보내기 (클라이언트 측 생성)
   * @param {Object} bopData - BOP 데이터 (collapsed 형식)
   */
  exportExcel(bopData) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 공정
    const processRows = (bopData.processes || []).map(p => ({
      '공정 ID': p.process_id,
      '공정명': p.name,
      '설명': p.description || '',
      '사이클타임(초)': p.cycle_time_sec,
      '병렬 수': p.parallel_count || 1,
      '선행 공정': (p.predecessor_ids || []).join(', '),
      '후행 공정': (p.successor_ids || []).join(', '),
      '위치 X': p.location?.x ?? '',
      '위치 Y': p.location?.y ?? '',
      '위치 Z': p.location?.z ?? '',
    }));
    const wsProcesses = XLSX.utils.json_to_sheet(processRows);
    XLSX.utils.book_append_sheet(wb, wsProcesses, '공정');

    // Sheet 2: 리소스 배치
    const resourceRows = [];
    (bopData.processes || []).forEach(p => {
      (p.resources || []).forEach(r => {
        resourceRows.push({
          '공정 ID': p.process_id,
          '공정명': p.name,
          '리소스 유형': r.resource_type,
          '리소스 ID': r.resource_id,
          '수량': r.quantity ?? 1,
          '역할': r.role || '',
        });
      });
    });
    const wsResources = XLSX.utils.json_to_sheet(resourceRows);
    XLSX.utils.book_append_sheet(wb, wsResources, '리소스 배치');

    // Sheet 3: 장비
    const eqRows = (bopData.equipments || []).map(e => ({
      '장비 ID': e.equipment_id,
      '장비명': e.name,
      '유형': e.type,
    }));
    const wsEquip = XLSX.utils.json_to_sheet(eqRows.length ? eqRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsEquip, '장비');

    // Sheet 4: 작업자
    const wkRows = (bopData.workers || []).map(w => ({
      '작업자 ID': w.worker_id,
      '이름': w.name,
      '숙련도': w.skill_level,
    }));
    const wsWorkers = XLSX.utils.json_to_sheet(wkRows.length ? wkRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsWorkers, '작업자');

    // Sheet 5: 자재
    const mtRows = (bopData.materials || []).map(m => ({
      '자재 ID': m.material_id,
      '자재명': m.name,
      '단위': m.unit,
    }));
    const wsMaterials = XLSX.utils.json_to_sheet(mtRows.length ? mtRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsMaterials, '자재');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, `${bopData.project_title || 'BOP'}.xlsx`);
  },

  /**
   * 3D JSON 내보내기 (클라이언트 측 생성)
   * @param {Object} bopData - BOP 데이터 (collapsed 형식)
   */
  export3D(bopData) {
    const json = JSON.stringify(bopData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, `${bopData.project_title || 'BOP'}_3d.json`);
  },

  // === Tool Management API (FastAPI backend) ===

  async analyzeScript(sourceCode, fileName, sampleInput = null) {
    const res = await fetch('/api/tools/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_code: sourceCode, file_name: fileName, sample_input: sampleInput }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `분석 실패 (${res.status})`);
    }
    return res.json();
  },

  async registerTool(toolData) {
    const res = await fetch('/api/tools/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toolData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `등록 실패 (${res.status})`);
    }
    return res.json();
  },

  async listTools() {
    const res = await fetch('/api/tools/');
    if (!res.ok) throw new Error(`도구 목록 조회 실패 (${res.status})`);
    return res.json();
  },

  async deleteTool(toolId) {
    const res = await fetch(`/api/tools/${toolId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`삭제 실패 (${res.status})`);
    return res.json();
  },

  async executeTool(toolId, bopData, params = null) {
    const body = { tool_id: toolId, bop_data: bopData };
    if (params) body.params = params;
    const res = await fetch('/api/tools/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `실행 실패 (${res.status})`);
    }
    return res.json();
  },
};
