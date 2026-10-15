import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, setDoc, addDoc, collection, serverTimestamp, increment, query, where, getDocs } from 'firebase/firestore';

export const useLibrarySystem = (
  seats, user, isAdmin, isExamActive, examEndDate, 
  setExamStartDate, setExamEndDate, setIsExamActive 
) => {
  const [now, setNow] = useState(new Date());
  const [hasAlertedReminder, setHasAlertedReminder] = useState(false); 
  const [hasAlertedExpired, setHasAlertedExpired] = useState(false);  

  // 🔔 공통 알림 함수
  const sendLibraryAlert = (title, message) => {
    if (Notification.permission === 'granted') {
      new Notification(title, { body: message, icon: '/favicon.ico' });
    } else {
      alert(`${title}: ${message}`);
    }
  };

  // 1️⃣ 1초(1000ms)마다 현재 시간 갱신 타이머
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000); 
    return () => clearInterval(timer);
  }, []);

  // 2️⃣ 시험 기간 자동 해제 감시자 (설정된 시간이 지나면 자동 통제 해제)
  useEffect(() => {
    if (isExamActive && examEndDate) {
      const endDateTime = new Date(examEndDate);
      if (now > endDateTime) {
        const autoClearExamPeriod = async () => {
          try {
            if (isAdmin) {
              await setDoc(doc(db, "System", "config"), { 
                examStartDate: '', examEndDate: '', isExamActive: false 
              }, { merge: true });
            }
            
            // 🚨 2. 유저님이 짜셨던 완벽한 방어 코드 3줄 원상복구!
            setExamStartDate(''); 
            setExamEndDate(''); 
            setIsExamActive(false);
            
            alert("✅ 설정된 시험 기간이 종료되어 통제가 자동으로 해제되었습니다.\n이제 일반 모드로 예약이 가능합니다.");
          } catch (error) {
            console.error("❌ 자동 통제 해제 실패:", error);
          }
        };
        autoClearExamPeriod();
      }
    }
  }, [now, isExamActive, examEndDate, isAdmin, setExamStartDate, setExamEndDate, setIsExamActive]); // 의존성 배열에도 추가

  // 3️⃣ 1분(60초)마다 전체 좌석 감시 (자동 퇴실 & 노쇼 방지)
  useEffect(() => {
    const autoSystem = setInterval(() => {
      const currentTime = new Date();

      seats.forEach(async (seat) => {
        // [A] 자동 퇴실 로직 (이용 시간 만료 시)
        if (seat.status === 'OCCUPIED' && seat.startedAt && seat.reservedHours) {
          const startedAt = seat.startedAt.toDate ? seat.startedAt.toDate() : new Date(seat.startedAt);
          const reservedMs = seat.reservedHours * 60 * 60 * 1000; 
          const endTime = new Date(startedAt.getTime() + reservedMs);

          if (currentTime > endTime) {
            try {
              const seatRef = doc(db, "Seat", seat.id); // DB 컬렉션 이름 확인!
              await updateDoc(seatRef, {
                status: 'AVAILABLE', userId: null, userName: null,
                startedAt: null, updatedAt: serverTimestamp()
              });
              if (user && seat.userId === user.email) {
                sendLibraryAlert("🚨 자동 퇴실 안내", `${seat.label} 좌석 이용 시간이 만료되어 자동 퇴실 처리되었습니다.`);
              }
            } catch (e) {
              console.error("자동 퇴실 실패:", e);
            }
          }
        }

        // [B] 15분 노쇼 방지 로직 (예약만 하고 안 온 자리 강제 취소)
        if (seat.status === 'RESERVED' && seat.updatedAt) {
          const updatedAt = seat.updatedAt.toDate ? seat.updatedAt.toDate() : new Date(seat.updatedAt);
          const diffMin = (currentTime - updatedAt) / (1000 * 60);

          if (diffMin >= 15) {
            try {
              const targetUserId = seat.userId; 
              const targetStudentNo = targetUserId?.split('@')[0];
              
              const seatRef = doc(db, "Seat", seat.id);
              await updateDoc(seatRef, {
                status: 'AVAILABLE', userId: null, userName: null, updatedAt: serverTimestamp()
              });

              if (targetUserId) {
                const userRef = doc(db, "User", targetStudentNo); 
                await updateDoc(userRef, {
                  penaltyCount: increment(1), cancelCount: increment(1), lastPenaltyDate: serverTimestamp()
                });

                await addDoc(collection(db, "Log"), {
                  action: 'NO_SHOW_CANCEL', seatId: seat.id, seatLabel: seat.label || seat.id,
                  uid: targetUserId, studentNo: targetStudentNo || '', 
                  result: '15분 미입실로 인한 예약 취소 (페널티 부여)', createdAt: serverTimestamp()
                });
              }
              if (user && seat.userId === user.email) {
                sendLibraryAlert("⚠️ 노쇼 취소", `15분 내 미인증으로 ${seat.label || seat.id} 예약이 취소되고 패널티가 부여되었습니다.`);
              }
            } catch (e) {
              console.error("노쇼 처리 실패:", e);
            }
          }
        }
      });
    }, 60000);

    return () => clearInterval(autoSystem);
  }, [seats, user]);

  // 4️⃣ 이용자 본인 화면 알림 및 🚨 '자동 퇴실' 강제 집행 시스템
  useEffect(() => {
    if (user && seats.length > 0) {
      const mySeat = seats.find(s => s.userId === user.email && s.status === 'OCCUPIED');
      
      if (mySeat && mySeat.startedAt && mySeat.reservedHours) {
        const startTime = mySeat.startedAt.toDate ? mySeat.startedAt.toDate() : new Date(mySeat.startedAt);
        const limitInMs = mySeat.reservedHours * 60 * 60 * 1000;          
        const reminderLimitMs = (mySeat.reminderMinutes || 20) * 60 * 1000; 
        const remainingMs = limitInMs - (now - startTime);                                 

        // 🚨 [핵심 개선] 시간이 0 이하가 되면 경고만 띄우는 게 아니라 DB에서 '진짜로' 자리를 빼버립니다!
        if (remainingMs <= 0 && !hasAlertedExpired) {
          setHasAlertedExpired(true);
          alert(`🚨 이용 시간(${mySeat.reservedHours}시간)이 모두 초과되어 자동 퇴실 처리됩니다.`);

          const executeAutoCheckout = async () => {
            try {
              const usedMins = Math.max(1, Math.ceil((now - startTime) / 60000));
              const actualUserId = mySeat.userId.split('@')[0];

              // 1. 도면 좌석(Seat)을 완벽한 빈자리(AVAILABLE)로 리셋
              await updateDoc(doc(db, "Seat", mySeat.id), {
                status: 'AVAILABLE',
                userId: null,
                userName: null,
                startedAt: null,
                reservedHours: null,
                reminderMinutes: null,
                updatedAt: serverTimestamp()
              });

              // 2. 🎫 내 예약증(Reservations) 파기 처리
              // 👉 이걸 안 하면 캘린더나 내 예약 목록에서 영원히 '사용중'으로 겹쳐서 남습니다!
              const q = query(
                collection(db, "Reservations"), 
                where("seatId", "==", mySeat.id), 
                where("userId", "==", user.email)
              );
              const snap = await getDocs(q);
              snap.forEach(async (d) => {
                const resData = d.data();
                // 혹시 모를 미래의 예약(RESERVED)은 건드리지 않고, 현재 사용중이던 티켓만 정확히 반납 처리
                if (resData.status === 'OCCUPIED') {
                  await updateDoc(doc(db, "Reservations", d.id), { status: 'RETURNED' });
                }
              });

              // 3. 유저 누적 이용 시간/횟수 통계 업데이트
              await updateDoc(doc(db, "User", actualUserId), {
                totalUsageCount: increment(1),
                totalUsageTime: increment(usedMins)
              });

              // 4. 마이페이지 이력에 남도록 AUTO_CHECKOUT 영수증 발급
              await addDoc(collection(db, "Log"), {
                action: 'AUTO_CHECKOUT',
                seatId: mySeat.id,
                uid: mySeat.userId,
                studentNo: actualUserId,
                result: '이용 시간 만료로 인한 자동 시스템 퇴실',
                usedMinutes: usedMins,
                createdAt: serverTimestamp()
              });

              // 처리가 끝나면 화면을 깔끔하게 새로고침하여 앱 상태 리셋
              window.location.reload();
            } catch (error) {
              console.error("자동 퇴실 처리 중 에러 발생:", error);
            }
          };

          executeAutoCheckout();
        } 
        // 사전 알림 로직은 그대로 안전하게 유지
        else if (remainingMs > 0 && remainingMs <= reminderLimitMs && !hasAlertedReminder && mySeat.reminderMinutes > 0) {
          sendLibraryAlert("⏰ 퇴실 사전 알림", `퇴실 시간 ${mySeat.reminderMinutes}분 전입니다. 마무리를 준비해 주세요.`);
          setHasAlertedReminder(true);
        }
      }
    }
  }, [now, seats, user, hasAlertedExpired, hasAlertedReminder]);

  return now; // 렌더링에 필요한 현재 시간(now)만 App.jsx로 반환!
};