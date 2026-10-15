import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase'; 
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, query, where, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore'; 
import { format, addDays, startOfDay } from 'date-fns';

import MyPage from './pages/MyPage';
import ScannerPage from './pages/Scanner';
import SeatModal from './components/SeatModal';
import Auth from './pages/Auth';
import FloorMap from './components/FloorMap';
import AdminDashboard from './pages/AdminDashboard';
import QRCodeGen from './components/QRCodeGen'; 

import EventBoard from './pages/EventBoard';
import EventDetail from './pages/EventDetail';
import AdminEvents from './pages/AdminEvents';
import BookSearch from './pages/BookSearch'; 
import AdminSearch from './pages/AdminSearch'; // 🌟 [추가된 부분] 관리자 검색 모듈 임포트

import { useLibraryData } from './hooks/useLibraryData';
import { useUserSession } from './hooks/useUserSession';

import RankingPage from './pages/RankingPage';
import FloatingChatbot from './components/FloatingChatbot';
import { handleLibraryAction } from './api/libraryService'; 
import { updateSeatsLayout } from './api/seatApi';

const floorTitles = { '1층': '1층 열람실', '2층': '2층 집중구역', '4층': '4층 스터디룸' };

const timeOptions = [...Array(28).keys()].map(i => {
  const h = Math.floor(i / 2) + 9;
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, '0')}:${m}`;
});

const getTime = (t) => {
  if (!t) return 0;
  if (t.toDate) return t.toDate().getTime();
  return new Date(t).getTime();
};

function App() {
  const { seats, user, currentUserData } = useLibraryData();
  useUserSession(user); 

  const scrollRef = useRef(null);
  const prevBooksRef = useRef({}); // 💡 도서 반납(여분 발생) 감지를 위한 캐시

  const [activeFloor, setActiveFloor] = useState('1층');
  const [viewMode, setViewMode] = useState('HOME'); 
  const [isBookingMode, setIsBookingMode] = useState(true);
  const [showIdQR, setShowIdQR] = useState(false);
  const [dbNotices, setDbNotices] = useState([]);
  const [boardTab, setBoardTab] = useState('NOTICE');
  
  const [systemAlert, setSystemAlert] = useState(null);

  useEffect(() => {
    if (systemAlert) {
      const timer = setTimeout(() => { setSystemAlert(null); }, 6000); 
      return () => clearTimeout(timer);
    }
  }, [systemAlert]);

  const [facilityStatus, setFacilityStatus] = useState({ '1층': 'AUTO', '2층': 'AUTO', '4층': 'AUTO' });
  const [todayReservations, setTodayReservations] = useState([]);

  const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자', '2212020']; 
  const isAdmin = (currentUserData && (ADMIN_IDS.includes(String(currentUserData.studentNo)) || currentUserData.role === 'MANAGER')) || 
                  (user && user.email && ADMIN_IDS.includes(user.email.split('@')[0]));

  const [currentTimeString, setCurrentTimeString] = useState(new Date().toTimeString().substring(0, 5));
  useEffect(() => {
    const timer = setInterval(() => setCurrentTimeString(new Date().toTimeString().substring(0, 5)), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'facilityStatus'), (docSnap) => {
      if (docSnap.exists()) setFacilityStatus(docSnap.data());
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const q = query(collection(db, 'Reservations'), where('date', '==', todayStr));
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, snap => setTodayReservations(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => unsub();
  }, [user]);

  // 🔔 [신규 핵심 기능] 예약한 도서가 반납되어 여분이 생겼을 때 실시간 알람 트리거
  useEffect(() => {
    if (!user) return;
    const myId = currentUserData?.studentNo || user?.email?.split('@')[0] || user?.uid;

    const unsubBooks = onSnapshot(collection(db, 'Books'), (snap) => {
      snap.docs.forEach(docSnap => {
        const book = docSnap.data();
        const bookId = docSnap.id;
        const prevAvail = prevBooksRef.current[bookId];
        const currAvail = book.availableQuantity ?? 0;

        // 내가 이 책을 예약한 사람 명단에 있는지 확인
        const reservations = Array.isArray(book.reservations) ? book.reservations : [];
        const isReservedByMe = reservations.some(r => r.userId === user.email || r.studentNo === myId || r.uid === user.uid);

        // 이전에 여분이 0권이었다가 방금 1권 이상으로 늘어났다면 (반납 발생!)
        if (isReservedByMe && prevAvail !== undefined && prevAvail === 0 && currAvail > 0) {
          const msg = `📚 예약하신 [${book.title}] 도서가 반납되어 대출 가능한 여분이 생겼습니다! 지금 도서관에서 대출해 주세요.`;
          setSystemAlert(msg);
          alert(msg);
        }

        prevBooksRef.current[bookId] = currAvail;
      });
    });

    return () => unsubBooks();
  }, [user, currentUserData]);

  const [systemSettings, setSystemSettings] = useState(null);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'settings'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSystemSettings(data);
        if (data.isExamActive && data.examEndDate) {
          if (new Date() > new Date(data.examEndDate)) {
            updateDoc(doc(db, 'System', 'settings'), { isExamActive: false })
              .then(() => alert("⏰ 시험기간 통제 기간이 종료되어 자동으로 해제되었습니다."));
          }
        }
      }
    });
    return () => unsub();
  }, []);

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const isMobile = windowWidth < 950; 
  const isSmallMobile = windowWidth < 600;

  const [selectedEvent, setSelectedEvent] = useState(null);
  
  useEffect(() => {
    // 🌟 [추가된 부분] 관리자가 아닌 사용자가 ADMIN_SEARCH에 접근하지 못하도록 보안 로직 추가
    if (user && !isAdmin && (viewMode === 'USERS' || viewMode === 'SCANNER' || viewMode === 'EVENTS_ADMIN' || viewMode === 'ADMIN_SEARCH')) {
      setViewMode('HOME');
    }
  }, [user, isAdmin, viewMode]);

  useEffect(() => {
    if (!user) return;
    let eventsList = []; let noticesList = [];
    const mergeAndSetNotices = () => {
      const filteredEvents = eventsList.filter(item => item.type?.toLowerCase().includes('notice') || item.category?.includes('공지') || item.title?.includes('[공지]') || item.name?.includes('[공지]'));
      const formattedNotices = noticesList.map(n => ({ ...n, _type: 'NOTICE' }));
      const combined = [...filteredEvents, ...formattedNotices].sort((a, b) => {
        const timeA = a.createdAt?.toDate?.()?.getTime() || (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt?.toDate?.()?.getTime() || (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });
      setDbNotices(combined.slice(0, 5));
    };
    const unsubE = onSnapshot(collection(db, 'Events'), (snap) => { eventsList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); mergeAndSetNotices(); });
    const unsubN = onSnapshot(collection(db, 'Notices'), (snap) => { noticesList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })); mergeAndSetNotices(); });
    return () => { unsubE(); unsubN(); };
  }, [user]);

  const [notifications, setNotifications] = useState([]);
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("11:00");
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [forceCleanCheck, setForceCleanCheck] = useState(false);

  useEffect(() => {
    const now = new Date();
    let h = now.getHours(); let m = now.getMinutes() < 30 ? 30 : 0;
    if (m === 0) h += 1; 
    if (h >= 9 && h <= 21) {
      const startStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const sIdx = timeOptions.indexOf(startStr);
      if (sIdx !== -1) {
        setStartTime(startStr);
        setEndTime(timeOptions[Math.min(sIdx + 4, timeOptions.length - 1)]);
      }
    }
  }, []);

  const [myActiveTickets, setMyActiveTickets] = useState([]);
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(query(collection(db, 'Reservations'), where('userId', '==', user.email), where('status', 'in', ['RESERVED', 'OCCUPIED'])), { includeMetadataChanges: true }, snap => setMyActiveTickets(snap.docs.map(d => ({id: d.id, ...d.data()}))));
    return () => unsub();
  }, [user]);

  const myTicket = myActiveTickets.find(res => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (res.date < todayStr) return false; 
    if (res.date === todayStr) return res.endTime >= currentTimeString; 
    return true; 
  });

  // ✅ [핵심 추가] QR 모달이 떠 있는 상태에서 키오스크 스캔이 완료되어 OCCUPIED로 바뀌면 모달을 자동으로 닫아줌
  useEffect(() => {
    if (showIdQR && myTicket && myTicket.status === 'OCCUPIED') {
      setShowIdQR(false);
    }
  }, [myTicket, showIdQR]);

  const getRealSeat = () => seats.find(s => s.id === myTicket?.seatId) || { id: myTicket?.seatId };
  
  const handleCloseIdQR = async () => {
    setShowIdQR(false);
    if (myTicket && myTicket.status === 'RESERVED' && myTicket.isImmediate) {
      await handleLibraryAction({ actionType: 'CANCEL_IMMEDIATE', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
    }
  };

  const handleCheckout = async () => await handleLibraryAction({ actionType: 'RETURN', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
  const handleCancel = async () => {
    if (myTicket?.isImmediate && myTicket.status === 'RESERVED') await handleLibraryAction({ actionType: 'CANCEL_IMMEDIATE', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
    else await handleLibraryAction({ actionType: 'CANCEL', seat: getRealSeat(), user, isAdmin, now: new Date(), setSystemAlert });
  };

  const handleStartTimeChange = (e) => {
    const newStart = e.target.value;
    setStartTime(newStart);
    if (newStart >= endTime) {
      const startIdx = timeOptions.indexOf(newStart);
      if (startIdx < timeOptions.length - 1) setEndTime(timeOptions[startIdx + 1]);
    }
  };

  const getFinalStatus = (floor) => {
    const dbStat = facilityStatus[floor] || 'AUTO';
    if (dbStat !== 'AUTO') return dbStat;
    const floorSeats = seats.filter(s => s.floor === floor || String(s.id).startsWith(floor.charAt(0)) || String(s.id).includes(floor));
    if (floorSeats.length === 0) return 'AVAILABLE'; 
    let occupied = 0;
    floorSeats.forEach(seat => {
      if (todayReservations.some(res => res.seatId === seat.id && res.status !== 'RETURNED' && res.status !== 'CANCELLED' && currentTimeString >= res.startTime && currentTimeString < res.endTime)) occupied++;
    });
    const ratio = occupied / floorSeats.length;
    if (ratio >= 0.9) return 'UNAVAILABLE'; 
    if (ratio >= 0.7) return 'CROWDED';     
    return 'AVAILABLE';                     
  };

  const renderFacilityBadge = (floor) => {
    const status = getFinalStatus(floor);
    let text = '이용 가능'; let bg = '#3b82f6';
    if (status === 'CROWDED') { text = '혼잡'; bg = '#f59e0b'; } 
    if (status === 'UNAVAILABLE') { text = '이용 불가'; bg = '#ef4444'; } 
    return <span style={{ background: bg, color: '#fff', fontSize: '0.75rem', fontWeight: '800', padding: '4px 10px', borderRadius: '20px' }}>{text}</span>;
  };

  const handleDeleteSeat = async (seatId) => { try { await deleteDoc(doc(db, "Seat", seatId)); } catch (error) { alert("오류가 발생했습니다."); } };

  if (!user || (user.email && !user.email.includes('@test.com') && (!user.emailVerified || !user.displayName))) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#020617' }}>
        {systemSettings?.isExamActive && (
          <div style={{ background: 'rgba(239, 68, 68, 0.9)', color: '#fff', padding: '15px 20px', textAlign: 'center', fontWeight: '900', fontSize: '1rem', zIndex: 9999 }}>
            🚨 [시험기간 특별 통제] 현재 예약 및 출입이 엄격히 제한됩니다.
          </div>
        )}
        <Auth isExamPeriod={systemSettings?.isExamActive} />
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', backgroundColor: '#020617', fontFamily: "'Inter', 'Pretendard', sans-serif", overflowX: 'hidden' }}>
      
      {/* 🌌 배경 오로라 */}
      <div style={{ position: 'fixed', top: '-10%', left: '-10%', width: '500px', height: '500px', background: '#1e3a8a', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.4, zIndex: 0 }} />
      <div style={{ position: 'fixed', bottom: '-10%', right: '-10%', width: '600px', height: '600px', background: '#0284c7', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.3, zIndex: 0 }} />

      {/* 🔔 시스템 및 도서 반납 실시간 알림 토스트 */}
      {systemAlert && (
        <div style={{ position: 'fixed', top: '85px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(15, 23, 42, 0.95)', color: '#fff', padding: '16px 28px', borderRadius: '50px', fontWeight: '900', fontSize: '0.95rem', zIndex: 999999, boxShadow: '0 15px 35px rgba(0,0,0,0.5)', border: '1px solid #60a5fa', backdropFilter: 'blur(15px)', textAlign: 'center', maxWidth: '90%', wordBreak: 'keep-all' }}>
          {systemAlert}
        </div>
      )}

      {/* 📲 [완벽 복구] QR 인증하기 & 모바일 출입증 모달 팝업 */}
      {showIdQR && (
        <div onClick={handleCloseIdQR} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 999999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(96, 165, 250, 0.4)', borderRadius: '28px', padding: '35px 25px', width: '100%', maxWidth: '380px', textAlign: 'center', boxShadow: '0 25px 50px rgba(0,0,0,0.6)', position: 'relative' }}>
            <div style={{ display: 'inline-block', padding: '6px 14px', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '900', marginBottom: '12px', border: '1px solid rgba(59, 130, 246, 0.4)' }}>
              {myTicket && myTicket.status === 'RESERVED' ? `🎫 좌석 입실 인증 (${myTicket.seatId})` : '🪪 스마트 도서관 출입증'}
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.45rem', fontWeight: '900' }}>
              {myTicket && myTicket.status === 'RESERVED' ? 'QR 인증하기' : '내 모바일 출입증'}
            </h3>
            <p style={{ margin: '0 0 25px 0', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '600' }}>
              키오스크 스캐너에 아래 QR코드를 태그해주세요.
            </p>
            <div style={{ background: '#fff', padding: '20px', borderRadius: '20px', display: 'inline-block', marginBottom: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
              <QRCodeGen studentId={user?.email || currentUserData?.studentNo || "이메일없음"} size={190} />
            </div>
            <p style={{ margin: '0 0 25px 0', color: '#60a5fa', fontWeight: '900', fontSize: '1.1rem' }}>
              {currentUserData?.name || user?.displayName || user?.email?.split('@')[0]} ({currentUserData?.studentNo || user?.email?.split('@')[0]})
            </p>
            <button onClick={handleCloseIdQR} style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', fontWeight: '900', fontSize: '1rem', cursor: 'pointer', boxShadow: '0 8px 20px rgba(37, 99, 235, 0.4)' }}>
              닫기
            </button>
          </div>
        </div>
      )}

      <style>{`
        .glass-nav {
          position: sticky; top: 0; z-index: 1000;
          background: rgba(2, 6, 23, 0.6); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        .hero-section {
          width: 100%; min-height: 70vh;
          background: linear-gradient(to bottom, rgba(2, 6, 23, 0.3), #020617), url('https://images.unsplash.com/photo-1507842217343-583bb7270b66?q=80&w=2000&auto=format&fit=crop') center/cover;
          display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
          padding: 80px 20px; position: relative;
        }
        .glass-card {
          background: rgba(255, 255, 255, 0.05); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 24px; padding: 30px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.3); transition: all 0.3s ease; color: #fff;
        }
        .glass-card:hover { border-color: rgba(96, 165, 250, 0.4); transform: translateY(-3px); }
        .glass-icon-btn {
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
          background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px; padding: 25px 10px; cursor: pointer; transition: 0.3s; color: #fff;
        }
        .glass-icon-btn:hover { background: rgba(255, 255, 255, 0.1); border-color: rgba(96, 165, 250, 0.5); transform: translateY(-5px); }
        .primary-gradient-btn {
          background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: #fff; border: 1px solid rgba(255,255,255,0.2);
          border-radius: 16px; font-weight: 800; padding: 18px 30px; cursor: pointer; transition: 0.3s;
          box-shadow: 0 10px 25px rgba(37, 99, 235, 0.4); font-size: 1.1rem; letter-spacing: 0.5px;
        }
        .primary-gradient-btn:hover { transform: translateY(-3px); box-shadow: 0 15px 35px rgba(37, 99, 235, 0.6); }
        .secondary-glass-btn {
          background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2);
          border-radius: 16px; font-weight: 800; padding: 18px 30px; cursor: pointer; transition: 0.3s;
          backdrop-filter: blur(10px); font-size: 1.1rem;
        }
        .secondary-glass-btn:hover { background: rgba(255, 255, 255, 0.2); transform: translateY(-3px); }
      `}</style>

      {/* 상단 네비게이션 바 */}
      <header className="glass-nav" style={{ padding: '15px 5%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 onClick={() => { setViewMode('HOME'); window.scrollTo({top:0, behavior:'smooth'}); }} style={{ margin: 0, color: '#fff', fontWeight: '900', fontSize: '1.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="#60a5fa" style={{ width: '26px', height: '26px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
          SMART LIB
        </h2>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '15px' }}>
          {isAdmin && !isSmallMobile && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setViewMode('USERS')} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontWeight: '700', cursor: 'pointer' }}>회원관리</button>
              
              {/* 🌟 [추가된 부분] 관리자 배너에 '검색관리' 버튼 추가 */}
              <button onClick={() => setViewMode('ADMIN_SEARCH')} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontWeight: '700', cursor: 'pointer' }}>검색관리</button>
              
              <button onClick={() => setViewMode('EVENTS_ADMIN')} style={{ background: 'transparent', color: '#94a3b8', border: 'none', fontWeight: '700', cursor: 'pointer' }}>시스템관리</button>
              <button onClick={() => setViewMode('SCANNER')} style={{ background: 'transparent', color: '#60a5fa', border: 'none', fontWeight: '800', cursor: 'pointer' }}>QR스캐너</button>
            </div>
          )}
          <span style={{ color: '#e2e8f0', fontSize: '0.9rem', fontWeight: '600' }}>
            {isAdmin ? '관리자' : (currentUserData?.name || user?.displayName || user?.email?.split('@')[0])}님
          </span>
          
          <button onClick={() => setViewMode(viewMode === 'MYPAGE' ? 'HOME' : 'MYPAGE')} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '10px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' }}>
            {viewMode === 'MYPAGE' ? '홈으로' : '마이페이지'}
          </button>

          <button onClick={async () => { if (window.confirm("로그아웃 하시겠습니까?")) await signOut(auth); }} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '10px', padding: '8px 16px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' }}>
            로그아웃
          </button>
        </div>
      </header>

      {/* 라우팅 영역 */}
      <div style={{ position: 'relative', zIndex: 1, paddingBottom: myTicket ? '150px' : '50px' }}>
        {isAdmin && viewMode === 'USERS' && <AdminDashboard />}
        {viewMode === 'MYPAGE' && <MyPage user={user} currentUserData={currentUserData} setViewMode={setViewMode} />}
        {viewMode === 'SCANNER' && isAdmin && <ScannerPage setViewMode={setViewMode} setSystemAlert={setSystemAlert} />}
        {viewMode === 'RANKING' && <RankingPage onBack={() => setViewMode('HOME')} user={user}/>}
        {viewMode === 'SEARCH' && <BookSearch onBack={() => setViewMode('HOME')} user={user} currentUserData={currentUserData} isAdmin={isAdmin} />}
        {viewMode === 'EVENTS' && <EventBoard initialTab={boardTab} onBack={() => setViewMode('HOME')} onSelectEvent={(ev) => { setSelectedEvent(ev); setViewMode('EVENT_DETAIL'); }} onSelectNotice={(notice) => { setSelectedEvent({ ...notice, _type: 'NOTICE' }); setViewMode('EVENT_DETAIL'); }} />}
        {viewMode === 'EVENT_DETAIL' && <EventDetail event={selectedEvent} onBack={() => setViewMode('EVENTS')} />}
        {viewMode === 'EVENTS_ADMIN' && isAdmin && <AdminEvents />}
        
        {/* 🌟 [추가된 부분] 관리자 검색 모듈 라우팅 연결 */}
        {viewMode === 'ADMIN_SEARCH' && isAdmin && <AdminSearch />}

        {(viewMode === 'HOME' || viewMode === 'MAP') && (
          <>
            {viewMode === 'HOME' && (
              <>
                <section className="hero-section">
                  <div style={{ maxWidth: '800px', width: '100%', zIndex: 2 }}>
                    <span style={{ display: 'inline-block', padding: '6px 14px', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.5)', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '800', marginBottom: '20px' }}>
                      2026 FALL SEMESTER
                    </span>
                    <h1 style={{ color: '#fff', fontSize: isMobile ? '2.5rem' : '4rem', fontWeight: '900', lineHeight: '1.2', margin: '0 0 20px 0', textShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                      지식의 바다로<br/>당신을 초대합니다
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', marginBottom: '50px', fontWeight: '500' }}>
                      울산과학대학교 스마트 도서관에서 새로운 영감을 얻어보세요.
                    </p>
                    
                    <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexDirection: isSmallMobile ? 'column' : 'row' }}>
                      <button className="primary-gradient-btn" onClick={() => { setIsBookingMode(true); setSelectedSeat(null); setViewMode('MAP'); scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }}>
                        좌석 예약하러 가기
                      </button>
                      <button className="secondary-glass-btn" onClick={() => setShowIdQR(true)}>
                        내 모바일 출입증
                      </button>
                    </div>
                  </div>
                </section>

                <div ref={scrollRef} style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '40px 5%' }}>
                  <section style={{ marginBottom: '60px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '20px' }}>
                      {[
                        { mode: 'SEARCH', label: '도서 검색', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ width: '32px', height: '32px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg> },
                        { mode: 'MAP', label: '배치도 보기', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg> },
                        { mode: 'EVENTS', tab: 'NOTICE', label: '공지사항', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg> },
                        { mode: 'EVENTS', tab: 'EVENT', label: '이벤트', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.2" stroke="currentColor" style={{ width: '32px', height: '32px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg> },
                        { mode: 'RANKING', label: '이용자 순위', svg: <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={{ width: '32px', height: '32px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> }
                      ].map((item, idx) => (
                        <div key={idx} className="glass-icon-btn" onClick={() => {
                          if(item.mode === 'MAP') { setIsBookingMode(false); setSelectedSeat(null); }
                          if(item.tab) setBoardTab(item.tab);
                          setViewMode(item.mode);
                          window.scrollTo({top:0});
                        }}>
                          {item.svg}
                          <span style={{ fontSize: '0.9rem', fontWeight: '800' }}>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section style={{ marginBottom: '60px' }}>
                    <h3 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: '900', marginBottom: '25px', paddingLeft: '10px', borderLeft: '4px solid #60a5fa' }}>도서관 공간 안내</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                      <div className="glass-card" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '20px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#fff' }}>1층 일반 도서관</h4>
                            {renderFacilityBadge('1층')}
                          </div>
                          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem' }}>열람석 60석, 스터디룸 2개 운영 중</p>
                        </div>
                        <button className="secondary-glass-btn" onClick={() => { setActiveFloor('1층'); setIsBookingMode(false); setViewMode('MAP'); }}>
                          배치도 보기 →
                        </button>
                      </div>

                      <div className="glass-card" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '20px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#fff' }}>2층 집중 열람실</h4>
                            {renderFacilityBadge('2층')}
                          </div>
                          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem' }}>집중석 32석, 그룹 스터디룸 2개 운영 중</p>
                        </div>
                        <button className="secondary-glass-btn" onClick={() => { setActiveFloor('2층'); setIsBookingMode(false); setViewMode('MAP'); }}>
                          배치도 보기 →
                        </button>
                      </div>

                      <div className="glass-card" style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: '20px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#fff' }}>4층 프리미엄 열람실</h4>
                            {renderFacilityBadge('4층')}
                          </div>
                          <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.95rem' }}>개인석, 창가 뷰 테이블 등 총 54석</p>
                        </div>
                        <button className="secondary-glass-btn" onClick={() => { setActiveFloor('4층'); setIsBookingMode(false); setViewMode('MAP'); }}>
                          배치도 보기 →
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="glass-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#fff' }}>새로운 소식</h3>
                      <button onClick={() => { setBoardTab('NOTICE'); setViewMode('EVENTS'); }} style={{ background: 'transparent', color: '#60a5fa', border: 'none', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' }}>더 보기 →</button>
                    </div>
                    <div>
                      {dbNotices.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', padding: '20px 0' }}>등록된 소식이 없습니다.</p>
                      ) : (
                        dbNotices.map((notice, idx) => (
                          <div key={idx} onClick={() => { setSelectedEvent({ ...notice, _type: 'NOTICE' }); setViewMode('EVENT_DETAIL'); }} 
                            style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 0', borderBottom: idx === dbNotices.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}>
                            <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{notice.title || notice.name}</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>{notice.createdAt?.toDate ? format(notice.createdAt.toDate(), 'yyyy-MM-dd') : (notice.date || '')}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}

            {/* 🗺️ MAP 뷰 렌더링 (시간 선택창 & 층별 탭 밸런스 대폭 업그레이드) */}
            {viewMode === 'MAP' && (
              <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '25px 5%' }}>
                <div className="glass-card" style={{ marginBottom: '25px', padding: isSmallMobile ? '20px' : '28px 32px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
                    <button onClick={() => setViewMode('HOME')} style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.2)', fontWeight: '800', fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      ◀ 홈으로
                    </button>
                    <h2 style={{ margin: 0, fontSize: isSmallMobile ? '1.25rem' : '1.5rem', fontWeight: '900', color: '#fff' }}>
                      {isBookingMode ? '📅 실시간 좌석 예약' : '🗺️ 도서관 층별 배치도'}
                    </h2>
                  </div>
                  
                  {isBookingMode && (
                    <div style={{ display: 'grid', gridTemplateColumns: isSmallMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px', background: 'rgba(0,0,0,0.25)', padding: '18px', borderRadius: '18px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div>
                        <label style={{ display: 'block', color: '#93c5fd', fontSize: '0.85rem', fontWeight: '800', marginBottom: '8px' }}>🟢 입실(시작) 시간</label>
                        <select value={startTime} onChange={handleStartTimeChange} style={{ width: '100%', padding: '15px 16px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.9)', color: '#fff', border: '1px solid rgba(96, 165, 250, 0.4)', fontSize: '1.05rem', fontWeight: '800', outline: 'none', cursor: 'pointer' }}>
                          {timeOptions.slice(0, -1).map(t => <option key={t} value={t}>{t} 부터</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', color: '#fca5a5', fontSize: '0.85rem', fontWeight: '800', marginBottom: '8px' }}>🔴 퇴실(종료) 시간</label>
                        <select value={endTime} onChange={(e) => setEndTime(e.target.value)} style={{ width: '100%', padding: '15px 16px', borderRadius: '14px', background: 'rgba(15, 23, 42, 0.9)', color: '#fff', border: '1px solid rgba(248, 113, 113, 0.4)', fontSize: '1.05rem', fontWeight: '800', outline: 'none', cursor: 'pointer' }}>
                          {timeOptions.map(t => <option key={t} value={t} disabled={t <= startTime}>{t} 까지</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '12px' }}>
                    {[
                      { id: '1층', label: '1층 일반열람실' },
                      { id: '2층', label: '2층 집중구역' },
                      { id: '4층', label: '4층 스터디룸' }
                    ].map(floor => (
                      <button key={floor.id} onClick={() => setActiveFloor(floor.id)} 
                        style={{ flex: 1, padding: '16px 10px', borderRadius: '16px', border: activeFloor === floor.id ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.1)', background: activeFloor === floor.id ? 'linear-gradient(135deg, #2563eb, #3b82f6)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: isSmallMobile ? '0.9rem' : '1.05rem', fontWeight: '900', cursor: 'pointer', transition: '0.2s', boxShadow: activeFloor === floor.id ? '0 8px 20px rgba(37, 99, 235, 0.35)' : 'none' }}>
                        {floor.label}
                      </button>
                    ))}
                  </div>
                </div>

                <FloorMap activeFloor={activeFloor} title={floorTitles[activeFloor]} seats={seats} user={user} isAdmin={isAdmin} currentUserData={currentUserData} viewMode={viewMode} now={new Date()} setSelectedSeat={setSelectedSeat} onUpdateSeats={updateSeatsLayout} onDeleteSeat={handleDeleteSeat} />
                
                {isBookingMode && (
                  <SeatModal selectedSeat={selectedSeat} setSelectedSeat={setSelectedSeat} user={user} isAdmin={isAdmin} currentUserData={currentUserData} selectedDate={selectedDate} setSelectedDate={setSelectedDate} startTime={startTime} endTime={endTime} showFullCalendar={showFullCalendar} setShowFullCalendar={setShowFullCalendar} setSystemAlert={setSystemAlert} setShowIdQR={setShowIdQR} forceCleanCheck={forceCleanCheck} setForceCleanCheck={setForceCleanCheck} />
                )}
              </div>
            )}

            {/* 하단 플로팅 예약 티켓 */}
            {myTicket && (
              <div style={{ position: 'fixed', bottom: '30px', left: '50%', transform: 'translateX(-50%)', width: '90%', maxWidth: '450px', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(25px)', WebkitBackdropFilter: 'blur(25px)', borderRadius: '24px', padding: '20px 25px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', border: '1px solid rgba(96, 165, 250, 0.4)', zIndex: 9998 }}>
                {myTicket.status !== 'OCCUPIED' ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <div>
                        <span style={{ background: 'rgba(250, 204, 21, 0.2)', color: '#fde047', border: '1px solid rgba(250, 204, 21, 0.4)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '900' }}>
                          {myTicket.isImmediate ? "⚡ 현장 대기" : (myTicket.date === format(new Date(), 'yyyy-MM-dd') ? "🎫 오늘 예약" : "🎫 사전 예약")}
                        </span>
                        <h3 style={{ margin: '8px 0 0 0', fontSize: '1.3rem', fontWeight: '900', color: '#fff' }}>
                          {myTicket.seatId}
                        </h3>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: '700' }}>이용 시간</p>
                        <p style={{ margin: 0, color: '#60a5fa', fontSize: '1.1rem', fontWeight: '900' }}>{myTicket.startTime} ~ {myTicket.endTime}</p>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setShowIdQR(true)} style={{ flex: 2, padding: '14px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem', boxShadow: '0 4px 15px rgba(37,99,235,0.4)' }}>
                        📲 QR 인증하기
                      </button>
                      <button onClick={handleCancel} style={{ flex: 1, padding: '14px', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', fontWeight: '900', cursor: 'pointer', fontSize: '0.95rem' }}>
                        취소
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ margin: '0 0 6px 0', color: '#60a5fa', fontSize: '0.85rem', fontWeight: '900' }}>👤 {isAdmin ? '관리자' : (currentUserData?.name || user?.displayName || user?.email?.split('@')[0])}님 사용중</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#fff' }}>{myTicket.seatId}</h3>
                        <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: '700' }}>~ {myTicket.endTime}</p>
                      </div>
                    </div>
                    <button onClick={handleCheckout} style={{ padding: '14px 24px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>퇴실하기</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ position: 'fixed', bottom: myTicket ? '160px' : '40px', right: '30px', zIndex: 99999, transition: 'bottom 0.3s ease' }}>
        <FloatingChatbot />
      </div>
    </div>
  );
}

export default App;