import { db } from '../firebase'; // 🔥 본인의 파이어베이스 설정 파일 경로에 맞게 수정하세요!
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, addDoc } from "firebase/firestore";

// 키오스크(맥북) 전용 QR 인증 로직
export const processKioskQRAuth = async (studentId) => {
  try {
    // 1. 해당 학생(studentId)이 예약한 좌석(status: 'RESERVED')을 DB에서 찾습니다.
    const seatsRef = collection(db, "Seat"); // 🚨 주의: 파이어베이스의 좌석 컬렉션 이름이 'seats'인지 확인 필요!
    const q = query(seatsRef, where("userId", "==", studentId), where("status", "==", "RESERVED"));
    const querySnapshot = await getDocs(q);

    // 예약 내역이 없으면 에러 던지기
    if (querySnapshot.empty) {
      throw "현재 예약된 좌석이 없거나 이미 입실 처리되었습니다.";
    }

    // 2. 검색된 좌석 정보 가져오기 (1명당 1좌석 예약 기준)
    const seatDoc = querySnapshot.docs[0];
    const seatRef = doc(db, "seats", seatDoc.id);
    const seatLabel = seatDoc.data().label || seatDoc.id;

    // 3. 좌석 상태를 'OCCUPIED'(사용중)로 업데이트 (혁님 로직 적용)
    await updateDoc(seatRef, {
      status: "OCCUPIED",
      startedAt: serverTimestamp(), // 유저님 프론트엔드에서 이용 시간 계산에 쓰이는 필드
      updatedAt: serverTimestamp()
    });

    // 4. 파이어베이스 Log 컬렉션에 성공 기록 남기기 (혁님 로직 적용)
    await addDoc(collection(db, "Log"), {
      uid: studentId,
      action: "QR_AUTH_SUCCESS",
      seatId: seatDoc.id,
      message: `${seatLabel} 좌석 키오스크 입실 완료`,
      createdAt: serverTimestamp()
    });

    return { success: true, seatLabel: seatLabel };
  } catch (error) {
    console.error("인증 로직 실패:", error);
    throw error;
  }
};