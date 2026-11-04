import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import Icon from '../components/Icon';
import { maskName, emailPrefix } from '../utils/userDoc';

const ADMIN_IDS = ['pjy', 'admin', 'manager', '1111111', '관리자', '2212020'];
const fmtMin = (m) => {
  const h = Math.floor(m / 60); const r = m % 60;
  return h ? `${h}시간 ${r}분` : `${r}분`;
};
const MEDAL = ['linear-gradient(135deg,#fde68a,#f59e0b)', 'linear-gradient(135deg,#e2e8f0,#94a3b8)', 'linear-gradient(135deg,#fdba74,#c2410c)'];

export default function RankingPage({ onBack, user, currentUserData }) {
  const [filter, setFilter] = useState('ALL');
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const usersSnap = await getDocs(collection(db, 'User'));
        const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(u => u.role !== 'MANAGER' && !ADMIN_IDS.includes(String(u.studentNo)) && !ADMIN_IDS.includes(u.id));
        const byKey = {};
        users.forEach(u => { [u.id, u.email, emailPrefix(u.email), u.studentNo].filter(Boolean).forEach(k => { byKey[String(k)] = u; }); });

        let totals = {};
        if (filter === 'ALL') {
          users.forEach(u => { totals[u.id] = { user: u, minutes: u.totalUsageTime || 0, count: u.totalUsageCount || 0 }; });
        } else {
          const since = new Date(Date.now() - (filter === 'WEEK' ? 7 : 30) * 864e5);
          const logsSnap = await getDocs(query(collection(db, 'Log'), where('createdAt', '>=', Timestamp.fromDate(since))));
          logsSnap.docs.forEach(d => {
            const l = d.data();
            if (!['RETURN', 'AUTO_CHECKOUT'].includes(l.action)) return;
            const u = byKey[String(l.uid)] || byKey[emailPrefix(l.uid)] || byKey[String(l.studentNo)];
            if (!u) return;
            if (!totals[u.id]) totals[u.id] = { user: u, minutes: 0, count: 0 };
            totals[u.id].minutes += Math.max(0, l.usedMinutes || 0);
            totals[u.id].count += 1;
          });
        }
        const list = Object.values(totals).filter(t => t.minutes > 0 || t.count > 0).sort((a, b) => b.minutes - a.minutes || b.count - a.count);
        if (!cancelled) setRankings(list);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError('순위를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [filter]);

  const isMe = (u) => u.email === user?.email || (currentUserData?.id && u.id === currentUserData.id);
  const myIndex = rankings.findIndex(r => isMe(r.user));
  const mine = myIndex >= 0 ? rankings[myIndex] : null;
  const top3 = rankings.slice(0, 3);
  const rest = rankings.slice(3, 50);

  return (
    <div className="sl-container" style={{ paddingTop: 28, paddingBottom: 48, maxWidth: 880 }}>
      <div className="sl-between" style={{ marginBottom: 22, flexWrap: 'wrap' }}>
        <div className="sl-row">
          <button className="sl-icon-btn" onClick={onBack} aria-label="뒤로"><Icon name="arrowLeft" size={18} /></button>
          <div>
            <div className="sl-faint" style={{ fontSize: '.76rem', fontWeight: 700, letterSpacing: '.1em' }}>LEADERBOARD</div>
            <h1 className="sl-h2">도서관 이용자 랭킹</h1>
          </div>
        </div>
        <div className="sl-seg" style={{ minWidth: 280 }}>
          {[{ id: 'ALL', label: '전체' }, { id: 'MONTH', label: '30일' }, { id: 'WEEK', label: '7일' }].map(t => (
            <button key={t.id} className={filter === t.id ? 'on accent' : ''} onClick={() => setFilter(t.id)}>{t.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="sl-stack">{[0, 1, 2, 3].map(i => <div key={i} className="sl-skel" style={{ height: i === 0 ? 180 : 64 }} />)}</div>
      ) : error ? (
        <div className="sl-card" style={{ textAlign: 'center', color: '#fecdd3' }}>{error}</div>
      ) : rankings.length === 0 ? (
        <div className="sl-card" style={{ textAlign: 'center', padding: '56px 20px' }}>
          <Icon name="trophy" size={40} style={{ color: 'var(--text-3)' }} />
          <p className="sl-muted" style={{ fontWeight: 700, margin: '14px 0 0' }}>아직 집계된 이용 기록이 없습니다.<br />첫 번째 열공왕이 되어 보세요!</p>
        </div>
      ) : (
        <>
          {/* 포디움 */}
          <div className="sl-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end', marginBottom: 16 }}>
            {[1, 0, 2].map(pos => {
              const r = top3[pos];
              if (!r) return <div key={pos} />;
              const me = isMe(r.user);
              return (
                <div key={pos} className={`sl-card ${pos === 0 ? 'glow' : ''} sl-rise d${pos + 1}`} style={{ textAlign: 'center', padding: pos === 0 ? '26px 12px' : '20px 12px', borderColor: me ? 'rgba(52,211,153,.5)' : undefined }}>
                  <div style={{ width: pos === 0 ? 60 : 50, height: pos === 0 ? 60 : 50, margin: '0 auto 12px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: MEDAL[pos], color: '#1a1206', fontWeight: 900, fontSize: pos === 0 ? '1.5rem' : '1.2rem', boxShadow: '0 12px 30px -10px rgba(0,0,0,.6)' }}>{pos + 1}</div>
                  <div style={{ fontWeight: 800, fontSize: pos === 0 ? '1.1rem' : '.98rem' }}>{me ? `${r.user.name || '나'} (나)` : maskName(r.user.name)}</div>
                  <div className="sl-num sl-grad-text" style={{ fontWeight: 850, fontSize: pos === 0 ? '1.25rem' : '1.05rem', marginTop: 4 }}>{fmtMin(r.minutes)}</div>
                  <div className="sl-faint" style={{ fontSize: '.76rem' }}>{r.count}회 이용</div>
                </div>
              );
            })}
          </div>

          {rest.length > 0 && (
            <div className="sl-card" style={{ padding: 8 }}>
              {rest.map((r, i) => {
                const me = isMe(r.user);
                return (
                  <div key={r.user.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 14px', borderRadius: 16, background: me ? 'rgba(52,211,153,.08)' : 'transparent', borderTop: i && !me ? '1px solid var(--line)' : 'none' }}>
                    <span className="sl-num" style={{ width: 28, textAlign: 'center', fontWeight: 800, color: 'var(--text-3)' }}>{i + 4}</span>
                    <span style={{ flex: 1, fontWeight: 700 }}>{me ? `${r.user.name || '나'} (나)` : maskName(r.user.name)}</span>
                    <span className="sl-faint" style={{ fontSize: '.8rem' }}>{r.count}회</span>
                    <span className="sl-num" style={{ fontWeight: 800, color: '#c7d2fe', minWidth: 90, textAlign: 'right' }}>{fmtMin(r.minutes)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 내 기록 */}
      {!loading && (
        <div className="sl-card glow" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16, background: 'var(--grad-soft)' }}>
          <div className="sl-num" style={{ width: 52, height: 52, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.25)', fontWeight: 900, fontSize: '1.2rem' }}>{mine ? myIndex + 1 : '-'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sl-faint" style={{ fontSize: '.76rem', fontWeight: 700 }}>내 순위</div>
            <div style={{ fontWeight: 800 }}>{currentUserData?.name || user?.displayName || '나'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="sl-num" style={{ fontWeight: 850, fontSize: '1.15rem' }}>{fmtMin(mine?.minutes || 0)}</div>
            <div className="sl-faint" style={{ fontSize: '.76rem' }}>{mine ? `상위 ${Math.max(1, Math.round(((myIndex + 1) / rankings.length) * 100))}%` : '기록 없음'}</div>
          </div>
        </div>
      )}
    </div>
  );
}
