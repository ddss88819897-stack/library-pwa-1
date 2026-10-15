import React, { useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { db } from '../firebase'; 
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore'; 
import { updateSeatStatus } from '../api/seatApi';

const ScannerPage = ({ setViewMode, setSystemAlert }) => {
  const [scanData, setScanData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleScan = async (result) => {
    if (isLoading || !result || result.length === 0) return;

    const rawScannedText = result[0].rawValue.trim(); 
    setScanData(rawScannedText);
    setIsLoading(true); 
    
    try {
      const lastUnderscoreIdx = rawScannedText.lastIndexOf('_');
      const actualStudentId = lastUnderscoreIdx !== -1 
        ? rawScannedText.substring(0, lastUnderscoreIdx) 
        : rawScannedText;

      const seatsRef = collection(db, "Seat");
      const snapshot = await getDocs(seatsRef);
      
    const mySeat = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).find(s => {
      const targetId = String(actualStudentId).trim().toLowerCase();
      const dbUserId = String(s.userId || "").trim().toLowerCase();
      const dbUserName = String(s.userName || "").trim().toLowerCase();
      const dbStudentNo = String(s.studentNo || "").trim().toLowerCase();

      const isMatch = dbUserId.includes(targetId) || dbUserName === targetId || dbStudentNo === targetId;
      const isValidStatus = s.status === 'RESERVED' || s.status === 'OCCUPIED';

      return isMatch && isValidStatus;
    });

    if (!mySeat) {
      // DB에 현재 '예약/사용중'인 사람들의 아이디를 싹 다 긁어옵니다.
      const bookedUsers = snapshot.docs
        .filter(d => d.data().status === 'RESERVED' || d.data().status === 'OCCUPIED')
        .map(d => d.data().userId || d.data().studentNo || '아이디없음')
        .join(', ');

      setSystemAlert({ 
        type: 'error', 
        // 💡 에러 창에 스캔된 QR 값과 DB에 적힌 예약자 명단을 동시에 띄웁니다!
        message: `❌ 인증 실패\n스캔된 QR: [${actualStudentId}]\nDB 예약자: [${bookedUsers || '아무도 예약안함'}]` 
      });
      setIsLoading(false);
      return;
    }

      // 1. 예약 상태에서 입실 스캔 시
      if (mySeat.status === 'RESERVED') {
        await updateSeatStatus(mySeat.id, 'OCCUPIED', mySeat.userId, mySeat.reservedHours, mySeat.userName, mySeat.reminderMinutes, mySeat.studentNo);
        
        const resQ = query(collection(db, "Reservations"), where("seatId", "==", mySeat.id));
        const resSnap = await getDocs(resQ);
        resSnap.forEach(async (d) => {
           if (d.data().status === 'RESERVED') {
             await updateDoc(doc(db, "Reservations", d.id), { 
               status: 'OCCUPIED',
               lastScannedAt: new Date().toISOString() 
             });
           }
        });

        setSystemAlert({ title: "✅ 입실 완료", message: `[${mySeat.id}]\n입실이 완료되었습니다.` });
        return; // 즉시 종료
      } 
      // 2. 사용 중(OCCUPIED) 상태에서 스캔 시
      else if (mySeat.status === 'OCCUPIED') {
        const now = new Date();
        const startedAt = mySeat.startedAt?.toDate ? mySeat.startedAt.toDate() : new Date(mySeat.startedAt || now);
        const usedMins = Math.max(0, Math.floor((now - startedAt) / 60000));
        
        // 입실 3분 이내면 문 열림 인증
        if (usedMins <= 3) {
          setSystemAlert({ title: "✅ 인증 완료", message: `[${mySeat.id}]\n출입문 인증이 완료되었습니다.` });
          
          const resQ = query(collection(db, "Reservations"), where("seatId", "==", mySeat.id));
          const resSnap = await getDocs(resQ);
          resSnap.forEach(async (d) => {
             if (d.data().status === 'OCCUPIED') {
               await updateDoc(doc(db, "Reservations", d.id), { 
                 lastScannedAt: new Date().toISOString() 
               });
             }
          });
          return;
        }

        // 3분 초과 시 퇴실 처리
        try {
          // 🚨 [대공사 2단계] 퇴실 처리 시 진짜 학번을 타겟으로 하여 페널티 및 이용 횟수 기록
          const targetUserId = mySeat.studentNo || actualStudentId;
          await updateDoc(doc(db, "User", targetUserId), {
            totalUsageCount: increment(1),
            totalUsageTime: increment(usedMins)
          });
        } catch(e) {}

        await updateSeatStatus(mySeat.id, 'AVAILABLE', null, 0, null, 20);
        
        const resQ = query(collection(db, "Reservations"), where("seatId", "==", mySeat.id));
        const resSnap = await getDocs(resQ);
        resSnap.forEach(async (d) => {
           if (d.data().status === 'OCCUPIED' || d.data().status === 'RESERVED') {
             await updateDoc(doc(db, "Reservations", d.id), { status: 'RETURNED' });
           }
        });

        setSystemAlert({ title: "👋 퇴실 완료", message: `[${mySeat.id}]\n정상 퇴실되었습니다.\n(이용시간: ${usedMins}분)` });
        return; // 즉시 종료
      }

    } catch (error) {
      console.error("인증 에러:", error);
      setSystemAlert({ title: "❌ 인증 에러", message: "인증 중 문제가 발생했습니다. 다시 시도해주세요." });
    } finally {
      // 2초 뒤에 다음 스캔이 가능하도록 릴레이
      setTimeout(() => setIsLoading(false), 2000); 
    }
  };

  const handleError = (error) => {
    console.error(error);
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', background: '#f8fafc', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', maxWidth: '500px', margin: '0 auto 20px auto' }}>
        <h2 style={{ color: '#0f172a', fontWeight: '900', margin: 0 }}>📸 입출입 스캐너</h2>
        <button onClick={() => setViewMode('HOME')} style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>닫기 ✕</button>
      </div>
      
      <div style={{ background: '#fff', padding: '20px', borderRadius: '20px', maxWidth: '500px', margin: '0 auto', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
        <p style={{ color: '#64748b', fontWeight: '800', marginBottom: '20px', lineHeight: '1.5' }}>
          스마트폰의 <span style={{ color: '#2563eb' }}>모바일 출입증(QR)</span>을 스캔해주세요.<br/>
          예약자는 <span style={{ color: '#16a34a' }}>'입실'</span>, 이용자는 <span style={{ color: '#dc2626' }}>'퇴실'</span> 처리됩니다.
        </p>

        <div style={{ borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', position: 'relative', background: '#000', aspectRatio: '1' }}>
          {isLoading && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(255,255,255,0.9)', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '1.2rem', color: '#2563eb' }}>
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>⏳</div>
              처리 중입니다...
            </div>
          )}

          <Scanner 
            onScan={handleScan}
            onError={handleError}
            components={{ audio: false, finder: true }}
          />
        </div>
        
        {scanData && !isLoading && (
          <div style={{ marginTop: '20px', padding: '15px', background: '#eff6ff', color: '#2563eb', borderRadius: '12px', fontWeight: '900', border: '2px solid #bfdbfe' }}>
            ✅ 최근 스캔 완료: {scanData.split('_')[0]}
          </div>
        )}
      </div>
    </div>
  );
}

export default ScannerPage;