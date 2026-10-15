import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isPast } from 'date-fns';
import { collection, query, where, onSnapshot, doc, getDoc, addDoc, serverTimestamp } from 'firebase/firestore'; 
import { db } from '../firebase';
import { handleLibraryAction } from '../api/libraryService'; 

const getTime = (t) => {
  if (!t) return 0;
  if (t.toDate) return t.toDate().getTime();
  return new Date(t).getTime();
};

export default function SeatModal({
  selectedSeat, setSelectedSeat, user, isAdmin, currentUserData, // 🚨 [대공사 2단계] currentUserData 프롭 추가
  selectedDate, setSelectedDate, startTime, endTime, 
  showFullCalendar, setShowFullCalendar, isExamPeriod,
  setSystemAlert, setShowIdQR, forceCleanCheck, setForceCleanCheck 
}) {
  if (!selectedSeat) return null;

  const [activeTab, setActiveTab] = useState('RESERVE');
  const [seatHistory, setSeatHistory] = useState([]);
  const [logFilter, setLogFilter] = useState('ALL');
  const [filterDate, setFilterDate] = useState('');

  const [showReportPopup, setShowReportPopup] = useState(false);
  const [showAppealPopup, setShowAppealPopup] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); 
  const [textContent, setTextContent] = useState(''); 
  const [attachedFiles, setAttachedFiles] = useState([]);

  const [showCleanCheckView, setShowCleanCheckView] = useState(false);
  const [isReportingIssue, setIsReportingIssue] = useState(false); 
  const [selectedIssues, setSelectedIssues] = useState([]);
  const [capturedPhotos, setCapturedPhotos] = useState([]);

  // 💡 [UI 최적화 수정] 기기 너비를 감지하여 모바일 여부를 확인합니다.
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    setLogFilter('ALL');
    setFilterDate('');
    setShowReportPopup(false);
    setShowAppealPopup(false);
    setTextContent('');
    setAttachedFiles([]);
    
    setShowCleanCheckView(!!forceCleanCheck);
    setIsReportingIssue(false); 
    setSelectedIssues([]);
    setCapturedPhotos([]);
  }, [selectedSeat, forceCleanCheck]);

  const renderCalendar = () => {
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    // 💡 [UI 최적화 수정] 달력 날짜들의 간격과 글자 크기를 좁은 모바일 화면에 맞게 비율 조정
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: isMobile ? '2px' : '5px' }}>
        {['일','월','화','수','목','금','토'].map(d => <div key={d} style={{ textAlign:'center', fontWeight:'900', color:'#94a3b8', fontSize: isMobile ? '0.75rem' : '0.8rem', paddingBottom: '10px' }}>{d}</div>)}
        {calendarDays.map((day, i) => (
          <button key={i} disabled={isPast(day) && !isSameDay(day, new Date())} onClick={() => { setSelectedDate(day); setShowFullCalendar(false); }} style={{ padding: isMobile ? '8px 0' : '12px 0', border: 'none', borderRadius: '10px', cursor: 'pointer', transition: '0.2s', background: isSameDay(day, selectedDate) ? '#2563eb' : (isSameMonth(day, monthStart) ? '#f8fafc' : 'transparent'), color: isSameDay(day, selectedDate) ? '#fff' : (isPast(day) && !isSameDay(day, new Date()) ? '#cbd5e1' : '#1e293b'), fontWeight: '800', fontSize: isMobile ? '0.85rem' : '0.95rem', opacity: isSameMonth(day, monthStart) ? 1 : 0.3 }}>
            {format(day, 'd')}
          </button>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (!selectedSeat || activeTab !== 'HISTORY') return;
    const q = query(collection(db, 'Log'), where('seatId', '==', selectedSeat.id));
    const unsub = onSnapshot(q, async (snap) => {
      const rawLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(log => ['RETURN', 'AUTO_CHECKOUT', 'FORCE_EVICT', 'CHECK_IN', 'USER_REPORTED'].includes(log.action))
        .sort((a, b) => getTime(b.timestamp || b.createdAt) - getTime(a.timestamp || a.createdAt));

      const nameCache = {};
      const logsWithNames = [];
      
      for (const log of rawLogs) {
        const targetId = log.uid?.split('@')[0] || log.studentNo || log.reporter?.split('@')[0];
        let realName = '이름 없음';
        
        if (targetId) {
          if (nameCache[targetId]) realName = nameCache[targetId]; 
          else {
            try {
              const userDoc = await getDoc(doc(db, 'User', targetId));
              if (userDoc.exists() && userDoc.data().name) {
                realName = userDoc.data().name;
                nameCache[targetId] = realName; 
              }
            } catch (error) {}
          }
        }
        logsWithNames.push({ ...log, realName });
      }
      setSeatHistory(logsWithNames);
    });
    return () => unsub();
  }, [selectedSeat, activeTab]);

  const maskName = (name) => {
    if (!name || name === '이름 없음') return '이름 없음';
    if (name.length <= 2) return name[0] + '*';
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  };

  const handleFinalReserve = async () => {
    const now = new Date();
    const currentString = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (isSameDay(selectedDate, now) && startTime < currentString) return alert("🚨 이미 지난 시간은 예약할 수 없습니다.");
    if (!window.confirm("지정하신 시간으로 예약을 확정하겠습니까?")) return;

    try {
      await handleLibraryAction({ actionType: 'RESERVED', seat: selectedSeat, user, isAdmin, isExamPeriod, hours: 2, now: new Date(), setSelectedSeat, selectedDate, startTime, endTime, setSystemAlert });
    } catch (error) {}
  };

  const handleImmediateUse = async () => {
    if (!window.confirm("이 좌석을 즉시 이용하시겠습니까?")) return;
    try {
      await handleLibraryAction({ actionType: 'IMMEDIATE_USE', seat: selectedSeat, user, isAdmin, isExamPeriod, hours: 2, now: new Date(), setSelectedSeat, setSystemAlert, setShowIdQR });
    } catch (error) {}
  };

  const handleAdminDirectAction = async (actionType) => {
    try { await handleLibraryAction({ actionType, seat: selectedSeat, user, isAdmin, now: new Date(), setSelectedSeat, setSystemAlert }); } catch (error) {}
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.some(f => f.size > 5 * 1024 * 1024)) return alert("🚨 파일 용량은 5MB를 초과할 수 없습니다.");
    setAttachedFiles(files);
  };

  const compressImageAndGetBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800; 
          const scaleSize = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6); 
          resolve(dataUrl);
        };
      };
      reader.onerror = error => reject(error);
    });
  };

  const uploadImagesAsBase64 = async (photoItems) => {
    const promises = photoItems.map(item => compressImageAndGetBase64(item.file || item));
    return Promise.all(promises);
  };

  const handleReportSubmit = async (isCleanCheck) => {
    if (!textContent && selectedIssues.length === 0) return alert("🚨 사유를 입력하거나 선택해주세요!");
    let uploadedUrls = [];
    if (attachedFiles.length > 0) uploadedUrls = await uploadImagesAsBase64(attachedFiles);

    try {
      await handleLibraryAction({
        actionType: 'REPORT_SEAT',
        seat: selectedSeat, user, isAdmin, now: new Date(), setSelectedSeat, setSystemAlert,
        reportPayload: { reason: isCleanCheck ? selectedIssues.join(', ') : textContent, mediaUrls: uploadedUrls, isCleanCheck: isCleanCheck }
      });
      setShowReportPopup(false);
    } catch (e) {}
  };

  const handleAppealSubmit = async () => {
    if (!textContent && attachedFiles.length === 0) return alert("🚨 소명 사유나 증거 사진을 제출해주세요!");
    let uploadedUrls = [];
    if (attachedFiles.length > 0) uploadedUrls = await uploadImagesAsBase64(attachedFiles);

    try {
      await handleLibraryAction({
        actionType: 'APPEAL_REPORT',
        seat: selectedSeat, user, isAdmin, now: new Date(), setSelectedSeat, setSystemAlert,
        reportPayload: { logId: reportTarget.id, appealReason: textContent, appealMediaUrls: uploadedUrls }
      });
      setShowAppealPopup(false);
    } catch (e) {}
  };

  const handleCameraCapture = (e) => {
    if (capturedPhotos.length >= 5) return alert("🚨 사진 증거는 최대 5장까지만 첨부 가능합니다.");
    const file = e.target.files[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setCapturedPhotos([...capturedPhotos, { file, previewUrl }]);
    }
  };

  const handleRemovePhoto = (index) => {
    URL.revokeObjectURL(capturedPhotos[index].previewUrl);
    setCapturedPhotos(capturedPhotos.filter((_, i) => i !== index));
  };

  const handleCleanCheckSubmit = async () => {
    if (selectedIssues.length > 0 && capturedPhotos.length === 0) {
      return alert("🚨 불량 상태를 신고하시려면 즉시 현장 사진을 1장 이상 촬영해 주세요.");
    }
    
    let finalUrls = [];
    if (capturedPhotos.length > 0) {
      finalUrls = await uploadImagesAsBase64(capturedPhotos);
    }

    try {
      // 🚨 [대공사 2단계] 이메일 대신 진짜 학번 사용
      const currentUserId = currentUserData?.studentNo;
      
      const previousLog = seatHistory.find(log => {
        const id = log.uid?.split('@')[0] || log.studentNo;
        return id && id !== currentUserId;
      });
      const targetUid = previousLog ? (previousLog.uid?.split('@')[0] || previousLog.studentNo) : null;

      await addDoc(collection(db, "Log"), {
        action: 'CHECK_IN_CLEAN_REPORT',
        uid: targetUid,
        reporter: user.email, 
        seatId: selectedSeat.id,
        seatLabel: selectedSeat.id,
        result: selectedIssues.join(', '), 
        mediaUrls: finalUrls, 
        createdAt: serverTimestamp() 
      });

      if (setSystemAlert) {
        setSystemAlert({
          title: "🚨 신고 접수 완료",
          message: "증거 사진과 신고 내용이 관리자에게 성공적으로 전달되었습니다.\n안심하고 이용을 시작하세요."
        });
      }

      if (setForceCleanCheck) setForceCleanCheck(false);
      setSelectedSeat(null);
    } catch (e) {
      console.error(e);
      alert("🚨 전표 제출 중 오류가 발생했습니다.");
    }
  };

  const handleCleanPassAccept = () => {
    if (setForceCleanCheck) setForceCleanCheck(false);
    setSelectedSeat(null);
  };

  const processedLogs = seatHistory.map((session, idx) => {
    const timeObj = session.timestamp || session.createdAt;
    
    let endTimeStr = '알 수 없음';
    let logDateStr = '';
    
    if (timeObj) {
      const d = timeObj.toDate ? timeObj.toDate() : new Date(timeObj);
      endTimeStr = d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      logDateStr = format(d, 'yyyy-MM-dd');
    }

    const isCheckIn = session.action === 'CHECK_IN';
    const isReport = session.action === 'USER_REPORTED';
    const isCurrentActive = idx === 0 && isCheckIn && selectedSeat?.status === 'OCCUPIED';
    
    let badgeType = ''; let badgeText = ''; let bg = ''; let color = '';

    if (session.action === 'RETURN') {
      badgeType = 'NORMAL_OUT'; badgeText = '👋 정상 퇴실'; bg = '#e0e7ff'; color = '#4f46e5';
    } else if (isCheckIn) {
      if (isCurrentActive) { badgeType = 'CURRENT'; badgeText = '✅ 현재 사용 중'; bg = '#dcfce7'; color = '#16a34a'; } 
      else { badgeType = 'CHECK_IN_PAST'; badgeText = '📲 과거 입실'; bg = '#f1f5f9'; color = '#64748b'; }
    } else if (isReport) {
      badgeType = 'REPORT'; badgeText = '🚨 신고/페널티 내역'; bg = '#fef2f2'; color = '#dc2626';
    } else {
      badgeType = 'ABNORMAL_OUT'; badgeText = '⏳ 비정상 퇴실'; bg = '#fee2e2'; color = '#dc2626';
    }

    const displayName = isAdmin ? session.realName : maskName(session.realName);
    const displayId = isAdmin ? (session.uid?.split('@')[0] || session.studentNo) : (session.uid ? session.uid.substring(0, 4) + '****' : '');
    // 🚨 [대공사 2단계] 신고 대상자 판별에 학번 사용
    const myStudentId = currentUserData?.studentNo;
    const isTargetMe = session.suspects?.includes(myStudentId) || session.uid?.includes(myStudentId) || session.studentNo === myStudentId;

    return { ...session, endTimeStr, logDateStr, badgeType, badgeText, badgeBg: bg, badgeColor: color, displayName, displayId, isAbnormal: badgeType === 'ABNORMAL_OUT', isTargetMe };
  });

  const filteredLogs = processedLogs.filter(log => {
    const matchesType = logFilter === 'ALL' || log.badgeType === logFilter;
    const matchesDate = !filterDate || log.logDateStr === filterDate;
    return matchesType && matchesDate;
  });

  return (
    <>
      {/* 💡 [팀원 코멘트] Full Calendar를 띄우는 팝업창 바깥 여백을 모바일에서는 살짝 줄여 줍니다. */}
      {showFullCalendar && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isMobile ? '15px' : '20px' }}>
          <div style={{ background: '#fff', padding: isMobile ? '20px' : '30px', borderRadius: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}><h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#0f172a' }}>{format(selectedDate, 'yyyy년 M월')}</h3><button onClick={() => setShowFullCalendar(false)} style={{ border: 'none', background: '#f1f5f9', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', color: '#475569' }}>✕</button></div>
            {renderCalendar()}
          </div>
        </div>
      )}

      {showReportPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999999, padding: isMobile ? '15px' : '20px' }}>
          <div style={{ background: '#fff', padding: isMobile ? '20px' : '30px', borderRadius: '24px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '1.3rem', fontWeight: '900', color: '#dc2626' }}>🚨 무소음 클린 체크 (신고)</h3>
            <p style={{ margin: '0 0 20px 0', color: '#64748b', fontSize: '0.85rem' }}>카메라 셔터음 발생을 막기 위해 <b>'갤러리 앱'</b>에서 미리 무음으로 찍은 사진을 첨부해 주세요.</p>
            {/* 💡 [팀원 코멘트] 사유 선택 버튼들을 모바일에 맞게 정렬합니다. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {['자리 쓰레기 방치', '도서관 기물 파손', '장시간 이석 및 짐만 두기', '심한 소음 유발'].map(issue => {
                const isChecked = selectedIssues.includes(issue);
                return (
                  <button key={issue} onClick={() => setSelectedIssues(isChecked ? selectedIssues.filter(i=>i!==issue) : [...selectedIssues, issue])} style={{ padding: '12px', borderRadius: '12px', border: `2px solid ${isChecked ? '#dc2626' : '#e2e8f0'}`, background: isChecked ? '#fef2f2' : '#fff', color: isChecked ? '#dc2626' : '#475569', fontWeight: '800', cursor: 'pointer', textAlign: 'left', transition: '0.2s' }}>{issue}</button>
                )
              })}
            </div>
            <textarea placeholder="추가 사유 입력 (선택)" value={textContent} onChange={e=>setTextContent(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '15px', resize: 'none', height: '60px', outline: 'none' }} />
            <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} style={{ marginBottom: '25px', fontSize: '0.85rem', width: '100%' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowReportPopup(false)} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', background: '#f1f5f9', color: '#64748b', fontWeight: '900', cursor: 'pointer' }}>취소</button>
              <button onClick={() => handleReportSubmit(true)} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', background: '#dc2626', color: '#fff', fontWeight: '900', cursor: 'pointer' }}>증거 전표 제출</button>
            </div>
          </div>
        </div>
      )}

      {showAppealPopup && reportTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999999, padding: isMobile ? '15px' : '20px' }}>
          <div style={{ background: '#fff', padding: isMobile ? '20px' : '30px', borderRadius: '24px', width: '100%', maxWidth: '400px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.3rem', fontWeight: '900', color: '#2563eb' }}>🙋‍♂️ 신고 소명 접수</h3>
            <div style={{ background: '#eff6ff', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
              <p style={{ margin: 0, color: '#1e3a8a', fontSize: '0.85rem', fontWeight: 'bold' }}>허위 소명 적발 시 섀도우 스코어가 2배 가중 처벌됩니다.</p>
            </div>
            <textarea placeholder="억울한 사유를 자세히 설명해 주세요." value={textContent} onChange={e=>setTextContent(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '15px', resize: 'none', height: '100px', outline: 'none' }} />
            <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: '5px' }}>결백 증거 자료 (사진/영상 첨부)</label>
            <input type="file" accept="image/*,video/*" multiple onChange={handleFileChange} style={{ marginBottom: '25px', fontSize: '0.85rem', width: '100%' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowAppealPopup(false)} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', background: '#f1f5f9', color: '#64748b', fontWeight: '900', cursor: 'pointer' }}>취소</button>
              <button onClick={handleAppealSubmit} style={{ flex: 1, padding: '16px', borderRadius: '12px', border: 'none', background: '#2563eb', color: '#fff', fontWeight: '900', cursor: 'pointer' }}>소명 자료 제출</button>
            </div>
          </div>
        </div>
      )}

      {/* 💡 [팀원 코멘트] 메인 예약 팝업창도 모바일 화면을 넘어가지 않도록 maxHeight와 너비를 조절합니다. */}
      {!showFullCalendar && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.7)', backdropFilter: 'blur(5px)', zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: isMobile ? '15px' : '20px', boxSizing: 'border-box' }}>
          <div style={{ background: '#fff', padding: isMobile ? '20px' : '30px', borderRadius: '24px', width: '100%', maxWidth: '450px', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile ? '1.4rem' : '1.6rem', fontWeight: '900', color: '#0f172a' }}>
                {selectedSeat.id} {showCleanCheckView ? '🔍 필수 클린 체크' : (isAdmin ? '좌석 제어' : '좌석 정보')}
              </h2>
              {!forceCleanCheck && <button onClick={() => setSelectedSeat(null)} style={{ background: '#f1f5f9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', fontSize: '1.2rem', cursor: 'pointer', color: '#475569' }}>✕</button>}
            </div>

            {showCleanCheckView ? (
              <div>
                {!isReportingIssue ? (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#64748b', fontSize: '0.95rem', marginBottom: '25px', wordBreak: 'keep-all', lineHeight: '1.5' }}>
                      다음 사용자를 위해 현재 좌석 상태를 확인해주세요.<br/>문제가 없다면 <b>'이상 없음'</b>을 눌러 바로 입실하세요.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <button onClick={handleCleanPassAccept} style={{ padding: '20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '16px', fontSize: '1.2rem', fontWeight: '900', cursor: 'pointer', boxShadow: '0 8px 20px rgba(37,99,235,0.3)', transition: '0.2s' }}>
                        ✅ 좌석 이상 없음 (바로 이용)
                      </button>
                      <button 
                        onClick={() => setIsReportingIssue(true)} 
                        style={{ padding: '16px', background: '#fef2f2', color: '#dc2626', border: '2px solid #fecaca', borderRadius: '16px', fontSize: '1rem', fontWeight: '900', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 10px rgba(220, 38, 38, 0.1)' }}
                      >
                        🚨 문제 신고하기 (쓰레기/오염 등)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ color: '#dc2626', fontSize: '0.9rem', fontWeight: '800', marginBottom: '15px', textAlign: 'center' }}>🚨 좌석의 문제점을 선택하고 사진을 첨부해주세요.</p>
                    
                    <h4 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>어떤 문제가 있나요?</h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                      {['쓰레기 방치', '음식물 오염', '사석화 (짐 방치)', '파손'].map(issue => (
                        <button 
                          key={issue} 
                          onClick={() => {
                            if (selectedIssues.includes(issue)) setSelectedIssues(selectedIssues.filter(i => i !== issue));
                            else setSelectedIssues([...selectedIssues, issue]);
                          }}
                          style={{ padding: '10px 14px', borderRadius: '12px', border: selectedIssues.includes(issue) ? '2px solid #2563eb' : '1px solid #cbd5e1', background: selectedIssues.includes(issue) ? '#eff6ff' : '#fff', color: selectedIssues.includes(issue) ? '#2563eb' : '#475569', fontWeight: '800', cursor: 'pointer', transition: '0.2s' }}
                        >
                          {issue}
                        </button>
                      ))}
                    </div>

                    <h4 style={{ margin: '0 0 10px 0', color: '#1e293b' }}>현장 사진 (필수)</h4>
                    <label style={{ display: 'block', padding: '20px', background: '#f8fafc', border: '2px dashed #94a3b8', borderRadius: '16px', textAlign: 'center', cursor: 'pointer', color: '#475569', fontWeight: '800', marginBottom: '20px' }}>
                      📸 카메라로 현장 촬영하기
                      <input type="file" accept="image/*" capture="environment" onChange={handleCameraCapture} style={{ display: 'none' }} />
                    </label>

                    {capturedPhotos.length > 0 && (
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '5px' }}>
                        {capturedPhotos.map((p, i) => (
                          <div key={i} style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', flexShrink: 0 }}>
                            <img src={p.previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button onClick={() => handleRemovePhoto(i)} style={{ position: 'absolute', top: '2px', right: '2px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: '900' }}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button onClick={() => setIsReportingIssue(false)} style={{ flex: 1, padding: '16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>이전으로</button>
                      <button onClick={handleCleanCheckSubmit} style={{ flex: 2, padding: '16px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>🚨 신고 접수</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', background: '#f1f5f9', padding: '6px', borderRadius: '14px', marginBottom: '25px' }}>
                  <button onClick={() => setActiveTab('RESERVE')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', fontWeight: '900', fontSize: '0.95rem', cursor: 'pointer', transition: '0.2s', background: activeTab === 'RESERVE' ? '#fff' : 'transparent', color: activeTab === 'RESERVE' ? '#2563eb' : '#64748b', boxShadow: activeTab === 'RESERVE' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>
                    {isAdmin ? '🛡️ 컨트롤 타워' : '📅 예약 정보'}
                  </button>
                  <button onClick={() => setActiveTab('HISTORY')} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', fontWeight: '900', fontSize: '0.95rem', cursor: 'pointer', transition: '0.2s', background: activeTab === 'HISTORY' ? '#fff' : 'transparent', color: activeTab === 'HISTORY' ? '#dc2626' : '#64748b', boxShadow: activeTab === 'HISTORY' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>
                    🚨 이용 내역/신고
                  </button>
                </div>

                {activeTab === 'RESERVE' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {isAdmin ? (
                      <>
                        <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '10px', textAlign: 'center' }}>
                          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold' }}>현재 상태: </span>
                          <span style={{ fontSize: '1rem', fontWeight: '900', color: selectedSeat.status === 'RESERVED' ? '#eab308' : selectedSeat.status === 'OCCUPIED' ? '#2563eb' : selectedSeat.status === 'DISABLED' ? '#ef4444' : '#10b981' }}>
                            {selectedSeat.status === 'RESERVED' && '예약 중'}
                            {selectedSeat.status === 'OCCUPIED' && '사용 중'}
                            {selectedSeat.status === 'DISABLED' && '비활성화됨'}
                            {(!selectedSeat.status || selectedSeat.status === 'AVAILABLE') && '🟢 빈자리 (사용 가능)'}
                          </span>
                        </div>

                        {selectedSeat.status === 'RESERVED' && (
                          <><button onClick={() => handleAdminDirectAction('CANCEL')} style={{ width: '100%', padding: '16px', background: '#eab308', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>💥 예약 강제 취소</button><button onClick={() => handleAdminDirectAction('DISABLED')} style={{ width: '100%', padding: '16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>🔒 예약 취소 후 좌석 비활성화</button></>
                        )}
                        {selectedSeat.status === 'OCCUPIED' && (
                          <><button onClick={() => handleAdminDirectAction('RETURN')} style={{ width: '100%', padding: '16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>🏃‍♂️ 강제 퇴실(반납) 처리</button><button onClick={() => handleAdminDirectAction('DISABLED')} style={{ width: '100%', padding: '16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>🔒 강제 퇴실 후 좌석 비활성화</button></>
                        )}
                        {selectedSeat.status === 'DISABLED' && (
                          <button onClick={() => handleAdminDirectAction('ENABLE')} style={{ width: '100%', padding: '16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>🔓 좌석 비활성화 해제 (정상 가동)</button>
                        )}
                        {(!selectedSeat.status || selectedSeat.status === 'AVAILABLE') && (
                          <>
                            <div style={{ background: '#f0fdf4', padding: '18px', borderRadius: '14px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                              <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#16a34a', fontWeight: 'bold' }}>이용 가능한 빈 좌석입니다.</p>
                              <button onClick={handleFinalReserve} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.85rem' }}>관리자 대리 예약</button>
                            </div>
                            <button onClick={() => handleAdminDirectAction('DISABLED')} style={{ width: '100%', padding: '16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: '900', cursor: 'pointer' }}>🔒 좌석 비활성화</button>
                          </>
                        )}
                      </>
                    ) : (
                    <div style={{ textAlign: 'center' }}>
                      {(() => {
                        const isMyOccupiedSeat = selectedSeat.status === 'OCCUPIED' && selectedSeat.userId === user?.email;
                        const isBlocked = ['RESERVED', 'OCCUPIED', 'DISABLED'].includes(selectedSeat.status);

                        if (isMyOccupiedSeat) {
                          return (
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ background: '#f0fdf4', padding: '20px', borderRadius: '16px', border: '2px solid #bbf7d0', marginBottom: '20px' }}>
                                <p style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#16a34a', fontWeight: '900' }}>✅ 현재 회원님이 사용 중인 좌석입니다.</p>
                                <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem', fontWeight: '700' }}>이용이 끝났다면 아래 버튼을 눌러 퇴실해주세요.</p>
                              </div>
                              <button 
                                onClick={async () => {
                                  await handleLibraryAction({ actionType: 'RETURN', seat: selectedSeat, user, isAdmin, now: new Date(), setSelectedSeat, setSystemAlert });
                                }} 
                                style={{ width: '100%', padding: '18px', background: '#475569', color: '#fff', border: 'none', borderRadius: '16px', fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 15px rgba(71, 85, 105, 0.3)' }}
                              >
                                👋 퇴실하기 (사용 종료)
                              </button>
                            </div>
                          );
                        }

                        return (
                          <>
                            <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '16px', border: '2px solid #e2e8f0', marginBottom: '25px' }}>
                              <p style={{ margin: '0 0 5px 0', fontWeight: '800', color: '#64748b' }}>선택하신 날짜</p>
                              <p style={{ margin: '0 0 20px 0', fontSize: '1.4rem', fontWeight: '900', color: '#0f172a' }}>{format(selectedDate, 'yyyy년 M월 d일')}</p>
                              <div style={{ height: '1px', background: '#e2e8f0', margin: '0 0 20px 0' }}></div>
                              <p style={{ margin: '0 0 5px 0', fontWeight: '800', color: '#64748b' }}>이용 희망 시간</p>
                              <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: '900', color: '#2563eb' }}>{startTime} ~ {endTime}</p>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <button 
                                onClick={handleFinalReserve} 
                                disabled={isBlocked}
                                style={{ 
                                  width: '100%', padding: '16px', 
                                  background: isBlocked ? '#cbd5e1' : '#eff6ff',
                                  color: isBlocked ? '#fff' : '#2563eb', border: isBlocked ? 'none' : '2px solid #bfdbfe', borderRadius: '16px', fontWeight: '900', fontSize: '1rem', 
                                  cursor: isBlocked ? 'not-allowed' : 'pointer', transition: '0.2s'
                                }}
                              >
                                {selectedSeat.status === 'DISABLED' ? '🔒 비활성화된 좌석' : isBlocked ? '🔒 예약 불가 좌석' : '이 시간으로 지정 예약'}
                              </button>

                              {!isBlocked && (
                                <button 
                                  onClick={handleImmediateUse} 
                                  style={{ 
                                    width: '100%', padding: '18px', 
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    color: '#fff', border: 'none', borderRadius: '16px', 
                                    fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.3)', transition: '0.2s'
                                  }}
                                >
                                  🚀 현장 이용하기 (즉시 QR 발권)
                                </button>
                              )}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'HISTORY' && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '12px', paddingBottom: '5px' }}>
                    {[{ id: 'ALL', label: '전체' }, { id: 'CURRENT', label: '현재 사용 중' }, { id: 'CHECK_IN_PAST', label: '과거 입실' }, { id: 'NORMAL_OUT', label: '정상 퇴실' }, { id: 'ABNORMAL_OUT', label: '비정상 퇴실' }].map(f => (
                      <button
                        key={f.id} onClick={() => setLogFilter(f.id)}
                        style={{ padding: '8px 14px', borderRadius: '20px', border: logFilter === f.id ? 'none' : '1px solid #cbd5e1', background: logFilter === f.id ? '#2563eb' : '#fff', color: logFilter === f.id ? '#fff' : '#64748b', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s ease' }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', background: '#f1f5f9', padding: '10px 15px', borderRadius: '12px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#475569', whiteSpace: 'nowrap' }}>📅 날짜 선택 :</span>
                    <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', fontWeight: '700', color: '#1e293b', outline: 'none' }} />
                    {filterDate && <button onClick={() => setFilterDate('')} style={{ border: 'none', background: '#cbd5e1', color: '#fff', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', fontWeight: '900', fontSize: '0.75rem' }}>✕</button>}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {filteredLogs.length === 0 ? (
                      <p style={{ textAlign: 'center', color: '#94a3b8', padding: '40px 0', fontWeight: 'bold', fontSize: '0.9rem' }}>해당하는 이용 내역이 없습니다.</p>
                    ) : (
                      filteredLogs.map((log, idx) => (
                        <div key={idx} style={{ background: '#f8fafc', border: `2px solid ${log.isAbnormal || log.badgeType === 'REPORT' ? '#fca5a5' : '#e2e8f0'}`, borderRadius: '16px', padding: '20px', position: 'relative', overflow: 'hidden' }}>
                          {(log.isAbnormal || log.badgeType === 'REPORT') && <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: '#dc2626' }}></div>}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div>
                              <span style={{ background: log.badgeBg, color: log.badgeColor, padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '900', display: 'inline-block', marginBottom: '8px' }}>{log.badgeText}</span>
                              <h4 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontWeight: '900' }}>{log.displayName} <span style={{ fontSize: '0.85rem', color: '#64748b' }}>({log.displayId})</span></h4>
                            </div>
                            {log.badgeType === 'REPORT' && log.isTargetMe && log.reportStatus !== 'APPEALING' && (
                              <button onClick={() => { setReportTarget(log); setShowAppealPopup(true); }} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', fontSize: '0.85rem' }}>🙋‍♂️ 소명하기</button>
                            )}
                            {log.reportStatus === 'APPEALING' && <span style={{ fontSize: '0.8rem', color: '#2563eb', fontWeight: 'bold' }}>소명 심사 중</span>}
                          </div>
                          {log.badgeType === 'REPORT' && <p style={{ margin: '5px 0', color: '#dc2626', fontSize: '0.85rem', fontWeight: 'bold' }}>사유: {log.result}</p>}
                          <p style={{ margin: '5px 0 0 0', color: '#64748b', fontSize: '0.85rem', fontWeight: '700' }}>기록 시간: {log.endTimeStr}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      )}
    </>
  );
}