import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { verifyPasswordResetCode, confirmPasswordReset, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import Icon from '../components/Icon';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(oobCode ? '' : '유효하지 않은 링크입니다.');
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!oobCode) return;
    verifyPasswordResetCode(auth, oobCode)
      .then((mail) => { setEmail(mail); setValid(true); })
      .catch(() => setMessage('링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.'));
  }, [oobCode]);

  const handleReset = async (e) => {
    e.preventDefault();
    if (password.length < 6) return setMessage('비밀번호는 6자 이상이어야 합니다.');
    if (password !== confirm) return setMessage('비밀번호가 일치하지 않습니다.');
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      if (auth.currentUser) await signOut(auth);
      alert('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.');
      navigate('/', { replace: true });
    } catch (err) {
      setMessage('비밀번호 재설정 실패: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'relative', minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="sl-ambient"><div className="sl-orb a" /><div className="sl-orb b" /></div>
      <form onSubmit={handleReset} className="sl-modal" style={{ position: 'relative', zIndex: 1 }}>
        <span className="sl-brand-mark" style={{ marginBottom: 18 }}><Icon name="lock" size={18} stroke={2.2} style={{ color: '#fff' }} /></span>
        <h1 className="sl-h2" style={{ marginBottom: 6 }}>새 비밀번호 설정</h1>
        <p className="sl-muted" style={{ margin: '0 0 22px', fontSize: '.92rem' }}>{email ? `${email} 계정의 비밀번호를 변경합니다.` : message ? '비밀번호 찾기에서 재설정 메일을 다시 요청해 주세요.' : '링크를 확인하고 있어요…'}</p>
        <div className="sl-stack">
          <input className="sl-input" type="password" autoComplete="new-password" placeholder="새 비밀번호 (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!valid} />
          <input className="sl-input" type="password" autoComplete="new-password" placeholder="새 비밀번호 확인" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={!valid} />
          {message && <p style={{ margin: 0, color: '#fecdd3', fontSize: '.88rem', fontWeight: 600 }}>⚠ {message}</p>}
          <button className="sl-btn primary lg block" type="submit" disabled={!valid || busy}>{busy ? '변경 중…' : '비밀번호 변경'}</button>
          <button type="button" className="sl-btn ghost block" onClick={() => navigate('/')}>로그인 화면으로</button>
        </div>
      </form>
    </div>
  );
}
