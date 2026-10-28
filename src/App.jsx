import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from './firebase'; 
import { signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, collection, query, where, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore'; 
import { format, addDays, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isPast, addMonths, subMonths } from 'date-fns';
import { ko } from 'date-fns/locale';

import MyPage from './pages/MyPage';
import ScannerPage from './pages/Scanner';
import SeatModal from './components/SeatModal';
import Auth from './pages/Auth';
import FloorMap from './components/FloorMap';
import AdminDashboard from './pages/AdminDashboard';
import QRCodeGen from './components/QRCodeGen'; 

import EventBanner from './components/EventBanner';
import EventBoard from './pages/EventBoard';
import EventDetail from './pages/EventDetail';
import AdminEvents from './pages/AdminEvents';
import BookSearch from './pages/BookSearch'; 
import AdminSearch from './pages/AdminSearch';

import { useLibraryData } from './hooks/useLibraryData';
import { useUserSession } from './hooks/useUserSession';

import RankingPage from './pages/RankingPage';
import RankingBanner from './components/RankingBanner';
import FloatingChatbot from './components/FloatingChatbot';
import { handleLibraryAction } from './api/libraryService'; 
import { updateSeatsLayout } from './api/seatApi';

const floorTitles = { '1층': '1층 열람실', '2층': '2층 집중구역', '4층': '4층 스터디룸' };

const getNotificationText = (action, seatLabel) => {
  const label = seatLabel || '좌석';
  switch (action) {
    case 'RESERVE': return `✅ ${label} 예약이 완료되었습니다.`;
    case 'CANCEL': return `🗑️ ${label} 예약이 취소되었습니다.`;
    case 'NO_SHOW_CANCEL': return `🚨 ${label} 미입실로 예약이 취소되었습니다.`;
    case 'CHECK_IN': return `📲 ${label} 입실이 확인되었습니다.`;
    case 'RETURN': return `👋 ${label} 퇴실 처리되었습니다.`;
    case 'AUTO_CHECKOUT': return `⏳ ${label} 이용 시간이 만료되어 자동 퇴실되었습니다.`;
    case 'FORCE_EVICT': return `❌ ${label} 관리자에 의해 강제 퇴실되었습니다.`;
    default: return `🔔 ${label}에 새로운 변경사항이 있습니다.`;
  }
};

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
  const mapRef = useRef(null);
  const prevBooksRef = useRef({});

  const [activeFloor, setActiveFloor] = useState('1층');
  const [viewMode, setViewMode] = useState('HOME'); 
  const [isBookingMode, setIsBookingMode] = useState(true);
  const [showIdQR, setShowIdQR] = useState(false);
  const [dbNotices, setDbNotices] = useState([]);
  const [boardTab, setBoardTab] = useState('NOTICE');
  
  const [systemAlert, setSystemAlert] = useState(null);
  const [kakaoPopup, setKakaoPopup] = useState(null);
  const initialNotifLoadRef = useRef(true);

  useEffect(() => {
    if (systemAlert) {
      const timer = setTimeout(() => { setSystemAlert(null); }, 6000); 
      return () => clearTimeout(timer);
    }
  }, [systemAlert]);

  const [facilityStatus, setFacilityStatus] = useState({ '1층': 'AUTO', '2층': 'AUTO', '4층': 'AUTO' });
  const [todayReservations, setTodayReservations] = useState([]);

  const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자', '2212020', 'tkdduf']; 
  const isAdmin = (currentUserData && (ADMIN_IDS.includes(String(currentUserData.studentNo)) || currentUserData.role === 'MANAGER' || currentUserData.role === 'ADMIN')) || 
                  (user && user.email && ADMIN_IDS.includes(user.email.split('@')[0]));

  const [currentTimeString, setCurrentTimeString] = useState(new Date().toTimeString().