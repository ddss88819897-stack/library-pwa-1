import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase'; 
import QRCodeGen from '../components/QRCodeGen';

const MyPage = ({ user, setViewMode }) => {
  const [userData, setUserData] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 모바일 화면 체크 (768px 미만이면 true)
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    if (!user || (!user.uid && !user.studentNo)) return;

    const currentUserId = user.uid || user.studentNo;

    // 1️⃣ 내 상태 정보(User 컬렉션) '실시간' 구독
    const userRef = doc(db, 'User', currentUserId);
    const unsubUser = onSnapshot(userRef, (userSnap) => {
      if (userSnap.exists()) {
        setUserData(userSnap.data());
      }
    });

    // 2️⃣ 내 행동 로그(Log 컬렉션) '실시간' 구독 및 필터링
    const logsRef = collection(db, 'Log'); 
    const unsubLogs = onSnapshot(logsRef, (logSnap) => {
      const logList = logSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(log => 
          log.uid === user?.uid || 
          log.uid === user?.email ||       
          log.studentNo === user?.studentNo || 
          log.studentNo === user?.name      
        )
        .sort((a, b) => {
          const timeA = (a.timestamp || a.createdAt)?.toDate ? (a.timestamp || a.createdAt).toDate() : new Date(0);
          const timeB = (b.timestamp || b.createdAt)?.toDate ? (b.timestamp || b.createdAt).toDate() : new Date(0);
          return timeB - timeA;
        });
      
      setLogs(logList);
      setLoading(false);
    });

    // 3️⃣ 내 좌석 상태 감시 (QR 인증 성공 시 MAP으로 튕겨주기 위함)
    const myUserId = user?.email || user?.studentNo; 
    const seatsRef = collection(db, 'Seat');
    const q = query(seatsRef, where("userId", "==", myUserId));
    
    const unsubSeat = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const seatData = change.doc.data();
          if (seatData.status === "OCCUPIED") {
            alert('✅ QR 인증 완료!\n자리 사용을 시작합니다.');
            if (setViewMode) {
              setViewMode('MAP');
            }
          }
        }
      });
    });

    return () => {
      unsubUser();
      unsubLogs();
      unsubSeat(); 
    };
  }, [user, setViewMode]);

  // 공통 글래스모피즘 스타일
  const glassCardStyle = {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: isMobile ? '25px 20px' : '35px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '25px'
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '100px 0', fontWeight: 'bold', color: 'rgba(255,255,255,0.6)' }}>데이터를 불러오는 중입니다... ⏳</div>;

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', padding: isMobile ? '20px 10px' : '40px 20px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto', fontFamily: "'Inter', 'Pretendard', sans-serif" }}>
        
        {/* 상단 타이틀 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', padding: '0 10px' }}>
          <h1 style={{ color: '#fff', fontSize: isMobile ? '1.6rem' : '2rem', fontWeight: '900', margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>마이페이지</h1>
        </div>

        {/* 1️⃣ 모바일 출입증 (QR 코드) */}
        {/* 기존 QRCodeGen을 감싸는 박스를 글래스 테마로 맞추고 여백을 줄임 */}
        <div style={{...glassCardStyle, alignItems: 'center', padding: isMobile ? '25px 15px' : '35px'}}>
           <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>나의 모바일 출입증</h2>
           <div style={{ background: '#fff', padding: '15px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', marginBottom: '15px' }}>
             <QRCodeGen studentId={user?.email || "이메일없음"} size={160} />
           </div>
           <p style={{ margin: 0, color: '#60a5fa', fontWeight: '900', fontSize: '1.1rem' }}>{userData?.name || user?.displayName || user?.email?.split('@')[0]}</p>
           <p style={{ margin: '5px 0 0 0', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: '600' }}>* 캡처된 화면으로는 스캔이 제한될 수 있습니다.</p>
        </div>

        {/* 2️⃣ 나의 패널티 현황 */}
        <div style={glassCardStyle}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff', borderLeft: '4px solid #ef4444', paddingLeft: '12px' }}>나의 패널티 현황</h2>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', minWidth: '150px' }}>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '700' }}>현재 노쇼 누적</p>
              <p style={{ margin: '10px 0 0 0', fontSize: '2rem', fontWeight: '900', color: userData?.penaltyCount >= 2 ? '#fca5a5' : '#93c5fd' }}>
                {userData?.penaltyCount || 0} <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)' }}>/ 3회</span>
              </p>
            </div>
            
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', minWidth: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '700' }}>예약 정지 해제일</p>
              <p style={{ margin: '10px 0 0 0', fontSize: '1.1rem', fontWeight: '900', color: userData?.penaltyUntil ? '#fca5a5' : '#34d399' }}>
                {userData?.penaltyUntil 
                  ? new Date(userData.penaltyUntil.toDate()).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                  : '정지 내역 없음'}
              </p>
            </div>
          </div>
        </div>

        {/* 3️⃣ 최근 이용 이력 */}
        <div style={glassCardStyle}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff', borderLeft: '4px solid #60a5fa', paddingLeft: '12px' }}>최근 이용 이력</h2>
          
          {(() => {
            const dailyData = {};
            
            logs
              .filter(log => log.action === 'RETURN' || log.action === 'AUTO_CHECKOUT')
              .forEach((log) => {
                const logDate = (log.timestamp || log.createdAt)?.toDate ? (log.timestamp || log.createdAt).toDate() : new Date();
                const year = logDate.getFullYear();
                const month = logDate.getMonth() + 1;
                const date = logDate.getDate();
                const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
                const day = dayNames[logDate.getDay()];
                const dateString = `${year}년 ${month}월 ${date}일 ${day}요일`;
                
                let actualMinutes = log.usedMinutes || 0;
                if (actualMinutes < 0) actualMinutes = 0;

                if (!dailyData[dateString]) {
                  dailyData[dateString] = { totalMinutes: 0, sortKey: logDate.getTime() };
                }
                dailyData[dateString].totalMinutes += actualMinutes;
              });

            const groupedLogs = Object.entries(dailyData)
              .sort(([, a], [, b]) => b.sortKey - a.sortKey)
              .map(([dateString, data]) => ({ dateString, totalMinutes: data.totalMinutes }));

            if (groupedLogs.length === 0) {
              return (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontWeight: '700' }}>아직 도서관 이용 기록이 없습니다.</p>
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '5px' }}>
                <style>{`.hide-scroll::-webkit-scrollbar { display: none; } .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
                {groupedLogs.map((item, index) => {
                  const h = Math.floor(item.totalMinutes / 60); 
                  const m = item.totalMinutes % 60;             

                  let durationText = '';
                  if (h > 0) durationText += `${h}시간 `;
                  if (m > 0) durationText += `${m}분`;
                  durationText = durationText.trim() || '1분 미만'; 

                  return (
                    <div key={index} style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                      padding: '16px 20px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.1)', transition: '0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.4)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    >
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#fff' }}>
                        {item.dateString}
                      </div>
                      <div style={{ 
                        background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '6px 12px', 
                        borderRadius: '12px', fontWeight: '900', fontSize: '0.85rem', border: '1px solid rgba(59,130,246,0.3)'
                      }}>
                        {durationText} 이용
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

      </div>
    </div>
  );
};

export default MyPage;