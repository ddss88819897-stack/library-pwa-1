import { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { subscribeToSeats } from '../api/seatApi';

export const useLibraryData = () => {
  const [seats, setSeats] = useState([]);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [currentUserData, setCurrentUserData] = useState(null);

  // 1. 로그인 상태 감시 (첫 응답 전까지는 로그인 화면이 깜빡이지 않도록 authReady 로 구분)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
    return () => unsubscribeAuth();
  }, []);

  // 2. 좌석 실시간 구독 (로그인 후에만 → 권한 에러 방지)
  useEffect(() => {
    if (!user) { setSeats([]); return; }
    const unsubscribeSeats = subscribeToSeats(setSeats);
    return () => unsubscribeSeats();
  }, [user]);

  // 3. 내 User 문서 실시간 구독 (문서 ID가 uid / 학번 어느 쪽이든 email 로 찾아서 연결)
  useEffect(() => {
    let isMounted = true;
    let unsubUser = () => {};

    const findAndSubscribe = async () => {
      if (!user || !user.email) { setCurrentUserData(null); return; }
      try {
        const snap = await getDocs(query(collection(db, 'User'), where('email', '==', user.email)));
        let docId = snap.empty ? null : snap.docs[0].id;
        if (!docId) docId = user.email.split('@')[0]; // 기존 테스트 계정(학번 문서) 대응
        if (!isMounted) return;
        unsubUser = onSnapshot(doc(db, 'User', docId), (s) => {
          if (isMounted) setCurrentUserData(s.exists() ? { ...s.data(), id: s.id } : null);
        }, () => {});
      } catch (error) {
        console.error('데이터 로드 오류:', error);
      }
    };

    findAndSubscribe();
    return () => { isMounted = false; unsubUser(); };
  }, [user]);

  return { seats, user, currentUserData, authReady };
};
