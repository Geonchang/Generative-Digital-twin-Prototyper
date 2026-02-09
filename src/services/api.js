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
   * @param {string} message - 사용자 메시지
   * @param {Object|null} currentBop - 현재 BOP 데이터 (collapsed 형식)
   * @param {Array} messages - 대화 히스토리 배열 (currently unused)
   * @param {string|null} model - LLM 모델 (null이면 기본 모델 사용)
   * @returns {Promise<Object>} { message: string, bop_data: Object|null }
   */
  async unifiedChat(message, currentBop = null, messages = [], model = null) {
    const body = { message, current_bop: currentBop };
    if (model) body.model = model;

    const res = await fetch('/api/chat/unified', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[API Error] Status:', res.status, 'Detail:', err);
      const errorMsg = typeof err.detail === 'string'
        ? err.detail
        : JSON.stringify(err.detail || err) || `채팅 실패 (${res.status})`;
      throw new Error(errorMsg);
    }

    return res.json();
  },

  /**
   * Excel 내보내기 (클라이언트 측 생성)
   * @param {Object} bopData - BOP 데이터 (collapsed 형식)
   */
  exportExcel(bopData) {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 프로젝트 정보
    const projectRows = [
      { '항목': '프로젝트명', '값': bopData.project_title || '' },
      { '항목': '목표 UPH', '값': bopData.target_uph || '' },
      { '항목': '공정 수', '값': (bopData.processes || []).length },
      { '항목': '장비 수', '값': (bopData.equipments || []).length },
      { '항목': '작업자 수', '값': (bopData.workers || []).length },
      { '항목': '자재 수', '값': (bopData.materials || []).length },
      { '항목': '장애물 수', '값': (bopData.obstacles || []).length },
    ];
    const wsProject = XLSX.utils.json_to_sheet(projectRows);
    wsProject['!cols'] = [{ wch: 15 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsProject, '프로젝트 정보');

    // Sheet 2: 공정 (연결 정보만)
    const processRows = (bopData.processes || []).map(p => ({
      '공정 ID': p.process_id,
      '병렬 수': p.parallel_count || 1,
      '선행 공정': (p.predecessor_ids || []).join(', '),
      '후행 공정': (p.successor_ids || []).join(', '),
    }));
    const wsProcesses = XLSX.utils.json_to_sheet(processRows.length ? processRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsProcesses, '공정');

    // Sheet 3: 공정별 병렬라인 상세 (모든 공정의 모든 라인 포함)
    const parallelRows = [];
    (bopData.processes || []).forEach(p => {
      const parallelCount = p.parallel_count || 1;
      const lines = p.parallel_lines && p.parallel_lines.length > 0
        ? p.parallel_lines
        : [{ parallel_index: 1, name: p.name, description: p.description, cycle_time_sec: p.cycle_time_sec, location: p.location, rotation_y: p.rotation_y }];

      lines.forEach((line, idx) => {
        parallelRows.push({
          '공정 ID': p.process_id,
          '병렬 인덱스': line.parallel_index ?? (idx + 1),
          '공정명': line.name || p.name,
          '설명': line.description ?? p.description ?? '',
          '사이클타임(초)': line.cycle_time_sec ?? p.cycle_time_sec,
          '위치 X': line.location?.x ?? 0,
          '위치 Y': line.location?.y ?? 0,
          '위치 Z': line.location?.z ?? 0,
          '회전 Y': line.rotation_y ?? 0,
        });
      });
    });
    const wsParallel = XLSX.utils.json_to_sheet(parallelRows.length ? parallelRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsParallel, '병렬라인 상세');

    // Sheet 4: 리소스 배치
    const resourceRows = [];
    (bopData.processes || []).forEach(p => {
      (p.resources || []).forEach(r => {
        resourceRows.push({
          '공정 ID': p.process_id,
          '병렬라인 인덱스': r.parallel_line_index ?? '',
          '리소스 유형': r.resource_type,
          '리소스 ID': r.resource_id,
          '수량': r.quantity ?? 1,
          '역할': r.role || '',
          '상대위치 X': r.relative_location?.x ?? 0,
          '상대위치 Y': r.relative_location?.y ?? 0,
          '상대위치 Z': r.relative_location?.z ?? 0,
          '회전 Y': r.rotation_y ?? 0,
          '스케일 X': r.scale?.x ?? 1,
          '스케일 Y': r.scale?.y ?? 1,
          '스케일 Z': r.scale?.z ?? 1,
        });
      });
    });
    const wsResources = XLSX.utils.json_to_sheet(resourceRows.length ? resourceRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsResources, '리소스 배치');

    // Sheet 5: 장비
    const eqRows = (bopData.equipments || []).map(e => ({
      '장비 ID': e.equipment_id,
      '장비명': e.name,
      '유형': e.type,
    }));
    const wsEquip = XLSX.utils.json_to_sheet(eqRows.length ? eqRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsEquip, '장비');

    // Sheet 6: 작업자
    const wkRows = (bopData.workers || []).map(w => ({
      '작업자 ID': w.worker_id,
      '이름': w.name,
      '숙련도': w.skill_level || '',
    }));
    const wsWorkers = XLSX.utils.json_to_sheet(wkRows.length ? wkRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsWorkers, '작업자');

    // Sheet 7: 자재
    const mtRows = (bopData.materials || []).map(m => ({
      '자재 ID': m.material_id,
      '자재명': m.name,
      '단위': m.unit,
    }));
    const wsMaterials = XLSX.utils.json_to_sheet(mtRows.length ? mtRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsMaterials, '자재');

    // Sheet 8: 장애물
    const obsRows = (bopData.obstacles || []).map(o => ({
      '장애물 ID': o.obstacle_id,
      '이름': o.name || '',
      '유형': o.type || '',
      '위치 X': o.position?.x ?? 0,
      '위치 Y': o.position?.y ?? 0,
      '위치 Z': o.position?.z ?? 0,
      '크기 X': o.size?.width ?? 0,
      '크기 Y': o.size?.height ?? 0,
      '크기 Z': o.size?.depth ?? 0,
      '회전 Y': o.rotation_y ?? 0,
    }));
    const wsObstacles = XLSX.utils.json_to_sheet(obsRows.length ? obsRows : [{}]);
    XLSX.utils.book_append_sheet(wb, wsObstacles, '장애물');

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const dateStr = new Date().toISOString().split('T')[0];
    downloadBlob(blob, `${bopData.project_title || 'BOP'}_${dateStr}.xlsx`);
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

  async analyzeScript(sourceCode, fileName, sampleInput = null, inputSchemaOverride = null, outputSchemaOverride = null) {
    const body = { source_code: sourceCode, file_name: fileName };
    if (sampleInput) body.sample_input = sampleInput;
    if (inputSchemaOverride) body.input_schema_override = inputSchemaOverride;
    if (outputSchemaOverride) body.output_schema_override = outputSchemaOverride;

    const res = await fetch('/api/tools/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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

  async registerSchemaOnly(schemaData) {
    const res = await fetch('/api/tools/register-schema-only', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schemaData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `스키마 등록 실패 (${res.status})`);
    }
    return res.json();
  },

  async updateToolScript(toolId, fileName, sourceCode) {
    const res = await fetch(`/api/tools/${toolId}/script`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_name: fileName, source_code: sourceCode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `스크립트 업데이트 실패 (${res.status})`);
    }
    return res.json();
  },

  async listTools() {
    const res = await fetch('/api/tools/');
    if (!res.ok) throw new Error(`도구 목록 조회 실패 (${res.status})`);
    return res.json();
  },

  async getToolDetail(toolId) {
    const res = await fetch(`/api/tools/${toolId}`);
    if (!res.ok) throw new Error(`도구 상세 조회 실패 (${res.status})`);
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // HTTP 오류 시에도 백엔드가 제공한 상세 정보 보존
      const error = new Error(data.detail || `실행 실패 (${res.status})`);
      // 백엔드 응답에 오류 정보가 있으면 에러 객체에 추가
      if (data.stdout) error.stdout = data.stdout;
      if (data.stderr) error.stderr = data.stderr;
      if (data.tool_output) error.tool_output = data.tool_output;
      throw error;
    }
    return data;
  },

  async generateSchema(description, model = null) {
    const body = { description };
    if (model) body.model = model;
    const res = await fetch('/api/tools/generate-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `스키마 생성 실패 (${res.status})`);
    }
    return res.json();
  },

  async improveSchema(toolName, description, inputSchema, outputSchema, params, userFeedback, model = null) {
    const body = {
      tool_name: toolName,
      description: description,
      current_input_schema: inputSchema,
      current_output_schema: outputSchema,
      current_params: params,
      user_feedback: userFeedback,
    };
    if (model) body.model = model;
    const res = await fetch('/api/tools/improve-schema', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `스키마 개선 실패 (${res.status})`);
    }
    return res.json();
  },

  async generateScript(description, inputSchema = null, outputSchema = null, model = null) {
    const body = { description };
    if (inputSchema) body.input_schema = inputSchema;
    if (outputSchema) body.output_schema = outputSchema;
    if (model) body.model = model;
    const res = await fetch('/api/tools/generate-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `스크립트 생성 실패 (${res.status})`);
    }
    return res.json();
  },

  async improveTool(toolId, { userFeedback, executionContext, modifyAdapter, modifyParams, modifyScript }) {
    const res = await fetch(`/api/tools/${toolId}/improve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_feedback: userFeedback,
        execution_context: executionContext,
        modify_adapter: modifyAdapter,
        modify_params: modifyParams,
        modify_script: modifyScript,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `개선 실패 (${res.status})`);
    }
    return res.json();
  },

  async applyImprovement(toolId, { preProcessCode, postProcessCode, paramsSchema, scriptCode, createNewVersion }) {
    const res = await fetch(`/api/tools/${toolId}/apply-improvement`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pre_process_code: preProcessCode,
        post_process_code: postProcessCode,
        params_schema: paramsSchema,
        script_code: scriptCode,
        create_new_version: createNewVersion,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `적용 실패 (${res.status})`);
    }
    return res.json();
  },
};
