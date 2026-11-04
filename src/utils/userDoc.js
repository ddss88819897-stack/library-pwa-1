import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase';

// 이메일 → User 문서 ID 캐시
// (신규 가입자는 문서 ID가 auth uid, 기존 계정은 학번/이메일 앞부분이라 둘 다 대응해야 함)
const cache = new Map();

export const emailPrefix = (email) => (email ? String(email).split('@')[0] : '');

export const resolveUserDocId = async (email) => {
  if (!email) return null;
  if (cache.has(email)) return cache.get(email);
  let id = emailPrefix(email);
  try {
    const snap = await getDocs(query(collection(db, 'User'), where('email', '==', email), limit(1)));
    if (!snap.empty) id = snap.docs[0].id;
  } catch (e) {
    console.warn('User 문서 조회 실패, 이메일 앞부분으로 대체합니다.', e);
  }
  cache.set(email, id);
  return id;
};

export const toDate = (t) => {
  if (!t) return null;
  if (t.toDate) return t.toDate();
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const toMillis = (t) => toDate(t)?.getTime() ?? 0;

// "HH:mm" 두 개 사이 분 차이
export const minutesBetween = (start, end) => {
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
};

export const maskName = (name) => {
  if (!name) return '익명';
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
};
