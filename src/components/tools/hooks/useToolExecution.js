import { useState } from 'react';
import { api } from '../../../services/api';
import useBopStore from '../../../store/bopStore';

/**
 * 도구 실행 및 BOP 적용 관리 훅
 */
export function useToolExecution() {
  const { exportBopData, setBopData, addMessage, normalizeAllProcesses } = useBopStore();

  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [toolParams, setToolParams] = useState({});
  const [pendingResult, setPendingResult] = useState(null);
  const [originalBop, setOriginalBop] = useState(null);
  const [bopChanges, setBopChanges] = useState(null);

  // BOP 변경 사항 계산
  const computeBopChanges = (original, updated) => {
    if (!original || !updated) return null;

    const changes = [];
    const fieldNames = {
      processes: '공정',
      equipments: '설비',
      workers: '작업자',
      materials: '자재',
      obstacles: '장애물'
    };

    const arrayFields = ['processes', 'equipments', 'workers', 'materials', 'obstacles'];
    arrayFields.forEach(field => {
      const origArr = original[field] || [];
      const updArr = updated[field] || [];

      const added = updArr.length - origArr.length;
      if (added > 0) {
        changes.push({ type: 'add', field: fieldNames[field] || field, count: added });
      } else if (added < 0) {
        changes.push({ type: 'remove', field: fieldNames[field] || field, count: -added });
      }

      if (field === 'processes') {
        let modified = 0;
        const modifiedDetails = [];
        origArr.forEach(origProc => {
          const updProc = updArr.find(p => p.process_id === origProc.process_id);
          if (updProc && JSON.stringify(origProc) !== JSON.stringify(updProc)) {
            modified++;
            if (origProc.parallel_count !== updProc.parallel_count) {
              modifiedDetails.push(`${origProc.name}: 병렬 ${origProc.parallel_count || 1} → ${updProc.parallel_count || 1}`);
            }
            if (origProc.cycle_time_sec !== updProc.cycle_time_sec) {
              modifiedDetails.push(`${origProc.name}: CT ${origProc.cycle_time_sec}s → ${updProc.cycle_time_sec}s`);
            }
          }
        });
        if (modified > 0) {
          changes.push({
            type: 'modify',
            field: fieldNames[field],
            count: modified,
            details: modifiedDetails.length > 0 ? modifiedDetails : null
          });
        }
      } else {
        const minLen = Math.min(origArr.length, updArr.length);
        let modified = 0;
        for (let i = 0; i < minLen; i++) {
          if (JSON.stringify(origArr[i]) !== JSON.stringify(updArr[i])) {
            modified++;
          }
        }
        if (modified > 0) {
          changes.push({ type: 'modify', field: fieldNames[field] || field, count: modified });
        }
      }
    });

    const scalarFields = ['project_title', 'target_uph'];
    scalarFields.forEach(field => {
      if (original[field] !== updated[field]) {
        const scalarNames = { project_title: '프로젝트명', target_uph: '목표 UPH' };
        changes.push({ type: 'modify', field: scalarNames[field] || field, count: 1 });
      }
    });

    return changes.length > 0 ? changes : null;
  };

  // 도구 실행
  const executeTool = async (toolId, params = {}) => {
    setExecuting(true);
    setExecResult(null);
    setPendingResult(null);
    setOriginalBop(null);
    setBopChanges(null);

    try {
      const collapsedBop = exportBopData();
      if (!collapsedBop) {
        setExecResult({ success: false, message: '실행할 BOP 데이터가 없습니다. 먼저 BOP를 생성해주세요.' });
        return;
      }

      const result = await api.executeTool(toolId, collapsedBop, Object.keys(params).length > 0 ? params : null);
      setExecResult(result);

      if (result.success && result.updated_bop) {
        const changes = computeBopChanges(collapsedBop, result.updated_bop);
        if (changes) {
          setOriginalBop(collapsedBop);
          setPendingResult(result);
          setBopChanges(changes);
        }
      }
    } catch (err) {
      // API 오류 시에도 상세 정보 보존 (개선 요청 시 사용)
      const errorResult = {
        success: false,
        message: err.message,
        // HTTP 응답 본문에 오류 정보가 있을 수 있음
        stderr: err.stderr || err.message,
        stdout: err.stdout || null,
        tool_output: err.tool_output || null,
      };
      setExecResult(errorResult);
    } finally {
      setExecuting(false);
    }
  };

  // BOP 적용
  const applyToBop = (toolName) => {
    if (!pendingResult || !pendingResult.updated_bop || !bopChanges) return false;

    const changeSummary = bopChanges.map(c => {
      if (c.type === 'add') return `${c.field} ${c.count}개 추가`;
      if (c.type === 'remove') return `${c.field} ${c.count}개 삭제`;
      if (c.type === 'modify') return `${c.field} ${c.count}개 수정`;
      return '';
    }).join('\n');

    const confirmed = confirm(`다음 변경 사항을 BOP에 반영하시겠습니까?\n\n${changeSummary}`);
    if (!confirmed) return false;

    setBopData(pendingResult.updated_bop);
    setTimeout(() => normalizeAllProcesses(), 0);
    addMessage('assistant', `"${toolName}" 도구 결과가 BOP에 반영되었습니다.`);
    setPendingResult(null);
    setBopChanges(null);
    setOriginalBop(null);
    return true;
  };

  // BOP 적용 취소
  const cancelApply = () => {
    setPendingResult(null);
    setBopChanges(null);
    setOriginalBop(null);
  };

  return {
    executing,
    execResult,
    toolParams,
    setToolParams,
    pendingResult,
    bopChanges,
    executeTool,
    applyToBop,
    cancelApply,
    setExecResult,
  };
}
