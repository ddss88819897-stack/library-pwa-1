import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, query, where, updateDoc } from 'firebase/firestore';
import { db } from '../firebase'; 
import QRCodeGen from '../components/QRCodeGen';

const MyPage = ({ user, setViewMode }) => {
  const [userData, setUserData] = useState(null);
  const [userDocId, setUserDocId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [allBooks, setAllBooks] = useState([]);
  const [kakaoAlerts, setKakaoAlerts] = useState([]);
  const [phoneInput, setPhoneInput] = useState('');
  const [editingPhone, setEditingPhone] = useState(false);
  const [loading, setLoading] = useState(true);

  const isMobile = window.innerWidth < 768;
  const emailPrefix = user?.email ? user.email.split('@')[0] : '';
  const myId = userData?.studentNo || user?.studentNo || emailPrefix || user?.uid || '';

  useEffect(() => {
    if (!user) return;

    const unsubUser = onSnapshot(collection(db, 'User'), (snap) => {
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const matched = allUsers.find(u => {
        const uPrefix = u.email ? u.email.split('@')[0] : '';
        return (
          (user.uid && (u.id === user.uid || u.uid === user.uid)) ||
          (user.studentNo && (String(u.studentNo) === String(user.studentNo) || u.id === String(user.studentNo))) ||
          (user.email && u.email === user.email) ||
          (emailPrefix && (uPrefix === emailPrefix || u.id === emailPrefix || String(u.studentNo) === emailPrefix))
        );
      });
      if (matched) {
        setUserData(matched);
        setUserDocId(matched.id);
        setPhoneInput(matched.phone || '010-1234-5678');
      }
    });

    const unsubBooks = onSnapshot(collection(db, 'Books'), (snap) => {
      setAllBooks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubNotifs = onSnapshot(collection(db, 'Notifications'), (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(n =>
          (user.uid && n.uid === user.uid) ||
          (user.email && n.userId === user.email) ||
          (emailPrefix && (n.studentNo === emailPrefix || n.userId === emailPrefix)) ||
          (userData?.studentNo && String(n.studentNo) === String(userData.studentNo))
        )
        .sort((a, b) => {
          const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return tB - tA;
        });
      setKakaoAlerts(list);
    });

    const logsRef = collection(db, 'Log'); 
    const unsubLogs = onSnapshot(logsRef, (logSnap) => {
      const logList = logSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(log => 
          log.uid === user?.uid || 
          log.uid === user?.email ||        
          log.studentNo === user?.studentNo || 
          log.studentNo === emailPrefix ||
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

    const myUserId = user?.email || user?.studentNo; 
    const seatsRef = collection(db, 'Seat');
    const q = query(seatsRef, where("userId", "==", myUserId));
    const unsubSeat = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "modified") {
          const seatData = change.doc.data();
          if (seatData.status === "OCCUPIED") {
            alert('✅ QR 인증 완료!\n자리 사용을 시작합니다.');
            if (setViewMode) setViewMode('MAP');
          }
        }
      });
    });

    return () => {
      unsubUser();
      unsubBooks();
      unsubNotifs();
      unsubLogs();
      unsubSeat(); 
    };
  }, [user, setViewMode, userData?.studentNo]);

  const handleSavePhone = async () => {
    if (!userDocId) return alert("회원 정보를 찾을 수 없습니다.");
    try {
      await updateDoc(doc(db, 'User', userDocId), { phone: phoneInput.trim() });
      setEditingPhone(false);
      alert(`✅ 카카오톡 도서 알림 수신 번호(${phoneInput.trim()})가 저장되었습니다!`);
    } catch (e) {
      alert("전화번호 저장 실패: " + e.message);
    }
  };

  const handleCancelMyReservation = async (book) => {
    if (!window.confirm(`[${book.title}] 도서의 대출 예약을 취소하시겠습니까?`)) return;
    try {
      const updated = (book.reservations || []).filter(r =>
        r.userId !== user?.email && String(r.studentNo) !== String(myId) && r.uid !== user?.uid
      );
      await updateDoc(doc(db, 'Books', book.id), { reservations: updated });
      alert("✅ 예약이 취소되었습니다.");
    } catch (e) {
      alert("취소 실패: " + e.message);
    }
  };

  const myLoanedBooks = [];
  allBooks.forEach(book => {
    (book.loans || []).forEach(loan => {
      if (
        (user?.uid && loan.uid === user.uid) ||
        (user?.email && loan.userId === user.email) ||
        (myId && String(loan.studentNo) === String(myId)) ||
        (emailPrefix && (loan.studentNo === emailPrefix || loan.userId === emailPrefix))
      ) {
        myLoanedBooks.push({ book, loan });
      }
    });
  });

  const myReservedBooks = [];
  allBooks.forEach(book => {
    (book.reservations || []).forEach((res, idx) => {
      if (
        (user?.uid && res.uid === user.uid) ||
        (user?.email && res.userId === user.email) ||
        (myId && String(res.studentNo) === String(myId)) ||
        (emailPrefix && (res.studentNo === emailPrefix || res.userId === emailPrefix))
      ) {
        myReservedBooks.push({ book, res, order: idx + 1 });
      }
    });
  });

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
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', padding: '0 10px' }}>
          <h1 style={{ color: '#fff', fontSize: isMobile ? '1.6rem' : '2rem', fontWeight: '900', margin: 0, textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>마이페이지</h1>
        </div>

        <div style={{ ...glassCardStyle, alignItems: 'center', padding: isMobile ? '25px 15px' : '35px' }}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>나의 모바일 출입증</h2>
          <div style={{ width: '100%', maxWidth: '340px' }}>
            <QRCodeGen
              studentId={user?.email || user?.studentNo || "이메일없음"}
              userName={userData?.name || user?.name || user?.displayName}
            />
          </div>
        </div>

        <div style={glassCardStyle}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff', borderLeft: '4px solid #3b82f6', paddingLeft: '12px' }}>
            📚 나의 도서 대출 및 예약 현황
          </h2>

          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: '900', color: '#86efac' }}>
            📖 현재 대출 도서 목록 ({myLoanedBooks.length}권)
          </h3>
          {myLoanedBooks.length === 0 ? (
            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', marginBottom: '22px' }}>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem', fontWeight: '700' }}>현재 대출 중인 도서가 없습니다.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '22px' }}>
              {myLoanedBooks.map(({ book, loan }, idx) => {
                const isOverdue = loan.dueDate && new Date(loan.dueDate) < new Date();
                return (
                  <div key={loan.loanId || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '15px 18px', borderRadius: '16px', background: isOverdue ? 'rgba(239, 68, 68, 0.12)' : 'rgba(255,255,255,0.05)', border: isOverdue ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid rgba(255,255,255,0.1)' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ color: '#fff', fontWeight: '900', fontSize: '1rem' }}>{book.title}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', background: isOverdue ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.2)', color: isOverdue ? '#fca5a5' : '#86efac' }}>
                          {isOverdue ? '🚨 연체중 (즉시 반납 요망)' : '✅ 대출중'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', fontWeight: '600' }}>
                        대출일: {loan.borrowedAt ? new Date(loan.borrowedAt).toLocaleDateString('ko-KR') : '-'} · 반납예정일: <strong style={{ color: isOverdue ? '#fca5a5' : '#93c5fd' }}>{loan.dueDate ? new Date(loan.dueDate).toLocaleDateString('ko-KR') : '-'}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: '900', color: '#fde047' }}>
            📌 예약 대기 도서 목록 ({myReservedBooks.length}권)
          </h3>
          {myReservedBooks.length === 0 ? (
            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.9rem', fontWeight: '700' }}>현재 예약 대기 중인 도서가 없습니다.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {myReservedBooks.map(({ book, order }, idx) => (
                <div key={book.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '15px 18px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ color: '#fde047', fontWeight: '900', fontSize: '0.85rem' }}>대기 {order}순위</span>
                      <span style={{ color: '#fff', fontWeight: '900', fontSize: '1rem' }}>{book.title}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: book.availableQuantity > 0 ? '#86efac' : 'rgba(255,255,255,0.5)', fontWeight: '700' }}>
                      {book.availableQuantity > 0 ? '🔔 도서가 반납되었습니다! 지금 방문하여 대출하세요.' : '⏳ 반납 대기 중 (대출 전환 시 현재 대출 목록으로 자동 이동합니다)'}
                    </div>
                  </div>
                  <button onClick={() => handleCancelMyReservation(book)} style={{ padding: '8px 14px', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '900', cursor: 'pointer' }}>
                    예약 취소
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={glassCardStyle}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#fff', borderLeft: '4px solid #60a5fa', paddingLeft: '12px' }}>
      🔔 도서 알림함
    </h2>
    <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '5px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: '900', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
      📱 알림 연동 번호: {userData?.phone || phoneInput || '010-1234-5678'}
    </span>
  </div>

  <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', alignItems: 'center', flexWrap: 'wrap' }}>
    {editingPhone ? (
      <>
        <input
          type="text"
          value={phoneInput}
          onChange={e => setPhoneInput(e.target.value)}
          placeholder="010-0000-0000"
          style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(96, 165, 250, 0.5)', color: '#fff', fontWeight: '700', outline: 'none' }}
        />
        <button onClick={handleSavePhone} style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '900', cursor: 'pointer' }}>저장</button>
        <button onClick={() => setEditingPhone(false)} style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '800', cursor: 'pointer' }}>취소</button>
      </>
    ) : (
      <button onClick={() => setEditingPhone(true)} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.07)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.35)', borderRadius: '10px', fontSize: '0.82rem', fontWeight: '800', cursor: 'pointer' }}>
        ✏️ 알림 수신 번호 변경
      </button>
    )}
  </div>

  {kakaoAlerts.length === 0 ? (
    <div style={{ padding: '22px', background: 'rgba(255,255,255,0.02)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center' }}>
      <p style={{ margin: 0, color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', fontWeight: '700' }}>수신된 도서 알림 메시지가 없습니다.</p>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '280px', overflowY: 'auto' }}>
      {kakaoAlerts.map(alertItem => (
        <div key={alertItem.id} style={{ borderRadius: '14px', overflow: 'hidden', border: '1px solid rgba(96, 165, 250, 0.4)', background: 'rgba(15, 23, 42, 0.9)' }}>
          <div style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', padding: '8px 14px', fontSize: '0.8rem', fontWeight: '900', display: 'flex', justifyContent: 'space-between' }}>
            <span>🔔 시스템 알림 ({alertItem.phone || userData?.phone || '010-1234-5678'})</span>
            <span>{alertItem.createdAt?.toDate ? alertItem.createdAt.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '방금 전'}</span>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <div style={{ color: alertItem.type === 'BOOK_OVERDUE' ? '#fca5a5' : '#93c5fd', fontWeight: '900', fontSize: '0.9rem', marginBottom: '4px' }}>{alertItem.title}</div>
            <div style={{ color: '#e2e8f0', fontSize: '0.85rem', lineHeight: '1.45', fontWeight: '600' }}>{alertItem.message}</div>
          </div>
        </div>
      ))}
    </div>
  )}
</div>

        <div style={glassCardStyle}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff', borderLeft: '4px solid #ef4444', paddingLeft: '12px' }}>나의 패널티 현황 (좌석 노쇼 및 도서 연체)</h2>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', minWidth: '150px' }}>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '700' }}>현재 패널티 누적</p>
              <p style={{ margin: '10px 0 0 0', fontSize: '2rem', fontWeight: '900', color: userData?.penaltyCount >= 2 ? '#fca5a5' : '#93c5fd' }}>
                {userData?.penaltyCount || 0} <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)' }}>/ 3회</span>
              </p>
            </div>
            
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', minWidth: '150px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '700' }}>이용 정지 해제일</p>
              <p style={{ margin: '10px 0 0 0', fontSize: '1.1rem', fontWeight: '900', color: userData?.penaltyUntil ? '#fca5a5' : '#34d399' }}>
                {userData?.penaltyUntil 
                  ? new Date(userData.penaltyUntil.toDate ? userData.penaltyUntil.toDate() : userData.penaltyUntil).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                  : '정지 내역 없음'}
              </p>
              {userData?.overdueBookTitle && (
                <span style={{ marginTop: '6px', fontSize: '0.75rem', color: '#fca5a5', fontWeight: '800' }}>사유: '{userData.overdueBookTitle}' 도서 연체</span>
              )}
            </div>
          </div>
        </div>

        <div style={glassCardStyle}>
          <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff', borderLeft: '4px solid #60a5fa', paddingLeft: '12px' }}>최근 좌석 이용 이력</h2>
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
                let actualMinutes = Math.max(0, log.usedMinutes || 0);
                if (!dailyData[dateString]) dailyData[dateString] = { totalMinutes: 0, sortKey: logDate.getTime() };
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
                {groupedLogs.map((item, index) => {
                  const h = Math.floor(item.totalMinutes / 60); 
                  const m = item.totalMinutes % 60;             
                  let durationText = `${h > 0 ? `${h}시간 ` : ''}${m > 0 ? `${m}분` : ''}`.trim() || '1분 미만'; 
                  return (
                    <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'rgba(255,255,255,0.05)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <div style={{ fontSize: '1rem', fontWeight: '800', color: '#fff' }}>{item.dateString}</div>
                      <div style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', padding: '6px 12px', borderRadius: '12px', fontWeight: '900', fontSize: '0.85rem', border: '1px solid rgba(59,130,246,0.3)' }}>
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

