import { collection, onSnapshot, doc, setDoc, getDoc, serverTimestamp, addDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

// 1. 실시간 조회 (상열이용) - 🚨 즉각 반응 옵션 켜기!
export const subscribeToSeats = (setSeats) => {
  const seatCollection = collection(db, "Seat");
  // 👇 includeMetadataChanges: true 를 넣어야 새로고침 없이 즉시 색상이 바뀝니다!
  const unsubscribe = onSnapshot(seatCollection, { includeMetadataChanges: true }, (snapshot) => {
    const seatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setSeats(seatList);
  });
  return unsubscribe;
};

// 2. 좌석 상태 업데이트 및 🧾 영수증(Log) 자동 발행기
export const updateSeatStatus = async (seatId, newStatus, userId = null, hours = 0, userName = "", reminderMinutes = 20, studentNo = "") => {
  try {
    const seatRef = doc(db, "Seat", seatId);
    const seatSnap = await getDoc(seatRef);
    const seatData = seatSnap.exists() ? seatSnap.data() : null;

    const isClearing = (newStatus === 'AVAILABLE' || newStatus === 'DISABLED');

    let updateData = {
      status: newStatus,
      userId: isClearing ? null : (userId || seatData?.userId || null),
      userName: isClearing ? null : (userName || seatData?.userName || null),
      studentNo: isClearing ? null : (studentNo || seatData?.studentNo || null), // ✨ 이 한 줄을 꼭 추가하세요!
      updatedAt: serverTimestamp()
    };

    let actionType = '';
    let resultMessage = '';
    let actualUsedMinutes = 0;

    if (newStatus === 'RESERVED') {
      updateData.reservedHours = hours || 1;  
      updateData.reminderMinutes = reminderMinutes || 20; 
      actionType = 'RESERVE';
      resultMessage = '좌석 예약 성공';

    } else if (newStatus === 'OCCUPIED') {
      if (!seatData?.startedAt) updateData.startedAt = serverTimestamp(); 
      actionType = 'CHECK_IN';
      resultMessage = '정상 입실 처리';

    } else if (isClearing) {
      if (seatData?.startedAt) {
        const startTime = seatData.startedAt.toDate ? seatData.startedAt.toDate() : new Date(seatData.startedAt);
        actualUsedMinutes = Math.floor((new Date() - startTime) / (1000 * 60)); 
        if (actualUsedMinutes < 0) actualUsedMinutes = 0;
      }

      updateData.startedAt = null;       
      updateData.reservedHours = null;
      updateData.reminderMinutes = null;
      
      if (newStatus === 'DISABLED') {
        actionType = seatData?.userId ? 'FORCE_EVICT' : 'ADMIN_ACTION';
        resultMessage = '관리자에 의한 좌석 비활성화';
      } else {
        actionType = 'RETURN';
        resultMessage = '사용자 자진 반납 및 초기화';
      }
    }

    await setDoc(seatRef, updateData, { merge: true });
    console.log(`✅ ${seatId} 상태 변경 완료! -> ${newStatus}`);

    const targetUserId = userId || seatData?.userId;
    const targetStudentNo = studentNo || userName || seatData?.studentNo || seatData?.userName;

    if (actionType && targetUserId) {
      await addDoc(collection(db, "Log"), {
        action: actionType,
        seatId: seatId,
        seatLabel: seatId, 
        uid: targetUserId,
        studentNo: targetStudentNo || "", 
        result: resultMessage,
        usedMinutes: actualUsedMinutes,
        createdAt: serverTimestamp(),
        startedAt: seatData?.startedAt || null 
      });
    }

  } catch (error) {
    console.error("❌ 업데이트 실패:", error);
    throw error; 
  }
};

// 배치도 좌석들의 위치(x, y)와 크기(width, height)를 파이어베이스에 한 번에 일괄 저장하는 함수입니다.
export const updateSeatsLayout = async (updatedSeats) => {
  try {
    const batch = writeBatch(db);

    updatedSeats.forEach(seat => {
      // 대소문자 주의: 기존 상단 코드에서 "Seat" 컬렉션을 사용하므로 동일하게 매칭합니다.
      const seatRef = doc(db, "Seat", seat.id);
      
      // ⚠️ 중요: 세션 초기화 방지를 위해 setDoc 대신 update를 사용하여 위치/크기만 쏙 변경합니다.
      batch.update(seatRef, {
        x: Number(seat.x) || 0,
        y: Number(seat.y) || 0,
        width: Number(seat.width) || 75,
        height: Number(seat.height) || 65,
        label: seat.label || seat.id
      });
    });

    // 파이어베이스로 일괄 전송
    await batch.commit();
    console.log("✅ 모든 좌석 배치도가 파이어베이스에 안전하게 저장되었습니다.");
  } catch (error) {
    console.error("🚨 좌석 배치 일괄 저장 중 오류 발생:", error);
    throw error;
  }
};