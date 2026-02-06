import { useEffect } from 'react';

function ToolListView({
  tools,
  listLoading,
  selectedToolIds,
  error,
  onToolClick,
  onToggleSelection,
  onToggleSelectAll,
  onDeleteSelected,
  onNavigate
}) {
  return (
    <div style={styles.content}>
      <div style={styles.header}>
        <h3 style={styles.title}>도구 관리</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.aiBtn} onClick={() => onNavigate('generate')}>
            ✨ AI 생성
          </button>
          <button style={styles.secondaryBtn} onClick={() => onNavigate('upload')}>
            + 업로드
          </button>
        </div>
      </div>

      {/* 다중 선택 도구 */}
      {!listLoading && tools.length > 0 && (
        <div style={styles.selectionBar}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={selectedToolIds.length === tools.length && tools.length > 0}
              onChange={onToggleSelectAll}
              style={{ cursor: 'pointer' }}
            />
            <span>전체 선택 ({selectedToolIds.length}/{tools.length})</span>
          </label>
          {selectedToolIds.length > 0 && (
            <button
              style={{ ...styles.dangerBtn, padding: '4px 12px', fontSize: 12 }}
              onClick={onDeleteSelected}
            >
              선택 삭제 ({selectedToolIds.length})
            </button>
          )}
        </div>
      )}

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
        <div
          key={tool.tool_id}
          style={{
            ...styles.card,
            backgroundColor: selectedToolIds.includes(tool.tool_id) ? '#e3f2fd' : 'white'
          }}
          onClick={() => onToolClick(tool)}
        >
          <div style={styles.cardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={selectedToolIds.includes(tool.tool_id)}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelection(tool.tool_id);
                }}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer' }}
              />
              <span style={styles.cardName}>{tool.tool_name}</span>
            </div>
            <span style={styles.badge}>{tool.execution_type}</span>
          </div>
          <div style={styles.cardDesc}>{tool.description}</div>
        </div>
      ))}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles = {
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
  selectionBar: {
    padding: '8px 12px',
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
    marginBottom: 8,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    cursor: 'pointer',
    userSelect: 'none'
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
  aiBtn: {
    padding: '8px 16px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
  error: {
    color: '#c0392b',
    backgroundColor: '#fdecea',
    padding: '8px 12px',
    fontSize: '13px',
    borderBottom: '1px solid #f5c6cb',
  },
};

export default ToolListView;
