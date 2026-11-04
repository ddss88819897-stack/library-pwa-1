import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, signOut, updatePassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import Icon from '../components/Icon';

const TEMP_PASS = 'Temp!@#123';
const SAVED_ID_KEY = 'smartlib:savedLoginId';

const readSavedId = () => { try { return localStorage.getItem(SAVED_ID_KEY) || ''; } catch { return ''; } };
const writeSavedId = (v) => { try { if (v) localStorage.setItem(SAVED_ID_KEY, v); else localStorage.removeItem(SAVED_ID_KEY); } catch { /* 저장소 차단 */ } };

const Auth = ({ isExamPeriod }) => {
  const [loginId, setLoginId] = useState(readSavedId);
  const [rememberId, setRememberId] = useState(() => !!readSavedId());
  const [realEmail, setRealEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [mode, setMode] = useState('LOGIN'); // LOGIN | SIGNUP | FORGOT
  const [signUpStep, setSignUpStep] = useState(1);
  const [signupType, setSignupType] = useState('SELECT');
  const [resetEmail, setResetEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await fn(); } finally { setBusy(false); }
  };

  const resetSignup = async () => {
    if (signUpStep > 1 && auth.currentUser && !auth.currentUser.displayName) {
      try { await auth.currentUser.delete(); } catch { /* 이미 삭제됨 */ }
    }
    setMode('LOGIN'); setSignupType('SELECT'); setSignUpStep(1);
    setRealEmail(''); setStudentId(''); setPassword(''); setPasswordConfirm(''); setName(''); setAgreed(false); setError('');
  };

  const handleLogin = (e) => {
    e.preventDefault();
    run(async () => {
      if (!loginId || !password) return setError('아이디와 비밀번호를 입력해 주세요.');
      const email = loginId.includes('@') ? loginId.trim() : `${loginId.trim()}@test.com`;
      try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        if (!email.includes('@test.com') && !cred.user.emailVerified) {
          await signOut(auth);
          return setError('이메일 인증이 완료되지 않았습니다. 메일함을 확인해 주세요.');
        }
        writeSavedId(rememberId ? loginId.trim() : '');
      } catch {
        setError('아이디 또는 비밀번호가 올바르지 않습니다.');
      }
    });
  };

  const sendVerification = () => run(async () => {
    if (!realEmail || !/^\S+@\S+\.\S+$/.test(realEmail)) return setError('올바른 이메일 주소를 입력해 주세요.');
    try {
      const cred = await createUserWithEmailAndPassword(auth, realEmail, TEMP_PASS);
      await sendEmailVerification(cred.user);
      setSignUpStep(2);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        try {
          const cred = await signInWithEmailAndPassword(auth, realEmail, TEMP_PASS);
          await sendEmailVerification(cred.user);
          setSignUpStep(2);
        } catch { setError('이미 가입이 완료된 이메일입니다. 로그인해 주세요.'); }
      } else setError(e.message);
    }
  });

  const checkVerification = () => run(async () => {
    if (!auth.currentUser) return setError('세션이 만료되었습니다. 처음부터 다시 진행해 주세요.');
    await auth.currentUser.reload();
    if (auth.currentUser.emailVerified) setSignUpStep(3);
    else setError('아직 인증되지 않았습니다. 메일의 링크를 눌러 주세요.');
  });

  const createAccount = () => run(async () => {
    if (!name.trim() || !studentId.trim()) return setError('이름과 학번(연락처)을 모두 입력해 주세요.');
    if (password.length < 6) return setError('비밀번호는 6자 이상이어야 합니다.');
    if (password !== passwordConfirm) return setError('비밀번호가 일치하지 않습니다.');
    if (!agreed) return setError('이용 약관에 동의해 주세요.');
    try {
      await updatePassword(auth.currentUser, password);
      await updateProfile(auth.currentUser, { displayName: name.trim() });
      await setDoc(doc(db, 'User', auth.currentUser.uid), {
        name: name.trim(), studentNo: studentId.trim(), email: realEmail, role: signupType === 'STUDENT' ? 'CLIENT' : 'GUEST', createdAt: serverTimestamp()
      });
      await signOut(auth);
      alert('🎉 가입이 완료되었습니다! 새 비밀번호로 로그인해 주세요.');
      setLoginId(realEmail);
      resetSignup();
    } catch (e) { setError('가입 오류: ' + e.message); }
  });

  const sendReset = () => run(async () => {
    if (!resetEmail || !resetEmail.includes('@')) return setError('올바른 이메일 주소를 입력해 주세요.');
    try {
      await sendPasswordResetEmail(auth, resetEmail, { url: `${window.location.origin}/reset-password`, handleCodeInApp: true });
      alert('✅ 재설정 메일을 보냈습니다. 메일함을 확인해 주세요.');
      setMode('LOGIN'); setResetEmail('');
    } catch (e) { setError(e.message); }
  });

  const steps = ['이메일 인증', '인증 확인', '정보 입력'];

  return (
    <div style={{ position: 'relative', minHeight: '100svh', display: 'grid', placeItems: 'center', padding: '24px 16px', overflow: 'hidden', background: 'var(--bg)' }}>
      <div className="sl-ambient"><div className="sl-orb a" /><div className="sl-orb b" /><div className="sl-orb c" /></div>
      <style>{`
        .auth-wrap { position: relative; z-index: 1; width: 100%; max-width: 1040px; display: grid; grid-template-columns: 1.05fr 1fr; border-radius: 36px; overflow: hidden;
          border: 1px solid var(--line-strong); background: rgba(10,14,30,.72); backdrop-filter: blur(28px); -webkit-backdrop-filter: blur(28px);
          box-shadow: 0 50px 120px -30px rgba(0,0,0,.9), inset 0 1px 0 rgba(255,255,255,.08); animation: sl-pop .6s var(--ease); }
        .auth-art { position: relative; padding: 44px; display: flex; flex-direction: column; justify-content: space-between; min-height: 620px; overflow: hidden;
          background: radial-gradient(120% 90% at 0% 0%, rgba(109,141,255,.55), transparent 55%), radial-gradient(90% 80% at 100% 100%, rgba(56,217,245,.35), transparent 55%), radial-gradient(80% 70% at 100% 0%, rgba(155,123,255,.45), transparent 60%), #0a0f24; }
        .auth-art::after { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px); background-size: 44px 44px; mask-image: linear-gradient(180deg, #000, transparent 85%); -webkit-mask-image: linear-gradient(180deg, #000, transparent 85%); pointer-events: none; }
        .auth-form { padding: 52px 52px 44px; display: flex; flex-direction: column; justify-content: center; }
        .auth-book { position: absolute; right: -40px; top: 46%; width: 300px; height: 300px; border-radius: 60px; transform: rotate(-14deg);
          background: linear-gradient(150deg, rgba(255,255,255,.18), rgba(255,255,255,.02)); border: 1px solid rgba(255,255,255,.22); backdrop-filter: blur(6px); display: grid; place-items: center; }
        @media (max-width: 880px) {
          .auth-wrap { grid-template-columns: 1fr; max-width: 480px; border-radius: 30px; }
          .auth-art { min-height: 0; padding: 28px 28px 26px; }
          .auth-art .auth-hero, .auth-book { display: none; }
          .auth-form { padding: 30px 26px 30px; }
        }
      `}</style>

      <div className="auth-wrap">
        {/* 브랜딩 패널 */}
        <div className="auth-art">
          <div className="sl-row" style={{ position: 'relative', zIndex: 1 }}>
            <span className="sl-brand-mark"><Icon name="book" size={18} stroke={2.2} style={{ color: '#fff' }} /></span>
            <span className="sl-brand-name">SMART LIB<small>UOU LIBRARY</small></span>
          </div>
          <div className="auth-book"><Icon name="book" size={140} stroke={1} style={{ color: 'rgba(255,255,255,.75)' }} /></div>
          <div className="auth-hero" style={{ position: 'relative', zIndex: 1 }}>
            <span className="sl-eyebrow"><span className="dot" />24/7 SMART RESERVATION</span>
            <h2 className="sl-display" style={{ fontSize: 'clamp(2.2rem, 4vw, 3.1rem)', margin: '16px 0 14px' }}>지식의 경계를 넘어,<br /><span className="sl-grad-text">나를 뛰어넘는다</span></h2>
            <p className="sl-muted" style={{ margin: 0, lineHeight: 1.6 }}>울산과학대학교 스마트 도서관<br />좌석 예약 · 도서 검색 · 모바일 출입증</p>
            <div className="sl-row" style={{ marginTop: 28, gap: 10, flexWrap: 'wrap' }}>
              {['실시간 좌석', 'QR 입실', 'AI 사서'].map(t => <span key={t} className="sl-chip" style={{ background: 'rgba(255,255,255,.08)' }}>{t}</span>)}
            </div>
          </div>
        </div>

        {/* 폼 패널 */}
        <div className="auth-form">
          {isExamPeriod && (
            <div className="sl-chip red" style={{ height: 'auto', padding: '10px 14px', borderRadius: 14, marginBottom: 20, whiteSpace: 'normal' }}>🚨 시험 기간 정책 가동 중 · 외부인 이용이 제한됩니다</div>
          )}

          {mode === 'LOGIN' && (
            <>
              <h1 className="sl-h2" style={{ fontSize: '2rem', marginBottom: 8 }}>다시 오신 걸 환영해요</h1>
              <p className="sl-muted" style={{ margin: '0 0 30px' }}>계정이 없으신가요? <button className="sl-btn ghost sm" style={{ padding: '0 6px', height: 'auto', color: 'var(--cyan)' }} onClick={() => { setMode('SIGNUP'); setError(''); }}>회원가입</button></p>
              <form onSubmit={handleLogin} className="sl-stack">
                <label className="sl-field"><span className="sl-label">아이디 또는 이메일</span>
                  <input className="sl-input" autoComplete="username" placeholder="학번 또는 example@email.com" value={loginId} onChange={e => setLoginId(e.target.value)} />
                </label>
                <label className="sl-field"><span className="sl-label">비밀번호</span>
                  <input className="sl-input" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                </label>
                <div className="sl-between" style={{ margin: '2px 0 6px' }}>
                  <label className="sl-row sl-muted" style={{ gap: 8, fontSize: '.88rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={rememberId} onChange={e => setRememberId(e.target.checked)} style={{ accentColor: '#6d8dff', width: 16, height: 16 }} /> 아이디 저장
                  </label>
                  <button type="button" className="sl-btn ghost sm" style={{ color: 'var(--text-2)' }} onClick={() => { setMode('FORGOT'); setError(''); }}>비밀번호 찾기</button>
                </div>
                {error && <p style={{ margin: 0, color: '#fecdd3', fontSize: '.88rem', fontWeight: 600 }}>⚠ {error}</p>}
                <button className="sl-btn primary lg block" type="submit" disabled={busy}>{busy ? '로그인 중…' : '로그인'} {!busy && <Icon name="arrowRight" size={18} stroke={2.2} />}</button>
              </form>
              <p className="sl-faint" style={{ fontSize: '.78rem', margin: '26px 0 0', textAlign: 'center' }}>학번만 입력하면 테스트 계정(@test.com)으로 로그인됩니다</p>
            </>
          )}

          {mode === 'SIGNUP' && (
            <>
              <button className="sl-btn ghost sm" style={{ alignSelf: 'flex-start', marginLeft: -10, marginBottom: 10 }} onClick={resetSignup}><Icon name="arrowLeft" size={16} />로그인으로</button>
              <h1 className="sl-h2" style={{ fontSize: '1.8rem', marginBottom: 8 }}>
                {signupType === 'SELECT' ? '계정 만들기' : signupType === 'STUDENT' ? '재학생 가입' : '외부인 가입'}
              </h1>
              <p className="sl-muted" style={{ margin: '0 0 24px' }}>{signupType === 'SELECT' ? '이용자 유형을 선택해 주세요.' : '이메일 인증 후 3단계로 간단히 가입할 수 있어요.'}</p>

              {signupType === 'SELECT' && (
                <div className="sl-stack">
                  {[{ t: 'STUDENT', icon: 'user', title: '재학생', sub: '학번으로 가입 · 시험 기간에도 이용 가능' }, { t: 'GUEST', icon: 'users', title: '외부인', sub: '연락처로 가입 · 일부 기간 이용 제한' }].map(o => (
                    <button key={o.t} className="sl-card hover" onClick={() => setSignupType(o.t)} style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, padding: 20, color: 'inherit' }}>
                      <span style={{ width: 48, height: 48, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--grad-soft)', border: '1px solid rgba(109,141,255,.3)', color: '#c7d2fe' }}><Icon name={o.icon} size={22} /></span>
                      <span style={{ flex: 1 }}><b style={{ fontSize: '1.05rem' }}>{o.title}</b><br /><span className="sl-faint" style={{ fontSize: '.85rem' }}>{o.sub}</span></span>
                      <Icon name="chevronRight" size={18} style={{ color: 'var(--text-3)' }} />
                    </button>
                  ))}
                </div>
              )}

              {signupType !== 'SELECT' && (
                <div className="sl-stack">
                  <div className="sl-row" style={{ gap: 6, marginBottom: 6 }}>
                    {steps.map((label, i) => (
                      <div key={label} style={{ flex: 1 }}>
                        <div style={{ height: 4, borderRadius: 4, background: i < signUpStep ? 'var(--grad)' : 'rgba(255,255,255,.1)' }} />
                        <div style={{ fontSize: '.72rem', fontWeight: 700, marginTop: 6, color: i < signUpStep ? 'var(--text)' : 'var(--text-3)' }}>{i + 1}. {label}</div>
                      </div>
                    ))}
                  </div>

                  {signUpStep === 1 && <>
                    <label className="sl-field"><span className="sl-label">이메일</span>
                      <input className="sl-input" type="email" placeholder="example@email.com" value={realEmail} onChange={e => setRealEmail(e.target.value)} />
                    </label>
                    {error && <p style={{ margin: 0, color: '#fecdd3', fontSize: '.88rem', fontWeight: 600 }}>⚠ {error}</p>}
                    <button className="sl-btn primary lg block" disabled={busy} onClick={sendVerification}>{busy ? '전송 중…' : '인증 메일 보내기'}</button>
                  </>}

                  {signUpStep === 2 && <>
                    <div style={{ padding: 16, borderRadius: 16, background: 'var(--grad-soft)', border: '1px solid rgba(109,141,255,.3)', lineHeight: 1.6, fontSize: '.92rem' }}>
                      <b style={{ color: '#c7d2fe' }}>{realEmail}</b> 로 인증 메일을 보냈어요.<br />메일의 링크를 누른 뒤 아래 버튼을 눌러 주세요.
                    </div>
                    {error && <p style={{ margin: 0, color: '#fecdd3', fontSize: '.88rem', fontWeight: 600 }}>⚠ {error}</p>}
                    <button className="sl-btn primary lg block" disabled={busy} onClick={checkVerification}>{busy ? '확인 중…' : '인증 완료했어요'}</button>
                  </>}

                  {signUpStep === 3 && <>
                    <div className="sl-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label className="sl-field"><span className="sl-label">이름</span><input className="sl-input" placeholder="홍길동" value={name} onChange={e => setName(e.target.value)} /></label>
                      <label className="sl-field"><span className="sl-label">{signupType === 'STUDENT' ? '학번' : '연락처'}</span><input className="sl-input" inputMode="numeric" placeholder={signupType === 'STUDENT' ? '예: 2212020' : '01012345678'} value={studentId} onChange={e => setStudentId(e.target.value)} /></label>
                    </div>
                    <label className="sl-field"><span className="sl-label">비밀번호</span><input className="sl-input" type="password" autoComplete="new-password" placeholder="6자 이상" value={password} onChange={e => setPassword(e.target.value)} /></label>
                    <label className="sl-field"><span className="sl-label">비밀번호 확인</span><input className="sl-input" type="password" autoComplete="new-password" placeholder="한 번 더 입력" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} /></label>
                    <label className="sl-row sl-muted" style={{ gap: 10, fontSize: '.88rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ accentColor: '#6d8dff', width: 16, height: 16 }} />
                      도서관 이용 약관 및 개인정보 수집에 동의합니다
                    </label>
                    {error && <p style={{ margin: 0, color: '#fecdd3', fontSize: '.88rem', fontWeight: 600 }}>⚠ {error}</p>}
                    <button className="sl-btn primary lg block" disabled={busy} onClick={createAccount}>{busy ? '가입 중…' : '가입 완료하기'}</button>
                  </>}
                </div>
              )}
            </>
          )}

          {mode === 'FORGOT' && (
            <>
              <button className="sl-btn ghost sm" style={{ alignSelf: 'flex-start', marginLeft: -10, marginBottom: 10 }} onClick={() => { setMode('LOGIN'); setError(''); }}><Icon name="arrowLeft" size={16} />로그인으로</button>
              <h1 className="sl-h2" style={{ fontSize: '1.8rem', marginBottom: 8 }}>비밀번호 찾기</h1>
              <p className="sl-muted" style={{ margin: '0 0 26px', lineHeight: 1.6 }}>가입한 이메일로 재설정 링크를 보내드려요.</p>
              <div className="sl-stack">
                <label className="sl-field"><span className="sl-label">이메일</span>
                  <input className="sl-input" type="email" placeholder="example@email.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} />
                </label>
                {error && <p style={{ margin: 0, color: '#fecdd3', fontSize: '.88rem', fontWeight: 600 }}>⚠ {error}</p>}
                <button className="sl-btn primary lg block" disabled={busy} onClick={sendReset}>{busy ? '전송 중…' : '재설정 링크 보내기'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Auth;
