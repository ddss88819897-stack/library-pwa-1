import React, { useState } from 'react';
import { auth, db } from '../firebase'; 
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, signOut, updatePassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'; 

const Auth = ({ isExamPeriod }) => {
  const [loginId, setLoginId] = useState(''); 
  const [realEmail, setRealEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState(''); 
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [agreed, setAgreed] = useState(false);
  
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [isForgotPasswordMode, setIsForgotPasswordMode] = useState(false);
  
  const [signUpStep, setSignUpStep] = useState(1);
  const [signupType, setSignupType] = useState('SELECT');
  const [resetStudentId, setResetStudentId] = useState('');

  const TEMP_PASS = "Temp!@#123"; 

  const handleCancelRegistration = async () => {
    if (signUpStep > 1 && auth.currentUser) {
      try { await auth.currentUser.delete(); } catch(e) {}
    }
    setIsSignUpMode(false);
    setSignupType('SELECT');
    setSignUpStep(1);
    setRealEmail('');
    setStudentId('');
    setPassword('');
    setPasswordConfirm('');
    setName('');
    setAgreed(false);
  };

  return (
    <>
      <style>{`
        .glass-container {
          display: flex;
          width: 950px;
          max-width: 95%;
          min-height: 600px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-right: 1px solid rgba(255, 255, 255, 0.1);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 24px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.3);
          overflow: hidden;
          z-index: 10;
        }
        .left-pane {
          flex: 1;
          background: linear-gradient(to bottom, rgba(15, 23, 42, 0.4), rgba(30, 58, 138, 0.85)), url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop') center/cover;
          position: relative;
          padding: 40px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .right-pane {
          flex: 1.2;
          padding: 50px 60px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          background: rgba(255, 255, 255, 0.02);
        }
        .form-input {
          width: 100%;
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 12px;
          color: #fff;
          font-size: 0.95rem;
          transition: all 0.3s ease;
          box-sizing: border-box;
          backdrop-filter: blur(10px);
        }
        .form-input::placeholder { color: rgba(255, 255, 255, 0.5); font-weight: 500; }
        .form-input:focus { background: rgba(255, 255, 255, 0.12); border-color: #60a5fa; outline: none; box-shadow: 0 0 15px rgba(96, 165, 250, 0.3); }
        
        .primary-btn {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 12px;
          font-weight: 800;
          font-size: 1rem;
          cursor: pointer;
          transition: 0.3s;
          text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }
        .primary-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(37, 99, 235, 0.4); }
        
        .text-link { color: #93c5fd; cursor: pointer; transition: 0.2s; text-decoration: none; font-weight: 700; }
        .text-link:hover { color: #fff; text-shadow: 0 0 8px rgba(147, 197, 253, 0.8); }
        
        @media (max-width: 850px) {
          .left-pane { display: none; }
          .right-pane { padding: 40px 30px; }
          .glass-container { width: 90%; min-height: auto; }
        }

        @keyframes blob-bounce { 0% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, -40px) scale(1.1); } 100% { transform: translate(0, 0) scale(1); } }
      `}</style>

      <div style={{ position: 'relative', width: '100%', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617', overflow: 'hidden', fontFamily: "'Inter', sans-serif" }}>
        
        <div style={{ position: 'absolute', top: '5%', left: '15%', width: '450px', height: '450px', background: '#1e3a8a', borderRadius: '50%', filter: 'blur(160px)', opacity: 0.6, animation: 'blob-bounce 15s infinite ease-in-out' }} />
        <div style={{ position: 'absolute', bottom: '5%', right: '15%', width: '500px', height: '500px', background: '#0284c7', borderRadius: '50%', filter: 'blur(160px)', opacity: 0.5, animation: 'blob-bounce 18s infinite ease-in-out reverse' }} />
        <div style={{ position: 'absolute', top: '40%', left: '40%', width: '300px', height: '300px', background: '#3b82f6', borderRadius: '50%', filter: 'blur(140px)', opacity: 0.3 }} />

        <div className="glass-container">
          
          <div className="left-pane">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" style={{ width: '28px', height: '28px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.315 48.315 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
                </svg>
                <span style={{ color: '#fff', fontWeight: '900', fontSize: '1.2rem', letterSpacing: '1px' }}>SMART LIB</span>
              </div>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '600' }}>
                홈으로 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{width:'14px'}}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </span>
            </div>
            
            <div>
              <h2 style={{ color: '#fff', fontSize: '2.4rem', fontWeight: '900', lineHeight: '1.3', margin: '0 0 15px 0', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>지식의 경계를 넘어,<br/>나를 뛰어넘는다</h2>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', margin: 0, fontWeight: '500' }}>울산과학대학교 스마트 도서관</p>
              
              <div style={{ display: 'flex', gap: '8px', marginTop: '40px' }}>
                <div style={{ width: '30px', height: '4px', background: '#fff', borderRadius: '2px', boxShadow: '0 0 10px rgba(255,255,255,0.5)' }} />
                <div style={{ width: '30px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} />
                <div style={{ width: '30px', height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px' }} />
              </div>
            </div>
          </div>

          <div className="right-pane">
            
            {!isSignUpMode && !isForgotPasswordMode && (
              <>
                <h1 style={{ color: '#fff', fontSize: '2rem', margin: '0 0 10px 0', fontWeight: '900' }}>로그인</h1>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: '0 0 40px 0' }}>
                  계정이 없으신가요? <span className="text-link" onClick={() => { setIsSignUpMode(true); setPassword(''); setSignUpStep(1); }}>회원가입</span>
                </p>

                {isExamPeriod && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px', fontSize: '0.85rem' }}>
                    🚨 시험 기간 정책 가동 중 (외부인 이용 금지)
                  </div>
                )}

                <form onSubmit={async (e) => {
                  e.preventDefault(); 
                  if (!loginId || !password) return alert("아이디와 비밀번호를 입력해주세요.");
                  try {
                    const emailToLogin = loginId.includes('@') ? loginId : `${loginId}@test.com`;
                    const cred = await signInWithEmailAndPassword(auth, emailToLogin, password);
                    if (!emailToLogin.includes('@test.com') && !cred.user.emailVerified) {
                      await signOut(auth); 
                      return alert("🚨 이메일 인증이 완료되지 않았습니다.");
                    }
                  } catch (err) { alert("❌ 로그인 실패: 아이디 또는 비밀번호가 틀립니다."); }
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '15px' }}>
                    <input className="form-input" type="text" placeholder="Email address" onChange={e => setLoginId(e.target.value)} />
                    <input className="form-input" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input type="checkbox" style={{ accentColor: '#3b82f6' }} /> 아이디 저장
                    </label>
                    <span onClick={() => setIsForgotPasswordMode(true)} className="text-link" style={{ fontSize: '0.85rem' }}>비밀번호 찾기</span>
                  </div>

                  <button className="primary-btn" type="submit">Log in</button>
                </form>
              </>
            )}

            {isSignUpMode && (
              <>
                <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: '0 0 10px 0', fontWeight: '900' }}>
                  {signupType === 'SELECT' ? '계정 생성' : signupType === 'STUDENT' ? '학생 계정 생성' : '외부인 계정 생성'}
                </h1>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', margin: '0 0 35px 0' }}>
                  이미 계정이 있으신가요? <span className="text-link" onClick={handleCancelRegistration}>로그인</span>
                </p>

                {signupType === 'SELECT' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    <button className="form-input" onClick={() => setSignupType('STUDENT')} style={{ padding: '20px', textAlign: 'left', cursor: 'pointer', fontSize: '1.1rem', fontWeight: '800' }}>🎓 재학생 입니다</button>
                    <button className="form-input" onClick={() => setSignupType('GUEST')} style={{ padding: '20px', textAlign: 'left', cursor: 'pointer', fontSize: '1.1rem', fontWeight: '800' }}>👤 외부인 입니다</button>
                  </div>
                )}

                {signupType !== 'SELECT' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    
                    {signUpStep === 1 && (
                      <>
                        <input className="form-input" type="email" placeholder="Email Address" onChange={e => setRealEmail(e.target.value)} />
                        <button className="primary-btn" onClick={async () => {
                          if (!realEmail || !realEmail.includes('@')) return alert("❌ 올바른 이메일 형식을 입력해주세요.");
                          try {
                            const cred = await createUserWithEmailAndPassword(auth, realEmail, TEMP_PASS);
                            await sendEmailVerification(cred.user);
                            alert("✅ 인증 메일이 발송되었습니다. 메일함 확인 후 다음 단계를 진행해주세요.");
                            setSignUpStep(2); 
                          } catch(e) {
                            if (e.code === 'auth/email-already-in-use') {
                              try {
                                const cred = await signInWithEmailAndPassword(auth, realEmail, TEMP_PASS);
                                await sendEmailVerification(cred.user); 
                                setSignUpStep(2);
                              } catch(err) { alert("❌ 이미 정식 가입된 이메일입니다."); }
                            } else { alert("❌ 오류: " + e.message); }
                          }
                        }}>Verify Email</button>
                      </>
                    )}

                    {signUpStep === 2 && (
                      <>
                        <div style={{ background: 'rgba(255,255,255,0.08)', padding: '15px', borderRadius: '12px', color: '#fff', fontSize: '0.9rem', border: '1px solid rgba(255,255,255,0.2)' }}>
                          <b style={{color: '#93c5fd'}}>{realEmail}</b>로 인증 메일을 보냈습니다.<br/>링크 클릭 후 아래 버튼을 눌러주세요.
                        </div>
                        <button className="primary-btn" onClick={async () => {
                          if (!auth.currentUser) return alert("❌ 세션이 만료되었습니다.");
                          await auth.currentUser.reload(); 
                          if (auth.currentUser.emailVerified) setSignUpStep(3); 
                          else alert("🚨 아직 인증되지 않았습니다.");
                        }}>Check Verification</button>
                      </>
                    )}

                    {signUpStep === 3 && (
                      <>
                        <div style={{ display: 'flex', gap: '15px' }}>
                          <input className="form-input" type="text" placeholder="Name" onChange={e => setName(e.target.value)} />
                          <input className="form-input" type="text" placeholder={signupType === 'STUDENT' ? "Student ID" : "Phone number"} onChange={e => setStudentId(e.target.value)} />
                        </div>
                        <input className="form-input" type="password" placeholder="Password (6+ chars)" onChange={e => setPassword(e.target.value)} />
                        <input className="form-input" type="password" placeholder="Confirm password" onChange={e => setPasswordConfirm(e.target.value)} />
                        
                        <label style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ accentColor: '#3b82f6', width: '16px', height: '16px' }} /> 
                          <span>I agree to the <span className="text-link">Terms & Conditions</span></span>
                        </label>

                        <button className="primary-btn" style={{ marginTop: '15px' }} onClick={async () => {
                          if (!name || !studentId) return alert("정보를 모두 입력해주세요.");
                          if (password.length < 6) return alert("❌ 비밀번호는 6자리 이상이어야 합니다.");
                          if (password !== passwordConfirm) return alert("❌ 비밀번호가 일치하지 않습니다.");
                          if (!agreed) return alert("🚨 약관에 동의해주세요.");
                          try {
                            await updatePassword(auth.currentUser, password);
                            await updateProfile(auth.currentUser, { displayName: name });
                            await setDoc(doc(db, "User", auth.currentUser.uid), { name, studentNo: studentId, email: realEmail, role: 'CLIENT', createdAt: serverTimestamp() });
                            alert("🎉 최종 가입 완료!");
                            await signOut(auth);
                            handleCancelRegistration();
                          } catch(e) { alert("가입 오류: " + e.message); }
                        }}>Create account</button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {isForgotPasswordMode && (
              <>
                <h1 style={{ color: '#fff', fontSize: '2rem', margin: '0 0 10px 0', fontWeight: '900' }}>비밀번호 찾기</h1>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', margin: '0 0 40px 0', lineHeight: '1.5' }}>
                  가입하신 이메일 주소를 입력하시면<br/>재설정 링크를 보내드립니다.
                </p>
                
                <input className="form-input" type="email" placeholder="Email Address" onChange={e => setResetStudentId(e.target.value)} style={{ marginBottom: '20px' }} />
                
                <button className="primary-btn" style={{ marginBottom: '20px' }} onClick={async () => {
                  if (!resetStudentId || !resetStudentId.includes('@')) return alert("올바른 이메일 주소를 입력해주세요.");
                  try {
                    await sendPasswordResetEmail(auth, resetStudentId, { url: 'https://library-pwa-psi.vercel.app/reset-password', handleCodeInApp: true });
                    alert(`✅ 메일 발송 완료!`);
                    setIsForgotPasswordMode(false); setResetStudentId('');
                  } catch (error) { alert(`❌ 오류가 발생했습니다.\n${error.message}`); }
                }}>Send Reset Link</button>
                
                <div style={{ textAlign: 'center' }}>
                  <span className="text-link" onClick={() => setIsForgotPasswordMode(false)} style={{ fontSize: '0.9rem' }}>로그인으로 돌아가기</span>
                </div>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
};

export default Auth;