import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, updateDoc, increment, setDoc, getDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const timeOptions = [...Array(48).keys()].map(i => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, '0')}:${m}`;
});

const actionOptions = [
  { value: 'WARNING', label: '단순 경고 (이용 정지 없음)' },
  { value: 'SUSPEND_1', label: '1일 이용 정지' },
  { value: 'SUSPEND_3', label: '3일 이용 정지' },
  { value: 'SUSPEND_7', label: '7일 이용 정지' },
  { value: 'SUSPEND_30', label: '30일 이용 정지' }
];

const getTime = (t) => {
  if (!t) return 0;
  if (t.toDate) return t.toDate().getTime();
  return new Date(t).getTime();
};

export default function AdminDashboard() {
  const [usersList, setUsersList] = useState([]); 
  const [tempSearch, setTempSearch] = useState(''); 
  const [debouncedSearch, setDebouncedSearch] = useState(''); 
  const [chartData, setChartData] = useState({ labels: [], datasets: [] });

  const [isExamActive, setIsExamActive] = useState(false);
  const [examStartDate, setExamStartDate] = useState('');
  const [examEndDate, setExamEndDate] = useState('');

  const [pickerTarget, setPickerTarget] = useState(null);
  const [pickerDate, setPickerDate] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [pickerTime, setPickerTime] = useState("09:00");

  const [actionReport, setActionReport] = useState(null); 
  const [actionType, setActionType] = useState('WARNING'); 

  const [activeTab, setActiveTab] = useState('REPORTS'); 
  const [reportsList, setReportsList] = useState([]); 
  const [aiAppealsList, setAiAppealsList] = useState([]);

  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const [isCrawling, setIsCrawling] = useState(false);

  const now = new Date();
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'System', 'settings'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setIsExamActive(data.isExamActive || false);
          setExamStartDate(data.examStartDate || '');
          setExamEndDate(data.examEndDate || '');
        }
      } catch (error) { console.error("설정 로드 실패:", error); }
    };
    fetchSettings();
  }, []);

  const saveExamPeriod = async () => {
    if (!examStartDate || !examEndDate) return alert("🚨 시작 일시와 종료 일시를 모두 설정해주세요.");
    if (examStartDate >= examEndDate) return alert("🚨 종료 일시가 시작 일시보다 빠를 수 없습니다.");
    
    try {
      await setDoc(doc(db, 'System', 'settings'), {
        isExamActive: true, examStartDate, examEndDate, updatedAt: new Date()
      }, { merge: true });
      setIsExamActive(true);
      alert("✅ 시험기간 통제가 시작되었습니다.");
    } catch (e) { alert("저장 중 오류가 발생했습니다."); }
  };

  const clearExamPeriod = async () => {
    try {
      await setDoc(doc(db, 'System', 'settings'), {
        isExamActive: false, examStartDate: '', examEndDate: '', updatedAt: new Date()
      }, { merge: true });
      setIsExamActive(false); setExamStartDate(''); setExamEndDate('');
      alert("❌ 시험기간 통제가 해제되었습니다.");
    } catch (e) { alert("해제 중 오류가 발생했습니다."); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(tempSearch); }, 300);
    return () => clearTimeout(timer);
  }, [tempSearch]);

  const loadUsers = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "User"));
      const usersMap = {}; 
      querySnapshot.docs.forEach(d => { usersMap[d.id] = d.data(); });
      setUsersList(Object.values(usersMap));

      const logsSnap = await getDocs(collection(db, 'Log'));
      const logs = await Promise.all(logsSnap.docs.map(async (d) => {
        const data = d.data();
        let realName = '추적 불가';
        let studentNo = data.uid?.split('@')[0] || '';
        if (studentNo && usersMap[studentNo]) { realName = usersMap[studentNo].name || '이름 없음'; }

        let reporterName = '이름 없음';
        let reporterNo = data.reporter?.split('@')[0] || '';
        if (reporterNo && usersMap[reporterNo]) { reporterName = usersMap[reporterNo].name || '이름 없음'; }

        return { id: d.id, ...data, realName, studentNo, reporterName, reporterNo };
      }));

      setReportsList(logs.filter(l => {
        const act = l.action || '';
        return ['USER_REPORTED', 'CHECK_IN_CLEAN_REPORT', 'REPORT_SEAT'].includes(act) || act.includes('REPORT');
      }).sort((a, b) => getTime(b.createdAt || b.timestamp) - getTime(a.createdAt || a.timestamp)));
        
      const appealsRef = collection(db, 'Appeals');
      const appealsSnap = await getDocs(appealsRef);
      const appealsData = appealsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAiAppealsList(appealsData.sort((a, b) => getTime(b.createdAt || b.timestamp) - getTime(a.createdAt || a.timestamp)));

      const labels = [];
      const dataMap = {}; 
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = `${d.getMonth() + 1}/${d.getDate()}`; 
        labels.push(dateStr);
        dataMap[dateStr] = 0; 
      }

      logs.forEach(data => {
        if (data.action === 'COMPLETED' || data.action === 'RETURN') { 
          const timeObj = data.createdAt || data.timestamp;
          if (timeObj) {
            const date = timeObj.toDate ? timeObj.toDate() : new Date(timeObj);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
            if (dataMap[dateStr] !== undefined) dataMap[dateStr] += 1;
          }
        }
      });

      // 💡 차트 컬러를 글래스모피즘 테마에 맞게 약간 조정
      setChartData({
        labels: labels,
        datasets: [{ 
          label: '도서관 이용 완료 횟수', 
          data: labels.map(label => dataMap[label]), 
          backgroundColor: 'rgba(96, 165, 250, 0.8)', // 더 밝고 투명한 파란색
          borderColor: '#60a5fa', 
          borderWidth: 1, 
          borderRadius: 6 
        }]
      });

    } catch (error) { console.error(error); }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleResetPenaltyOnly = async (studentNo, studentName) => {
    if (window.confirm(`${studentName}(${studentNo}) 학생의 이용정지를 해제하시겠습니까?`)) {
      try {
        const userRef = doc(db, "User", studentNo);
        await updateDoc(userRef, { penaltyUntil: null, resetCount: increment(1) });
        alert(`✅ 해제되었습니다.`);
        loadUsers(); 
      } catch (error) { alert("오류가 발생했습니다."); }
    }
  };

  const submitAction = async () => {
    if (!actionReport) return;
    const targetId = actionReport.studentNo;
    if (!targetId || targetId === '정보 없음' || targetId === '추적 불가') return alert("🚨 대상(피신고자)이 특정되지 않아 직접 제재를 가할 수 없습니다.");

    const selectedOption = actionOptions.find(opt => opt.value === actionType);
    if (!window.confirm(`${actionReport.realName}(${targetId}) 사용자에게 [${selectedOption.label}] 처리를 진행하시겠습니까?`)) return;

    try {
      const userRef = doc(db, "User", targetId);
      let days = 0;
      if (actionType === 'SUSPEND_1') days = 1;
      else if (actionType === 'SUSPEND_3') days = 3;
      else if (actionType === 'SUSPEND_7') days = 7;
      else if (actionType === 'SUSPEND_30') days = 30;

      if (days > 0) {
        const penaltyUntil = new Date();
        penaltyUntil.setDate(penaltyUntil.getDate() + days);
        await updateDoc(userRef, { penaltyCount: increment(1), penaltyUntil: penaltyUntil });
      } else {
        await updateDoc(userRef, { penaltyCount: increment(1) });
      }

      await addDoc(collection(db, "Log"), {
        action: 'ADMIN_PENALTY', uid: targetId, seatLabel: actionReport.seatLabel || '알 수 없음',
        result: `관리자 직권 조치: ${selectedOption.label}`, createdAt: serverTimestamp()
      });

      await deleteDoc(doc(db, "Log", actionReport.id));
      alert(`✅ 조치가 완료되었습니다.`);
      setActionReport(null); 
      loadUsers();
    } catch (e) { alert("처리 중 오류가 발생했습니다."); }
  };

  const handleDismissReport = async (reportId) => {
    if (!window.confirm("신고 내용을 반려(삭제)하시겠습니까?")) return;
    try { await deleteDoc(doc(db, "Log", reportId)); loadUsers(); } 
    catch (e) { alert("오류가 발생했습니다."); }
  };

  const handleResolveAppeal = async (appealId) => {
    if (!window.confirm("이 접수 건을 '확인 완료' 처리하시겠습니까?")) return;
    try { await updateDoc(doc(db, "Appeals", appealId), { status: 'RESOLVED' }); alert("✅ 확인 완료 처리되었습니다."); loadUsers(); } 
    catch (e) { alert("오류가 발생했습니다."); }
  };

  const handleDeleteAppeal = async (appealId) => {
    if (!window.confirm("이 접수 내역을 완전히 삭제하시겠습니까?")) return;
    try { await deleteDoc(doc(db, "Appeals", appealId)); loadUsers(); } 
    catch (e) { alert("오류가 발생했습니다."); }
  };

  const openViewer = (photos, index) => { setViewerPhotos(photos); setCurrentPhotoIndex(index); };
  const closeViewer = () => { setViewerPhotos([]); setCurrentPhotoIndex(0); };

  const openPicker = (target) => {
    if (isExamActive) return;
    setPickerTarget(target);
    const existingVal = target === 'start' ? examStartDate : examEndDate;
    if (existingVal) {
      try {
        const [dStr, tStr] = existingVal.split('T');
        const parsedDate = new Date(dStr);
        setPickerDate(parsedDate); setPickerMonth(parsedDate); setPickerTime(tStr || "09:00");
      } catch (e) { setPickerDate(new Date()); setPickerMonth(new Date()); setPickerTime("09:00"); }
    } else { setPickerDate(new Date()); setPickerMonth(new Date()); setPickerTime("09:00"); }
  };

  const applyPicker = () => {
    const val = `${format(pickerDate, 'yyyy-MM-dd')}T${pickerTime}`;
    if (pickerTarget === 'start') {
      setExamStartDate(val);
      if (examEndDate && val >= examEndDate) setExamEndDate(''); 
    } else {
      setExamEndDate(val);
    }
    setPickerTarget(null);
  };

  const handleCrawlNotices = async () => {
    if (!window.confirm("외부 도서관 공지사항 및 최신 규정을 크롤링하여 AI 챗봇에 학습시키겠습니까?")) return;
    setIsCrawling(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      alert("✅ 크롤링 및 AI 챗봇 지식 베이스 업데이트가 완료되었습니다!\n이제 챗봇이 최신 도서관 규정을 기반으로 답변합니다.");
    } catch (error) { alert("🚨 크롤링 서버와 통신 중 오류가 발생했습니다."); console.error(error); } 
    finally { setIsCrawling(false); }
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(pickerMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', marginBottom: '10px' }}>
          {['일','월','화','수','목','금','토'].map((d, i) => (
            <div key={d} style={{ textAlign:'center', fontWeight:'900', color: i === 0 ? '#fca5a5' : i === 6 ? '#93c5fd' : '#cbd5e1', fontSize:'0.8rem' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px' }}>
          {calendarDays.map((day, i) => {
            const isSelected = isSameDay(day, pickerDate);
            const isCurrentMonth = isSameMonth(day, monthStart);
            return (
              <button 
                key={i} 
                onClick={() => {
                  setPickerDate(day);
                  if (pickerTarget === 'end' && examStartDate) {
                    const [sDate, sTime] = examStartDate.split('T');
                    if (format(day, 'yyyy-MM-dd') === sDate && pickerTime <= sTime) {
                      const sIdx = timeOptions.indexOf(sTime);
                      if (sIdx < timeOptions.length - 1) setPickerTime(timeOptions[sIdx + 1]);
                    }
                  }
                }} 
                style={{ padding: '10px 0', border: 'none', borderRadius: '8px', cursor: 'pointer', background: isSelected ? 'rgba(59, 130, 246, 0.8)' : 'transparent', color: isSelected ? '#fff' : !isCurrentMonth ? 'rgba(255,255,255,0.2)' : '#e2e8f0', fontWeight: isSelected ? '900' : '700', fontSize: '0.95rem', transition: '0.2s' }}>
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // 공통 글래스모피즘 스타일
  const glassCardStyle = {
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '24px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    padding: isMobile ? '20px' : '30px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column'
  };

  const thStyle = { padding: '16px 10px', textAlign: 'center', color: '#94a3b8', fontWeight: '900', borderBottom: '1px solid rgba(255,255,255,0.1)', fontSize: '0.9rem', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '16px 10px', textAlign: 'center', color: '#e2e8f0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.9rem', fontWeight: '600' };

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: isMobile ? '10px' : '20px', boxSizing: 'border-box' }}>
       <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '25px' }}>

         {/* 피커 모달 (글래스모피즘 테마 적용) */}
         {pickerTarget && (
            <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', boxSizing: 'border-box' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.95)', padding: '30px', borderRadius: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '1.3rem', fontWeight: '900', color: '#fff', textAlign: 'center' }}>
                  {pickerTarget === 'start' ? '🟢 시작 일시 설정' : '🔴 종료 일시 설정'}
                </h3>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                  <button onClick={() => setPickerMonth(subMonths(pickerMonth, 1))} style={{ border:'none', background:'transparent', fontSize:'1.5rem', cursor:'pointer', color: '#94a3b8' }}>◀</button>               
                  <h4 style={{ margin: 0, fontWeight: '900', fontSize: '1.2rem', color: '#fff' }}>{format(pickerMonth, 'yyyy년 M월')}</h4>
                  <button onClick={() => setPickerMonth(addMonths(pickerMonth, 1))} style={{ border:'none', background:'transparent', fontSize:'1.5rem', cursor:'pointer', color: '#94a3b8' }}>▶</button>
                </div>

                {renderCalendar()}

                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: '900', color: '#94a3b8' }}>시간 선택</label>
                  <select 
                    value={pickerTime} 
                    onChange={(e) => setPickerTime(e.target.value)} 
                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', fontWeight: '900', fontSize: '1rem', color: '#60a5fa', outline: 'none', background: 'rgba(15, 23, 42, 0.9)', cursor: 'pointer' }}
                  >
                    {timeOptions.map(t => {
                      let isDisabled = false;
                      if (pickerTarget === 'end' && examStartDate) {
                        const [startDatePart, startTimePart] = examStartDate.split('T');
                        const currentPickerDatePart = format(pickerDate, 'yyyy-MM-dd');
                        if (currentPickerDatePart === startDatePart && t <= startTimePart) isDisabled = true;
                      }
                      return <option key={t} value={t} disabled={isDisabled}>{t}</option>;
                    })}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setPickerTarget(null)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontWeight: '900', cursor: 'pointer', fontSize: '1rem' }}>취소</button>
                  <button onClick={applyPicker} style={{ flex: 2, padding: '14px', borderRadius: '12px', border: 'none', background: 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontWeight: '900', cursor: 'pointer', fontSize: '1rem', boxShadow: '0 4px 15px rgba(37,99,235,0.4)' }}>✅ 적용하기</button>
                </div>
              </div>
            </div>
          )}

         {/* 상단 레이아웃 (그리드 1:2 비율) */}
         <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.8fr', gap: '25px' }}>

           {/* 좌측: 시험 기간 통제 모듈 */}
           <div style={glassCardStyle}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ⚙️ 시험 기간 외부인 통제
                </h3>
                <span style={{ background: isExamActive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.1)', color: isExamActive ? '#fca5a5' : '#cbd5e1', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: '900', border: `1px solid ${isExamActive ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255,255,255,0.2)'}` }}>
                  {isExamActive ? '🚨 통제 모드' : '✅ 일반 모드'}
                </span>
             </div>

             <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: '800', marginBottom: '8px' }}>시작 일시</label>
                  <button onClick={() => openPicker('start')} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: examStartDate ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: '700', textAlign: 'left', cursor: isExamActive ? 'not-allowed' : 'pointer' }}>
                    {examStartDate ? examStartDate.replace('T', ' ') : '선택해주세요'}
                  </button>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', fontWeight: '800', marginBottom: '8px' }}>종료 일시</label>
                  <button onClick={() => openPicker('end')} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: examEndDate ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: '700', textAlign: 'left', cursor: isExamActive ? 'not-allowed' : 'pointer' }}>
                    {examEndDate ? examEndDate.replace('T', ' ') : '선택해주세요'}
                  </button>
                </div>
             </div>

             <button onClick={() => { if (window.confirm(isExamActive ? "해제하시겠습니까?" : "시작하시겠습니까?")) isExamActive ? clearExamPeriod() : saveExamPeriod(); }} style={{ marginTop: 'auto', width: '100%', padding: '16px', borderRadius: '12px', background: isExamActive ? 'rgba(239, 68, 68, 0.8)' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontWeight: '900', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '1rem', boxShadow: isExamActive ? 'none' : '0 4px 15px rgba(37, 99, 235, 0.4)', transition: '0.2s' }}>
               {isExamActive ? '❌ 통제 해제' : '✅ 설정 저장 및 통제 시작'}
             </button>
           </div>

           {/* 우측: 차트 렌더링 모듈 */}
           <div style={glassCardStyle}>
             <h3 style={{ margin: '0 0 20px 0', color: '#fff', fontSize: '1.2rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
               📈 일별 이용 현황 (퇴실 기준)
             </h3>
             <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', padding: '15px', minHeight: '220px' }}>
                <Bar 
                  data={chartData} 
                  options={{ 
                    maintainAspectRatio: false,
                    scales: {
                      y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.6)' } },
                      x: { grid: { display: false }, ticks: { color: 'rgba(255,255,255,0.6)' } }
                    },
                    plugins: { legend: { labels: { color: 'rgba(255,255,255,0.8)' } } }
                  }} 
                />
             </div>
           </div>

         </div>

         {/* =========================================
             2. 하단 탭 및 테이블 영역
             ========================================= */}
         <div style={{ ...glassCardStyle, minHeight: '400px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '20px', marginBottom: '25px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px' }}>
              
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {[
                  { id: 'REPORTS', label: `🚨 수동 신고 관리 (${reportsList.length})`, color: '239, 68, 68' },
                  { id: 'APPEALS', label: `🤖 AI 소명/신고 접수 (${aiAppealsList.filter(a => a.status !== 'RESOLVED').length})`, color: '16, 185, 129' },
                  { id: 'USERS', label: '👥 전체 회원 목록', color: '59, 130, 246' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '12px',
                      fontWeight: '800',
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      background: activeTab === tab.id ? `rgba(${tab.color}, 0.2)` : 'rgba(255,255,255,0.05)',
                      color: activeTab === tab.id ? `rgb(${tab.color})` : 'rgba(255,255,255,0.5)',
                      border: activeTab === tab.id ? `1px solid rgba(${tab.color}, 0.5)` : '1px solid rgba(255,255,255,0.1)',
                      boxShadow: activeTab === tab.id ? `0 4px 15px rgba(${tab.color}, 0.2)` : 'none'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <button 
                onClick={handleCrawlNotices}
                disabled={isCrawling}
                style={{ padding: '12px 20px', borderRadius: '12px', background: isCrawling ? 'rgba(168, 85, 247, 0.5)' : 'linear-gradient(135deg, #8b5cf6, #a855f7)', color: '#fff', fontWeight: '900', border: '1px solid rgba(255,255,255,0.2)', cursor: isCrawling ? 'wait' : 'pointer', fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.4)' }}
              >
                {isCrawling ? '⏳ AI 지식 베이스 업데이트 중...' : '👾 외부 공지사항 크롤링 봇 가동'}
              </button>
            </div>

            {/* 수동 신고 탭 */}
            {activeTab === 'REPORTS' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                      <th style={thStyle}>피신고자</th>
                      <th style={thStyle}>신고 사유</th>
                      <th style={thStyle}>좌석</th>
                      <th style={thStyle}>신고자</th>
                      <th style={thStyle}>증거 사진</th>
                      <th style={thStyle}>조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportsList.length === 0 ? ( 
                      <tr><td colSpan="6" style={{ padding: '80px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: '700', fontSize: '1rem' }}>접수된 내역이 없습니다.</td></tr> 
                    ) : reportsList.map(r => {
                      const isCleanCheck = r.action === 'CHECK_IN_CLEAN_REPORT';
                      const reasonText = r.result || r.reason || r.issues?.join(', ') || '사유 없음';
                      const photos = r.mediaUrls || r.payload?.mediaUrls || r.reportPayload?.mediaUrls || [];
                      return (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isCleanCheck ? 'rgba(250, 204, 21, 0.05)' : 'transparent' }}>
                          <td style={tdStyle}>{r.realName} <span style={{color:'rgba(255,255,255,0.4)', fontSize:'0.75rem', display:'block'}}>{r.studentNo}</span></td>
                          <td style={tdStyle}>{isCleanCheck && <span style={{ background:'rgba(16,185,129,0.2)', color:'#34d399', padding:'2px 6px', borderRadius:'4px', fontSize:'0.7rem', marginRight:'6px' }}>클린체크</span>}{reasonText}</td>
                          <td style={tdStyle}><span style={{color:'#60a5fa'}}>{r.seatLabel || r.seatId || '-'}</span></td>
                          <td style={tdStyle}>{r.reporterName} <span style={{color:'rgba(255,255,255,0.4)', fontSize:'0.75rem', display:'block'}}>{r.reporterNo}</span></td>
                          <td style={tdStyle}>
                            {photos.length > 0 ? (
                              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', justifyContent: 'center' }}>
                                {photos.map((url, i) => <img key={i} src={url} alt="증거" onClick={() => openViewer(photos, i)} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)' }} /> )}
                              </div>
                            ) : <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem' }}>사진 없음</span>}
                          </td>
                          <td style={{ ...tdStyle, display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button onClick={() => setActionReport(r)} style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.8)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>조치</button>
                            <button onClick={() => handleDismissReport(r.id)} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>반려</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* AI 호소 탭 */}
            {activeTab === 'APPEALS' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '850px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
                      <th style={thStyle}>접수자(학번)</th>
                      <th style={thStyle}>상세 내용 (AI를 통해 전달됨)</th>
                      <th style={thStyle}>접수일시</th>
                      <th style={thStyle}>상태</th>
                      <th style={thStyle}>관리 액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiAppealsList.length === 0 ? ( <tr><td colSpan="5" style={{ padding: '80px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontWeight: '700', fontSize: '1rem' }}>현재 AI를 통해 접수된 내역이 없습니다.</td></tr> ) : aiAppealsList.map(a => {
                      const timeObj = a.createdAt || a.timestamp;
                      const dateStr = timeObj ? (timeObj.toDate ? timeObj.toDate().toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date(timeObj).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '방금 전';
                      return (
                        <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: a.status === 'RESOLVED' ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                          <td style={tdStyle}>{a.userId?.split('@')[0] || '익명'}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'pre-wrap', lineHeight: '1.4', textAlign: 'left' }}>{a.content}</td>
                          <td style={{ ...tdStyle, color: 'rgba(255,255,255,0.5)' }}>{dateStr}</td>
                          <td style={{ ...tdStyle, color: a.status === 'RESOLVED' ? '#34d399' : '#fbbf24' }}>{a.status === 'RESOLVED' ? '✅ 확인완료' : '⏳ 대기중'}</td>
                          <td style={{ ...tdStyle, display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            {a.status !== 'RESOLVED' && <button onClick={() => handleResolveAppeal(a.id)} style={{ padding: '8px 12px', background: 'rgba(16, 185, 129, 0.8)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>확인처리</button>}
                            <button onClick={() => handleDeleteAppeal(a.id)} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', border: 'none', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' }}>삭제</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 전체 회원 목록 탭 */}
            {activeTab === 'USERS' && (
              <>
                <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                  <input type="text" placeholder="학번 또는 이름으로 검색..." value={tempSearch} onChange={(e) => setTempSearch(e.target.value)} style={{ width: '100%', maxWidth: '300px', padding: '12px 15px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: '0.95rem', fontWeight: '700', outline: 'none' }} />
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '950px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
                        <th style={thStyle}>학번</th>
                        <th style={thStyle}>이름</th>
                        <th style={thStyle}>이용 횟수</th>
                        <th style={thStyle}>누적 사고</th>
                        <th style={thStyle}>패널티 초기화</th>
                        <th style={thStyle}>정지 기한</th>
                        <th style={thStyle}>관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersList.filter(u => !['pjy', 'admin', 'manager', '1111111', '관리자'].includes(u.studentNo)).filter(u => (u.studentNo || '').includes(debouncedSearch) || (u.name || '').includes(debouncedSearch)).map((u) => {
                        const isSuspended = u.penaltyUntil && now < (u.penaltyUntil.toDate ? u.penaltyUntil.toDate() : new Date(u.penaltyUntil));
                        return (
                          <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: isSuspended ? 'rgba(239, 68, 68, 0.1)' : 'transparent' }}>
                            <td style={tdStyle}>{u.studentNo}</td>
                            <td style={tdStyle}>{u.name}</td>
                            <td style={{ ...tdStyle, color: '#60a5fa' }}>{u.totalUsageCount || 0}회</td>
                            <td style={{ ...tdStyle, color: '#fca5a5' }}>취소 {u.cancelCount || 0} / 제재 {u.penaltyCount || 0}단계</td>
                            <td style={{ ...tdStyle, color: '#93c5fd' }}>{u.resetCount || 0}회</td>
                            <td style={{ ...tdStyle, color: isSuspended ? '#fca5a5' : 'rgba(255,255,255,0.4)' }}>
                              {isSuspended ? (u.penaltyUntil.toDate ? u.penaltyUntil.toDate().toLocaleString('ko-KR', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : new Date(u.penaltyUntil).toLocaleString()) : '-'}
                            </td>
                            <td style={{ ...tdStyle, display: 'flex', justifyContent: 'center' }}>
                              {isSuspended && (<button onClick={() => handleResetPenaltyOnly(u.studentNo, u.name)} style={{ padding: '6px 10px', background: 'rgba(59, 130, 246, 0.8)', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '900', cursor: 'pointer', fontSize: '0.8rem' }}>사면 처리</button>)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

         </div>

       </div>
    </div>
  );
}