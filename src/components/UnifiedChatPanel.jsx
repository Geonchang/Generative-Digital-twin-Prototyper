import { useState, useRef, useEffect } from 'react';
import useBopStore from '../store/bopStore';
import { api } from '../services/api';

function UnifiedChatPanel() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { bopData, messages, setBopData, addMessage } = useBopStore();
  const messagesEndRef = useRef(null);

  // 메시지 추가 시 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) {
      setError('메시지를 입력해주세요');
      return;
    }

    const userMessage = input.trim();
    setLoading(true);
    setError('');
    setInput('');

    // 사용자 메시지를 히스토리에 추가
    addMessage('user', userMessage);

    try {
      // 통합 채팅 API 호출
      const response = await api.unifiedChat(userMessage, bopData);

      console.log('[DEBUG] API Response:', response);
      console.log('[DEBUG] BOP Data exists:', !!response.bop_data);

      // 어시스턴트 메시지를 히스토리에 추가
      addMessage('assistant', response.message);

      // BOP 데이터가 업데이트된 경우
      if (response.bop_data) {
        console.log('[DEBUG] Setting BOP Data:', response.bop_data);
        setBopData(response.bop_data);
        console.log('[DEBUG] BOP Data set successfully');
      } else {
        console.warn('[WARN] No BOP data in response');
      }
    } catch (err) {
      console.error('[ERROR] API call failed:', err);
      setError(err.message);
      // 에러 메시지도 히스토리에 추가
      addMessage('assistant', `오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>AI 어시스턴트</h2>

      {/* 대화 히스토리 */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 && (
          <div style={styles.placeholder}>
            <p style={styles.placeholderTitle}>BOP 생성 및 관리 어시스턴트</p>
            <p style={styles.placeholderText}>예시:</p>
            <ul style={styles.exampleList}>
              <li>"자전거 제조 라인 BOP 만들어줘"</li>
              <li>"3번 공정 삭제해줘"</li>
              <li>"검사 공정 추가해줘"</li>
              <li>"현재 bottleneck이 뭐야?"</li>
            </ul>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              ...styles.message,
              ...(msg.role === 'user' ? styles.userMessage : styles.assistantMessage),
            }}
          >
            <div style={styles.messageRole}>
              {msg.role === 'user' ? '👤 You' : '🤖 AI'}
            </div>
            <div style={styles.messageContent}>{msg.content}</div>
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.message, ...styles.assistantMessage }}>
            <div style={styles.messageRole}>🤖 AI</div>
            <div style={styles.messageContent}>생각 중...</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 */}
      <div style={styles.inputContainer}>
        {error && <div style={styles.error}>{error}</div>}
        <div style={styles.inputWrapper}>
          <textarea
            style={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="메시지를 입력하세요 (Shift+Enter로 줄바꿈)"
            disabled={loading}
            rows={2}
          />
          <button
            style={styles.sendButton}
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            전송
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#fff',
  },
  title: {
    margin: '0',
    padding: '15px 20px',
    fontSize: '18px',
    fontWeight: 'bold',
    borderBottom: '1px solid #e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
  },
  placeholder: {
    textAlign: 'center',
    color: '#666',
    padding: '40px 20px',
  },
  placeholderTitle: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '20px',
  },
  placeholderText: {
    fontSize: '14px',
    marginBottom: '10px',
  },
  exampleList: {
    listStyle: 'none',
    padding: 0,
    fontSize: '13px',
    color: '#888',
  },
  message: {
    padding: '12px 15px',
    borderRadius: '8px',
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#e3f2fd',
    marginLeft: 'auto',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f5f5f5',
    marginRight: 'auto',
  },
  messageRole: {
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '5px',
    color: '#666',
  },
  messageContent: {
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  inputContainer: {
    borderTop: '1px solid #e0e0e0',
    padding: '15px 20px',
    backgroundColor: '#f8f9fa',
  },
  inputWrapper: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '10px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    resize: 'none',
    fontFamily: 'inherit',
  },
  sendButton: {
    padding: '10px 20px',
    backgroundColor: '#4a90e2',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    cursor: 'pointer',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
  },
  error: {
    color: '#ff6b6b',
    fontSize: '13px',
    marginBottom: '10px',
  },
};

export default UnifiedChatPanel;
