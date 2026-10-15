// 🔐 접근 권한 정책
//   - 쓰기(create / update / delete / 이미지 업로드): 관리자(ADMIN_IDS)만 호출
//   - 읽기(getActive / getAll / getOne): 모든 로그인 사용자 허용
//   - 클라이언트 단의 isAdmin 체크는 보조 가드. 실제 보호는 Firestore Rules에서 강제할 것.

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";

const COL = "events";

// 📤 [Admin] 배너 이미지 업로드 → Storage URL 반환
export const uploadEventBanner = async (file) => {
  if (!file) return "";
  const path = `event_banners/${Date.now()}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  return { url, path };
};

// 🗑️ [Admin] 이미지 삭제(이벤트 삭제 시 함께 호출)
export const deleteEventBanner = async (path) => {
  if (!path) return;
  try { await deleteObject(ref(storage, path)); } catch (e) { console.warn(e); }
};

// ➕ [Admin] 이벤트 생성
export const createEvent = async ({ title, content, imageUrl, imagePath, startDate, endDate, isActive = true }) => {
  return await addDoc(collection(db, COL), {
    title, content, imageUrl, imagePath,
    startDate, endDate, isActive,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
};

// ✏️ [Admin] 이벤트 수정 / 게시·숨김 토글
export const updateEvent = async (id, patch) =>
  await updateDoc(doc(db, COL, id), { ...patch, updatedAt: serverTimestamp() });

export const toggleEventActive = (id, isActive) => updateEvent(id, { isActive });

// ❌ [Admin] 이벤트 삭제
export const removeEvent = async (id, imagePath) => {
  await deleteEventBanner(imagePath);
  await deleteDoc(doc(db, COL, id));
};

// 📥 [User] 활성 이벤트 (배너 슬라이드용)
export const fetchActiveEvents = async () => {
  const q = query(collection(db, COL), where("isActive", "==", true), orderBy("startDate", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// 📥 [User/Admin] 전체 이벤트 (관리자 목록 / 사용자 게시판)
export const fetchAllEvents = async () => {
  const snap = await getDocs(query(collection(db, COL), orderBy("startDate", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

// 📥 단일 이벤트 (상세 페이지)
export const fetchEventById = async (id) => {
  const s = await getDoc(doc(db, COL, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
};
