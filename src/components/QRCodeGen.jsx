import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

function QRCodeGen({ studentId }) {
  const [qrValue, setQrValue] = useState('');
  const [timeLeft, setTimeLeft] = useState(15);

  useEffect(() => {
    // 1️⃣ QR코드 내용물 갱신 함수 (학번 + 현재시간)
    const updateQRCode = () => {
      const currentTime = Date.now(); 
      setQrValue(`${studentId}_${currentTime}`);
      setTimeLeft(15); 
    };

    updateQRCode(); // 처음 실행

    // 2️⃣ 1초 타이머
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          updateQRCode(); // 0초 되면 QR 갱신
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer); // 정리
  }, [studentId]);

  return (
    /* 🚨 [디자인 변경 핵심] 밑에 카드들과 똑같은 스타일 적용 */
    <div style={{ 
      background: '#fff',          // 흰색 배경
      padding: '30px',             // 넉넉한 안쪽 여백
      borderRadius: '25px',        // 둥근 모서리 (패널티 카드와 동일)
      boxShadow: '0 4px 15px rgba(0,0,0,0.05)', // 은은한 그림자 (통일)
      textAlign: 'center', 
      marginBottom: '30px'
    }}>
      
      {/* 🏷️ 제목 스타일 변경 (밑에 h2들과 통일) */}
      <h2 style={{ 
        margin: '0 0 20px 0', 
        fontSize: '1.6rem', 
        fontWeight: '900',          // 아주 굵게
        color: '#1e293b'            // 진한 네이비/그레이
      }}>
        나의 QR 코드
      </h2>
      
      {/* 🖼️ QR 코드 주변 디자인 (깔끔하게 하얀 박스 안에 배치) */}
      <div style={{ 
        padding: '15px', 
        background: '#fff', 
        display: 'inline-block', 
        borderRadius: '15px', 
        border: '1px solid #e2e8f0', // 아주 연한 테두리 추가로 깔끔함 업
        boxShadow: '0 2px 5px rgba(0,0,0,0.02)', // 아주 미세한 그림자
        marginBottom: '20px'
      }}>
        <QRCodeCanvas 
          value={qrValue} 
          size={200} 
          bgcolor={"#ffffff"}
          fgcolor={"#1a237e"} // 기존 유저님의 예쁜 파란색 유지
          level={"H"} 
        />
      </div>

      {/* 🆔 학번 표시 스타일 변경 (패널티 수치처럼 굵고 크고 파랗게!) */}
      <p style={{ 
        margin: '0 0 10px 0', 
        fontSize: '1.8rem',         // 크게
        fontWeight: '900',          // 아주 굵게
        color: '#2563eb'            // 포인트 파란색
      }}>
        {studentId}
      </p>
      
      {/* ⏳ 타이머 UI 변경 (좀 더 깔끔하고 작게 정보 전달용으로) */}
      <div style={{ 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: '6px', 
        marginBottom: '15px',
        background: '#fee2e2',     // 연한 빨간색 배경 바박스
        padding: '8px 15px', 
        borderRadius: '20px',       // 캡슐 모양
        display: 'inline-flex'      // 크기 자동 조절
      }}>
        <span style={{ fontSize: '1.1rem' }}>⌛</span>
        <span style={{ 
          color: '#dc2626',         // 빨간색
          fontWeight: 'bold', 
          fontSize: '0.95rem' 
        }}>
          남은 시간: {timeLeft}초
        </span>
      </div>
      
      {/* 📝 주의사항 스타일 변경 (연하고 얇게) */}
      <p style={{ 
        margin: 0, 
        fontSize: '0.85rem', 
        color: '#94a3b8',           // 연한 그레이
        fontWeight: 'normal' 
      }}>
        * 스크린샷 캡처본으로는 입실할 수 없습니다.
      </p>
    </div>
  );
}

export default QRCodeGen;