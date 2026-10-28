import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const maskName = (name) => {
  if (!name || name === '이름 없음') return '박*열';
  const trimmed = String(name).trim();
  if (trimmed.length <= 1) return trimmed;
  if (trimmed.length === 2) return trimmed[0] + '*';
  return trimmed[0] + '*'.repeat(trimmed.length - 2) + trimmed[trimmed.length - 1];
};

function QRCodeGen({ studentId, userName }) {
  const [qrValue, setQrValue] = useState('');
  const [timeLeft, setTimeLeft] = useState(15);
  const [resolvedName, setResolvedName] = useState('');

  useEffect(() => {
    const updateQRCode = () => {
      const currentTime = Date.now();
      setQrValue(`${studentId}_${currentTime}`);
      setTimeLeft(15);
    };

    updateQRCode();

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          updateQRCode();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [studentId]);

  useEffect(() => {
    let isMounted = true;
    const resolveUserName = async () => {
      const rawId = String(studentId || '');
      const emailPrefix = rawId.includes('@') ? rawId.split('@')[0] : rawId;

      if (userName && userName !== rawId && userName !== emailPrefix && !userName.includes('@') && userName !== '이메일없음') {
        if (isMounted) setResolvedName(userName);
        return;
      }

      if (emailPrefix.toLowerCase().startsWith('tkdduf')) {
        if (isMounted) setResolvedName('박상열');
        return;
      }

      try {
        const snap = await getDocs(collection(db, 'User'));
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const matched = users.find(u => {
          const uPrefix = u.email ? u.email.split('@')[0] : '';
          return (
            (rawId && (u.email === rawId || u.id === rawId || u.uid === rawId || String(u.studentNo) === rawId)) ||
            (emailPrefix && (uPrefix === emailPrefix || u.id === emailPrefix || String(u.studentNo) === emailPrefix))
          );
        });
        if (isMounted) {
          setResolvedName(matched?.name || userName || '박상열');
        }
      } catch (e) {
        if (isMounted) setResolvedName(userName || '박상열');
      }
    };

    resolveUserName();
    return () => { isMounted = false; };
  }, [studentId, userName]);

  const displayMaskedName = maskName(resolvedName || userName || '박상열');

  return (
    <div style={{
      background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.78), rgba(15, 23, 42, 0.94))',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      padding: '28px 22px',
      borderRadius: '24px',
      border: '1px solid rgba(96, 165, 250, 0.3)',
      boxShadow: '0 15px 35px rgba(0, 0, 0, 0.45)',
      textAlign: 'center',
      boxSizing: 'border-box'
    }}>
      <h2 style={{
        margin: '0 0 18px 0',
        fontSize: '1.35rem',
        fontWeight: '900',
        color: '#f8fafc',
        letterSpacing: '-0.3px'
      }}>
        나의 QR 코드
      </h2>

      <div style={{
        padding: '16px',
        background: '#ffffff',
        display: 'inline-block',
        borderRadius: '18px',
        border: '2px solid rgba(96, 165, 250, 0.45)',
        boxShadow: '0 8px 25px rgba(0, 0, 0, 0.35)',
        marginBottom: '18px'
      }}>
        <QRCodeCanvas
          value={qrValue}
          size={190}
          bgColor={"#ffffff"}
          fgColor={"#0f172a"}
          level={"H"}
        />
      </div>

      <p style={{
        margin: '0 0 14px 0',
        fontSize: '1.5rem',
        fontWeight: '900',
        color: '#60a5fa',
        letterSpacing: '1.5px'
      }}>
        {displayMaskedName}
      </p>

      <div style={{
        justifyContent: 'center',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '14px',
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.35)',
        padding: '7px 16px',
        borderRadius: '20px',
        display: 'inline-flex'
      }}>
        <span style={{ fontSize: '1rem' }}>⌛</span>
        <span style={{
          color: '#fca5a5',
          fontWeight: '800',
          fontSize: '0.9rem',
          whiteSpace: 'nowrap'
        }}>
          남은 시간: {timeLeft}초
        </span>
      </div>

      <p style={{
        margin: 0,
        fontSize: '0.8rem',
        color: 'rgba(255, 255, 255, 0.45)',
        fontWeight: '600'
      }}>
        * 스크린샷 캡처본으로는 입실할 수 없습니다.
      </p>
    </div>
  );
}

export default QRCodeGen;

