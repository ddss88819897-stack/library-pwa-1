import { useEffect } from 'react';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export const useUserSession = (user) => {
  
  // 🔥 [보조 함수] 기기별 고유 번호 생성
  const generateUUID = () => {
    return 'device-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
  };

  // 1️⃣ 기기 인증 로직 (중복 로그인 방지)
  useEffect(() => {
    if (!user) return;

    const checkDeviceBinding = async () => {
      try {
        let localDeviceUuid = localStorage.getItem('deviceUuid');
        
        if (!localDeviceUuid) {
          localDeviceUuid = generateUUID();
          localStorage.setItem('deviceUuid', localDeviceUuid);
        }

        const userId = user.email.split('@')[0]; 
        const userRef = doc(db, "User", userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          const dbDeviceUuid = userData.registeredDeviceUuid;

          if (!dbDeviceUuid) {
            await updateDoc(userRef, { registeredDeviceUuid: localDeviceUuid });
          } 
          else if (dbDeviceUuid !== localDeviceUuid) {
            const forceLogin = window.confirm(
              "🚨 다른 기기에서 접속 중인 계정입니다.\n기존 접속을 끊고 현재 기기에서 로그인하시겠습니까?"
            );
            
            if (forceLogin) {
              await updateDoc(userRef, { registeredDeviceUuid: localDeviceUuid });
              alert("✅ 현재 기기로 접속이 전환되었습니다.");
            } else {
              await signOut(auth);
              window.location.reload();
            }
          }
        }
      } catch (error) {
        console.error("기기 인증 오류:", error);
      }
    };

    checkDeviceBinding();
  }, [user]);

  // 2️⃣ 자동 로그아웃 로직 (활동 감지)
  useEffect(() => {
    if (!user) return; 

    let logoutTimer;
    const LOGOUT_TIME_MS = 30 * 60 * 1000; // 30분 (필요시 조절하세요)

    const autoLogout = async () => {
      try {
        await signOut(auth);
        localStorage.removeItem('deviceUuid');
        alert("🔒 장시간 활동이 없어 안전을 위해 자동 로그아웃 되었습니다.");
        window.location.reload();
      } catch (error) {
        console.error("자동 로그아웃 에러:", error);
      }
    };

    const resetTimer = () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      logoutTimer = setTimeout(autoLogout, LOGOUT_TIME_MS);
    };

    const events = ['mousemove', 'mousedown', 'click', 'scroll', 'keypress', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetTimer));

    resetTimer(); // 시작

    return () => {
      if (logoutTimer) clearTimeout(logoutTimer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [user]);
};