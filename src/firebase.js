import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

console.log("확인용 API 키:", import.meta.env.VITE_FIREBASE_API_KEY); 

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

console.log("캐시 비우기 얍!");
// 1. Firebase 앱 초기화 (이 과정이 없으면 DB 연결이 불가능합니다)
const app = initializeApp(firebaseConfig);

// 2. 서비스 내보내기 (다른 파일에서 import 해서 사용)
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
auth.languageCode = 'ko';