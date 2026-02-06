import { useState, useRef } from 'react';
import { api } from '../../services/api';
import useBopStore from '../../store/bopStore';

function ToolUploadView({ onNavigate, onUploadComplete }) {
  const { addMessage } = useBopStore();

  const [uploadedCode, setUploadedCode] = useState('');
  const [fileName, setFileName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [useSchemaOverride, setUseSchemaOverride] = useState(false);
  const [schemaOverride, setSchemaOverride] = useState({ input: null, output: null });
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);

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
      const inputOverride = useSchemaOverride && schemaOverride.input ? schemaOverride.input : null;
      const outputOverride = useSchemaOverride && schemaOverride.output ? schemaOverride.output : null;
      const result = await api.analyzeScript(uploadedCode, fileName, null, inputOverride, outputOverride);
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
      const registerData = {
        tool_name: analysisResult.tool_name,
        description: analysisResult.description,
        execution_type: analysisResult.execution_type,
        file_name: fileName,
        source_code: uploadedCode,
        input_schema: analysisResult.input_schema,
        output_schema: analysisResult.output_schema,
        params_schema: analysisResult.params_schema || null,
      };

      await api.registerTool(registerData);
      addMessage('assistant', `"${analysisResult.tool_name}" 도구가 등록되었습니다.`);

      // Reset
      setUploadedCode('');
      setFileName('');
      setAnalysisResult(null);
      onUploadComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div style={styles.content}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => onNavigate('main')}>← 목록</button>
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
          <pre style={{ ...styles.codePreview, maxHeight: '300px', overflow: 'auto' }}>
            {uploadedCode}
          </pre>
        </div>
      )}

      {/* Step 2.5: Schema Override */}
      {uploadedCode && !analysisResult && (
        <div style={styles.section}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={useSchemaOverride}
              onChange={e => setUseSchemaOverride(e.target.checked)}
            />
            스키마 직접 지정 (AI 분석 스킵)
          </label>
          {useSchemaOverride && (
            <div style={{ ...styles.resultCard, marginTop: 8 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>입력 스키마 (JSON)</label>
                <textarea
                  style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 11, minHeight: 120 }}
                  placeholder='{"type": "json", "description": "BOP 데이터"}'
                  value={schemaOverride.input ? JSON.stringify(schemaOverride.input, null, 2) : ''}
                  onChange={e => {
                    try {
                      const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : null;
                      setSchemaOverride(prev => ({ ...prev, input: parsed }));
                      setError('');
                    } catch (err) {
                      setError('입력 스키마 JSON 형식 오류');
                    }
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>출력 스키마 (JSON)</label>
                <textarea
                  style={{ ...styles.textarea, fontFamily: 'monospace', fontSize: 11, minHeight: 120 }}
                  placeholder='{"type": "json", "description": "수정된 BOP 데이터"}'
                  value={schemaOverride.output ? JSON.stringify(schemaOverride.output, null, 2) : ''}
                  onChange={e => {
                    try {
                      const parsed = e.target.value.trim() ? JSON.parse(e.target.value) : null;
                      setSchemaOverride(prev => ({ ...prev, output: parsed }));
                      setError('');
                    } catch (err) {
                      setError('출력 스키마 JSON 형식 오류');
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Analyze Button */}
      {uploadedCode && !analysisResult && (
        <div style={styles.section}>
          <label style={styles.label}>3. {useSchemaOverride ? '스키마로 등록' : 'AI 분석'}</label>
          <button
            style={styles.primaryBtn}
            onClick={handleAnalyze}
            disabled={analyzing || (useSchemaOverride && (!schemaOverride.input || !schemaOverride.output))}
          >
            {analyzing ? (useSchemaOverride ? '등록 준비 중...' : '분석 중...') : (useSchemaOverride ? '스키마로 등록' : '분석하기')}
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

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles = {
  content: { padding: '16px', overflow: 'auto', flex: 1 },
  header: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  title: { margin: 0, fontSize: '16px', fontWeight: 'bold', flex: 1 },
  section: { marginBottom: '16px' },
  label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#555', marginBottom: '8px' },
  backBtn: { padding: '4px 10px', backgroundColor: 'transparent', color: '#4a90e2', border: '1px solid #4a90e2', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' },
  secondaryBtn: { padding: '8px 16px', backgroundColor: '#f0f0f0', color: '#333', border: '1px solid #ccc', borderRadius: '4px', fontSize: '13px', cursor: 'pointer' },
  primaryBtn: { padding: '8px 16px', backgroundColor: '#4a90e2', color: 'white', border: 'none', borderRadius: '4px', fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' },
  codePreview: { backgroundColor: '#f5f5f5', border: '1px solid #ddd', borderRadius: '4px', padding: '10px', fontSize: '11px', lineHeight: '1.4', overflow: 'auto', maxHeight: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' },
  resultCard: { backgroundColor: '#f9f9f9', border: '1px solid #e0e0e0', borderRadius: '6px', padding: '12px' },
  resultRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '13px' },
  resultLabel: { fontWeight: '600', color: '#555', minWidth: '50px' },
  resultValue: { color: '#333' },
  input: { flex: 1, padding: '4px 8px', border: '1px solid #ddd', borderRadius: '3px', fontSize: '13px' },
  textarea: { width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#555', cursor: 'pointer' },
  error: { color: '#c0392b', backgroundColor: '#fdecea', padding: '8px 12px', fontSize: '13px', borderBottom: '1px solid #f5c6cb' },
};

export default ToolUploadView;
