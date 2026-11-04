import React, { useEffect, useState } from 'react';
import { fetchActiveEvents } from '../api/eventApi';
import { fetchActiveNotices } from '../api/noticeApi';
import { toDate, toMillis } from '../utils/userDoc';
import Icon from './Icon';

// 메인 화면 활성 이벤트/공지 자동 슬라이드 배너 (고정글 우선 → 최신순, 4초 간격)
export default function EventBanner({ onSeeAll, onSelectEvent }) {
  const [items, setItems] = useState([]);
  const [idx, setIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchActiveEvents().catch(() => []), fetchActiveNotices().catch(() => [])])
      .then(([events, notices]) => {
        const combined = [...events.map(e => ({ ...e, _type: 'EVENT' })), ...notices.map(n => ({ ...n, _type: 'NOTICE' }))];
        combined.sort((a, b) => (!!b.isPinned !== !!a.isPinned ? (b.isPinned ? 1 : -1) : toMillis(b.createdAt || b.startDate) - toMillis(a.createdAt || a.startDate)));
        setItems(combined);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (items.length <= 1 || !isPlaying) return;
    const t = setInterval(() => setIdx(i => (i + 1) % items.length), 4000);
    return () => clearInterval(t);
  }, [items, isPlaying]);

  if (isLoading) return <div className="sl-skel" style={{ height: 260, borderRadius: 26 }} />;
  if (items.length === 0) return null;

  const e = items[idx % items.length];
  const created = toDate(e.createdAt);

  return (
    <div className="sl-card" style={{ padding: 'clamp(18px, 3vw, 24px)' }}>
      <div className="sl-between" style={{ marginBottom: 16 }}>
        <h2 className="sl-h2">이벤트 · 공지</h2>
        <button className="sl-btn ghost sm" onClick={onSeeAll}>더 보기 <Icon name="chevronRight" size={16} /></button>
      </div>

      <div onClick={() => onSelectEvent?.(e)} style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', cursor: 'pointer', aspectRatio: '16 / 6.5', minHeight: 170,
        background: 'radial-gradient(120% 140% at 0% 0%, rgba(109,141,255,.5), transparent 60%), radial-gradient(100% 120% at 100% 100%, rgba(244,114,182,.35), transparent 60%), #0d1326' }}>
        {e.imageUrl && <img src={e.imageUrl} alt={e.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '60px 20px 18px', background: 'linear-gradient(to top, rgba(5,7,15,.92), rgba(5,7,15,.35) 60%, transparent)' }}>
          <div className="sl-row" style={{ gap: 8, marginBottom: 6, minWidth: 0 }}>
            <span className={`sl-chip ${e._type === 'NOTICE' ? 'blue' : 'amber'}`} style={{ flexShrink: 0 }}>{e._type === 'NOTICE' ? '공지' : '이벤트'}</span>
            <span style={{ fontWeight: 800, fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
          </div>
          <div className="sl-muted" style={{ fontSize: '.82rem' }}>
            {e._type === 'NOTICE' ? (created ? `작성일 ${created.toLocaleDateString('ko-KR')}` : '') : [e.startDate, e.endDate].filter(Boolean).join(' ~ ')}
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <div className="sl-row" style={{ justifyContent: 'center', gap: 14, marginTop: 14 }}>
          <div className="sl-row" style={{ gap: 6 }}>
            {items.map((_, i) => (
              <button key={i} aria-label={`${i + 1}번째`} onClick={() => { setIdx(i); setIsPlaying(false); }}
                style={{ width: i === idx ? 22 : 7, height: 7, padding: 0, border: 0, borderRadius: 4, cursor: 'pointer', background: i === idx ? 'var(--grad)' : 'rgba(255,255,255,.2)', transition: 'width .3s var(--ease)' }} />
            ))}
          </div>
          <button className="sl-icon-btn" style={{ width: 34, height: 34 }} onClick={() => setIsPlaying(!isPlaying)} title={isPlaying ? '일시정지' : '자동 재생'}>
            {isPlaying
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
          </button>
        </div>
      )}
    </div>
  );
}
