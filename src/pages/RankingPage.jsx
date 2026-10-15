import React, { useState, useEffect } from 'react';
import { db } from '../firebase'; // 기존 파이어베이스 세팅 유지

export default function RankingPage({ onBack, user }) {
  const [filter, setFilter] = useState('ALL'); // 'ALL', 'MONTH', 'WEEK'
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // 내 기록 초기값 세팅 (user 정보 기반)
  const [myRecord, setMyRecord] = useState({ 
    rank: '-', 
    name: user?.displayName || '익명 (나)', 
    email: user?.email || 'tkdduf010305',
    time: 0 
  });

  // 💡 기존에 작성해두신 순위 데이터를 불러오는(Fetch) 로직이 있다면 이 안에 넣어주세요!
  useEffect(() => {
    setLoading(true);
    // 예시: fetchRankings(filter).then(data => setRankings(data));
    
    // 데이터 불러오기 완료 시뮬레이션
    setTimeout(() => {
      setLoading(false);
    }, 300);
  }, [filter]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', padding: window.innerWidth < 768 ? '20px 10px' : '40px', boxSizing: 'border-box' }}>
      
      {/* 메인 글래스 카드 컨테이너 */}
      <div style={{ 
        maxWidth: '850px', 
        margin: '0 auto', 
        background: 'rgba(255, 255, 255, 0.03)', 
        borderRadius: '24px', 
        border: '1px solid rgba(255, 255, 255, 0.1)', 
        backdropFilter: 'blur(20px)', 
        WebkitBackdropFilter: 'blur(20px)', 
        padding: window.innerWidth < 768 ? '25px 20px' : '40px', 
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '80vh'
      }}>

        {/* 1. 상단 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '35px' }}>
           <h2 style={{ margin: 0, color: '#fff', fontSize: window.innerWidth < 768 ? '1.4rem' : '1.7rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '10px', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
             🏆 도서관 이용자 순위
           </h2>
           <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 16px', borderRadius: '12px', color: '#fff', fontWeight: '800', cursor: 'pointer', transition: '0.3s', backdropFilter: 'blur(5px)' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
             ◀ 뒤로
           </button>
        </div>

        {/* 2. 필터 탭 버튼 영역 */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '40px', flexWrap: 'wrap' }}>
          {[
            { id: 'ALL', label: '전체' },
            { id: 'MONTH', label: '최근 한 달' },
            { id: 'WEEK', label: '최근 일주일' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                padding: '12px 24px',
                borderRadius: '14px',
                fontWeight: '800',
                fontSize: '0.95rem',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                // ⭐️ 주황색 대신 네온 블루 그라데이션 적용
                background: filter === tab.id ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'rgba(255,255,255,0.05)',
                color: filter === tab.id ? '#fff' : 'rgba(255,255,255,0.5)',
                border: filter === tab.id ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255,255,255,0.1)',
                boxShadow: filter === tab.id ? '0 8px 20px rgba(37, 99, 235, 0.3)' : 'none'
              }}
              onMouseEnter={(e) => { if (filter !== tab.id) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { if (filter !== tab.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 3. 순위 리스트 출력 영역 (남은 공간을 모두 차지하도록 flex: 1 설정) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', color: 'rgba(255,255,255,0.5)', fontWeight: '700' }}>
              ⏳ 데이터를 불러오는 중...
            </div>
          ) : rankings.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px dashed rgba(255,255,255,0.1)', minHeight: '250px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '15px', opacity: 0.5 }}>📊</div>
              <p style={{ margin: 0, fontWeight: '700', fontSize: '1.1rem' }}>아직 집계된 이용 기록이 없습니다.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
               {/* 💡 추후 순위 데이터가 들어오면 Map을 돌려 렌더링할 부분 */}
               {rankings.map((user, idx) => (
                 <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '16px 20px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                     <span style={{ fontSize: '1.2rem', fontWeight: '900', color: idx < 3 ? '#fbbf24' : '#94a3b8', width: '25px', textAlign: 'center' }}>{idx + 1}</span>
                     <span style={{ color: '#fff', fontWeight: '700' }}>{user.name}</span>
                   </div>
                   <span style={{ color: '#60a5fa', fontWeight: '900' }}>{user.time}분</span>
                 </div>
               ))}
            </div>
          )}
        </div>

        {/* 4. 내 이용 기록 (하단 고정형 디자인) */}
        <div style={{ marginTop: '40px', paddingTop: '30px', borderTop: '1px dashed rgba(255,255,255,0.15)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#fff', fontSize: '1.2rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
            👤 내 이용 기록
          </h3>
          
          <div style={{ 
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.05))', 
            border: '1px solid rgba(96, 165, 250, 0.3)', 
            borderRadius: '20px', 
            padding: '20px 25px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: window.innerWidth < 768 ? '15px' : '25px' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#60a5fa', width: '35px', textAlign: 'center' }}>
                {myRecord.rank}
              </span>
              <div>
                <p style={{ margin: 0, color: '#fff', fontWeight: '900', fontSize: '1.15rem' }}>{myRecord.name}</p>
                <p style={{ margin: '4px 0 0 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontWeight: '600' }}>{myRecord.email}</p>
              </div>
            </div>
            
            <div style={{ 
              background: 'rgba(255,255,255,0.1)', 
              border: '1px solid rgba(255,255,255,0.2)', 
              padding: '10px 20px', 
              borderRadius: '14px', 
              color: '#fff', 
              fontWeight: '900', 
              fontSize: '1.1rem',
              boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
            }}>
              {myRecord.time}분
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}