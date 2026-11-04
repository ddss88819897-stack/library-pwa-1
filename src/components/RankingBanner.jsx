import React from 'react';
import Icon from './Icon';

export default function RankingBanner({ onEnter, onClose }) {
  return (
    <div className="sl-card hover" onClick={onEnter} role="button"
      style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', overflow: 'hidden',
        background: 'linear-gradient(120deg, rgba(251,191,36,.22), rgba(249,115,22,.12) 55%, rgba(255,255,255,.03))', borderColor: 'rgba(251,191,36,.35)' }}>
      <span style={{ width: 48, height: 48, borderRadius: 16, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#fde68a,#f59e0b)', color: '#3b2300', boxShadow: '0 12px 30px -10px rgba(245,158,11,.8)' }}>
        <Icon name="trophy" size={24} stroke={2} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>도서관 이용자 랭킹</div>
        <div className="sl-muted" style={{ fontSize: '.86rem', marginTop: 2 }}>가장 오래 공부한 열공왕 TOP 10 확인하기</div>
      </div>
      <span className="sl-chip amber sl-desktop-only">보러가기 <Icon name="arrowRight" size={13} stroke={2.4} /></span>
      <button className="sl-icon-btn" style={{ width: 34, height: 34, flexShrink: 0 }} title="배너 닫기"
        onClick={(e) => { e.stopPropagation(); onClose?.(); }}><Icon name="x" size={16} /></button>
    </div>
  );
}
