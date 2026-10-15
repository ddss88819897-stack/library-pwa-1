import { useState, useEffect } from 'react';
import { auth, db } from '../firebase'; 
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore'; 
import { subscribeToSeats } from '../api/seatApi';

export const useLibraryData = () => {
  const [seats, setSeats] = useState([]);
  const [user, setUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);

  // 1. 좌석 정보 실시간 구독 (공용 데이터)
  useEffect(() => {
    // 🚨 핵심: 로그인이 안 되어 있으면 좌석 데이터를 부르지 않음 (권한 에러 방지)
    if (!user) {
      setSeats([]);
      return;
    }

    const unsubscribeSeats = subscribeToSeats((fetchedSeats) => {
      setSeats(fetchedSeats);
    });
    return () => unsubscribeSeats();
  }, [user]); // [] 대신 [user]를 넣어야 합니다.

  // 2. 로그인 상태 감시
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribeAuth();
  }, []);

  // 3. 내 상세 정보(User 컬렉션) 구독: 기존 학번 데이터 유지 + 실시간 동기화
  useEffect(() => {
    let isMounted = true;
    let unsubUser = () => {};

    const findAndSubscribe = async () => {
      if (!user || !user.email) {
        setCurrentUserData(null);
        return;
      }

      try {
        // 1. 이메일로 문서 조회 (기존 학번 문서 ID를 찾기 위함)
        const q = query(collection(db, "User"), where("email", "==", user.email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty && isMounted) {
          const docId = querySnapshot.docs[0].id;
          
          // 2. 찾은 문서ID(학번)로 실시간 리스너 연결
          unsubUser = onSnapshot(doc(db, "User", docId), (snap) => {
            if (snap.exists() && isMounted) {
              setCurrentUserData({ ...snap.data(), id: snap.id });
            }
          });
        }
      } catch (error) {
        console.error("데이터 로드 오류:", error);
      }
    };

    findAndSubscribe();

    return () => {
      isMounted = false; // 컴포넌트가 사라지면 작업 중단
      unsubUser();       // 리스너 구독 해제
    };
  }, [user]);

  return { seats, user, currentUserData };
};