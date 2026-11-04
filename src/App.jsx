import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { auth, db } from './firebase';
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, query, where, deleteDoc } from 'firebase/firestore';
import { format, addDays } from 'date-fns';

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
import AdminSearch from './pages/AdminSearch';
import RankingPage from './pages/RankingPage';
import FloatingChatbot from './components/FloatingChatbot';
import Icon from './components/Icon';

import { useLibraryData } from './hooks/useLibraryData';
import { useUserSession } from './hooks/useUserSession';
import { handleLibraryAction } from './api/libraryService';
import { updateSeatsLayout } from './api/seatApi';
import { minutesBetween } from './utils/userDoc';

const FLOORS = [
  { id: '1층', title: '1층 일반 열람실', short: '1층 열람실', desc: '조용한 개인 열람석과 소규모 스터디룸', fallback: '열람석 60석 · 스터디룸 2개' },
  { id: '2층', title: '2층 집중 열람실', short: '2층 집중구역', desc: '시험 기간 인기 1위, 완전 정숙 구역', fallback: '집중석 32석 · 그룹룸 2개' },
  { id: '4층', title: '4층 프리미엄 라운지', short: '4층 스터디룸', desc: '창가 뷰 테이블과 1인 부스', fallback: '개인석 · 창가석 54석' },
];
const floorTitles = Object.fromEntries(FLOORS.map(f => [f.id, f.title]));

const timeOptions = [...Array(28).keys()].map(i => {
  const h = Math.floor(i / 2) + 9;
  const m = i % 2 === 0 ? '00' : '30';
  return `${String(h).padStart(2, '0')}:${m}`;
});

const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자', '2212020'];
const ADMIN_VIEWS = ['USERS', 'SCANNER', 'EVENTS_ADMIN', 'ADMIN_SEARCH'];

const nowHHMM = () => format(new Date(), 'HH:mm');
const addMinutesHHMM = (hhmm, mins) => {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + mins;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};
const fmtDuration = (mins) => {
  if (mins <= 0) return '곧 종료';
  const h = Math.floor(mins / 60); const m = mins % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
};
const greeting = () => {
  const h = new Date().getHours();
  if (h < 6) return '늦은 밤에도 열정적이네요';
  if (h < 12) return '좋은 아침이에요';
  if (h < 18) return '오늘도 힘내세요';
  return '편안한 저녁 되세요';
};

// 문자열 / {title,message} / {type,message} 어떤 형태로 와도 토스트로 정규화
const normalizeAlert = (a) => {
  if (!a) return null;
  if (typeof a === 'string') return { title: a, message: '' };
  return { title: a.title || (a.type === 'error' ? '알림' : '안내'), message: a.message || '' };
};

function App() {
  const { seats, user, currentUserData, authReady } = useLibraryData();
  useUserSession(user);

  const scrollRef = useRef(null);
  const prevBooksRef = useRef({});
  const handledTicketsRef = useRef(new Set());

  const [activeFloor, setActiveFloor] = useState('1층');
  const [viewMode, setViewMode] = useState('HOME');
  const [isBookingMode, setIsBookingMode] = useState(true);
  const [showIdQR, setShowIdQR] = useState(false);
  const [dbNotices, setDbNotices] = useState([]);
  const [boardTab, setBoardTab] = useState('NOTICE');
  const [systemAlert, setSystemAlert] = useState(null);
  const [facilityStatus, setFacilityStatus] = useState({ '1층': 'AUTO', '2층': 'AUTO', '4층': 'AUTO' });
  const [todayReservations, setTodayReservations] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [selectedSeat, setSelectedSeat] = useState(null);
  const [forceCleanCheck, setForceCleanCheck] = useState(false);
  const [myActiveTickets, setMyActiveTickets] = useState([]);
  const [clock, setClock] = useState(nowHHMM());

  const toast = normalizeAlert(systemAlert);

  const isAdmin = !!((currentUserData && (ADMIN_IDS.includes(String(currentUserData.studentNo)) || currentUserData.role === 'MANAGER')) ||
    (user?.email && ADMIN_IDS.includes(user.email.split('@')[0])));
  const displayName = isAdmin ? '관리자' : (currentUserData?.name || user?.displayName || user?.email?.split('@')[0] || '회원');

  // ⏱ 시계 (30초마다)
  useEffect(() => {
    const t = setInterval(() => setClock(nowHHMM()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!systemAlert) return;
    const timer = setTimeout(() => setSystemAlert(null), 6000);
    return () => clearTimeout(timer);
  }, [systemAlert]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'facilityStatus'), (snap) => { if (snap.exists()) setFacilityStatus(snap.data()); }, () => {});
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'Reservations'), where('date', '==', format(new Date(), 'yyyy-MM-dd')));
    const unsub = onSnapshot(q, snap => setTodayReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    return () => unsub();
  }, [user]);

  // 🔔 예약한 도서가 반납되어 여분이 생기면 알림
  useEffect(() => {
    if (!user) return;
    const myId = currentUserData?.studentNo || user?.email?.split('@')[0] || user?.uid;
    const unsub = onSnapshot(collection(db, 'Books'), (snap) => {
      snap.docs.forEach(d => {
        const book = d.data();
        const prev = prevBooksRef.current[d.id];
        const curr = book.availableQuantity ?? 0;
        const reservations = Array.isArray(book.reservations) ? book.reservations : [];
        const mine = reservations.some(r => r.userId === user.email || r.studentNo === myId || r.uid === user.uid);
        if (mine && prev === 0 && curr > 0) {
          setSystemAlert({ title: '📚 예약 도서 대출 가능', message: `[${book.title}] 도서가 반납되었습니다.\n지금 도서관에서 대출해 주세요!` });
        }
        prevBooksRef.current[d.id] = curr;
      });
    }, () => {});
    return () => unsub();
  }, [user, currentUserData]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'System', 'settings'), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setSystemSettings(data);
      if (data.isExamActive && data.examEndDate && new Date() > new Date(data.examEndDate)) {
        updateDoc(doc(db, 'System', 'settings'), { isExamActive: false }).catch(() => {});
      }
    }, () => {});
    return () => unsub();
  }, []);

  // 관리자 전용 화면 접근 차단
  useEffect(() => {
    if (user && !isAdmin && ADMIN_VIEWS.includes(viewMode)) setViewMode('HOME');
  }, [user, isAdmin, viewMode]);

  useEffect(() => {
    if (!user) return;
    let eventsList = []; let noticesList = [];
    const merge = () => {
      const filteredEvents = eventsList.filter(item => item.type?.toLowerCase().includes('notice') || item.category?.includes('공지') || item.title?.includes('[공지]') || item.name?.includes('[공지]'));
      const combined = [...filteredEvents, ...noticesList.map(n => ({ ...n, _type: 'NOTICE' }))].sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime() || (a.date ? new Date(a.date).getTime() : 0);
        const tb = b.createdAt?.toDate?.()?.getTime() || (b.date ? new Date(b.date).getTime() : 0);
        return tb - ta;
      });
      setDbNotices(combined.slice(0, 5));
    };
    const unsubE = onSnapshot(collection(db, 'Events'), (snap) => { eventsList = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge(); }, () => {});
    const unsubN = onSnapshot(collection(db, 'Notices'), (snap) => { noticesList = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge(); }, () => {});
    return () => { unsubE(); unsubN(); };
  }, [user]);

  // 기본 예약 시간: 다음 30분 단위부터 2시간
  useEffect(() => {
    const now = new Date();
    let h = now.getHours(); const m = now.getMinutes() < 30 ? 30 : 0;
    if (m === 0) h += 1;
    const startStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const sIdx = timeOptions.indexOf(startStr);
    if (sIdx !== -1 && sIdx < timeOptions.length - 1) {
      setStartTime(startStr);
      setEndTime(timeOptions[Math.min(sIdx + 4, timeOptions.length - 1)]);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'Reservations'), where('userId', '==', user.email), where('status', 'in', ['RESERVED', 'OCCUPIED']));
    const unsub = onSnapshot(q, snap => setMyActiveTickets(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => {});
    return () => unsub();
  }, [user]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const myTicket = useMemo(() => myActiveTickets
    .filter(r => r.date > todayStr || (r.date === todayStr && r.endTime > clock))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0], [myActiveTickets, todayStr, clock]);

  const seatFor = useCallback((ticket) => seats.find(s => s.id === ticket?.seatId) || { id: ticket?.seatId }, [seats]);

  // ⏰ 자동 퇴실 · 노쇼 · 사전 알림 (내 예약만 내 기기에서 처리)
  useEffect(() => {
    if (!user) return;
    myActiveTickets.forEach(t => {
      const key = `${t.id}:${t.status}`;
      if (handledTicketsRef.current.has(key)) return;
      const expired = t.date < todayStr || (t.date === todayStr && t.endTime <= clock);
      const noShow = t.status === 'RESERVED' && t.date === todayStr && clock >= addMinutesHHMM(t.startTime, 15);
      if (t.status === 'OCCUPIED' && expired) {
        handledTicketsRef.current.add(key);
        handleLibraryAction({ actionType: 'AUTO_CHECKOUT', seat: seatFor(t), user, isAdmin, reservationId: t.id, setSystemAlert });
      } else if (t.status === 'RESERVED' && (expired || noShow)) {
        handledTicketsRef.current.add(key);
        handleLibraryAction({ actionType: 'NO_SHOW', seat: seatFor(t), user, isAdmin, reservationId: t.id, setSystemAlert });
      } else if (t.status === 'OCCUPIED' && t.date === todayStr) {
        const left = minutesBetween(clock, t.endTime);
        const rKey = `${t.id}:reminder`;
        if (left > 0 && left <= 10 && !handledTicketsRef.current.has(rKey)) {
          handledTicketsRef.current.add(rKey);
          setSystemAlert({ title: '⏰ 퇴실 10분 전', message: `${t.seatId} 좌석 이용이 ${t.endTime}에 종료됩니다. 마무리를 준비해 주세요.` });
          try { if (Notification?.permission === 'granted') new Notification('스마트 도서관', { body: `퇴실 ${left}분 전입니다. (${t.seatId})` }); } catch { /* 알림 미지원 */ }
        }
      }
    });
  }, [myActiveTickets, clock, todayStr, user, isAdmin, seatFor]);

  // 키오스크 스캔으로 입실 완료되면 QR 창 자동 닫기
  useEffect(() => {
    if (showIdQR && myTicket?.status === 'OCCUPIED') {
      setShowIdQR(false);
      setSystemAlert({ title: '✅ 입실 완료', message: `${myTicket.seatId} 좌석 이용을 시작합니다. 집중력 200% 응원해요!` });
    }
  }, [myTicket, showIdQR]);

  const handleCloseIdQR = async () => {
    setShowIdQR(false);
    if (myTicket && myTicket.status === 'RESERVED' && myTicket.isImmediate) {
      await handleLibraryAction({ actionType: 'CANCEL_IMMEDIATE', seat: seatFor(myTicket), user, isAdmin, reservationId: myTicket.id, setSystemAlert });
    }
  };
  const handleCheckout = () => handleLibraryAction({ actionType: 'RETURN', seat: seatFor(myTicket), user, isAdmin, setSystemAlert });
  const handleCancel = () => handleLibraryAction({
    actionType: myTicket?.isImmediate && myTicket.status === 'RESERVED' ? 'CANCEL_IMMEDIATE' : 'CANCEL',
    seat: seatFor(myTicket), user, isAdmin, reservationId: myTicket?.id, setSystemAlert,
  });

  const handleStartTimeChange = (e) => {
    const newStart = e.target.value;
    setStartTime(newStart);
    if (newStart >= endTime) {
      const idx = timeOptions.indexOf(newStart);
      setEndTime(timeOptions[Math.min(idx + 4, timeOptions.length - 1)]);
    }
  };

  const floorStats = useCallback((floor) => {
    const floorSeats = seats.filter(s => s.floor === floor || String(s.id).startsWith(floor));
    const usable = floorSeats.filter(s => s.status !== 'DISABLED');
    const busy = usable.filter(seat => ['RESERVED', 'OCCUPIED'].includes(seat.status) ||
      todayReservations.some(r => r.seatId === seat.id && ['RESERVED', 'OCCUPIED'].includes(r.status) && clock >= r.startTime && clock < r.endTime)).length;
    const ratio = usable.length ? busy / usable.length : 0;
    const dbStat = facilityStatus[floor] || 'AUTO';
    const status = dbStat !== 'AUTO' ? dbStat : ratio >= 0.9 ? 'UNAVAILABLE' : ratio >= 0.7 ? 'CROWDED' : 'AVAILABLE';
    return { total: usable.length, busy, free: usable.length - busy, ratio, status };
  }, [seats, todayReservations, clock, facilityStatus]);

  const statusChip = (status) => {
    if (status === 'UNAVAILABLE') return <span className="sl-chip red"><span className="dot" />이용 불가</span>;
    if (status === 'CROWDED') return <span className="sl-chip amber"><span className="dot" />혼잡</span>;
    return <span className="sl-chip green"><span className="dot" />여유</span>;
  };

  const handleDeleteSeat = async (seatId) => {
    try { await deleteDoc(doc(db, 'Seat', seatId)); } catch { setSystemAlert({ title: '❌ 좌석 삭제 실패', message: '권한 또는 네트워크를 확인해 주세요.' }); }
  };

  const go = (mode, opts = {}) => {
    if (mode === 'MAP') { setIsBookingMode(opts.booking ?? true); setSelectedSeat(null); if (opts.floor) setActiveFloor(opts.floor); }
    if (opts.tab) setBoardTab(opts.tab);
    setViewMode(mode);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const isToday = format(selectedDate, 'yyyy-MM-dd') === todayStr;

  // ────────────────── 로그인 전 ──────────────────
  if (!authReady) {
    return (
      <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div className="sl-brand-mark" style={{ width: 56, height: 56, borderRadius: 18, animation: 'sl-pulse 1.6s infinite' }}><Icon name="book" size={28} stroke={2} style={{ color: '#fff' }} /></div>
      </div>
    );
  }

  if (!user || (user.email && !user.email.includes('@test.com') && (!user.emailVerified || !user.displayName))) {
    return <Auth isExamPeriod={systemSettings?.isExamActive} />;
  }

  // ────────────────── 로그인 후 ──────────────────
  const navItems = [
    { mode: 'HOME', label: '홈', icon: 'home' },
    { mode: 'MAP', label: '좌석 예약', icon: 'seat' },
    { mode: 'SEARCH', label: '도서 검색', icon: 'search' },
    { mode: 'EVENTS', label: '소식', icon: 'bell' },
    { mode: 'RANKING', label: '랭킹', icon: 'trophy' },
  ];
  const adminItems = [
    { mode: 'USERS', label: '회원관리', icon: 'users' },
    { mode: 'ADMIN_SEARCH', label: '검색관리', icon: 'search' },
    { mode: 'EVENTS_ADMIN', label: '시스템관리', icon: 'settings' },
    { mode: 'SCANNER', label: 'QR 스캐너', icon: 'scan' },
  ];
  const isMapLike = viewMode === 'HOME' || viewMode === 'MAP';
  const ticketMinsLeft = myTicket && myTicket.date === todayStr
    ? (myTicket.status === 'OCCUPIED' ? minutesBetween(clock, myTicket.endTime) : minutesBetween(clock, myTicket.startTime))
    : null;
  const ticketTotal = myTicket ? Math.max(1, minutesBetween(myTicket.startTime, myTicket.endTime)) : 1;
  const ticketProgress = myTicket?.status === 'OCCUPIED' && ticketMinsLeft != null ? Math.min(100, Math.max(0, 100 - (ticketMinsLeft / ticketTotal) * 100)) : 0;
  const totalFree = FLOORS.reduce((sum, f) => sum + floorStats(f.id).free, 0);

  return (
    <div className={`sl-shell ${viewMode !== 'SCANNER' ? 'sl-has-tabbar' : ''}`} style={{ paddingBottom: myTicket && isMapLike ? 190 : undefined }}>
      <div className="sl-ambient"><div className="sl-orb a" /><div className="sl-orb b" /><div className="sl-orb c" /></div>

      {/* 🔔 토스트 */}
      {toast && (
        <div className="sl-toast" role="status" onClick={() => setSystemAlert(null)}>
          <span className="bar" />
          <div><p className="t">{toast.title}</p>{toast.message && <p className="m">{toast.message}</p>}</div>
        </div>
      )}

      {systemSettings?.isExamActive && (
        <div style={{ position: 'relative', zIndex: 1001, background: 'linear-gradient(90deg, rgba(244,63,94,.9), rgba(251,113,133,.85))', color: '#fff', textAlign: 'center', padding: '9px 16px', fontWeight: 700, fontSize: '.86rem' }}>
          🚨 시험기간 특별 통제 중 · 재학생만 예약할 수 있습니다
        </div>
      )}

      {/* 📲 모바일 출입증 / 입실 QR */}
      {showIdQR && (
        <div className="sl-overlay" onClick={handleCloseIdQR}>
          <div className="sl-modal" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 400 }}>
            <button className="sl-icon-btn" onClick={handleCloseIdQR} style={{ position: 'absolute', top: 18, right: 18 }} aria-label="닫기"><Icon name="x" size={18} /></button>
            <span className={`sl-chip ${myTicket?.status === 'RESERVED' ? 'blue' : 'green'}`} style={{ marginBottom: 14 }}>
              <span className="dot" />{myTicket?.status === 'RESERVED' ? `${myTicket.seatId} 입실 인증` : 'SMART LIB PASS'}
            </span>
            <h3 className="sl-h2" style={{ marginBottom: 6 }}>{myTicket?.status === 'RESERVED' ? 'QR 입실 인증' : '모바일 출입증'}</h3>
            <p className="sl-muted" style={{ margin: '0 0 24px', fontSize: '.92rem' }}>키오스크 스캐너에 QR 코드를 비춰 주세요</p>
            <QRCodeGen studentId={user?.email || currentUserData?.studentNo || 'unknown'} size={200} />
            <div style={{ marginTop: 22, padding: '14px 16px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
              <div className="sl-avatar" style={{ cursor: 'default' }}>{displayName.slice(0, 1)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800 }}>{currentUserData?.name || user?.displayName || user?.email?.split('@')[0]}</div>
                <div className="sl-faint" style={{ fontSize: '.82rem' }}>{currentUserData?.studentNo || user?.email}</div>
              </div>
            </div>
            {myTicket?.isImmediate && myTicket.status === 'RESERVED' && (
              <p className="sl-faint" style={{ fontSize: '.78rem', margin: '14px 0 0' }}>⚠ 입실 전에 창을 닫으면 현장 발권이 취소됩니다</p>
            )}
          </div>
        </div>
      )}

      {/* ───── 상단 네비게이션 ───── */}
      <header className="sl-nav">
        <div className="sl-container sl-nav-inner">
          <button className="sl-brand" onClick={() => go('HOME')}>
            <span className="sl-brand-mark"><Icon name="book" size={18} stroke={2.2} style={{ color: '#fff' }} /></span>
            <span className="sl-brand-name">SMART LIB<small>UOU LIBRARY</small></span>
          </button>

          <nav className="sl-navlinks">
            {navItems.map(n => (
              <button key={n.mode} className={`sl-navlink ${viewMode === n.mode || (n.mode === 'EVENTS' && viewMode === 'EVENT_DETAIL') ? 'on' : ''}`} onClick={() => go(n.mode)}>{n.label}</button>
            ))}
            {isAdmin && <span style={{ width: 1, background: 'var(--line)', margin: '8px 6px' }} />}
            {isAdmin && adminItems.map(n => (
              <button key={n.mode} className={`sl-navlink ${viewMode === n.mode ? 'on' : ''}`} onClick={() => go(n.mode)} style={{ color: viewMode === n.mode ? '#fff' : 'var(--violet)' }}>{n.label}</button>
            ))}
          </nav>

          <div className="sl-row" style={{ gap: 8 }}>
            <button className="sl-btn sm sl-desktop-only" onClick={() => setShowIdQR(true)}><Icon name="qr" size={16} />출입증</button>
            <button className="sl-avatar" title="마이페이지" onClick={() => go('MYPAGE')}>{displayName.slice(0, 1)}</button>
            <button className="sl-icon-btn" title="로그아웃" onClick={async () => { if (window.confirm('로그아웃 하시겠습니까?')) await signOut(auth); }}><Icon name="logout" size={18} /></button>
          </div>
        </div>
      </header>

      {/* ───── 라우팅 영역 ───── */}
      <main style={{ position: 'relative', zIndex: 1 }}>
        {isAdmin && viewMode === 'USERS' && <AdminDashboard />}
        {viewMode === 'MYPAGE' && <MyPage user={user} currentUserData={currentUserData} isAdmin={isAdmin} setViewMode={setViewMode} adminItems={isAdmin ? adminItems : []} />}
        {viewMode === 'SCANNER' && isAdmin && <ScannerPage setViewMode={setViewMode} setSystemAlert={setSystemAlert} />}
        {viewMode === 'RANKING' && <RankingPage onBack={() => go('HOME')} user={user} currentUserData={currentUserData} />}
        {viewMode === 'SEARCH' && <BookSearch onBack={() => go('HOME')} user={user} currentUserData={currentUserData} isAdmin={isAdmin} />}
        {viewMode === 'EVENTS' && <EventBoard initialTab={boardTab} onBack={() => go('HOME')} onSelectEvent={(ev) => { setSelectedEvent(ev); setViewMode('EVENT_DETAIL'); }} onSelectNotice={(n) => { setSelectedEvent({ ...n, _type: 'NOTICE' }); setViewMode('EVENT_DETAIL'); }} />}
        {viewMode === 'EVENT_DETAIL' && <EventDetail event={selectedEvent} onBack={() => setViewMode('EVENTS')} />}
        {viewMode === 'EVENTS_ADMIN' && isAdmin && <AdminEvents />}
        {viewMode === 'ADMIN_SEARCH' && isAdmin && <AdminSearch />}

        {/* ───── HOME ───── */}
        {viewMode === 'HOME' && (
          <>
            <section className="sl-container" style={{ padding: 'clamp(40px, 8vw, 96px) 20px clamp(36px, 6vw, 72px)' }}>
              <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 'clamp(28px, 5vw, 64px)', alignItems: 'center' }}>
                <div>
                  <span className="sl-eyebrow sl-rise"><span className="dot" />실시간 운영 중 · 2026 FALL</span>
                  <h1 className="sl-display sl-rise d1" style={{ margin: '18px 0 20px' }}>
                    지식의 바다로<br /><span className="sl-grad-text">당신을 초대합니다</span>
                  </h1>
                  <p className="sl-muted sl-rise d2" style={{ fontSize: 'clamp(1rem, 1.6vw, 1.12rem)', lineHeight: 1.65, margin: '0 0 32px', maxWidth: 480 }}>
                    {displayName}님, {greeting()}. 지금 <b style={{ color: 'var(--text)' }}>{totalFree}석</b>이 비어 있어요.<br />
                    좌석 예약부터 도서 검색, 모바일 출입증까지 한 곳에서.
                  </p>
                  <div className="sl-row sl-rise d3" style={{ flexWrap: 'wrap' }}>
                    <button className="sl-btn primary lg" onClick={() => go('MAP', { booking: true })}>좌석 예약하기 <Icon name="arrowRight" size={18} stroke={2.2} /></button>
                    <button className="sl-btn lg" onClick={() => setShowIdQR(true)}><Icon name="qr" size={18} />모바일 출입증</button>
                  </div>
                </div>

                {/* 실시간 현황 카드 */}
                <div className="sl-card glow sl-rise d2" style={{ padding: 'clamp(20px, 3vw, 30px)', borderRadius: 30 }}>
                  <div className="sl-between" style={{ marginBottom: 22 }}>
                    <div>
                      <div className="sl-faint" style={{ fontSize: '.78rem', fontWeight: 700, letterSpacing: '.1em' }}>LIVE OCCUPANCY</div>
                      <div className="sl-h3" style={{ marginTop: 4 }}>층별 실시간 좌석 현황</div>
                    </div>
                    <div className="sl-num" style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.04em' }}>{clock}</div>
                  </div>
                  <div className="sl-stack" style={{ gap: 14 }}>
                    {FLOORS.map(f => {
                      const st = floorStats(f.id);
                      const color = st.status === 'UNAVAILABLE' ? 'var(--red)' : st.status === 'CROWDED' ? 'var(--amber)' : 'var(--green)';
                      return (
                        <button key={f.id} onClick={() => go('MAP', { booking: true, floor: f.id })} style={{ all: 'unset', cursor: 'pointer', display: 'block', padding: '14px 16px', borderRadius: 18, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
                          <div className="sl-between" style={{ marginBottom: 10 }}>
                            <span style={{ fontWeight: 750 }}>{f.short}</span>
                            <span className="sl-num sl-muted" style={{ fontSize: '.85rem', fontWeight: 600 }}>
                              <b style={{ color, fontSize: '1rem' }}>{st.free}</b> / {st.total || '-'} 석 여유
                            </span>
                          </div>
                          <div style={{ height: 8, borderRadius: 8, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(st.ratio * 100)}%`, minWidth: st.busy ? 8 : 0, height: '100%', borderRadius: 8, background: color, boxShadow: `0 0 12px ${color}`, transition: 'width .8s var(--ease)' }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {myTicket ? (
                    <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 18, background: 'var(--grad-soft)', border: '1px solid rgba(109,141,255,.3)' }} className="sl-between">
                      <div>
                        <div className="sl-faint" style={{ fontSize: '.76rem', fontWeight: 700 }}>내 좌석</div>
                        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{myTicket.seatId} · {myTicket.startTime}~{myTicket.endTime}</div>
                      </div>
                      <span className={`sl-chip ${myTicket.status === 'OCCUPIED' ? 'green' : 'blue'}`}>{myTicket.status === 'OCCUPIED' ? '이용 중' : '예약됨'}</span>
                    </div>
                  ) : (
                    <p className="sl-faint" style={{ fontSize: '.82rem', margin: '18px 0 0', textAlign: 'center' }}>층을 눌러 바로 예약할 수 있어요</p>
                  )}
                </div>
              </div>
            </section>

            <div ref={scrollRef} className="sl-container">
              {/* 바로가기 */}
              <section className="sl-section">
                <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                  {[
                    { label: '도서 검색', sub: '소장 도서 · 대출 예약', icon: 'search', onClick: () => go('SEARCH'), tint: '#6d8dff' },
                    { label: '배치도 보기', sub: '층별 좌석 위치', icon: 'map', onClick: () => go('MAP', { booking: false }), tint: '#38d9f5' },
                    { label: '공지사항', sub: '도서관 운영 안내', icon: 'bell', onClick: () => go('EVENTS', { tab: 'NOTICE' }), tint: '#9b7bff' },
                    { label: '이벤트', sub: '참여하고 혜택 받기', icon: 'gift', onClick: () => go('EVENTS', { tab: 'EVENT' }), tint: '#f472b6' },
                    { label: '이용자 랭킹', sub: '이번 주 열공왕', icon: 'trophy', onClick: () => go('RANKING'), tint: '#fbbf24' },
                  ].map((item) => (
                    <button key={item.label} className="sl-card hover" onClick={item.onClick} style={{ textAlign: 'left', cursor: 'pointer', padding: 20, color: 'inherit' }}>
                      <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: `${item.tint}22`, color: item.tint, border: `1px solid ${item.tint}44`, marginBottom: 16 }}>
                        <Icon name={item.icon} size={22} />
                      </span>
                      <div style={{ fontWeight: 800, fontSize: '1rem' }}>{item.label}</div>
                      <div className="sl-faint" style={{ fontSize: '.82rem', marginTop: 4 }}>{item.sub}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* 관리자 콘솔 */}
              {isAdmin && (
                <section className="sl-section">
                  <div className="sl-card glow" style={{ padding: 22 }}>
                    <div className="sl-between" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
                      <div className="sl-row"><Icon name="shield" size={20} style={{ color: 'var(--violet)' }} /><span className="sl-h3">관리자 콘솔</span></div>
                      <span className="sl-chip blue">ADMIN</span>
                    </div>
                    <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                      {adminItems.map(a => (
                        <button key={a.mode} className="sl-btn" style={{ height: 52, justifyContent: 'flex-start' }} onClick={() => go(a.mode)}><Icon name={a.icon} size={18} />{a.label}</button>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {/* 공간 안내 */}
              <section className="sl-section">
                <div className="sl-between" style={{ marginBottom: 20 }}>
                  <h2 className="sl-h2">도서관 공간 안내</h2>
                  <button className="sl-btn ghost sm" onClick={() => go('MAP', { booking: false })}>전체 배치도 <Icon name="chevronRight" size={16} /></button>
                </div>
                <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
                  {FLOORS.map((f, i) => {
                    const st = floorStats(f.id);
                    return (
                      <div key={f.id} className="sl-card hover" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ height: 120, position: 'relative', background: [
                          'radial-gradient(120% 140% at 0% 0%, rgba(109,141,255,.55), transparent 60%), radial-gradient(100% 120% at 100% 100%, rgba(56,217,245,.35), transparent 60%)',
                          'radial-gradient(120% 140% at 100% 0%, rgba(155,123,255,.55), transparent 60%), radial-gradient(100% 120% at 0% 100%, rgba(109,141,255,.35), transparent 60%)',
                          'radial-gradient(120% 140% at 50% 0%, rgba(56,217,245,.45), transparent 60%), radial-gradient(100% 120% at 100% 100%, rgba(244,114,182,.3), transparent 60%)',
                        ][i] }}>
                          <span style={{ position: 'absolute', left: 20, bottom: 14, fontSize: '3.2rem', fontWeight: 900, letterSpacing: '-0.06em', color: 'rgba(255,255,255,.92)', lineHeight: 1 }}>{f.id.replace('층', 'F')}</span>
                          <span style={{ position: 'absolute', right: 16, top: 16 }}>{statusChip(st.status)}</span>
                        </div>
                        <div style={{ padding: 20 }}>
                          <div className="sl-h3">{f.title}</div>
                          <p className="sl-muted" style={{ margin: '6px 0 4px', fontSize: '.9rem' }}>{f.desc}</p>
                          <p className="sl-faint" style={{ margin: '0 0 18px', fontSize: '.82rem' }}>{st.total ? `전체 ${st.total}석 · 현재 ${st.free}석 이용 가능` : f.fallback}</p>
                          <div className="sl-row">
                            <button className="sl-btn primary sm" style={{ flex: 1 }} onClick={() => go('MAP', { booking: true, floor: f.id })}>예약</button>
                            <button className="sl-btn sm" style={{ flex: 1 }} onClick={() => go('MAP', { booking: false, floor: f.id })}>배치도</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 새로운 소식 */}
              <section className="sl-section">
                <div className="sl-card" style={{ padding: 'clamp(20px, 3vw, 28px)' }}>
                  <div className="sl-between" style={{ marginBottom: 8 }}>
                    <h2 className="sl-h2">새로운 소식</h2>
                    <button className="sl-btn ghost sm" onClick={() => go('EVENTS', { tab: 'NOTICE' })}>더 보기 <Icon name="chevronRight" size={16} /></button>
                  </div>
                  {dbNotices.length === 0 ? (
                    <p className="sl-faint" style={{ textAlign: 'center', padding: '28px 0 12px', margin: 0 }}>등록된 소식이 없습니다.</p>
                  ) : dbNotices.map((n, idx) => (
                    <button key={n.id || idx} onClick={() => { setSelectedEvent({ ...n, _type: 'NOTICE' }); setViewMode('EVENT_DETAIL'); window.scrollTo({ top: 0 }); }}
                      style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, width: '100%', boxSizing: 'border-box', padding: '16px 4px', borderTop: idx === 0 ? 'none' : '1px solid var(--line)' }}>
                      <span className="sl-chip blue" style={{ flexShrink: 0 }}>공지</span>
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title || n.name}</span>
                      <span className="sl-faint sl-num" style={{ fontSize: '.82rem', flexShrink: 0 }}>{n.createdAt?.toDate ? format(n.createdAt.toDate(), 'MM.dd') : (n.date || '')}</span>
                    </button>
                  ))}
                </div>
              </section>

              <footer className="sl-faint" style={{ textAlign: 'center', fontSize: '.78rem', padding: '8px 0 40px' }}>
                © 2026 Ulsan College Smart Library · 운영시간 09:00 – 23:00
              </footer>
            </div>
          </>
        )}

        {/* ───── MAP ───── */}
        {viewMode === 'MAP' && (
          <div className="sl-container" style={{ paddingTop: 24, paddingBottom: 24 }}>
            <div className="sl-card" style={{ marginBottom: 20, padding: 'clamp(18px, 3vw, 26px)' }}>
              <div className="sl-between" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
                <div className="sl-row">
                  <button className="sl-icon-btn" onClick={() => go('HOME')} aria-label="홈으로"><Icon name="arrowLeft" size={18} /></button>
                  <div>
                    <div className="sl-faint" style={{ fontSize: '.76rem', fontWeight: 700, letterSpacing: '.1em' }}>{isBookingMode ? 'RESERVATION' : 'FLOOR MAP'}</div>
                    <h1 className="sl-h2">{isBookingMode ? '실시간 좌석 예약' : '층별 배치도'}</h1>
                  </div>
                </div>
                <div className="sl-seg" style={{ minWidth: 220 }}>
                  <button className={isBookingMode ? 'on' : ''} onClick={() => setIsBookingMode(true)}>예약 모드</button>
                  <button className={!isBookingMode ? 'on' : ''} onClick={() => setIsBookingMode(false)}>둘러보기</button>
                </div>
              </div>

              {isBookingMode && (
                <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12, marginBottom: 18 }}>
                  <label className="sl-field">
                    <span className="sl-label"><Icon name="calendar" size={13} style={{ verticalAlign: -2, marginRight: 4 }} />날짜</span>
                    <input className="sl-input" type="date" value={format(selectedDate, 'yyyy-MM-dd')} min={todayStr} max={format(addDays(new Date(), 14), 'yyyy-MM-dd')}
                      onChange={(e) => { if (e.target.value) setSelectedDate(new Date(`${e.target.value}T00:00:00`)); }} style={{ fontWeight: 700 }} />
                  </label>
                  <label className="sl-field">
                    <span className="sl-label" style={{ color: '#a7f3d0' }}>입실 시간</span>
                    <select className="sl-select" value={startTime} onChange={handleStartTimeChange}>
                      {timeOptions.slice(0, -1).map(t => <option key={t} value={t} disabled={isToday && t < clock}>{t}</option>)}
                    </select>
                  </label>
                  <label className="sl-field">
                    <span className="sl-label" style={{ color: '#fecdd3' }}>퇴실 시간</span>
                    <select className="sl-select" value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                      {timeOptions.map(t => <option key={t} value={t} disabled={t <= startTime}>{t}</option>)}
                    </select>
                  </label>
                  <div className="sl-field">
                    <span className="sl-label">이용 시간</span>
                    <div className="sl-input sl-num" style={{ display: 'flex', alignItems: 'center', fontWeight: 800, background: 'var(--grad-soft)', borderColor: 'rgba(109,141,255,.35)' }}>
                      {fmtDuration(minutesBetween(startTime, endTime))}
                    </div>
                  </div>
                </div>
              )}

              <div className="sl-seg">
                {FLOORS.map(f => {
                  const st = floorStats(f.id);
                  return (
                    <button key={f.id} className={activeFloor === f.id ? 'on accent' : ''} onClick={() => setActiveFloor(f.id)} style={{ height: 50 }}>
                      <span className="sl-desktop-label">{f.short}</span><span className="sl-mobile-label">{f.id}</span><span className="sl-num" style={{ marginLeft: 6, opacity: .7, fontSize: '.78rem' }}>{st.total ? `${st.free}석` : ''}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <FloorMap activeFloor={activeFloor} title={floorTitles[activeFloor]} seats={seats} isAdmin={isAdmin} setSelectedSeat={setSelectedSeat} onUpdateSeats={updateSeatsLayout} onDeleteSeat={handleDeleteSeat} myEmail={user?.email} />

            <SeatModal selectedSeat={selectedSeat} setSelectedSeat={setSelectedSeat} user={user} isAdmin={isAdmin} currentUserData={currentUserData}
              selectedDate={selectedDate} startTime={startTime} endTime={endTime} isExamPeriod={systemSettings?.isExamActive}
              setSystemAlert={setSystemAlert} setShowIdQR={setShowIdQR} forceCleanCheck={forceCleanCheck} setForceCleanCheck={setForceCleanCheck} />
          </div>
        )}

        {/* ───── 플로팅 예약 티켓 ───── */}
        {myTicket && isMapLike && (
          <div className="sl-ticket" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(var(--dock-offset, 24px) + env(safe-area-inset-bottom))', width: 'min(460px, calc(100vw - 24px))', zIndex: 9995 }}>
            <style>{`@media (max-width: 860px) { .sl-ticket { --dock-offset: 88px; } }`}</style>
            <div className="sl-card glow" style={{ padding: 18, borderRadius: 24, background: 'rgba(12,16,34,.9)' }}>
              <div className="sl-between" style={{ alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <span className={`sl-chip ${myTicket.status === 'OCCUPIED' ? 'green' : myTicket.isImmediate ? 'amber' : 'blue'}`}>
                    <span className="dot" />{myTicket.status === 'OCCUPIED' ? '이용 중' : myTicket.isImmediate ? '현장 발권 · 입실 대기' : myTicket.date === todayStr ? '오늘 예약' : `${myTicket.date} 예약`}
                  </span>
                  <div style={{ fontSize: '1.45rem', fontWeight: 850, letterSpacing: '-0.03em', marginTop: 8 }}>{myTicket.seatId}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="sl-num" style={{ fontWeight: 800, fontSize: '1.05rem' }}>{myTicket.startTime} – {myTicket.endTime}</div>
                  {ticketMinsLeft != null && (
                    <div className="sl-faint" style={{ fontSize: '.8rem', marginTop: 3 }}>
                      {myTicket.status === 'OCCUPIED' ? `남은 시간 ${fmtDuration(ticketMinsLeft)}` : ticketMinsLeft > 0 ? `입실까지 ${fmtDuration(ticketMinsLeft)}` : `입실 마감 ${addMinutesHHMM(myTicket.startTime, 15)}`}
                    </div>
                  )}
                </div>
              </div>
              {myTicket.status === 'OCCUPIED' && (
                <div style={{ height: 5, borderRadius: 5, background: 'rgba(255,255,255,.08)', overflow: 'hidden', margin: '14px 0 2px' }}>
                  <div style={{ width: `${ticketProgress}%`, height: '100%', background: 'var(--grad)' }} />
                </div>
              )}
              <div className="sl-row" style={{ marginTop: 14 }}>
                {myTicket.status === 'OCCUPIED' ? (
                  <button className="sl-btn block" onClick={handleCheckout}>퇴실하기</button>
                ) : (
                  <>
                    <button className="sl-btn primary" style={{ flex: 2 }} onClick={() => setShowIdQR(true)}><Icon name="qr" size={17} />QR 입실 인증</button>
                    <button className="sl-btn danger" style={{ flex: 1 }} onClick={handleCancel}>취소</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ───── 모바일 하단 탭바 ───── */}
      {viewMode !== 'SCANNER' && (
        <nav className="sl-tabbar">
          {[navItems[0], navItems[1]].map(n => (
            <button key={n.mode} className={viewMode === n.mode ? 'on' : ''} onClick={() => go(n.mode)}><Icon name={n.icon} size={21} />{n.label}</button>
          ))}
          <button className="qr" onClick={() => setShowIdQR(true)} aria-label="모바일 출입증"><span className="ring"><Icon name="qr" size={22} stroke={2} /></span></button>
          <button className={viewMode === 'SEARCH' ? 'on' : ''} onClick={() => go('SEARCH')}><Icon name="search" size={21} />도서</button>
          <button className={viewMode === 'MYPAGE' ? 'on' : ''} onClick={() => go('MYPAGE')}><Icon name="user" size={21} />MY</button>
        </nav>
      )}

      {viewMode !== 'SCANNER' && <FloatingChatbot raised={!!(myTicket && isMapLike)} />}
    </div>
  );
}

export default App;
