import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "../firebase";

// 로그인 함수
export const login = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("✅ 로그인 성공:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    console.error("❌ 로그인 실패:", error.message);
    throw error; // 에러 던져서 UI에서 처리하게 함
  }
};

// 로그아웃 함수
export const logout = async () => {
  await signOut(auth);
  console.log("👋 로그아웃 완료");
};