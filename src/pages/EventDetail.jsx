import React, { useState } from 'react';
import { format } from 'date-fns';

export default function EventDetail({ event, onBack }) {
  const [isImageZoomed, setIsImageZoomed] = useState(false);

  if (!event) return null;

  const isNotice = event._type === 'NOTICE';

  // 💡 [핵심] "Invalid Date" 에러를 완벽하게 막아주는 강력한 날짜 포맷 함수
  const formatDate = (dateValue) => {
    if (!dateValue) return '날짜 정보 없음';
    try {
      // Firebase Timestamp 객체인 경우
      if (dateValue.toDate) {
        return format(dateValue.toDate(), 'yyyy.MM.dd HH:mm');
      }
      // 일반 문자열이나 Date 객체인 경우
      return format(new Date(dateValue), 'yyyy.MM.dd HH:mm');
    } catch (e) {
      return '날짜 정보 없음';
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', padding: window.innerWidth < 768 ? '20px 10px' : '40px 20px', boxSizing: 'border-box' }}>
      
      {/* 이미지 확대 보기 모달 */}
      {isImageZoomed && event.imageUrl && (
        <div 
          onClick={() => setIsImageZoomed(false)}
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.9)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'zoom-out' }}
        >
          <img src={event.imageUrl} alt="확대된 이미지" style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain', borderRadius: '12px' }} />
        </div>
      )}

      <div style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', zIndex: 10 }}>
        
        {/* 1. 상단 네비게이션 (뒤로 가기) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 20px', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: '800', backdropFilter: 'blur(10px)', transition: '0.3s', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
            ◀ 목록으로
          </button>
        </div>

        {/* 2. 메인 컨텐츠 영역 (글래스모피즘 카드) */}
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
          
          {/* 2-1. 게시글 헤더 (제목 및 메타 정보) */}
          <div style={{ padding: window.innerWidth < 768 ? '25px 20px' : '40px 40px 20px 40px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ 
              display: 'inline-block', padding: '6px 14px', 
              background: isNotice ? 'rgba(59, 130, 246, 0.2)' : 'rgba(236, 72, 153, 0.2)', 
              color: isNotice ? '#93c5fd' : '#f9a8d4', 
              borderRadius: '8px', fontSize: '0.85rem', fontWeight: '900', marginBottom: '15px', 
              border: `1px solid ${isNotice ? 'rgba(59,130,246,0.4)' : 'rgba(236,72,153,0.4)'}` 
            }}>
              {isNotice ? '📢 공지사항' : '🎉 이벤트'}
            </span>
            
            <h1 style={{ margin: '0 0 20px 0', fontSize: window.innerWidth < 768 ? '1.6rem' : '2.2rem', color: '#fff', fontWeight: '900', lineHeight: '1.4', wordBreak: 'keep-all' }}>
              {event.title || event.name}
            </h1>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', fontWeight: '600' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', fontWeight: '900', fontSize: '0.8rem' }}>
                  관
                </div>
                <span style={{ color: 'rgba(255,255,255,0.8)' }}>관리자</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span>{formatDate(event.createdAt || event.date || event.startDate)}</span>
              </div>
            </div>
          </div>

          {/* 2-2. 게시글 본문 */}
          <div style={{ padding: window.innerWidth < 768 ? '25px 20px' : '40px' }}>
            
            {/* 첨부 이미지 영역 (표준 커뮤니티 배치) */}
            {event.imageUrl && (
              <div style={{ marginBottom: '30px', textAlign: 'center' }}>
                <img 
                  src={event.imageUrl} 
                  alt="게시글 첨부" 
                  onClick={() => setIsImageZoomed(true)}
                  style={{ width: '100%', maxHeight: '500px', objectFit: 'contain', borderRadius: '16px', background: 'rgba(0,0,0,0.3)', cursor: 'zoom-in', border: '1px solid rgba(255,255,255,0.1)' }} 
                />
                <p style={{ margin: '10px 0 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>🔍 이미지를 클릭하면 크게 볼 수 있습니다.</p>
              </div>
            )}

            {/* 텍스트 컨텐츠 영역 */}
            <div style={{ 
              color: 'rgba(255,255,255,0.85)', 
              fontSize: '1.05rem', 
              lineHeight: '1.8', 
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-word',
              minHeight: '150px'
            }}>
              {event.content || "상세 내용이 없습니다."}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}