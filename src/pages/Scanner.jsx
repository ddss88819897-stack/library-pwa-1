import React, { useState, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { format } from 'date-fns';
import { updateSeatStatus } from '../api/seatApi';
import { resolveUserDocId, toDate } from '../utils/userDoc';
import Icon from '../components/Icon';

const QR_MAX_AGE_MS = 45 * 1000; // QR 은 15초마다 갱신 → 45초(기기 간 시계 오차 여유 포함) 지난 코드는 캡처본으로 간주

const ScannerPage = ({ setViewMode, setSystemAlert }) => {
  const [lastResult, setLastResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const busyRef = useRef(false);

  const finish = (result) => {
    setLastResult(result);
    setSystemAlert?.({ title: result.title, message: result.message });
  };

  // 같은 좌석·같은 사용자의 예약만 상태 변경 (다른 사람의 예약을 건드리지 않도록)
  const updateMyReservations = async (seatId, userId, fromStatuses, patch) => {
    const snap = await getDocs(query(collection(db, 'Reservations'), where('seatId', '==', seatId)));
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    await Promise.all(snap.docs.map(d => {
      const r = d.data();
      if (r.userId !== userId || !fromStatuses.includes(r.status) || r.date > todayStr) return null;
      return updateDoc(doc(db, 'Reservations', d.id), patch);
    }));
  };

  const handleScan = async (result) => {
    if (busyRef.current || !result || result.length === 0) return;
    busyRef.current = true;
    setIsLoading(true);

    const raw = String(result[0].rawValue || '').trim();
    try {
      const idx = raw.lastIndexOf('_');
      const ts = idx !== -1 ? Number(raw.substring(idx + 1)) : NaN;
      const scannedId = (idx !== -1 && !Number.isNaN(ts) ? raw.substring(0, idx) : raw).trim().toLowerCase();

      if (!Number.isNaN(ts) && Date.now() - ts > QR_MAX_AGE_MS) {
        return finish({ ok: false, title: '❌ 만료된 QR 코드', message: '화면 캡처본이거나 오래된 QR입니다.\n앱에서 새 QR을 띄워 주세요.' });
      }

      const snapshot = await getDocs(collection(db, 'Seat'));
      const seatsList = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      let mySeat = seatsList.find(s => {
        const ids = [s.userId, s.studentNo].filter(Boolean).map(v => String(v).trim().toLowerCase());
        return ids.includes(scannedId) && (s.status === 'RESERVED' || s.status === 'OCCUPIED');
      });

      // 좌석에는 아직 반영되지 않은 "오늘" 예약 (다른 날 미리 잡아둔 예약) → 입실 처리
      if (!mySeat && scannedId.includes('@')) {
        const now = new Date();
        const todayStr = format(now, 'yyyy-MM-dd');
        const hhmm = format(now, 'HH:mm');
        const resSnap = await getDocs(query(collection(db, 'Reservations'), where('userId', '==', scannedId)));
        const todayRes = resSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .find(r => r.status === 'RESERVED' && r.date === todayStr && r.endTime > hhmm);
        if (todayRes) {
          const seat = seatsList.find(s => s.id === todayRes.seatId);
          if (seat && seat.status && seat.status !== 'AVAILABLE') {
            return finish({ ok: false, title: '❌ 좌석 사용 중', message: `[${todayRes.seatId}] 좌석을 다른 이용자가 사용 중입니다.\n관리자에게 문의해 주세요.` });
          }
          mySeat = { id: todayRes.seatId, status: 'RESERVED', userId: scannedId, reservedHours: 2 };
        }
      }

      if (!mySeat) {
        return finish({ ok: false, title: '❌ 인증 실패', message: `스캔된 QR: ${scannedId}\n현재 예약 또는 사용 중인 좌석이 없습니다.` });
      }

      // 1) 예약 → 입실
      if (mySeat.status === 'RESERVED') {
        await updateSeatStatus(mySeat.id, 'OCCUPIED', mySeat.userId, mySeat.reservedHours, mySeat.userName, mySeat.reminderMinutes, mySeat.studentNo);
        await updateMyReservations(mySeat.id, mySeat.userId, ['RESERVED'], { status: 'OCCUPIED', lastScannedAt: new Date().toISOString() });
        return finish({ ok: true, title: '✅ 입실 완료', message: `[${mySeat.id}] 입실이 완료되었습니다.`, seat: mySeat.id, who: mySeat.userName || scannedId });
      }

      // 2) 사용 중 → 3분 이내면 출입문 재인증, 이후면 퇴실
      const seatSnap = await getDoc(doc(db, 'Seat', mySeat.id));
      const startedAt = toDate(seatSnap.data()?.startedAt) || new Date();
      const usedMins = Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 60000));

      if (usedMins <= 3) {
        await updateMyReservations(mySeat.id, mySeat.userId, ['OCCUPIED'], { lastScannedAt: new Date().toISOString() });
        return finish({ ok: true, title: '✅ 출입 인증 완료', message: `[${mySeat.id}] 출입문 인증이 완료되었습니다.`, seat: mySeat.id, who: mySeat.userName || scannedId });
      }

      try {
        const targetId = await resolveUserDocId(mySeat.userId);
        if (targetId) await updateDoc(doc(db, 'User', targetId), { totalUsageCount: increment(1), totalUsageTime: increment(usedMins) });
      } catch { /* 통계 실패는 퇴실을 막지 않음 */ }

      await updateSeatStatus(mySeat.id, 'AVAILABLE', null, 0, null, 20);
      await updateMyReservations(mySeat.id, mySeat.userId, ['OCCUPIED', 'RESERVED'], { status: 'RETURNED' });
      return finish({ ok: true, title: '👋 퇴실 완료', message: `[${mySeat.id}] 정상 퇴실되었습니다. (이용 ${usedMins}분)`, seat: mySeat.id, who: mySeat.userName || scannedId });
    } catch (error) {
      console.error('인증 에러:', error);
      finish({ ok: false, title: '❌ 인증 에러', message: '인증 중 문제가 발생했습니다. 다시 시도해 주세요.' });
    } finally {
      // 2초 뒤 다음 스캔 허용
      setTimeout(() => { busyRef.current = false; setIsLoading(false); }, 2000);
    }
  };

  return (
    <div className="sl-container" style={{ paddingTop: 28, paddingBottom: 40, maxWidth: 560 }}>
      <div className="sl-between" style={{ marginBottom: 20 }}>
        <div className="sl-row">
          <span className="sl-brand-mark"><Icon name="scan" size={18} stroke={2.2} style={{ color: '#fff' }} /></span>
          <div>
            <div className="sl-faint" style={{ fontSize: '.76rem', fontWeight: 700, letterSpacing: '.1em' }}>KIOSK</div>
            <h1 className="sl-h2">입·퇴실 스캐너</h1>
          </div>
        </div>
        <button className="sl-btn sm" onClick={() => setViewMode('HOME')}>닫기 <Icon name="x" size={15} /></button>
      </div>

      <div className="sl-card glow" style={{ padding: 18 }}>
        <p className="sl-muted" style={{ margin: '4px 4px 16px', lineHeight: 1.6, fontSize: '.92rem' }}>
          모바일 출입증 QR을 비춰 주세요. 예약자는 <b style={{ color: '#a7f3d0' }}>입실</b>, 이용자는 <b style={{ color: '#fecdd3' }}>퇴실</b> 처리됩니다.
        </p>
        <div style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', background: '#000', aspectRatio: '1', border: '1px solid var(--line-strong)' }}>
          {isLoading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'grid', placeItems: 'center', background: 'rgba(5,7,15,.82)', backdropFilter: 'blur(6px)' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="sl-brand-mark" style={{ width: 56, height: 56, borderRadius: 18, margin: '0 auto 12px', animation: 'sl-pulse 1.2s infinite' }}><Icon name="scan" size={26} style={{ color: '#fff' }} /></div>
                <div style={{ fontWeight: 800 }}>처리 중입니다…</div>
              </div>
            </div>
          )}
          <Scanner onScan={handleScan} onError={(e) => console.error(e)} components={{ audio: false, finder: true }} />
        </div>

        {lastResult && !isLoading && (
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 16, display: 'flex', gap: 12, alignItems: 'flex-start',
            background: lastResult.ok ? 'rgba(52,211,153,.08)' : 'rgba(251,113,133,.08)', border: `1px solid ${lastResult.ok ? 'rgba(52,211,153,.3)' : 'rgba(251,113,133,.3)'}` }}>
            <Icon name={lastResult.ok ? 'check' : 'alert'} size={20} style={{ color: lastResult.ok ? 'var(--green)' : 'var(--red)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 800 }}>{lastResult.title}</div>
              <div className="sl-muted" style={{ fontSize: '.86rem', whiteSpace: 'pre-line', marginTop: 2 }}>{lastResult.message}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScannerPage;
