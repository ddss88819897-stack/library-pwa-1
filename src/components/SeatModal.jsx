import React, { useState, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { handleLibraryAction } from '../api/libraryService';
import { toMillis, maskName, minutesBetween } from '../utils/userDoc';
import Icon from './Icon';

const STATUS_META = {
  AVAILABLE: { label: '이용 가능', chip: 'green' },
  RESERVED: { label: '예약 중', chip: 'amber' },
  OCCUPIED: { label: '사용 중', chip: 'blue' },
  DISABLED: { label: '비활성화', chip: 'red' },
};

// 이미지 파일 → 압축된 base64 (영상 등 이미지가 아닌 파일은 건너뜀)
const compressImage = (file) => new Promise((resolve) => {
  if (!file?.type?.startsWith('image/')) return resolve(null);
  const reader = new FileReader();
  reader.onerror = () => resolve(null);
  reader.onload = (event) => {
    const img = new Image();
    img.onerror = () => resolve(null);
    img.onload = () => {
      const scale = Math.min(1, 800 / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
});
const toBase64List = async (items) => (await Promise.all(items.map(it => compressImage(it.file || it)))).filter(Boolean);

export default function SeatModal({
  selectedSeat, setSelectedSeat, user, isAdmin, currentUserData,
  selectedDate, startTime, endTime, isExamPeriod,
  setSystemAlert, setShowIdQR, forceCleanCheck, setForceCleanCheck
}) {
  // ⚠️ 훅은 항상 같은 순서로 호출되어야 하므로 early return 은 모든 훅 아래에 둡니다.
  const [activeTab, setActiveTab] = useState('RESERVE');
  const [seatHistory, setSeatHistory] = useState([]);
  const [logFilter, setLogFilter] = useState('ALL');
  const [filterDate, setFilterDate] = useState('');
  const [showAppealPopup, setShowAppealPopup] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [textContent, setTextContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [isReportingIssue, setIsReportingIssue] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [busy, setBusy] = useState(false);

  const seatId = selectedSeat?.id;
  const showCleanCheckView = !!forceCleanCheck;

  // 좌석이 바뀌면 모든 입력 상태 초기화
  useEffect(() => {
    setActiveTab('RESERVE');
    setLogFilter('ALL');
    setFilterDate('');
    setShowAppealPopup(false);
    setTextContent('');
    setAttachedFiles([]);
    setIsReportingIssue(false);
    setSelectedIssues([]);
    setCapturedPhotos([]);
    setSeatHistory([]);
  }, [seatId, forceCleanCheck]);

  // 이용 내역 (히스토리 탭 또는 클린 체크 시 직전 이용자 추적용)
  useEffect(() => {
    if (!seatId || (activeTab !== 'HISTORY' && !showCleanCheckView)) return;
    let cancelled = false;
    const q = query(collection(db, 'Log'), where('seatId', '==', seatId));
    const unsub = onSnapshot(q, async (snap) => {
      const rawLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(log => ['RETURN', 'AUTO_CHECKOUT', 'FORCE_EVICT', 'CHECK_IN', 'USER_REPORTED'].includes(log.action))
        .sort((a, b) => toMillis(b.timestamp || b.createdAt) - toMillis(a.timestamp || a.createdAt))
        .slice(0, 60);

      const nameCache = {};
      const withNames = await Promise.all(rawLogs.map(async (log) => {
        const targetId = log.uid?.split('@')[0] || log.studentNo || log.reporter?.split('@')[0];
        if (!targetId) return { ...log, realName: '이름 없음' };
        if (!(targetId in nameCache)) {
          nameCache[targetId] = getDoc(doc(db, 'User', targetId)).then(d => (d.exists() && d.data().name) || '이름 없음').catch(() => '이름 없음');
        }
        return { ...log, realName: await nameCache[targetId] };
      }));
      if (!cancelled) setSeatHistory(withNames);
    }, () => {});
    return () => { cancelled = true; unsub(); };
  }, [seatId, activeTab, showCleanCheckView]);

  if (!selectedSeat) return null;

  const status = selectedSeat.status || 'AVAILABLE';
  const meta = STATUS_META[status] || STATUS_META.AVAILABLE;
  const close = () => { if (!forceCleanCheck) setSelectedSeat(null); };
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } finally { setBusy(false); } };

  const handleFinalReserve = () => run(async () => {
    const now = new Date();
    if (isSameDay(selectedDate, now) && startTime < format(now, 'HH:mm')) {
      return setSystemAlert?.({ title: '🚨 이미 지난 시간', message: '입실 시간을 현재 이후로 다시 선택해 주세요.' });
    }
    if (!window.confirm(`${format(selectedDate, 'M월 d일')} ${startTime} ~ ${endTime}\n${selectedSeat.id} 좌석 예약을 확정할까요?`)) return;
    await handleLibraryAction({ actionType: 'RESERVED', seat: selectedSeat, user, isAdmin, isExamPeriod, setSelectedSeat, selectedDate, startTime, endTime, setSystemAlert });
  });

  const handleImmediateUse = () => run(async () => {
    if (!window.confirm('이 좌석을 지금 바로 이용할까요?\n(2시간 · QR 인증 후 입실)')) return;
    await handleLibraryAction({ actionType: 'IMMEDIATE_USE', seat: selectedSeat, user, isAdmin, isExamPeriod, setSelectedSeat, setSystemAlert, setShowIdQR });
  });

  const adminAction = (actionType) => run(() => handleLibraryAction({ actionType, seat: selectedSeat, user, isAdmin, setSelectedSeat, setSystemAlert }));

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.some(f => f.size > 5 * 1024 * 1024)) return alert('🚨 파일 용량은 5MB를 초과할 수 없습니다.');
    setAttachedFiles(files);
  };

  const handleAppealSubmit = () => run(async () => {
    if (!textContent && attachedFiles.length === 0) return alert('🚨 소명 사유나 증거 사진을 제출해주세요!');
    const urls = await toBase64List(attachedFiles);
    await handleLibraryAction({
      actionType: 'APPEAL_REPORT', seat: selectedSeat, user, isAdmin, setSelectedSeat, setSystemAlert,
      reportPayload: { logId: reportTarget.id, appealReason: textContent, appealMediaUrls: urls }
    });
    setShowAppealPopup(false);
  });

  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (capturedPhotos.length >= 5) return alert('🚨 사진은 최대 5장까지 첨부할 수 있습니다.');
    setCapturedPhotos(prev => [...prev, { file, previewUrl: URL.createObjectURL(file) }]);
  };
  const handleRemovePhoto = (index) => {
    URL.revokeObjectURL(capturedPhotos[index].previewUrl);
    setCapturedPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleCleanCheckSubmit = () => run(async () => {
    if (selectedIssues.length === 0) return alert('🚨 어떤 문제가 있는지 하나 이상 선택해 주세요.');
    if (capturedPhotos.length === 0) return alert('🚨 현장 사진을 1장 이상 촬영해 주세요.');
    try {
      const urls = await toBase64List(capturedPhotos);
      const myId = currentUserData?.studentNo;
      const previousLog = seatHistory.find(log => {
        const id = log.uid?.split('@')[0] || log.studentNo;
        return ['RETURN', 'AUTO_CHECKOUT'].includes(log.action) && id && id !== myId && log.uid !== user?.email;
      });
      await addDoc(collection(db, 'Log'), {
        action: 'CHECK_IN_CLEAN_REPORT', uid: previousLog ? (previousLog.uid || previousLog.studentNo) : null,
        reporter: user.email, seatId: selectedSeat.id, seatLabel: selectedSeat.id,
        result: selectedIssues.join(', '), mediaUrls: urls, createdAt: serverTimestamp()
      });
      setSystemAlert?.({ title: '🚨 신고 접수 완료', message: '증거 사진과 신고 내용이 관리자에게 전달되었습니다.\n안심하고 이용을 시작하세요.' });
      setForceCleanCheck?.(false);
      setSelectedSeat(null);
    } catch (e) {
      console.error(e);
      alert('🚨 신고 제출 중 오류가 발생했습니다.');
    }
  });

  const handleCleanPassAccept = () => { setForceCleanCheck?.(false); setSelectedSeat(null); };

  // 이용 내역 가공
  const myStudentId = currentUserData?.studentNo;
  const processedLogs = seatHistory.map((session, idx) => {
    const t = session.timestamp || session.createdAt;
    const d = t ? (t.toDate ? t.toDate() : new Date(t)) : null;
    const isCheckIn = session.action === 'CHECK_IN';
    const isCurrent = idx === 0 && isCheckIn && status === 'OCCUPIED';
    let badgeType, badgeText, chip;
    if (session.action === 'RETURN') { badgeType = 'NORMAL_OUT'; badgeText = '정상 퇴실'; chip = 'blue'; }
    else if (isCheckIn) { badgeType = isCurrent ? 'CURRENT' : 'CHECK_IN_PAST'; badgeText = isCurrent ? '현재 사용 중' : '입실'; chip = isCurrent ? 'green' : ''; }
    else if (session.action === 'USER_REPORTED') { badgeType = 'REPORT'; badgeText = '신고 내역'; chip = 'red'; }
    else { badgeType = 'ABNORMAL_OUT'; badgeText = session.action === 'AUTO_CHECKOUT' ? '자동 퇴실' : '강제 퇴실'; chip = 'amber'; }
    const rawId = session.uid?.split('@')[0] || session.studentNo || '';
    return {
      ...session, badgeType, badgeText, chip,
      timeStr: d ? d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '알 수 없음',
      logDateStr: d ? format(d, 'yyyy-MM-dd') : '',
      displayName: isAdmin ? session.realName : maskName(session.realName === '이름 없음' ? '' : session.realName),
      displayId: isAdmin ? rawId : (rawId ? rawId.slice(0, 4) + '****' : ''),
      isTargetMe: !!myStudentId && (session.suspects?.includes(myStudentId) || session.suspects?.includes(user?.email) || session.uid === user?.email || session.studentNo === myStudentId),
    };
  });
  const filteredLogs = processedLogs.filter(l => (logFilter === 'ALL' || l.badgeType === logFilter) && (!filterDate || l.logDateStr === filterDate));

  const isMine = selectedSeat.userId && selectedSeat.userId === user?.email;
  const isBlocked = ['RESERVED', 'OCCUPIED', 'DISABLED'].includes(status) && !isMine;
  const durationMin = minutesBetween(startTime, endTime);

  return (
    <>
      {/* 소명 팝업 */}
      {showAppealPopup && reportTarget && (
        <div className="sl-overlay" style={{ zIndex: 10020 }} onClick={() => setShowAppealPopup(false)}>
          <div className="sl-modal" onClick={e => e.stopPropagation()}>
            <div className="sl-modal-head">
              <div><span className="sl-chip blue" style={{ marginBottom: 10 }}>APPEAL</span><h3 className="sl-h2">신고 소명 접수</h3></div>
              <button className="sl-icon-btn" onClick={() => setShowAppealPopup(false)}><Icon name="x" size={18} /></button>
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', color: '#fde68a', fontSize: '.85rem', fontWeight: 600, marginBottom: 16 }}>
              허위 소명으로 판명되면 섀도우 스코어가 2배 가중됩니다.
            </div>
            <div className="sl-stack">
              <textarea className="sl-textarea" placeholder="억울한 사유를 자세히 설명해 주세요." value={textContent} onChange={e => setTextContent(e.target.value)} rows={4} />
              <label className="sl-field"><span className="sl-label">결백 증거 사진 (선택)</span>
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="sl-input" style={{ paddingTop: 13 }} />
              </label>
              <div className="sl-row">
                <button className="sl-btn" style={{ flex: 1 }} onClick={() => setShowAppealPopup(false)}>취소</button>
                <button className="sl-btn primary" style={{ flex: 1 }} disabled={busy} onClick={handleAppealSubmit}>{busy ? '제출 중…' : '소명 제출'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메인 좌석 모달 */}
      <div className="sl-overlay sheet" onClick={close}>
        <div className="sl-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <div className="sl-modal-head">
            <div>
              <div className="sl-row" style={{ gap: 8, marginBottom: 10 }}>
                <span className={`sl-chip ${meta.chip}`}><span className="dot" />{isMine ? '내 좌석' : meta.label}</span>
                {isAdmin && <span className="sl-chip blue">ADMIN</span>}
              </div>
              <h2 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 850, letterSpacing: '-0.04em' }}>{selectedSeat.label || selectedSeat.id}</h2>
              <p className="sl-faint" style={{ margin: '4px 0 0', fontSize: '.86rem' }}>{showCleanCheckView ? '입실 전 필수 클린 체크' : isAdmin ? '좌석 제어 패널' : '좌석 정보 및 예약'}</p>
            </div>
            {!forceCleanCheck && <button className="sl-icon-btn" onClick={close} aria-label="닫기"><Icon name="x" size={18} /></button>}
          </div>

          {showCleanCheckView ? (
            !isReportingIssue ? (
              <div className="sl-stack" style={{ textAlign: 'center' }}>
                <p className="sl-muted" style={{ margin: '0 0 8px', lineHeight: 1.6 }}>다음 사용자를 위해 좌석 상태를 확인해 주세요.<br />문제가 없다면 <b style={{ color: 'var(--text)' }}>이상 없음</b>을 눌러 바로 이용하세요.</p>
                <button className="sl-btn primary lg block" onClick={handleCleanPassAccept}><Icon name="check" size={20} stroke={2.4} />좌석 이상 없음</button>
                <button className="sl-btn danger block" onClick={() => setIsReportingIssue(true)}><Icon name="alert" size={18} />문제 신고하기</button>
              </div>
            ) : (
              <div className="sl-stack">
                <span className="sl-label">어떤 문제가 있나요?</span>
                <div className="sl-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                  {['쓰레기 방치', '음식물 오염', '사석화 (짐 방치)', '파손'].map(issue => {
                    const on = selectedIssues.includes(issue);
                    return <button key={issue} className={`sl-btn sm ${on ? 'primary' : ''}`} onClick={() => setSelectedIssues(on ? selectedIssues.filter(i => i !== issue) : [...selectedIssues, issue])}>{issue}</button>;
                  })}
                </div>
                <span className="sl-label" style={{ marginTop: 6 }}>현장 사진 (필수 · 최대 5장)</span>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 22, borderRadius: 18, border: '1.5px dashed var(--line-strong)', background: 'rgba(255,255,255,.03)', cursor: 'pointer', fontWeight: 700, color: 'var(--text-2)' }}>
                  <Icon name="camera" size={20} />카메라로 촬영하기
                  <input type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} style={{ display: 'none' }} />
                </label>
                {capturedPhotos.length > 0 && (
                  <div className="sl-row hide-scroll" style={{ overflowX: 'auto', gap: 10 }}>
                    {capturedPhotos.map((p, i) => (
                      <div key={p.previewUrl} style={{ position: 'relative', width: 72, height: 72, borderRadius: 14, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--line-strong)' }}>
                        <img src={p.previewUrl} alt="현장 사진" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => handleRemovePhoto(i)} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, border: 0, background: 'rgba(0,0,0,.65)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}><Icon name="x" size={12} stroke={2.5} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="sl-row" style={{ marginTop: 6 }}>
                  <button className="sl-btn" style={{ flex: 1 }} onClick={() => setIsReportingIssue(false)}>이전</button>
                  <button className="sl-btn danger-solid" style={{ flex: 2 }} disabled={busy} onClick={handleCleanCheckSubmit}>{busy ? '접수 중…' : '신고 접수'}</button>
                </div>
              </div>
            )
          ) : (
            <>
              <div className="sl-seg" style={{ marginBottom: 20 }}>
                <button className={activeTab === 'RESERVE' ? 'on' : ''} onClick={() => setActiveTab('RESERVE')}>{isAdmin ? '컨트롤' : '예약'}</button>
                <button className={activeTab === 'HISTORY' ? 'on' : ''} onClick={() => setActiveTab('HISTORY')}>이용 내역 · 신고</button>
              </div>

              {activeTab === 'RESERVE' && (isAdmin ? (
                <div className="sl-stack" style={{ gap: 10 }}>
                  {selectedSeat.userId && (
                    <div style={{ padding: '14px 16px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                      <div className="sl-faint" style={{ fontSize: '.78rem', fontWeight: 700 }}>현재 이용자</div>
                      <div style={{ fontWeight: 800, marginTop: 2 }}>{selectedSeat.userName || '이름 없음'} <span className="sl-faint" style={{ fontWeight: 600 }}>({selectedSeat.studentNo || selectedSeat.userId})</span></div>
                    </div>
                  )}
                  {status === 'RESERVED' && <>
                    <button className="sl-btn warn block" disabled={busy} onClick={() => adminAction('CANCEL')}>예약 강제 취소</button>
                    <button className="sl-btn danger block" disabled={busy} onClick={() => adminAction('DISABLED')}><Icon name="lock" size={16} />예약 취소 후 비활성화</button>
                  </>}
                  {status === 'OCCUPIED' && <>
                    <button className="sl-btn primary block" disabled={busy} onClick={() => adminAction('RETURN')}>강제 퇴실(반납) 처리</button>
                    <button className="sl-btn danger block" disabled={busy} onClick={() => adminAction('DISABLED')}><Icon name="lock" size={16} />강제 퇴실 후 비활성화</button>
                  </>}
                  {status === 'DISABLED' && <button className="sl-btn success block" disabled={busy} onClick={() => adminAction('ENABLE')}>비활성화 해제 (정상 가동)</button>}
                  {status === 'AVAILABLE' && <>
                    <div style={{ padding: 16, borderRadius: 16, background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.25)' }} className="sl-between">
                      <span style={{ color: '#a7f3d0', fontWeight: 700, fontSize: '.9rem' }}>비어 있는 좌석입니다</span>
                      <button className="sl-btn success sm" disabled={busy} onClick={handleFinalReserve}>대리 예약</button>
                    </div>
                    <button className="sl-btn danger block" disabled={busy} onClick={() => adminAction('DISABLED')}><Icon name="lock" size={16} />좌석 비활성화</button>
                  </>}
                </div>
              ) : isMine && status === 'OCCUPIED' ? (
                <div className="sl-stack">
                  <div style={{ padding: 20, borderRadius: 20, background: 'rgba(52,211,153,.08)', border: '1px solid rgba(52,211,153,.28)', textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, color: '#a7f3d0', fontSize: '1.05rem' }}>현재 회원님이 사용 중인 좌석입니다</div>
                    <div className="sl-muted" style={{ fontSize: '.88rem', marginTop: 4 }}>이용이 끝났다면 퇴실해 주세요.</div>
                  </div>
                  <button className="sl-btn block lg" disabled={busy} onClick={() => run(() => handleLibraryAction({ actionType: 'RETURN', seat: selectedSeat, user, isAdmin, setSelectedSeat, setSystemAlert }))}>퇴실하기</button>
                </div>
              ) : (
                <div className="sl-stack">
                  <div style={{ padding: 20, borderRadius: 22, background: 'var(--grad-soft)', border: '1px solid rgba(109,141,255,.28)' }}>
                    <div className="sl-between">
                      <div>
                        <div className="sl-faint" style={{ fontSize: '.78rem', fontWeight: 700 }}>예약 날짜</div>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem', marginTop: 2 }}>{format(selectedDate, 'M월 d일 (EEE)', { locale: ko })}</div>
                      </div>
                      <span className="sl-chip">{durationMin > 0 ? `${Math.floor(durationMin / 60) ? `${Math.floor(durationMin / 60)}시간 ` : ''}${durationMin % 60 ? `${durationMin % 60}분` : ''}` : '-'}</span>
                    </div>
                    <div className="sl-num" style={{ fontSize: '2rem', fontWeight: 850, letterSpacing: '-0.04em', marginTop: 12 }}>
                      {startTime} <span className="sl-faint" style={{ fontWeight: 500 }}>→</span> {endTime}
                    </div>
                    <p className="sl-faint" style={{ margin: '6px 0 0', fontSize: '.8rem' }}>시간 변경은 상단 예약 바에서 할 수 있어요 · 입실 시간 15분 내 미인증 시 자동 취소</p>
                  </div>
                  <button className="sl-btn primary lg block" disabled={isBlocked || busy} onClick={handleFinalReserve}>
                    {status === 'DISABLED' ? '비활성화된 좌석' : isBlocked ? '예약 불가 좌석' : busy ? '처리 중…' : '이 시간으로 예약하기'}
                  </button>
                  {!isBlocked && status === 'AVAILABLE' && (
                    <button className="sl-btn success block" disabled={busy} onClick={handleImmediateUse}><Icon name="bolt" size={17} stroke={2.2} />지금 바로 이용 (현장 QR 발권)</button>
                  )}
                </div>
              ))}

              {activeTab === 'HISTORY' && (
                <div className="sl-stack" style={{ gap: 12 }}>
                  <div className="sl-row hide-scroll" style={{ overflowX: 'auto', gap: 6 }}>
                    {[{ id: 'ALL', label: '전체' }, { id: 'CURRENT', label: '사용 중' }, { id: 'CHECK_IN_PAST', label: '입실' }, { id: 'NORMAL_OUT', label: '정상 퇴실' }, { id: 'ABNORMAL_OUT', label: '자동·강제 퇴실' }, { id: 'REPORT', label: '신고' }].map(f => (
                      <button key={f.id} className={`sl-btn sm ${logFilter === f.id ? 'primary' : ''}`} style={{ borderRadius: 999, flexShrink: 0 }} onClick={() => setLogFilter(f.id)}>{f.label}</button>
                    ))}
                  </div>
                  <div className="sl-row">
                    <input className="sl-input" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ height: 44 }} />
                    {filterDate && <button className="sl-icon-btn" onClick={() => setFilterDate('')}><Icon name="x" size={16} /></button>}
                  </div>
                  {filteredLogs.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-3)', fontWeight: 600 }}>해당하는 이용 내역이 없습니다.</div>
                  ) : filteredLogs.map(log => (
                    <div key={log.id} style={{ position: 'relative', padding: '16px 16px 16px 18px', borderRadius: 18, background: 'var(--surface)', border: `1px solid ${log.badgeType === 'REPORT' || log.badgeType === 'ABNORMAL_OUT' ? 'rgba(251,113,133,.3)' : 'var(--line)'}`, overflow: 'hidden' }}>
                      {(log.badgeType === 'REPORT' || log.badgeType === 'ABNORMAL_OUT') && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: 'var(--red)' }} />}
                      <div className="sl-between" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <span className={`sl-chip ${log.chip}`}>{log.badgeText}</span>
                          <div style={{ fontWeight: 800, marginTop: 8 }}>{log.displayName} <span className="sl-faint" style={{ fontWeight: 600, fontSize: '.85rem' }}>{log.displayId && `(${log.displayId})`}</span></div>
                        </div>
                        {log.badgeType === 'REPORT' && log.isTargetMe && log.reportStatus !== 'APPEALING' && (
                          <button className="sl-btn primary sm" onClick={() => { setReportTarget(log); setTextContent(''); setAttachedFiles([]); setShowAppealPopup(true); }}>소명하기</button>
                        )}
                        {log.reportStatus === 'APPEALING' && <span className="sl-chip blue">소명 심사 중</span>}
                      </div>
                      {log.badgeType === 'REPORT' && <p style={{ margin: '8px 0 0', color: '#fecdd3', fontSize: '.85rem', fontWeight: 600 }}>사유: {log.result}</p>}
                      <p className="sl-faint sl-num" style={{ margin: '6px 0 0', fontSize: '.8rem' }}>{log.timeStr}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
