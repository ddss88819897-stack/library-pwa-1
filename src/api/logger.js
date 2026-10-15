import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase'; 

/**
 * 📝 공통 로그 기록 함수
 */
export const addLog = async (uid, action, result, seatId = null) => {
  try {
    const logRef = collection(db, 'logs');
    
    await addDoc(logRef, {
      uid: uid,
      action: action,
      result: result,
      seatId: seatId,
      createdAt: serverTimestamp() 
    });

    console.log(`[Log Saved] ${action}: ${result}`);
  } catch (error) {
    console.error("로그 저장 실패:", error);
  }
};