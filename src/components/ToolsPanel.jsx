import { useState, useEffect, useRef } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';

function ToolsPanel() {
  const {
    exportBopData,
    setBopData,
    addMessage,
    normalizeAllProcesses,
  } = useBopStore();

  // Navigation
  const [view, setView] = useState('main'); // 'main' | 'upload' | 'detail'

  // Tool list
  const [tools, setTools] = useState([]);
  const [listLoading, setListLoading] = useState(false);

  // Upload & Analysis
  const [uploadedCode, setUploadedCode] = useState('');
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [registering, setRegistering] = useState(false);

  // Detail
  const [selectedTool, setSelectedTool] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [toolParams, setToolParams] = useState({});
  const [pendingResult, setPendingResult] = useState(null);
  const [originalBop, setOriginalBop] = useState(null);
  const [bopChanges, setBopChanges] = useState(null);

  // Error
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

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

    // 배열 비교 (processes, equipments, workers, materials, obstacles)
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

      // 기존 항목 수정 체크 (ID 기반 비교)
      if (field === 'processes') {
        // 공정: ID로 매칭하여 비교
        let modified = 0;
        const modifiedDetails = [];
        origArr.forEach(origProc => {
          const updProc = updArr.find(p => p.process_id === origProc.process_id);
          if (updProc && JSON.stringify(origProc) !== JSON.stringify(updProc)) {
            modified++;
            // parallel_count 변경 감지
            if (origProc.parallel_count !== updProc.parallel_count) {
              modifiedDetails.push(`${origProc.name}: 병렬 ${origProc.parallel_count || 1} → ${updProc.parallel_count || 1}`);
            }
            // cycle_time 변경 감지
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
        // 다른 필드: 순서대로 비교
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

    // 스칼라 필드 비교
    const scalarFields = ['project_title', 'target_uph'];
    scalarFields.forEach(field => {
      if (original[field] !== updated[field]) {
        const scalarNames = { project_title: '프로젝트명', target_uph: '목표 UPH' };
        changes.push({ type: 'modify', field: scalarNames[field] || field, count: 1 });
      }
    });

    return changes.length > 0 ? changes : null;
  };

  // Load tools on mount
  useEffect(() => {
    if (view === 'main') loadTools();
  }, [view]);

  const loadTools = async () => {
    setListLoading(true);
    try {
      const list = await api.listTools();
      setTools(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  };

  // === Upload View Handlers ===

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.py')) {
      setError('Python (.py) 파일만 업로드 가능합니다.');
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedCode(ev.target.result);
      setFileName(file.name);
      setAnalysisResult(null);
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!uploadedCode) return;
    setAnalyzing(true);
    setError('');
    try {
      const result = await api.analyzeScript(uploadedCode, fileName);
      setAnalysisResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRegister = async () => {
    if (!analysisResult || !uploadedCode) return;
    setRegistering(true);
    setError('');
    try {
      await api.registerTool({
        tool_name: analysisResult.tool_name,
        description: analysisResult.description,
        execution_type: analysisResult.execution_type,
        file_name: fileName,
        source_code: uploadedCode,
        input_schema: analysisResult.input_schema,
        output_schema: analysisResult.output_schema,
        params_schema: analysisResult.params_schema || null,
      });
      // Reset and go back to tools
      setUploadedCode('');
      setFileName('');
      setAnalysisResult(null);
      setView('main');
    } catch (err) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  };

  // === Detail View Handlers ===

  const openDetail = (tool) => {
    setSelectedTool(tool);
    setExecResult(null);
    setPendingResult(null);
    setError('');
    // 파라미터 기본값 초기화 (BOP 값을 fallback으로 사용)
    const bopData = exportBopData();
    const defaults = {};
    (tool.params_schema || []).forEach(p => {
      if (p.default != null) {
        defaults[p.key] = p.default;
      } else if (bopData && bopData[p.key] != null) {
        // BOP fallback: BOP에 같은 키가 있으면 그 값을 기본값으로 사용
        defaults[p.key] = bopData[p.key];
      }
    });
    setToolParams(defaults);
    setView('detail');
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    setExecResult(null);
    setPendingResult(null);
    setOriginalBop(null);
    setBopChanges(null);
    setError('');
    try {
      const collapsedBop = exportBopData();
      if (!collapsedBop) {
        setError('실행할 BOP 데이터가 없습니다. 먼저 BOP를 생성해주세요.');
        setExecuting(false);
        return;
      }
      // 빈 문자열을 number로 변환하고 빈 값은 제거
      const cleanParams = {};
      const schema = selectedTool.params_schema || [];
      schema.forEach(p => {
        const val = toolParams[p.key];
        if (val !== '' && val != null) {
          cleanParams[p.key] = p.type === 'number' ? Number(val) : val;
        }
      });
      const result = await api.executeTool(
        selectedTool.tool_id,
        collapsedBop,
        Object.keys(cleanParams).length > 0 ? cleanParams : null
      );
      setExecResult(result);
      if (result.success && result.updated_bop) {
        const changes = computeBopChanges(collapsedBop, result.updated_bop);
        if (changes) {
          setOriginalBop(collapsedBop);
          setPendingResult(result);
          setBopChanges(changes);
        }
        // changes가 null이면 BOP 반영 버튼이 표시되지 않음
      }
    } catch (err) {
      setExecResult({ success: false, message: err.message });
    } finally {
      setExecuting(false);
    }
  };

  const handleApplyToBop = () => {
    if (!pendingResult || !pendingResult.updated_bop || !bopChanges) return;

    // 변경 사항 요약 생성
    const changeSummary = bopChanges.map(c => {
      if (c.type === 'add') return `${c.field} ${c.count}개 추가`;
      if (c.type === 'remove') return `${c.field} ${c.count}개 삭제`;
      if (c.type === 'modify') return `${c.field} ${c.count}개 수정`;
      return '';
    }).join('\n');

    const confirmed = confirm(`다음 변경 사항을 BOP에 반영하시겠습니까?\n\n${changeSummary}`);
    if (!confirmed) return;

    setBopData(pendingResult.updated_bop);
    // BOP 반영 후 그리드 재계산 (모든 도구 공통 - 병렬 확장, 공정 위치 정규화)
    setTimeout(() => normalizeAllProcesses(), 0);
    addMessage('assistant', `"${selectedTool.tool_name}" 도구 결과가 BOP에 반영되었습니다.`);
    setPendingResult(null);
    setBopChanges(null);
    setOriginalBop(null);
  };

  const handleCancelApply = () => {
    setPendingResult(null);
    setBopChanges(null);
    setOriginalBop(null);
  };


  const handleDelete = async () => {
    if (!selectedTool) return;
    if (!confirm(`"${selectedTool.tool_name}" 도구를 삭제하시겠습니까?`)) return;
    try {
      await api.deleteTool(selectedTool.tool_id);
      setSelectedTool(null);
      setView('main');
    } catch (err) {
      setError(err.message);
    }
  };

  // === Render ===

  const renderTools = () => (
    <div style={styles.content}>
      <div style={styles.header}>
        <h3 style={styles.title}>도구 관리</h3>
        <button style={styles.primaryBtn} onClick={() => { setView('upload'); setError(''); }}>
          + 도구 업로드
        </button>
      </div>

      {listLoading && <div style={styles.info}>불러오는 중...</div>}

      {!listLoading && tools.length === 0 && (
        <div style={styles.emptyState}>
          <p style={{ fontWeight: 'bold', marginBottom: 8 }}>등록된 도구가 없습니다</p>
          <p style={{ color: '#888', fontSize: 13 }}>
            Python 최적화 스크립트를 업로드하여<br />BOP 데이터와 연동할 수 있습니다.
          </p>
        </div>
      )}

      {tools.map(tool => (
        <div key={tool.tool_id} style={styles.card} onClick={() => openDetail(tool)}>
          <div style={styles.cardHeader}>
            <span style={styles.cardName}>{tool.tool_name}</span>
            <span style={styles.badge}>{tool.execution_type}</span>
          </div>
          <div style={styles.cardDesc}>{tool.description}</div>
        </div>
      ))}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );

  const renderUpload = () => (
    <div style={styles.content}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => setView('main')}>← 목록</button>
        <h3 style={styles.title}>도구 업로드</h3>
      </div>

      {/* Step 1: File Upload */}
      <div style={styles.section}>
        <label style={styles.label}>1. Python 스크립트 선택</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".py"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button style={styles.secondaryBtn} onClick={() => fileInputRef.current?.click()}>
          {fileName || '파일 선택...'}
        </button>
      </div>

      {/* Step 2: Code Preview */}
      {uploadedCode && (
        <div style={styles.section}>
          <label style={styles.label}>2. 코드 미리보기</label>
          <pre style={styles.codePreview}>
            {uploadedCode.length > 2000 ? uploadedCode.slice(0, 2000) + '\n...' : uploadedCode}
          </pre>
        </div>
      )}

      {/* Step 3: Analyze Button */}
      {uploadedCode && !analysisResult && (
        <div style={styles.section}>
          <label style={styles.label}>3. AI 분석</label>
          <button
            style={styles.primaryBtn}
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? '분석 중...' : '분석하기'}
          </button>
        </div>
      )}

      {/* Step 4: Analysis Result */}
      {analysisResult && (
        <div style={styles.section}>
          <label style={styles.label}>4. 분석 결과</label>
          <div style={styles.resultCard}>
            <div style={styles.resultRow}>
              <span style={styles.resultLabel}>도구명:</span>
              <input
                style={styles.input}
                value={analysisResult.tool_name}
                onChange={e => setAnalysisResult({ ...analysisResult, tool_name: e.target.value })}
              />
            </div>
            <div style={styles.resultRow}>
              <span style={styles.resultLabel}>설명:</span>
              <input
                style={styles.input}
                value={analysisResult.description}
                onChange={e => setAnalysisResult({ ...analysisResult, description: e.target.value })}
              />
            </div>
            <div style={styles.resultRow}>
              <span style={styles.resultLabel}>입력:</span>
              <span style={styles.resultValue}>
                {analysisResult.input_schema?.type} - {analysisResult.input_schema?.description}
              </span>
            </div>
            {analysisResult.input_schema?.args_format && (
              <div style={styles.resultRow}>
                <span style={styles.resultLabel}>인자:</span>
                <code style={styles.codeInline}>{analysisResult.input_schema.args_format}</code>
              </div>
            )}
            <div style={styles.resultRow}>
              <span style={styles.resultLabel}>출력:</span>
              <span style={styles.resultValue}>
                {analysisResult.output_schema?.type} - {analysisResult.output_schema?.description}
              </span>
            </div>
            {analysisResult.params_schema?.length > 0 && (
              <div style={{ marginTop: 8, borderTop: '1px solid #e0e0e0', paddingTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                  추가 파라미터 ({analysisResult.params_schema.length}개)
                </div>
                {analysisResult.params_schema.map((p, idx) => (
                  <div key={idx} style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                    <span style={{ fontWeight: 500 }}>{p.label}</span>
                    <span style={{ color: '#999' }}> ({p.key}, {p.type})</span>
                    {p.required && <span style={{ color: '#c0392b', marginLeft: 4 }}>*필수</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 5: Register */}
      {analysisResult && (
        <div style={styles.section}>
          <label style={styles.label}>5. 도구 등록</label>
          <button
            style={styles.primaryBtn}
            onClick={handleRegister}
            disabled={registering}
          >
            {registering ? '등록 중 (어댑터 코드 생성)...' : '등록하기'}
          </button>
        </div>
      )}
    </div>
  );

  const renderToolOutput = (toolOutput) => {
    if (!toolOutput) return null;
    try {
      const parsed = JSON.parse(toolOutput);
      return (
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          {Object.entries(parsed).map(([key, value]) => (
            <div key={key} style={{ marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: '#555' }}>{key}: </span>
              {typeof value === 'object' ? (
                <pre style={{ ...styles.codePreview, maxHeight: 120, marginTop: 2 }}>
                  {JSON.stringify(value, null, 2)}
                </pre>
              ) : (
                <span style={{ color: '#333' }}>{String(value)}</span>
              )}
            </div>
          ))}
        </div>
      );
    } catch {
      return <pre style={styles.codePreview}>{toolOutput}</pre>;
    }
  };

  const renderDetail = () => (
    <div style={styles.content}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => setView('main')}>← 목록</button>
        <h3 style={styles.title}>{selectedTool?.tool_name}</h3>
      </div>

      <div style={styles.section}>
        <div style={styles.resultCard}>
          <div style={styles.resultRow}>
            <span style={styles.resultLabel}>ID:</span>
            <span style={styles.resultValue}>{selectedTool?.tool_id}</span>
          </div>
          <div style={styles.resultRow}>
            <span style={styles.resultLabel}>설명:</span>
            <span style={styles.resultValue}>{selectedTool?.description}</span>
          </div>
          <div style={styles.resultRow}>
            <span style={styles.resultLabel}>타입:</span>
            <span style={styles.badge}>{selectedTool?.execution_type}</span>
          </div>
        </div>
      </div>

      {/* Parameter Input Form */}
      {selectedTool?.params_schema?.length > 0 && (
        <div style={styles.section}>
          <label style={styles.label}>파라미터 설정</label>
          <div style={styles.resultCard}>
            {selectedTool.params_schema.map(p => (
              <div key={p.key} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{p.label}</span>
                  {p.required && <span style={{ color: '#c0392b', fontSize: 11 }}>*</span>}
                </div>
                {p.description && (
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{p.description}</div>
                )}
                <input
                  style={styles.paramInput}
                  type={p.type === 'number' ? 'number' : 'text'}
                  placeholder={p.default != null ? `기본값: ${p.default}` : (p.required ? '' : '(선택)')}
                  value={toolParams[p.key] ?? ''}
                  onChange={e => setToolParams(prev => ({ ...prev, [p.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execute */}
      <div style={styles.section}>
        <button
          style={styles.primaryBtn}
          onClick={handleExecute}
          disabled={executing}
        >
          {executing ? '실행 중...' : '실행하기'}
        </button>
      </div>

      {/* Execution Result */}
      {execResult && (
        <div style={styles.section}>
          <label style={styles.label}>실행 결과</label>
          <div style={{
            ...styles.resultCard,
            borderLeft: `4px solid ${execResult.success ? '#50c878' : '#ff6b6b'}`,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 6, color: execResult.success ? '#2d7a3a' : '#c0392b' }}>
              {execResult.success ? '성공' : '실패'}
            </div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{execResult.message}</div>
            {execResult.execution_time_sec != null && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                실행 시간: {execResult.execution_time_sec.toFixed(1)}초
              </div>
            )}

            {/* Tool Output Preview */}
            {execResult.success && execResult.tool_output && (
              <div style={{ marginTop: 8, borderTop: '1px solid #e0e0e0', paddingTop: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                  결과 미리보기
                </div>
                {renderToolOutput(execResult.tool_output)}
              </div>
            )}

            {execResult.stdout && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>stdout</summary>
                <pre style={styles.codePreview}>{execResult.stdout}</pre>
              </details>
            )}
            {execResult.stderr && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#666' }}>실행 로그</summary>
                <pre style={{ ...styles.codePreview }}>{execResult.stderr}</pre>
              </details>
            )}
          </div>
        </div>
      )}

      {/* Apply to BOP Section */}
      {pendingResult && bopChanges && (
        <div style={styles.section}>
          <label style={styles.label}>BOP 변경 사항</label>
          <div style={{ ...styles.resultCard, borderLeft: '4px solid #f39c12', marginBottom: 12 }}>
            {bopChanges.map((change, idx) => (
              <div key={idx} style={{ fontSize: 13, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 6px',
                    borderRadius: 3,
                    fontSize: 11,
                    fontWeight: 600,
                    backgroundColor: change.type === 'add' ? '#d4edda' : change.type === 'remove' ? '#f8d7da' : '#fff3cd',
                    color: change.type === 'add' ? '#155724' : change.type === 'remove' ? '#721c24' : '#856404',
                  }}>
                    {change.type === 'add' ? '추가' : change.type === 'remove' ? '삭제' : '수정'}
                  </span>
                  <span>{change.field} {change.count}개</span>
                </div>
                {change.details && change.details.length > 0 && (
                  <div style={{ marginLeft: 8, marginTop: 4, fontSize: 11, color: '#666' }}>
                    {change.details.slice(0, 5).map((detail, i) => (
                      <div key={i}>• {detail}</div>
                    ))}
                    {change.details.length > 5 && <div>• ... 외 {change.details.length - 5}개</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.applyBtn} onClick={handleApplyToBop}>
              반영하기
            </button>
            <button style={styles.secondaryBtn} onClick={handleCancelApply}>
              취소
            </button>
          </div>
        </div>
      )}

      {/* Delete */}
      <div style={{ ...styles.section, borderTop: '1px solid #eee', paddingTop: 16, marginTop: 16 }}>
        <button style={styles.dangerBtn} onClick={handleDelete}>삭제하기</button>
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      {/* Main view */}
      {view === 'main' && renderTools()}

      {/* Upload view */}
      {view === 'upload' && renderUpload()}

      {/* Detail view */}
      {view === 'detail' && renderDetail()}
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fff',
  },
  content: {
    padding: '16px',
    overflow: 'auto',
    flex: 1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 'bold',
    flex: 1,
  },
  section: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: '#555',
    marginBottom: '8px',
  },
  info: {
    textAlign: 'center',
    color: '#888',
    padding: '20px',
  },
  emptyState: {
    textAlign: 'center',
    color: '#666',
    padding: '40px 20px',
  },
  card: {
    padding: '12px 14px',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    marginBottom: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    backgroundColor: '#fafafa',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  cardName: {
    fontWeight: '600',
    fontSize: '14px',
  },
  cardDesc: {
    fontSize: '12px',
    color: '#777',
  },
  badge: {
    fontSize: '11px',
    padding: '2px 8px',
    borderRadius: '10px',
    backgroundColor: '#e3f2fd',
    color: '#1565c0',
    fontWeight: '500',
  },
  primaryBtn: {
    padding: '8px 16px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  secondaryBtn: {
    padding: '8px 16px',
    backgroundColor: '#f0f0f0',
    color: '#333',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
  },
  backBtn: {
    padding: '4px 10px',
    backgroundColor: 'transparent',
    color: '#4a90e2',
    border: '1px solid #4a90e2',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  applyBtn: {
    padding: '10px 20px',
    backgroundColor: '#50c878',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 'bold',
    flex: 1,
  },
  paramInput: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
    boxSizing: 'border-box',
  },
  dangerBtn: {
    padding: '8px 16px',
    backgroundColor: '#ff6b6b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  codePreview: {
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '4px',
    padding: '10px',
    fontSize: '11px',
    lineHeight: '1.4',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    fontFamily: 'monospace',
  },
  resultCard: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #e0e0e0',
    borderRadius: '6px',
    padding: '12px',
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '13px',
  },
  resultLabel: {
    fontWeight: '600',
    color: '#555',
    minWidth: '50px',
  },
  resultValue: {
    color: '#333',
  },
  input: {
    flex: 1,
    padding: '4px 8px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    fontSize: '13px',
  },
  error: {
    color: '#c0392b',
    backgroundColor: '#fdecea',
    padding: '8px 12px',
    fontSize: '13px',
    borderBottom: '1px solid #f5c6cb',
  },
  codeInline: {
    backgroundColor: '#f0f0f0',
    padding: '2px 6px',
    borderRadius: '3px',
    fontSize: '11px',
    fontFamily: 'monospace',
    color: '#333',
  },
};

export default ToolsPanel;
