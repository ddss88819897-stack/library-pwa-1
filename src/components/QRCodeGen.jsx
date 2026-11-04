import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

const REFRESH_SEC = 15;

// 15초마다 "아이디_타임스탬프" 로 갱신되는 동적 QR (캡처본 재사용 방지)
function QRCodeGen({ studentId, size = 200 }) {
  const [qrValue, setQrValue] = useState(() => `${studentId}_${Date.now()}`);
  const [timeLeft, setTimeLeft] = useState(REFRESH_SEC);

  useEffect(() => {
    setQrValue(`${studentId}_${Date.now()}`);
    setTimeLeft(REFRESH_SEC);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setQrValue(`${studentId}_${Date.now()}`);
          return REFRESH_SEC;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [studentId]);

  const pct = (timeLeft / REFRESH_SEC) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', padding: 14, borderRadius: 24, background: '#fff', boxShadow: '0 30px 60px -20px rgba(109,141,255,.6), 0 0 0 1px rgba(255,255,255,.2)' }}>
        <QRCodeCanvas value={qrValue} size={size} bgColor="#ffffff" fgColor="#0b1030" level="H" />
      </div>
      <div style={{ width: size * 0.9, maxWidth: '100%' }}>
        <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--grad)', transition: 'width 1s linear' }} />
        </div>
        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: '.8rem', fontWeight: 600, color: 'var(--text-3)' }}>
          <span className="sl-num" style={{ color: 'var(--cyan)', fontWeight: 800 }}>{timeLeft}초</span> 후 자동 갱신 · 캡처본은 인증되지 않습니다
        </p>
      </div>
    </div>
  );
}

export default QRCodeGen;
