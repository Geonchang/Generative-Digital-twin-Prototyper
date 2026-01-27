import { useState, useEffect, useRef } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';

function ToolsPanel() {
  const { exportBopData, setBopData, addMessage } = useBopStore();

  // Navigation
  const [view, setView] = useState('list'); // 'list' | 'upload' | 'detail'

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

  // Error
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

  // Load tools on mount and when returning to list
  useEffect(() => {
    if (view === 'list') loadTools();
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
      });
      // Reset and go back to list
      setUploadedCode('');
      setFileName('');
      setAnalysisResult(null);
      setView('list');
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
    setError('');
    setView('detail');
  };

  const handleExecute = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    setExecResult(null);
    setError('');
    try {
      const collapsedBop = exportBopData();
      if (!collapsedBop) {
        setError('실행할 BOP 데이터가 없습니다. 먼저 BOP를 생성해주세요.');
        setExecuting(false);
        return;
      }
      const result = await api.executeTool(selectedTool.tool_id, collapsedBop);
      setExecResult(result);
      if (result.success && result.updated_bop) {
        setBopData(result.updated_bop);
        addMessage('assistant', `"${selectedTool.tool_name}" 도구 실행 완료: ${result.message}`);
      }
    } catch (err) {
      setExecResult({ success: false, message: err.message });
    } finally {
      setExecuting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTool) return;
    if (!confirm(`"${selectedTool.tool_name}" 도구를 삭제하시겠습니까?`)) return;
    try {
      await api.deleteTool(selectedTool.tool_id);
      setSelectedTool(null);
      setView('list');
    } catch (err) {
      setError(err.message);
    }
  };

  // === Render ===

  const renderList = () => (
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
    </div>
  );

  const renderUpload = () => (
    <div style={styles.content}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => setView('list')}>← 목록</button>
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
            <div style={styles.resultRow}>
              <span style={styles.resultLabel}>출력:</span>
              <span style={styles.resultValue}>
                {analysisResult.output_schema?.type} - {analysisResult.output_schema?.description}
              </span>
            </div>
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

  const renderDetail = () => (
    <div style={styles.content}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => setView('list')}>← 목록</button>
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

      {/* Execute */}
      <div style={styles.section}>
        <label style={styles.label}>BOP에 대해 실행</label>
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
              <div style={{ fontSize: 12, color: '#888' }}>
                실행 시간: {execResult.execution_time_sec.toFixed(1)}초
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
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#c0392b' }}>stderr</summary>
                <pre style={{ ...styles.codePreview, borderColor: '#ffcccc' }}>{execResult.stderr}</pre>
              </details>
            )}
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
      {error && <div style={styles.error}>{error}</div>}
      {view === 'list' && renderList()}
      {view === 'upload' && renderUpload()}
      {view === 'detail' && renderDetail()}
    </div>
  );
}

const styles = {
  container: {
    height: '100%',
    overflow: 'auto',
    backgroundColor: '#fff',
  },
  content: {
    padding: '16px',
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
};

export default ToolsPanel;
