// TODO: implement

const API_BASE_URL = 'http://localhost:8000';

export const api = {
  /**
   * BOP 생성 API 호출
   * @param {string} userInput - 사용자 입력 텍스트
   * @returns {Promise<Object>} BOP 데이터
   */
  async generateBOP(userInput) {
    const response = await fetch(`${API_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_input: userInput }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'BOP 생성 실패');
    }

    return await response.json();
  },

  /**
   * BOP 수정 API 호출
   * @param {string} message - 수정 요청 메시지
   * @param {Object} currentBop - 현재 BOP 데이터
   * @returns {Promise<Object>} 수정된 BOP 데이터
   */
  async chatBOP(message, currentBop) {
    const response = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        current_bop: currentBop,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'BOP 수정 실패');
    }

    return await response.json();
  },

  /**
   * 통합 채팅 API 호출 (생성/수정/QA 통합)
   * @param {string} message - 사용자 메시지
   * @param {Object|null} currentBop - 현재 BOP 데이터 (없으면 null)
   * @returns {Promise<Object>} { message: string, bop_data?: Object }
   */
  async unifiedChat(message, currentBop = null) {
    const response = await fetch(`${API_BASE_URL}/api/chat/unified`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        current_bop: currentBop,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Chat 실패');
    }

    return await response.json();
  },

  /**
   * Excel 내보내기
   * @param {Object} bopData - BOP 데이터
   */
  async exportExcel(bopData) {
    const response = await fetch(`${API_BASE_URL}/api/export/excel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bopData),
    });

    if (!response.ok) {
      throw new Error('Excel export 실패');
    }

    // Blob으로 변환하여 다운로드
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bopData.project_title || 'BOP'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  /**
   * 3D JSON 내보내기
   * @param {Object} bopData - BOP 데이터
   */
  async export3D(bopData) {
    const response = await fetch(`${API_BASE_URL}/api/export/3d`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bopData),
    });

    if (!response.ok) {
      throw new Error('3D export 실패');
    }

    // Blob으로 변환하여 다운로드
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bopData.project_title || 'BOP'}_3d.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};
