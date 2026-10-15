// src/pages/ResetPassword.jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';
import { auth } from '../firebase'; // 프로젝트의 firebase 초기화 파일

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode'); // URL에서 인증코드 추출
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!oobCode) {
      setMessage("유효하지 않은 링크입니다.");
      return;
    }
    // 링크가 유효한지 파이어베이스에 확인
    verifyPasswordResetCode(auth, oobCode)
      .catch(() => {
        setMessage("링크가 만료되었거나 이미 사용되었습니다.");
      });
  }, [oobCode]);

  const handleReset = async (e) => {
    e.preventDefault();
    try {
      await confirmPasswordReset(auth, oobCode, password);
      
      // 1. 비밀번호 변경 성공 후, 현재 세션이 있다면 로그아웃 처리
      if (auth.currentUser) {
        await signOut(auth);
      }
      
      alert("비밀번호가 변경되었습니다. 다시 로그인해주세요.");
      navigate('/login'); // 로그인 페이지로 이동
    } catch (err) {
      setMessage("비밀번호 재설정 실패: " + err.message);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2>새 비밀번호 설정</h2>
      <form onSubmit={handleReset}>
        <input 
          type="password" 
          placeholder="새 비밀번호" 
          onChange={(e) => setPassword(e.target.value)} 
          required 
        />
        <button type="submit">비밀번호 변경</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}