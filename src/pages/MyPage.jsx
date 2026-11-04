import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import QRCodeGen from '../components/QRCodeGen';
import Icon from '../components/Icon';
import { toDate, toMillis } from '../utils/userDoc';

const DAY = ['일', '월', '화', '수', '목', '금', '토'];
const fmtMin = (m) => {
  const h = Math.floor(m / 60); const r = m % 60;
  return `${h ? `${h}시간 ` : ''}${r || !h ? `${r}분` : ''}`.trim();
};

const MyPage = ({ user, currentUserData, isAdmin, setViewMode, adminItems = [] }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 내 로그만 구독 (전체 Log 컬렉션을 받아오던 방식 → uid 조건 쿼리로 변경)
  useEffect(() => {
    if (!user?.email) return;
    const unsub = onSnapshot(query(collection(db, 'Log'), where('uid', '==', user.email)), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => toMillis(b.createdAt || b.timestamp) - toMillis(a.createdAt || a.timestamp)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user?.email]);

  const userData = currentUserData || {};
  const penaltyEnd = toDate(userData.penaltyUntil);
  const isSuspended = penaltyEnd && penaltyEnd > new Date();

  const grouped = useMemo(() => {
    const daily = {};
    logs.filter(l => l.action === 'RETURN' || l.action === 'AUTO_CHECKOUT').forEach(l => {
      const d = toDate(l.createdAt || l.timestamp) || new Date();
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!daily[key]) daily[key] = { date: d, minutes: 0, count: 0 };
      daily[key].minutes += Math.max(0, l.usedMinutes || 0);
      daily[key].count += 1;
    });
    return Object.values(daily).sort((a, b) => b.date - a.date);
  }, [logs]);

  const weekMinutes = grouped.filter(g => Date.now() - g.date.getTime() < 7 * 864e5).reduce((s, g) => s + g.minutes, 0);
  const maxMin = Math.max(60, ...grouped.slice(0, 14).map(g => g.minutes));
  const name = userData.name || user?.displayName || user?.email?.split('@')[0];

  return (
    <div className="sl-container" style={{ paddingTop: 32, paddingBottom: 48, maxWidth: 960 }}>
      <div className="sl-between sl-rise" style={{ marginBottom: 24, flexWrap: 'wrap' }}>
        <div className="sl-row" style={{ gap: 16 }}>
          <div className="sl-avatar" style={{ width: 60, height: 60, borderRadius: 20, fontSize: '1.4rem', cursor: 'default' }}>{(isAdmin ? '관' : name || '?').slice(0, 1)}</div>
          <div>
            <div className="sl-faint" style={{ fontSize: '.78rem', fontWeight: 700, letterSpacing: '.1em' }}>MY PAGE</div>
            <h1 className="sl-h2" style={{ fontSize: '1.8rem' }}>{name}님</h1>
            <div className="sl-muted" style={{ fontSize: '.88rem' }}>{userData.studentNo || '-'} · {user?.email}</div>
          </div>
        </div>
        {isSuspended ? <span className="sl-chip red"><span className="dot" />이용 정지 중</span> : <span className="sl-chip green"><span className="dot" />정상 이용</span>}
      </div>

      <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', marginBottom: 16 }}>
        <div className="sl-card glow sl-rise d1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 28 }}>
          <span className="sl-chip blue" style={{ marginBottom: 14 }}><Icon name="qr" size={13} />모바일 출입증</span>
          <QRCodeGen studentId={user?.email || 'unknown'} size={170} />
        </div>

        <div className="sl-stack sl-rise d2">
          <div className="sl-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: '누적 이용', value: `${userData.totalUsageCount || 0}회`, icon: 'history', tint: 'var(--blue)' },
              { label: '누적 시간', value: fmtMin(userData.totalUsageTime || 0), icon: 'clock', tint: 'var(--cyan)' },
              { label: '최근 7일', value: fmtMin(weekMinutes), icon: 'sparkle', tint: 'var(--violet)' },
              { label: '취소 누적', value: `${userData.cancelCount || 0} / 3`, icon: 'alert', tint: (userData.cancelCount || 0) >= 2 ? 'var(--red)' : 'var(--amber)' },
            ].map(s => (
              <div key={s.label} className="sl-card" style={{ padding: 18 }}>
                <Icon name={s.icon} size={18} style={{ color: s.tint }} />
                <div className="sl-faint" style={{ fontSize: '.78rem', fontWeight: 700, marginTop: 10 }}>{s.label}</div>
                <div className="sl-num" style={{ fontSize: '1.3rem', fontWeight: 850, letterSpacing: '-0.03em', marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="sl-card" style={{ padding: 18, borderColor: isSuspended ? 'rgba(251,113,133,.35)' : undefined }}>
            <div className="sl-between">
              <div>
                <div className="sl-faint" style={{ fontSize: '.78rem', fontWeight: 700 }}>패널티 현황</div>
                <div style={{ fontWeight: 800, marginTop: 4, color: isSuspended ? '#fecdd3' : '#a7f3d0' }}>
                  {isSuspended ? `${penaltyEnd.toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}까지 예약 정지` : '정지 내역 없음'}
                </div>
              </div>
              <span className="sl-chip">제재 {userData.penaltyCount || 0}단계</span>
            </div>
            <p className="sl-faint" style={{ margin: '10px 0 0', fontSize: '.78rem' }}>예약 취소 · 노쇼 3회 누적 시 단계별로 이용이 정지됩니다.</p>
          </div>
        </div>
      </div>

      {adminItems.length > 0 && (
        <div className="sl-card sl-rise d3" style={{ marginBottom: 16 }}>
          <div className="sl-row" style={{ marginBottom: 14 }}><Icon name="shield" size={18} style={{ color: 'var(--violet)' }} /><span className="sl-h3">관리자 메뉴</span></div>
          <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            {adminItems.map(a => <button key={a.mode} className="sl-btn" style={{ justifyContent: 'flex-start' }} onClick={() => setViewMode(a.mode)}><Icon name={a.icon} size={17} />{a.label}</button>)}
          </div>
        </div>
      )}

      <div className="sl-card sl-rise d3">
        <div className="sl-between" style={{ marginBottom: 16 }}>
          <h2 className="sl-h3">최근 이용 이력</h2>
          <span className="sl-faint" style={{ fontSize: '.82rem' }}>{grouped.length}일</span>
        </div>
        {loading ? (
          <div className="sl-stack" style={{ gap: 10 }}>{[0, 1, 2].map(i => <div key={i} className="sl-skel" style={{ height: 56 }} />)}</div>
        ) : grouped.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', borderRadius: 18, border: '1px dashed var(--line-strong)', color: 'var(--text-3)', fontWeight: 600 }}>아직 도서관 이용 기록이 없어요. 첫 좌석을 예약해 볼까요?</div>
        ) : (
          <div className="sl-stack" style={{ gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
            {grouped.map(g => (
              <div key={g.date.toISOString()} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, auto) 1fr auto', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16, background: 'rgba(255,255,255,.03)', border: '1px solid var(--line)' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{g.date.getMonth() + 1}월 {g.date.getDate()}일 <span className="sl-faint" style={{ fontWeight: 600 }}>({DAY[g.date.getDay()]})</span></div>
                  <div className="sl-faint" style={{ fontSize: '.76rem' }}>{g.count}회 이용</div>
                </div>
                <div style={{ height: 8, borderRadius: 8, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, (g.minutes / maxMin) * 100)}%`, height: '100%', borderRadius: 8, background: 'var(--grad)' }} />
                </div>
                <span className="sl-chip blue sl-num">{fmtMin(g.minutes) || '1분 미만'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyPage;
