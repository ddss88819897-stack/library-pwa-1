import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, doc, increment, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, deleteDoc, addDoc, writeBatch } from 'firebase/firestore';

export default function BookSearch({ onBack, user, currentUserData, isAdmin }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [allBooks, setAllBooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const RECOMMENDED_KEYWORDS = ['해리포터', '클린 코드', '데이터베이스', '파이썬', '인공지능', '소설', '자기계발', '역사'];
  const [popularKeywords, setPopularKeywords] = useState([]);

  // ==========================================
  // 장 혁님께서 만든 코드 시작 (개인화 추천 검색어 상태)
  // ==========================================
  const [myRecommendedKeywords, setMyRecommendedKeywords] = useState([]);
  // ==========================================
  // 장 혁님께서 만든 코드 끝
  // ==========================================

  // 💡 관리자 도서 등록/수정 모달 상태
  const [showBookModal, setShowBookModal] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [bookForm, setBookForm] = useState({
    title: '', author: '', publisher: '', publishYear: '2026', callNumber: '', location: '1층 일반열람실', totalQuantity: 2, availableQuantity: 2
  });

  // 💡 관리자 예약자 명단 확인 모달 상태
  const [reservationViewBook, setReservationViewBook] = useState(null);

  const myId = currentUserData?.studentNo || user?.email?.split('@')[0] || user?.uid || '익명';
  const myName = currentUserData?.name || user?.displayName || user?.email?.split('@')[0] || '학생';

  // 1. 실시간 인기검색어 구독
  useEffect(() => {
    const q = query(collection(db, 'SearchKeywords'), orderBy('count', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPopularKeywords(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  // ==========================================
  // 장 혁님께서 만든 코드 시작 (사용자 본인 맞춤형 추천검색어 실시간 구독)
  // ==========================================
  useEffect(() => {
    if (!myId || myId === '익명') return;
    const q = query(collection(db, 'UserSearchHistory', myId, 'Keywords'), orderBy('count', 'desc'), limit(8));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMyRecommendedKeywords(snapshot.docs.map(doc => doc.id));
    });
    return () => unsubscribe();
  }, [myId]);
  // ==========================================
  // 장 혁님께서 만든 코드 끝
  // ==========================================

  // 2. 전체 도서 목록 실시간 구독 (재고/예약 상태 실시간 반영)
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'Books'), (snapshot) => {
      const booksData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          totalQuantity: data.totalQuantity ?? 1,
          availableQuantity: data.availableQuantity ?? (data.status === '대출가능' ? 1 : 0),
          reservations: Array.isArray(data.reservations) ? data.reservations : []
        };
      });
      setAllBooks(booksData);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 3. 검색어 입력 시 인기검색어 카운트 증가 (디바운스)
  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      const matched = allBooks.some(b => 
        b.title?.toLowerCase().includes(term.toLowerCase()) ||
        b.author?.toLowerCase().includes(term.toLowerCase()) ||
        b.publisher?.toLowerCase().includes(term.toLowerCase())
      );
      if (matched) {
        const keywordRef = doc(db, 'SearchKeywords', term);
        await setDoc(keywordRef, { count: increment(1), updatedAt: serverTimestamp() }, { merge: true });

        // ==========================================
        // 장 혁님께서 만든 코드 시작 (개인 맞춤형 검색 데이터 파이어베이스 저장)
        // 사용자가 검색한 유효한 키워드를 개인별 DB에 별도 누적
        // ==========================================
        if (myId && myId !== '익명') {
          const myKeywordRef = doc(db, 'UserSearchHistory', myId, 'Keywords', term);
          await setDoc(myKeywordRef, { count: increment(1), updatedAt: serverTimestamp() }, { merge: true });
        }
        // ==========================================
        // 장 혁님께서 만든 코드 끝
        // ==========================================
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [searchTerm, allBooks, myId]); // 장 혁님께서 만든 코드: myId 의존성 추가

  // 현재 검색어로 필터링된 도서 리스트 (관리자는 검색어 없을 때 전체 도서 관리 가능하도록 표시)
  const filteredBooks = searchTerm.trim() === "" 
    ? (isAdmin ? allBooks : []) 
    : allBooks.filter(b => {
        const lower = searchTerm.toLowerCase().trim();
        return (b.title && b.title.toLowerCase().includes(lower)) ||
               (b.author && b.author.toLowerCase().includes(lower)) ||
               (b.publisher && b.publisher.toLowerCase().includes(lower));
      });

  // 🟢 [이용자] 도서 예약하기 (여분 재고가 0권일 때만 가능)
  const handleReserve = async (book) => {
    if (book.availableQuantity > 0) {
      return alert("현재 도서관에 비치된 여분 도서가 있습니다! 예약 없이 방문하여 바로 대출하실 수 있습니다.");
    }
    const alreadyReserved = book.reservations.some(r => r.userId === user?.email || r.studentNo === myId);
    if (alreadyReserved) return alert("이미 예약 대기 중인 도서입니다.");

    if (!window.confirm(`[${book.title}] 도서를 대출 예약하시겠습니까?\n도서가 반납되어 여분이 생기면 즉시 알림을 보내드립니다.`)) return;

    try {
      const newReservation = {
        uid: user?.uid || myId,
        userId: user?.email || myId,
        studentNo: myId,
        userName: myName,
        reservedAt: new Date().toISOString()
      };
      const updatedReservations = [...book.reservations, newReservation];
      await updateDoc(doc(db, 'Books', book.id), {
        reservations: updatedReservations,
        status: '예약대기중'
      });
      alert(`🎉 '${book.title}' 예약이 완료되었습니다! (대기 순번: ${updatedReservations.length}번)`);
    } catch (e) {
      alert("예약 처리 중 오류가 발생했습니다: " + e.message);
    }
  };

  // 🔴 [이용자] 내 예약 직접 취소하기
  const handleCancelMyReservation = async (book) => {
    if (!window.confirm(`[${book.title}] 도서의 대출 예약을 취소하시겠습니까?`)) return;
    try {
      const updatedReservations = book.reservations.filter(r => r.userId !== user?.email && r.studentNo !== myId);
      await updateDoc(doc(db, 'Books', book.id), {
        reservations: updatedReservations,
        status: book.availableQuantity > 0 ? '대출가능' : (updatedReservations.length > 0 ? '예약대기중' : '대출중')
      });
      alert("✅ 예약이 취소되었습니다.");
    } catch (e) {
      alert("예약 취소 중 오류가 발생했습니다.");
    }
  };

  // 🛠️ [관리자] 특정 예약자 강제 취소
  const handleAdminRemoveReservation = async (book, targetStudentNo) => {
    if (!window.confirm(`학번 [${targetStudentNo}] 사용자의 예약을 취소하시겠습니까?`)) return;
    try {
      const updated = book.reservations.filter(r => r.studentNo !== targetStudentNo && r.userId !== targetStudentNo);
      await updateDoc(doc(db, 'Books', book.id), { reservations: updated });
      setReservationViewBook({ ...book, reservations: updated });
    } catch (e) {
      alert("취소 실패: " + e.message);
    }
  };

  // 🛠️ [관리자] 대출(-1) 및 반납(+1) 재고 조절 (반납 시 예약자 알림 자동 발송 트리거!)
  const handleAdjustStock = async (book, delta) => {
    const nextAvail = (book.availableQuantity || 0) + delta;
    if (nextAvail < 0) return alert("현재 여분 재고가 0권입니다.");
    if (nextAvail > book.totalQuantity) return alert(`총 소장 권수(${book.totalQuantity}권)를 초과할 수 없습니다.`);

    try {
      await updateDoc(doc(db, 'Books', book.id), {
        availableQuantity: nextAvail,
        status: nextAvail > 0 ? '대출가능' : (book.reservations?.length > 0 ? '예약대기중' : '대출중')
      });
      if (delta > 0 && book.availableQuantity === 0 && book.reservations?.length > 0) {
        alert(`✅ 반납 처리되어 여분 재고가 1권 생겼습니다!\n예약 대기 중인 ${book.reservations.length}명의 학생에게 실시간 알림이 전송됩니다.`);
      }
    } catch (e) {
      alert("재고 변경 실패: " + e.message);
    }
  };

  // 🛠️ [관리자] 도서 신규 등록 및 수정 저장
  const handleSaveBook = async () => {
    if (!bookForm.title.trim() || !bookForm.author.trim()) return alert("도서명과 저자를 입력해주세요.");
    const total = Math.max(1, parseInt(bookForm.totalQuantity, 10) || 1);
    const avail = Math.min(total, Math.max(0, parseInt(bookForm.availableQuantity, 10) || 0));

    try {
      const payload = {
        ...bookForm,
        totalQuantity: total,
        availableQuantity: avail,
        status: avail > 0 ? '대출가능' : '대출중',
        updatedAt: serverTimestamp()
      };

      if (editingBook) {
        await updateDoc(doc(db, 'Books', editingBook.id), payload);
        alert("✅ 도서 정보가 수정되었습니다.");
      } else {
        await addDoc(collection(db, 'Books'), { ...payload, reservations: [], createdAt: serverTimestamp() });
        alert("✅ 새 도서가 등록되었습니다.");
      }
      setShowBookModal(false);
      setEditingBook(null);
    } catch (e) {
      alert("저장 중 오류 발생: " + e.message);
    }
  };

  // 🛠️ [관리자] 도서 파지(폐기/영구 삭제)
  const handleDisposeBook = async (book) => {
    if (!window.confirm(`🚨 [${book.title}] 도서를 파지(영구 폐기) 처리하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      await deleteDoc(doc(db, 'Books', book.id));
      alert("🗑️ 도서 파지(폐기) 처리가 완료되었습니다.");
    } catch (e) {
      alert("파지 처리 실패: " + e.message);
    }
  };

  // 🛠️ [관리자] 복본 개념이 적용된 시연용 더미 데이터 10권 원클릭 세팅
  const injectDummyData = async () => {
    if (!window.confirm("Firebase에 복본(다중 권수)이 적용된 시연용 도서 10권을 세팅하시겠습니까?")) return;
    
    const dummyBooks = [
      { title: "해리포터와 마법사의 돌", author: "J.K. 롤링", publisher: "문학수첩", publishYear: "1999", callNumber: "843.5 롤23마", location: "1층 일반열람실", totalQuantity: 3, availableQuantity: 0, status: "대출중", reservations: [] },
      { title: "해리포터와 비밀의 방", author: "J.K. 롤링", publisher: "문학수첩", publishYear: "1999", callNumber: "843.5 롤23비", location: "1층 일반열람실", totalQuantity: 2, availableQuantity: 1, status: "대출가능", reservations: [] },
      { title: "클린 코드 (Clean Code)", author: "로버트 C. 마틴", publisher: "인사이트", publishYear: "2013", callNumber: "005.13 마88ㅋ", location: "2층 IT 전문 서적 코너", totalQuantity: 2, availableQuantity: 0, status: "대출중", reservations: [] },
      { title: "혼자 공부하는 파이썬", author: "윤인성", publisher: "한빛미디어", publishYear: "2022", callNumber: "005.133 윤68ㅎ", location: "2층 IT 전문 서적 코너", totalQuantity: 4, availableQuantity: 2, status: "대출가능", reservations: [] },
      { title: "모던 자바스크립트 Deep Dive", author: "이웅모", publisher: "위키북스", publishYear: "2020", callNumber: "005.138 이66ㅁ", location: "2층 IT 전문 서적 코너", totalQuantity: 2, availableQuantity: 0, status: "대출중", reservations: [] },
      { title: "트렌드 코리아 2026", author: "김난도 외", publisher: "미래의창", publishYear: "2025", callNumber: "320.911 김12ㅌ", location: "1층 신간도서 코너", totalQuantity: 3, availableQuantity: 3, status: "대출가능", reservations: [] },
      { title: "인공지능의 미래", author: "스튜어트 러셀", publisher: "김영사", publishYear: "2021", callNumber: "004.7 러53ㅇ", location: "2층 IT 전문 서적 코너", totalQuantity: 1, availableQuantity: 0, status: "대출중", reservations: [] },
      { title: "데이터베이스 첫걸음", author: "미크", publisher: "한빛미디어", publishYear: "2016", callNumber: "005.74 미87ㄷ", location: "2층 IT 전문 서적 코너", totalQuantity: 2, availableQuantity: 1, status: "대출가능", reservations: [] },
      { title: "불편한 편의점", author: "김호연", publisher: "나무옆의자", publishYear: "2021", callNumber: "813.7 김95ㅂ", location: "1층 베스트셀러 코너", totalQuantity: 3, availableQuantity: 2, status: "대출가능", reservations: [] },
      { title: "역사의 쓸모", author: "최태성", publisher: "다산북스", publishYear: "2019", callNumber: "901 최88ㅇ", location: "1층 일반열람실", totalQuantity: 2, availableQuantity: 2, status: "대출가능", reservations: [] },
    ];

    try {
      const batch = writeBatch(db);
      dummyBooks.forEach((book, idx) => {
        const docRef = doc(collection(db, 'Books'), `bk-dummy-${idx + 1}`);
        batch.set(docRef, book);
      });
      await batch.commit();
      alert("✅ 복본 재고 데이터가 포함된 10권의 도서가 세팅되었습니다!\n'해리포터와 마법사의 돌'은 여분이 0권이라 즉시 예약 테스트가 가능합니다.");
    } catch (e) {
      alert("더미 데이터 생성 오류: " + e.message);
    }
  };

  // 내가 예약한 도서 목록 추출 (상단에 한눈에 보여주기 위함)
  const myReservedBooks = allBooks.filter(b => 
    b.reservations?.some(r => r.userId === user?.email || r.studentNo === myId)
  );

  const openNewBookModal = () => {
    setEditingBook(null);
    setBookForm({ title: '', author: '', publisher: '', publishYear: '2026', callNumber: '005.13 신12ㄷ', location: '1층 일반열람실', totalQuantity: 2, availableQuantity: 2 });
    setShowBookModal(true);
  };

  const openEditBookModal = (book) => {
    setEditingBook(book);
    setBookForm({
      title: book.title || '', author: book.author || '', publisher: book.publisher || '',
      publishYear: book.publishYear || '2026', callNumber: book.callNumber || '',
      location: book.location || '1층 일반열람실',
      totalQuantity: book.totalQuantity ?? 1, availableQuantity: book.availableQuantity ?? 0
    });
    setShowBookModal(true);
  };

  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.95rem', fontWeight: '700', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', padding: '20px', boxSizing: 'border-box' }}>
      
      {/* 🛠️ 관리자용 도서 등록 / 수정 모달 */}
      {showBookModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(96, 165, 250, 0.4)', borderRadius: '24px', padding: '30px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#fff', fontSize: '1.3rem', fontWeight: '900' }}>
              {editingBook ? '✏️ 도서 정보 및 재고 수정' : '➕ 신규 도서 등록'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '800', display: 'block', marginBottom: '4px' }}>도서명 *</label>
                <input style={inputStyle} value={bookForm.title} onChange={e => setBookForm({...bookForm, title: e.target.value})} placeholder="예: 해리포터와 마법사의 돌" />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '800', display: 'block', marginBottom: '4px' }}>저자 *</label>
                  <input style={inputStyle} value={bookForm.author} onChange={e => setBookForm({...bookForm, author: e.target.value})} placeholder="예: J.K. 롤링" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '800', display: 'block', marginBottom: '4px' }}>출판사</label>
                  <input style={inputStyle} value={bookForm.publisher} onChange={e => setBookForm({...bookForm, publisher: e.target.value})} placeholder="예: 문학수첩" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '800', display: 'block', marginBottom: '4px' }}>청구기호</label>
                  <input style={inputStyle} value={bookForm.callNumber} onChange={e => setBookForm({...bookForm, callNumber: e.target.value})} placeholder="843.5 롤23마" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: '800', display: 'block', marginBottom: '4px' }}>소장 위치</label>
                  <input style={inputStyle} value={bookForm.location} onChange={e => setBookForm({...bookForm, location: e.target.value})} placeholder="1층 일반열람실" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', background: 'rgba(59, 130, 246, 0.1)', padding: '14px', borderRadius: '14px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#93c5fd', fontSize: '0.8rem', fontWeight: '900', display: 'block', marginBottom: '4px' }}>총 소장 권수 (복본)</label>
                  <input type="number" min="1" style={inputStyle} value={bookForm.totalQuantity} onChange={e => setBookForm({...bookForm, totalQuantity: e.target.value})} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#86efac', fontSize: '0.8rem', fontWeight: '900', display: 'block', marginBottom: '4px' }}>현재 여분(비치) 권수</label>
                  <input type="number" min="0" max={bookForm.totalQuantity} style={inputStyle} value={bookForm.availableQuantity} onChange={e => setBookForm({...bookForm, availableQuantity: e.target.value})} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '22px' }}>
              <button onClick={() => setShowBookModal(false)} style={{ flex: 1, padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', fontWeight: '800', cursor: 'pointer' }}>취소</button>
              <button onClick={handleSaveBook} style={{ flex: 2, padding: '14px', borderRadius: '12px', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', border: 'none', fontWeight: '900', cursor: 'pointer' }}>💾 저장하기</button>
            </div>
          </div>
        </div>
      )}

      {/* 🛠️ 관리자용 예약자 명단 확인 모달 */}
      {reservationViewBook && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(250, 204, 21, 0.4)', borderRadius: '24px', padding: '30px', width: '100%', maxWidth: '440px', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.25rem', fontWeight: '900' }}>📋 예약 대기 명단</h3>
            <p style={{ margin: '0 0 20px 0', color: '#fde047', fontSize: '0.9rem', fontWeight: '800' }}>{reservationViewBook.title}</p>
            
            {(!reservationViewBook.reservations || reservationViewBook.reservations.length === 0) ? (
              <p style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '30px 0', fontWeight: '700' }}>현재 예약 대기 중인 학생이 없습니다.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '300px', overflowY: 'auto' }}>
                {reservationViewBook.reservations.map((r, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '12px 15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div>
                      <span style={{ color: '#fde047', fontWeight: '900', marginRight: '8px' }}>{idx + 1}순위</span>
                      <span style={{ color: '#fff', fontWeight: '800' }}>{r.userName} ({r.studentNo})</span>
                      <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                        {r.reservedAt ? new Date(r.reservedAt).toLocaleString('ko-KR') : ''}
                      </div>
                    </div>
                    <button onClick={() => handleAdminRemoveReservation(reservationViewBook, r.studentNo)} style={{ padding: '6px 10px', background: 'rgba(239, 68, 68, 0.25)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900', cursor: 'pointer' }}>
                      예약취소
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setReservationViewBook(null)} style={{ width: '100%', marginTop: '20px', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', fontWeight: '900', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '850px', margin: '0 auto' }}>
        
        {/* 상단 헤더 & 관리자 도구 바 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '25px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '10px', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)' }}>
              <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="#fff" style={{ width: '20px', height: '20px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
            </button>
            <h2 style={{ fontSize: '1.45rem', fontWeight: '900', margin: 0, color: '#fff' }}>도서 통합 검색 및 예약</h2>
          </div>

          {isAdmin && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={openNewBookModal} style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '9px 14px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}>
                ➕ 도서 등록
              </button>
              <button onClick={injectDummyData} style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.4)', padding: '9px 14px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '900', cursor: 'pointer' }}>
                ⚡ 시연용 더미 세팅
              </button>
            </div>
          )}
        </div>

        {/* 🎫 [이용자 전용] 내가 예약 중인 도서 현황 카드 */}
        {myReservedBooks.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(37, 99, 235, 0.05))', border: '1px solid rgba(96, 165, 250, 0.4)', borderRadius: '20px', padding: '20px', marginBottom: '25px', backdropFilter: 'blur(15px)' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: '900', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📌 내가 예약 대기 중인 도서 ({myReservedBooks.length}건)
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {myReservedBooks.map(book => (
                <div key={book.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.25)', padding: '12px 16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: '900', fontSize: '0.95rem', marginRight: '10px' }}>{book.title}</span>
                    {book.availableQuantity > 0 ? (
                      <span style={{ background: 'rgba(34, 197, 94, 0.25)', color: '#86efac', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '900' }}>🔔 반납됨! 지금 대출 가능</span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', fontWeight: '700' }}>반납 대기 중</span>
                    )}
                  </div>
                  <button onClick={() => handleCancelMyReservation(book)} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '900', cursor: 'pointer' }}>
                    예약 취소
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 검색 입력창 */}
        <div style={{ position: 'relative', marginBottom: '30px' }}>
          <div style={{ position: 'absolute', top: '50%', left: '16px', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center' }}>
            <svg fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" style={{ width: '22px', height: '22px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>
          </div>
          <input 
            type="text" 
            placeholder="도서명, 저자, 출판사를 검색해보세요 (예: 해리포터, 파이썬)" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '18px 50px 18px 48px', fontSize: '1rem', fontWeight: '700', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', color: '#fff', outline: 'none', boxSizing: 'border-box', backdropFilter: 'blur(10px)' }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ position: 'absolute', top: '50%', right: '16px', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>✕</button>
          )}
        </div>

        {/* 검색 전: 추천 검색어 & 인기 검색어 */}
        {searchTerm.trim() === "" && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px', marginBottom: '35px' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '25px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', fontWeight: '900', color: '#fff' }}>💡 추천 검색어</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {/* ========================================== */}
                {/* 장 혁님께서 만든 코드 시작 (사용자 맞춤형 추천검색어 반영) */}
                {/* 개인 검색 데이터가 있으면 그것을 보여주고, 없으면 기존 기본 추천검색어를 띄워줍니다. */}
                {/* ========================================== */}
                {(myRecommendedKeywords.length > 0 ? myRecommendedKeywords : RECOMMENDED_KEYWORDS).map((keyword, idx) => (
                  <button key={idx} onClick={() => setSearchTerm(keyword)} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.08)', color: '#93c5fd', border: '1px solid rgba(147, 197, 253, 0.3)', borderRadius: '20px', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' }}>
                    {keyword}
                  </button>
                ))}
                {/* ========================================== */}
                {/* 장 혁님께서 만든 코드 끝 */}
                {/* ========================================== */}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '25px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '1.1rem', fontWeight: '900', color: '#fff' }}>🔥 실시간 인기 검색어</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {popularKeywords.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', margin: 0 }}>집계된 인기 검색어가 없습니다.</p>
                ) : (
                  popularKeywords.map((keyword, idx) => (
                    <div key={keyword.id} onClick={() => setSearchTerm(keyword.id)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 15px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <span style={{ fontSize: '1rem', fontWeight: '900', color: idx < 3 ? '#fbbf24' : 'rgba(255,255,255,0.6)', width: '20px' }}>{idx + 1}</span>
                        <span style={{ fontSize: '1rem', fontWeight: '700', color: '#fff' }}>{keyword.id}</span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>{keyword.count}회</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* 도서 리스트 출력 영역 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', paddingBottom: '40px' }}>
          {isAdmin && searchTerm.trim() === "" && allBooks.length > 0 && (
            <h3 style={{ color: '#fff', fontSize: '1.15rem', fontWeight: '900', margin: '10px 0 5px 0' }}>📚 전체 소장 도서 관리 ({allBooks.length}종)</h3>
          )}

          {searchTerm.trim() !== "" && !isLoading && filteredBooks.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#fff', background: 'rgba(255,255,255,0.05)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.2)' }}>
              <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>'{searchTerm}'에 대한 검색 결과가 없습니다.</p>
            </div>
          )}

          {filteredBooks.map((book) => {
            const avail = book.availableQuantity ?? 0;
            const total = book.totalQuantity ?? 1;
            const resList = book.reservations || [];
            const isReservedByMe = resList.some(r => r.userId === user?.email || r.studentNo === myId);

            // 배지 스타일 결정
            let badgeBg = 'rgba(34, 197, 94, 0.2)'; let badgeColor = '#86efac'; let badgeText = `대출 가능 (여분 ${avail}/${total}권)`;
            if (avail === 0) {
              badgeBg = 'rgba(239, 68, 68, 0.2)'; badgeColor = '#fca5a5';
              badgeText = `전권 대출중 (여분 0/${total}권) · 예약대기 ${resList.length}명`;
            }

            return (
              <div key={book.id} style={{ display: 'flex', flexDirection: 'column', gap: '15px', background: 'rgba(255,255,255,0.05)', padding: '22px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ width: '70px', height: '100px', background: 'rgba(255,255,255,0.08)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="#60a5fa" style={{ width: '34px', height: '34px' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '1.2rem', fontWeight: '900', color: '#fff' }}>{book.title}</h3>
                    <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', fontWeight: '600' }}>
                      {book.author} | {book.publisher} {book.publishYear && `(${book.publishYear})`}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
                      <span style={{ background: badgeBg, color: badgeColor, border: `1px solid ${badgeColor}50`, padding: '5px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '900' }}>
                        {badgeText}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>📍 {book.location}</span>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', background: 'rgba(0,0,0,0.25)', padding: '4px 8px', borderRadius: '6px', fontWeight: '700' }}>청구기호: {book.callNumber}</span>
                    </div>
                  </div>
                </div>

                {/* 하단 액션 바 (이용자 예약/취소 버튼 & 관리자 재고/수정/파지 컨트롤) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  
                  {/* 관리자 전용 컨트롤러 */}
                  {isAdmin ? (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button onClick={() => handleAdjustStock(book, -1)} style={{ padding: '7px 11px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '800', cursor: 'pointer' }}>-1 대출처리</button>
                      <button onClick={() => handleAdjustStock(book, 1)} style={{ padding: '7px 11px', background: 'rgba(34, 197, 94, 0.2)', color: '#86efac', border: '1px solid rgba(34, 197, 94, 0.4)', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '900', cursor: 'pointer' }}>+1 반납(알림발송)</button>
                      <button onClick={() => setReservationViewBook(book)} style={{ padding: '7px 11px', background: 'rgba(250, 204, 21, 0.15)', color: '#fde047', border: '1px solid rgba(250, 204, 21, 0.4)', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '900', cursor: 'pointer' }}>
                        📋 예약자 확인 ({resList.length})
                      </button>
                      <button onClick={() => openEditBookModal(book)} style={{ padding: '7px 11px', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '900', cursor: 'pointer' }}>수정</button>
                      <button onClick={() => handleDisposeBook(book)} style={{ padding: '7px 11px', background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '900', cursor: 'pointer' }}>🗑️ 파지</button>
                    </div>
                  ) : <div />}

                  {/* 이용자 예약 / 취소 버튼 */}
                  <div>
                    {isReservedByMe ? (
                      <button onClick={() => handleCancelMyReservation(book)} style={{ background: 'rgba(239, 68, 68, 0.85)', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900', cursor: 'pointer' }}>
                        ✖ 예약 취소하기
                      </button>
                    ) : avail === 0 ? (
                      <button onClick={() => handleReserve(book)} style={{ background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 18px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)' }}>
                        📌 대출 예약하기
                      </button>
                    ) : (
                      <button disabled style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#86efac', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '10px 18px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '900', cursor: 'default' }}>
                        ✅ 여분 있음 (방문 대출)
                      </button>
                    )}
                  </div>

                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

