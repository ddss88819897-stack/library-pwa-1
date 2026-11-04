import { doc, getDoc, updateDoc, addDoc, collection, increment, serverTimestamp, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { updateSeatStatus } from './seatApi';
import { addLog } from './logger';
import { format } from 'date-fns';
import { resolveUserDocId, emailPrefix, toDate, toMillis, minutesBetween } from '../utils/userDoc';

const ACTIVE = ['RESERVED', 'OCCUPIED'];

// 토스트(있으면) 또는 alert 로 안내
const notify = (setSystemAlert, title, message = '') => {
  if (setSystemAlert) setSystemAlert({ title, message });
  else alert(message ? `${title}\n${message}` : title);
};

// 패널티(이용 정지) 여부 확인 → 정지 해제 시각 or null
const getPenaltyEnd = async (userDocId, now) => {
  if (!userDocId) return null;
  const snap = await getDoc(doc(db, 'User', userDocId));
  if (!snap.exists()) return null;
  const end = toDate(snap.data().penaltyUntil);
  return end && now < end ? end : null;
};

// 취소/노쇼 누적 → 3회마다 단계별 이용 정지
const applyCancelPenalty = async (userDocId, now) => {
  if (!userDocId) return null;
  const ref = doc(db, 'User', userDocId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  const cancelCount = (data.cancelCount || 0) + 1;
  const updates = { cancelCount };
  let penaltyUntil = null;
  if (cancelCount >= 3) {
    const penaltyCount = (data.penaltyCount || 0) + 1;
    penaltyUntil = new Date(now);
    if (penaltyCount <= 3) penaltyUntil.setHours(penaltyUntil.getHours() + 2);
    else if (penaltyCount === 4) penaltyUntil.setDate(penaltyUntil.getDate() + 3);
    else penaltyUntil.setDate(penaltyUntil.getDate() + 30);
    Object.assign(updates, { cancelCount: 0, penaltyCount, penaltyUntil });
  }
  await updateDoc(ref, updates);
  return penaltyUntil;
};

// 특정 좌석(+특정 사용자)의 활성 예약을 일괄 상태 변경
const updateReservations = async ({ seatId, userId, reservationId, newStatus, onlyUntilToday = false }) => {
  if (reservationId) {
    await updateDoc(doc(db, 'Reservations', reservationId), { status: newStatus, updatedAt: serverTimestamp() });
    return;
  }
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const snap = await getDocs(query(collection(db, 'Reservations'), where('seatId', '==', seatId)));
  await Promise.all(snap.docs.map(d => {
    const r = d.data();
    if (!ACTIVE.includes(r.status)) return null;
    if (userId && r.userId !== userId) return null;
    if (onlyUntilToday && r.date > todayStr) return null;
    return updateDoc(doc(db, 'Reservations', d.id), { status: newStatus, updatedAt: serverTimestamp() });
  }));
};

const addUsageStats = async (email, minutes) => {
  const id = await resolveUserDocId(email);
  if (!id) return;
  try {
    await updateDoc(doc(db, 'User', id), { totalUsageCount: increment(1), totalUsageTime: increment(minutes) });
  } catch (e) {
    console.warn('이용 통계 갱신 실패:', e);
  }
};

export const handleLibraryAction = async ({
  actionType, seat, user, isAdmin, isExamPeriod, now = new Date(), reminderMinutes,
  setSelectedSeat, selectedDate, startTime, endTime,
  setSystemAlert, setShowIdQR, reservationId,
  reportPayload // 신고/소명 시 첨부파일 및 세부 데이터
}) => {
  const email = user?.email;
  const studentNo = emailPrefix(email);
  let userDocId = null;
  let currentUserName = user?.displayName || '';
  let profileStudentNo = studentNo;

  try {
    if (email) {
      userDocId = await resolveUserDocId(email);
      try {
        const userDoc = await getDoc(doc(db, 'User', userDocId));
        if (userDoc.exists()) {
          if (userDoc.data().name) currentUserName = userDoc.data().name;
          if (userDoc.data().studentNo) profileStudentNo = String(userDoc.data().studentNo);
        }
      } catch { /* 이름 조회 실패는 무시 */ }
    }

    // [A] 지정 시간 예약
    if (actionType === 'RESERVED') {
      if (isExamPeriod && !isAdmin && !/^\d{7}$/.test(profileStudentNo)) return notify(setSystemAlert, '🚨 예약 불가', '시험 기간에는 재학생만 예약할 수 있습니다.');
      if (!startTime || !endTime || startTime >= endTime) return notify(setSystemAlert, '🚨 시간 오류', '종료 시간은 시작 시간보다 늦어야 합니다.');

      if (!isAdmin) {
        const penaltyEnd = await getPenaltyEnd(userDocId, now);
        if (penaltyEnd) return notify(setSystemAlert, '🚫 예약 정지', `패널티로 인해 예약이 제한되었습니다.\n해제일시: ${format(penaltyEnd, 'yyyy-MM-dd HH:mm')}`);
      }

      const dateStr = format(selectedDate || now, 'yyyy-MM-dd');
      const todayStr = format(now, 'yyyy-MM-dd');

      // 1인 1예약 (관리자 대리 예약은 예외)
      if (!isAdmin) {
        const mine = await getDocs(query(collection(db, 'Reservations'), where('userId', '==', email)));
        const hasActive = mine.docs.some(d => ACTIVE.includes(d.data().status) && d.data().date >= todayStr);
        if (hasActive) return notify(setSystemAlert, '🚨 중복 예약', '이미 진행 중인 예약이 있습니다.\n기존 예약을 취소하거나 이용 완료 후 다시 예약해 주세요.');
      }

      // 같은 좌석 · 같은 날짜 시간 겹침 검사
      const sameSeat = await getDocs(query(collection(db, 'Reservations'), where('seatId', '==', seat.id), where('date', '==', dateStr)));
      const overlap = sameSeat.docs.some(d => {
        const r = d.data();
        return ACTIVE.includes(r.status) && r.startTime < endTime && startTime < r.endTime;
      });
      if (overlap) return notify(setSystemAlert, '🚨 예약 불가', '선택한 시간대에 이미 예약된 좌석입니다.\n다른 시간이나 좌석을 선택해 주세요.');

      await addDoc(collection(db, 'Reservations'), {
        seatId: seat.id, userId: email, date: dateStr, startTime, endTime, status: 'RESERVED', createdAt: serverTimestamp()
      });

      const hours = Math.max(0.5, minutesBetween(startTime, endTime) / 60);
      // 오늘 예약만 좌석 상태에 반영 (다른 날짜 예약이 오늘 좌석을 막지 않도록)
      if (dateStr === todayStr) {
        await updateSeatStatus(seat.id, 'RESERVED', email, hours, currentUserName, reminderMinutes, studentNo);
      }
      notify(setSystemAlert, '✅ 예약 완료', `${seat.label || seat.id} · ${dateStr === todayStr ? '오늘' : dateStr} ${startTime} ~ ${endTime}`);
      addLog(studentNo, 'RESERVE', 'SUCCESS', seat.id);
    }

    // [A-2] 현장 즉시 발권 - 트랜잭션 동시성 제어
    else if (actionType === 'IMMEDIATE_USE') {
      const finalHours = 2;
      if (isExamPeriod && !isAdmin && !/^\d{7}$/.test(profileStudentNo)) return notify(setSystemAlert, '🚨 이용 불가', '시험 기간에는 재학생만 이용할 수 있습니다.');

      if (!isAdmin) {
        const penaltyEnd = await getPenaltyEnd(userDocId, now);
        if (penaltyEnd) return notify(setSystemAlert, '🚫 이용 정지', `패널티로 현장 발권이 제한되었습니다.\n해제일시: ${format(penaltyEnd, 'yyyy-MM-dd HH:mm')}`);

        const todayStr = format(now, 'yyyy-MM-dd');
        const mine = await getDocs(query(collection(db, 'Reservations'), where('userId', '==', email)));
        if (mine.docs.some(d => ACTIVE.includes(d.data().status) && d.data().date >= todayStr)) {
          return notify(setSystemAlert, '🚨 중복 이용', '이미 진행 중인 예약이 있습니다.');
        }
      }

      const seatRef = doc(db, 'Seat', seat.id);
      await runTransaction(db, async (transaction) => {
        const seatDoc = await transaction.get(seatRef);
        const currentStatus = seatDoc.exists() ? seatDoc.data().status : 'AVAILABLE';
        if (currentStatus && currentStatus !== 'AVAILABLE') throw new Error('REJECTED_CONCURRENCY');

        const startNow = new Date();
        let endNow = new Date(startNow.getTime() + finalHours * 60 * 60 * 1000);
        // 자정을 넘기면 "01:00" 처럼 문자열 비교가 깨지므로 당일 23:59 로 제한
        if (format(endNow, 'yyyy-MM-dd') !== format(startNow, 'yyyy-MM-dd')) {
          endNow = new Date(startNow); endNow.setHours(23, 59, 0, 0);
        }

        transaction.set(doc(collection(db, 'Reservations')), {
          seatId: seat.id, userId: email, date: format(startNow, 'yyyy-MM-dd'), startTime: format(startNow, 'HH:mm'), endTime: format(endNow, 'HH:mm'), status: 'RESERVED', isImmediate: true, createdAt: serverTimestamp()
        });
        transaction.set(seatRef, { status: 'RESERVED', userId: email, startedAt: null, reservedHours: finalHours, userName: currentUserName, studentNo, updatedAt: serverTimestamp() }, { merge: true });
      });

      if (setShowIdQR) setShowIdQR(true);
      addLog(studentNo, 'RESERVE', 'IMMEDIATE_SUCCESS', seat.id);
    }

    // 섀도우 스코어링 + 미디어 첨부 신고 (REPORT_SEAT)
    else if (actionType === 'REPORT_SEAT') {
      const { reason, mediaUrls, isCleanCheck } = reportPayload;

      // 직전 사용자 2명 추적 (복합 인덱스 없이 동작하도록 클라이언트에서 정렬)
      const logSnap = await getDocs(query(collection(db, 'Log'), where('seatId', '==', seat.id)));
      const recent = logSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(l => ['RETURN', 'AUTO_CHECKOUT'].includes(l.action) && (l.uid || l.studentNo) && l.uid !== email)
        .sort((a, b) => toMillis(b.createdAt || b.timestamp) - toMillis(a.createdAt || a.timestamp))
        .slice(0, 2);

      if (recent.length === 0) return notify(setSystemAlert, '🚨 신고 불가', '이전 이용 내역이 없어 대상을 특정할 수 없습니다.');

      await addDoc(collection(db, 'Log'), {
        action: 'USER_REPORTED', seatId: seat.id, seatLabel: seat.label || seat.id, reporter: email,
        result: reason, mediaUrls: mediaUrls || [], reportStatus: 'SHADOW_SCORING_ACTIVE',
        suspects: recent.map(u => u.uid || u.studentNo), isCleanCheck: !!isCleanCheck, createdAt: serverTimestamp()
      });

      // 직전자 2점, 앞앞사람 1점
      await Promise.all(recent.map(async (u, i) => {
        const id = String(u.uid || '').includes('@') ? await resolveUserDocId(u.uid) : (u.studentNo || u.uid);
        if (!id) return;
        try { await updateDoc(doc(db, 'User', id), { shadowScore: increment(i === 0 ? 2 : 1) }); } catch { /* 대상 문서 없음 */ }
      }));

      notify(setSystemAlert, '🚨 증거 기반 신고 완료', isCleanCheck
        ? '입실 직후 클린 체크로 회원님은 면책되었습니다.\n이전 사용자들에게 섀도우 스코어가 누적됩니다.'
        : '증거 자료와 함께 관리자에게 전달되었습니다.');
    }

    // 신고 소명 접수 (APPEAL_REPORT)
    else if (actionType === 'APPEAL_REPORT') {
      const { logId, appealReason, appealMediaUrls } = reportPayload;
      await updateDoc(doc(db, 'Log', logId), {
        reportStatus: 'APPEALING', appealReason, appealMediaUrls: appealMediaUrls || [], appealedAt: serverTimestamp()
      });
      notify(setSystemAlert, '🙋 소명 접수 완료', '관리자에게 소명 자료가 전달되었습니다.\n허위 소명 시 가중 처벌(2배)될 수 있습니다.');
    }

    // 현장 발권 자동 취소 (QR 창을 닫고 입실하지 않은 경우)
    else if (actionType === 'CANCEL_IMMEDIATE') {
      const seatSnap = await getDoc(doc(db, 'Seat', seat.id));
      if (seatSnap.exists() && seatSnap.data().status === 'OCCUPIED') return;
      await updateReservations({ seatId: seat.id, userId: email, reservationId, newStatus: 'CANCELLED' });
      if (!seatSnap.exists() || seatSnap.data().userId === email) {
        await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
      }
    }

    // 예약 취소 (CANCEL)
    else if (actionType === 'CANCEL') {
      if (isAdmin && seat?.userId && seat.userId !== email) {
        if (!window.confirm('관리자 권한으로 예약을 취소하시겠습니까? (패널티 면제)')) return;
        await updateReservations({ seatId: seat.id, userId: seat.userId, newStatus: 'CANCELLED', onlyUntilToday: true });
        await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
        notify(setSystemAlert, '✅ 강제 예약 취소 완료');
      } else {
        if (!window.confirm('예약을 취소하시겠습니까?\n(취소 3회 누적 시 이용 정지 패널티가 부여됩니다.)')) return;
        const penaltyUntil = isAdmin ? null : await applyCancelPenalty(userDocId, now);
        await updateReservations({ seatId: seat.id, userId: email, reservationId, newStatus: 'CANCELLED' });
        // 좌석이 내 것으로 잡혀 있을 때만 비움 (다른 사람 좌석을 지우지 않도록)
        const seatSnap = await getDoc(doc(db, 'Seat', seat.id));
        if (seatSnap.exists() && seatSnap.data().userId === email) {
          await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
        }
        notify(setSystemAlert, '✅ 예약이 취소되었습니다', penaltyUntil ? `취소 3회 누적으로 ${format(penaltyUntil, 'M월 d일 HH:mm')}까지 예약이 제한됩니다.` : '');
      }
    }

    // 퇴실 / 반납 (RETURN) · 시간 만료 자동 퇴실 (AUTO_CHECKOUT)
    else if (actionType === 'RETURN' || actionType === 'AUTO_CHECKOUT') {
      const isAuto = actionType === 'AUTO_CHECKOUT';
      const seatSnap = await getDoc(doc(db, 'Seat', seat.id));
      const live = seatSnap.exists() ? { ...seat, ...seatSnap.data() } : seat;
      const ownerEmail = live.userId || email;
      const isForceEvict = isAdmin && live.userId && live.userId !== email;

      if (!isAuto && !window.confirm(isForceEvict ? '강제 퇴실(반납) 처리하시겠습니까?' : '퇴실하시겠습니까?')) return;
      if (isAuto && live.userId !== email) {
        // 좌석은 이미 비워졌거나 다른 사람이 사용 중 → 내 예약 기록만 정리
        await updateReservations({ seatId: seat.id, userId: email, reservationId, newStatus: 'RETURNED' });
        return;
      }

      if (isForceEvict) {
        try {
          const targetId = await resolveUserDocId(live.userId);
          await addDoc(collection(db, 'User', targetId, 'notifications'), {
            message: `🚨 [관리자] ${seat.id} 좌석이 규정 위반으로 인해 강제 퇴실되었습니다.`, read: false, createdAt: serverTimestamp()
          });
        } catch (e) { console.error('알림 발송 실패:', e); }
      }

      const startedAt = toDate(live.startedAt) || now;
      const usedMins = Math.max(1, Math.ceil((now - startedAt) / 60000));
      if (live.status === 'OCCUPIED') await addUsageStats(ownerEmail, usedMins);

      await updateReservations({ seatId: seat.id, userId: ownerEmail, newStatus: 'RETURNED', onlyUntilToday: true });
      await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20, '', isAuto ? { logAction: 'AUTO_CHECKOUT', logResult: '이용 시간 만료로 인한 자동 퇴실' } : undefined);

      if (isAuto) notify(setSystemAlert, '⏰ 자동 퇴실 완료', `이용 시간이 끝나 ${seat.id} 좌석이 자동 반납되었습니다. (${usedMins}분 이용)`);
      else notify(setSystemAlert, isForceEvict ? '✅ 강제 퇴실 처리 완료' : '👋 퇴실 완료', isForceEvict ? '' : `${usedMins}분 이용하셨습니다. 수고하셨어요!`);
    }

    // 입실 시간 15분 경과 미인증 → 노쇼 처리
    else if (actionType === 'NO_SHOW') {
      await updateReservations({ seatId: seat.id, userId: email, reservationId, newStatus: 'NO_SHOW' });
      const seatSnap = await getDoc(doc(db, 'Seat', seat.id));
      if (seatSnap.exists() && seatSnap.data().userId === email && seatSnap.data().status === 'RESERVED') {
        await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
      }
      const penaltyUntil = await applyCancelPenalty(userDocId, now);
      await addDoc(collection(db, 'Log'), {
        action: 'NO_SHOW_CANCEL', seatId: seat.id, seatLabel: seat.id, uid: email, studentNo,
        result: '15분 미입실로 인한 예약 자동 취소', createdAt: serverTimestamp()
      });
      notify(setSystemAlert, '⚠️ 노쇼 자동 취소', `입실 시간 15분이 지나 ${seat.id} 예약이 취소되었습니다.${penaltyUntil ? `\n${format(penaltyUntil, 'M월 d일 HH:mm')}까지 예약이 제한됩니다.` : ''}`);
    }

    else if (actionType === 'DISABLED' || actionType === 'DISABLE') {
      if (!window.confirm('이 좌석을 비활성화 하시겠습니까?')) return;
      if (seat.userId) await updateReservations({ seatId: seat.id, userId: seat.userId, newStatus: 'CANCELLED', onlyUntilToday: true });
      await updateSeatStatus(seat.id, 'DISABLED', null, 0, null, 20);
    }
    else if (actionType === 'OCCUPY') {
      await updateSeatStatus(seat.id, 'OCCUPIED', email, seat.reservedHours || 1, currentUserName, reminderMinutes, studentNo);
      await updateReservations({ seatId: seat.id, userId: email, newStatus: 'OCCUPIED', onlyUntilToday: true });
    }
    else if (actionType === 'ENABLE') {
      if (!window.confirm('비활성화를 해제하시겠습니까?')) return;
      await updateSeatStatus(seat.id, 'AVAILABLE', null, 0, null, 20);
    }

  } catch (error) {
    if (error.message === 'REJECTED_CONCURRENCY') {
      notify(setSystemAlert, '🚨 이미 선점된 좌석', '방금 다른 이용자가 이 좌석을 먼저 예약했습니다.');
    } else {
      console.error(error);
      notify(setSystemAlert, '❌ 처리 중 오류', error.message || '잠시 후 다시 시도해 주세요.');
    }
  } finally {
    if (setSelectedSeat) setSelectedSeat(null);
  }
};
