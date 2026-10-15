import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, query, where } from "firebase/firestore";
import { db } from "../firebase";

// 💡 EventBanner.jsx에서 부르는 함수
export const fetchActiveNotices = async () => {
  const q = query(collection(db, "Notices"), where("isActive", "==", true));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// 💡 AdminEvents.jsx에서 부르는 함수들
export const fetchAllNotices = async () => {
  const snapshot = await getDocs(collection(db, "Notices"));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const createNotice = async (data) => {
  return await addDoc(collection(db, "Notices"), { ...data, createdAt: serverTimestamp() });
};

export const updateNotice = async (id, data) => {
  return await updateDoc(doc(db, "Notices", id), data);
};

export const removeNotice = async (id) => {
  return await deleteDoc(doc(db, "Notices", id));
};

export const toggleNoticeActive = async (id, isActive) => {
  return await updateDoc(doc(db, "Notices", id), { isActive });
};