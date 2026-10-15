import { doc, getDoc, updateDoc, addDoc, collection, increment, serverTimestamp, query, where, getDocs, runTransaction, orderBy, limit } from 'firebase/firestore'; 
import { db } from '../firebase';
import { updateSeatStatus } from './seatApi';
import { addLog } from './logger';
import { format } from 'date-fns';

export const handleLibraryAction = async ({
  actionType, seat, user, isAdmin, isExamPeriod, now, reminderMinutes,
  setSelectedSeat, setShowCancelWarning, setCancelWarningData, loadUsers,
  hours, setShowSeatQR, 
  selectedDate, startTime, endTime,
  setSystemAlert, setShowIdQR, 
  reportPayload // 🚨 [추가] 신고/소명 시 넘어오는 첨부파일 및 세부 데이터
}) => {
  let studentNo = user?.email?.split('@')[0];
  let currentUserName = "";

  if (studentNo) {
    try {
      const userDoc = await getDoc(doc(db, "User", studentNo));
      if (userDoc.exists()) currentUserName = userDoc.data().name;
    } catch (e) {}
  }

  try {
    const clearReservations = async (newResStatus) => {
      const q = query(collection(db, "Reservations"), where("seatId", "==", seat.id));
      const snap = await getDocs(q);
      const promises = snap.docs.map(d => {
        const data = d.data();
        if (data.status === 'RESERVED' || data.status === 'OCCUPIED') {
          return updateDoc(doc(db, "Reservations", d.id), { status: newResStatus });
        }
        return Promise.resolve();
      });
      await Promise.all(promises);
    };

    // [A] 지정 시간 예약하기 (RESERVED)
    if (actionType === 'RESERVED') {
      const finalHours = hours || 1; 
      if (isExamPeriod && !isAdmin && !/^\d{7}$/.test(studentNo)) return alert("🚨 시험 기간에는 재학생만 예약할 수 있습니다.");

      if (studentNo) {
        const userSnap = await getDoc(doc(db, "User", studentNo));
        if (userSnap.exists() && userSnap.data().penaltyUntil && !isAdmin) {
          const penaltyEnd = userSnap.data().penaltyUntil.toDate ? userSnap.data().penaltyUntil.toDate() : new Date(userSnap.data().penaltyUntil);
          if (now < penaltyEnd) return setSystemAlert?.({ title: "🚫 예약 정지", message: `패널티로 인해 예약이 제한되었습니다.\n해제일시: ${format(penaltyEnd, 'yyyy-MM-dd HH:mm')}` });
        }
      }

      const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(now, 'yyyy-MM-dd');
      await addDoc(collection(db, "Reservations"), {
        seatId: seat.id, userId: user.email, date: dateStr, startTime: startTime || "09:00", endTime: endTime || "11:00", status: 'RESERVED', createdAt: serverTimestamp()
      });

      await updateSeatStatus(seat.id, 'RESERVED', user?.email, finalHours, currentUserName, reminderMinutes, studentNo || "");
      alert(`⏱️ ${finalHours}시간 예약이 완료되었습니다.`);
      addLog(studentNo, 'RESERVE', 'SUCCESS', seat.id);
    }

    // [A-2] 현장 즉시 발권 (IMMEDIATE_USE) - 트랜잭션 동시성 제어
    else if (actionType === 'IMMEDIATE_USE') {
      const finalHours = hours || 2; 
      if (isExamPeriod && !isAdmin && !/^\d{7}$/.test(studentNo)) return alert("🚨 시험 기간에는 재학생만 이용할 수 있습니다.");

      if (studentNo) {
        const userSnap = await getDoc(doc(db, "User", studentNo));
        if (userSnap.exists() && userSnap.data().penaltyUntil && !isAdmin) {
          const penaltyEnd = userSnap.data().penaltyUntil.toDate ? userSnap.data().penaltyUntil.toDate() : new Date(userSnap.data().penaltyUntil);
          if (now < penaltyEnd) return setSystemAlert?.({ title: "🚫 이용 정지", message: `패널티로 현장 발권이 제한되었습니다.\n해제일시: ${format(penaltyEnd, 'yyyy-MM-dd HH:mm')}` });
        }
      }

      const seatRef = doc(db, "Seat", seat.id);
      const reservationsColl = collection(db, "Reservations");

      await runTransaction(db, async (transaction) => {
        const seatDoc = await transaction.get(seatRef);
        const currentStatus = seatDoc.exists() ? seatDoc.data().status : 'AVAILABLE';
        if (currentStatus !== 'AVAILABLE' && currentStatus !== undefined) throw new Error("REJECTED_CONCURRENCY");

        const startNow = new Date();
        const endNow = new Date(startNow.getTime() + finalHours * 60 * 60 * 1000);
        
        transaction.set(doc(reservationsColl), {
          seatId: seat.id, userId: user.email, date: format(startNow, 'yyyy-MM-dd'), startTime: format(startNow, 'HH:mm'), endTime: format(endNow, 'HH:mm'), status: 'RESERVED', isImmediate: true, createdAt: serverTimestamp()
        });

        transaction.update(seatRef, { status: 'RESERVED', userId: user.email, startedAt: startNow, reservedHours: finalHours, userName: currentUserName, studentNo: studentNo });
      });

      if (setShowIdQR) setShowIdQR(true);
      addLog(studentNo, 'RESERVE', 'IMMEDIATE_SUCCESS', seat.id);
    }

    // 🚀 [핵심 아키텍처 1] 섀도우 스코어링 + 미디어 첨부 신고 시스템 (REPORT_SEAT)
    else if (actionType === 'REPORT_SEAT') {
      const { reason, mediaUrls, isCleanCheck } = reportPayload;

      // 이전 사용자 2명을 추적합니다 (폭탄 돌리기 방어용)
      const logQ = query(collection(db, 'Log'), where('seatId', '==', seat.id), where('action', 'in', ['RETURN', 'AUTO_CHECKOUT']), orderBy('timestamp', 'desc'), limit(2));
      const logSnap = await getDocs(logQ);
      
      if (logSnap.empty) return alert("🚨 이전 이용 내역이 없어 대상을 특정할 수 없습니다.");

      const recentUsers = logSnap.docs.map(d => ({ uid: d.data().uid || d.data().studentNo, id: d.id }));
      const primarySuspect = recentUsers[0]; // 직전자 (B)
      const secondarySuspect = recentUsers.length > 1 ? recentUsers[1] : null; // 앞앞사람 (A)

      // 1. 신고 로그 생성 (사진/영상 포함)
      await addDoc(collection(db, "Log"), {
        action: 'USER_REPORTED',
        seatId: seat.id,
        seatLabel: seat.id,
        reporter: user.email, 
        result: reason,
        mediaUrls: mediaUrls || [], // 📸 증거 자료
        reportStatus: 'SHADOW_SCORING_ACTIVE', // 그림자 점수 누적 중
        suspects: recentUsers.map(u => u.uid), // 👥 혐의자 명단
        isCleanCheck: isCleanCheck, // 3분 내 인증 여부
        createdAt: serverTimestamp()
      });

      // 2. 섀도우 스코어(Shadow Score) 알고리즘 분배
      // 3분 이내 클린 체크면 앞사람들만 징계. 3분 이후면 현 사용자도 묵인 혐의 반영.
      try {
        const p1Ref = doc(db, "User", primarySuspect.uid.split('@')[0]);
        await updateDoc(p1Ref, { shadowScore: increment(2) }); // 직전자는 벌점 2점

        if (secondarySuspect) {
          const p2Ref = doc(db, "User", secondarySuspect.uid.split('@')[0]);
          await updateDoc(p2Ref, { shadowScore: increment(1) }); // 앞앞사람은 벌점 1점
        }
      } catch (e) {}

      if (setSystemAlert) {
        setSystemAlert({
          title: "🚨 증거 기반 신고 완료",
          message: isCleanCheck 
            ? "입실 3분 내 클린 체크가 완료되어 회원님은 면책되었습니다.\n이전 사용자들에게 섀도우 스코어가 누적됩니다."
            : "신고가 접수되었습니다.\n증거 자료와 함께 관리자 대시보드에 전송되었으며, 누적 점수에 따라 피신고자는 제재를 받습니다."
        });
      }
    }

    // 🚀 [핵심 아키텍처 2] 신고 소명(Appeal) 접수 시스템 (APPEAL_REPORT)
    else if (actionType === 'APPEAL_REPORT') {
      const { logId, appealReason, appealMediaUrls } = reportPayload;
      
      // 해당 신고 로그를 소명 중(APPEALING)으로 업데이트
      const logRef = doc(db, "Log", logId);
      await updateDoc(logRef, {
        reportStatus: 'APPEALING',
        appealReason: appealReason,
        appealMediaUrls: appealMediaUrls || [], // 📸 소명 증거
        appealedAt: serverTimestamp()
      });

      if (setSystemAlert) {
        setSystemAlert({
          title: "🙋‍♂️ 소명 접수 완료",
          message: "관리자에게 소명 자료가 전달되었습니다.\n※ 허위 소명으로 판명될 경우, 규정에 따라 가중 처벌(2배)을 받을 수 있습니다."
        });
      }
    }

    // [B-2] 현장 발권 자동 취소 (CANCEL_IMMEDIATE)
    else if (actionType === 'CANCEL_IMMEDIATE') {
      const seatSnap = await getDoc(doc(db, "Seat", seat.id));
      if (seatSnap.exists() && seatSnap.data().status === 'OCCUPIED') return; 

      await clearReservations('CANCELLED'); 
      await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
    }

    // [B-3] 일반 예약 취소 (CANCEL)
    else if (actionType === 'CANCEL') {
      if (isAdmin) {
        if (!window.confirm("관리자 권한으로 예약을 취소하시겠습니까? (패널티 면제)")) return;
        await clearReservations('CANCELLED'); 
        await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
        alert("✅ 강제 예약 취소가 완료되었습니다.");
      } else {
        if (!window.confirm("예약을 취소하시겠습니까?\n(잦은 취소 시 패널티가 부여될 수 있습니다.)")) return;
        const targetUserRef = doc(db, "User", studentNo);
        const targetUserSnap = await getDoc(targetUserRef);

        if (targetUserSnap.exists()) {
          let data = targetUserSnap.data();
          let cancelCount = (data.cancelCount || 0) + 1;
          let penaltyCount = data.penaltyCount || 0;
          let updates = { cancelCount: cancelCount };

          if (cancelCount >= 3) {
            penaltyCount += 1;
            updates.penaltyCount = penaltyCount;
            updates.cancelCount = 0;
            let penaltyTime = new Date(now);
            if (penaltyCount <= 3) penaltyTime.setHours(penaltyTime.getHours() + 2);
            else if (penaltyCount === 4) penaltyTime.setDate(penaltyTime.getDate() + 3);
            else penaltyTime.setDate(penaltyTime.getDate() + 30);
            updates.penaltyUntil = penaltyTime;
          }
          await updateDoc(targetUserRef, updates);
          await clearReservations('CANCELLED'); 
          await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
        }
      }
    }

    // [C] 퇴실 및 반납 (RETURN)
    else if (actionType === 'RETURN') {
      const isForceEvict = isAdmin && seat.userId !== user?.email;
      if (!window.confirm(isForceEvict ? "강제 퇴실(반납) 처리하시겠습니까?" : "퇴실하시겠습니까?")) return;

      if (isForceEvict) {
        try {
          const targetUserId = seat.userId?.split('@')[0];
          if (targetUserId) {
            // 해당 사용자의 notifications 컬렉션에 알림 추가
            await addDoc(collection(db, "User", targetUserId, "notifications"), {
              message: `🚨 [관리자] ${seat.id}번 좌석이 규정 위반으로 인해 강제 퇴실되었습니다.`,
              read: false,
              createdAt: serverTimestamp()
            });
          }
        } catch (e) {
          console.error("알림 발송 실패:", e);
        }
      }

      const startedAt = seat.startedAt?.toDate ? seat.startedAt.toDate() : new Date(seat.startedAt || now);
      const usedMins = Math.max(1, Math.ceil((now - startedAt) / 60000));
      const actualUserId = seat.userId?.split('@')[0] || studentNo;

      if (actualUserId) {
        try { await updateDoc(doc(db, "User", actualUserId), { totalUsageCount: increment(1), totalUsageTime: increment(usedMins) }); } catch(e) {}
      }

      await clearReservations('RETURNED'); 
      await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
      alert(isForceEvict ? "✅ 강제 퇴실 처리되었습니다." : `✅ 퇴실 완료 (${usedMins}분 이용)`);
    }

    // [D, E, F 생략 - 기존과 동일하게 유지]
    else if (actionType === 'DISABLED' || actionType === 'DISABLE') {
      if (!window.confirm("비활성화 하시겠습니까?")) return;
      await clearReservations('CANCELLED'); await updateSeatStatus(seat.id, 'DISABLED', null, 0, null, 20);
    }
    else if (actionType === 'OCCUPY') {
      await updateSeatStatus(seat.id, 'OCCUPIED', user?.email, seat.reservedHours || 1, currentUserName, reminderMinutes, studentNo || "");
      await clearReservations('OCCUPIED'); 
    }
    else if (actionType === 'ENABLE') {
      if (!window.confirm("해제하시겠습니까?")) return;
      await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
    }

  } catch (error) {
    if (error.message === "REJECTED_CONCURRENCY") {
      alert("🚨 동시성 충돌: 다른 유저가 좌석을 선점했습니다.");
    } else {
      console.error(error);
    }
  } finally {
    if (setSelectedSeat) setSelectedSeat(null);
  }
};