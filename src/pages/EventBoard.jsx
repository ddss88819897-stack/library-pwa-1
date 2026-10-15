import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';

export default function EventBoard({ initialTab = 'NOTICE', onBack, onSelectEvent, onSelectNotice }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [notices, setNotices] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("ALL"); // 이벤트 전용 필터

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    // 💡 1. 공지사항 데이터 실시간 로드
    const qNotices = query(collection(db, 'Notices'), orderBy('createdAt', 'desc'));
    const unsubNotices = onSnapshot(qNotices, (snap) => {
      setNotices(snap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'NOTICE' })));
    });

    // 💡 2. 이벤트 데이터 실시간 로드
    const qEvents = query(collection(db, 'Events'), orderBy('createdAt', 'desc'));
    const unsubEvents = onSnapshot(qEvents, (snap) => {
      setEvents(snap.docs.map(doc => ({ id: doc.id, ...doc.data(), _type: 'EVENT' })));
      setLoading(false);
    });

    return () => { unsubNotices(); unsubEvents(); };
  }, []);

  // 날짜 에러 방지 함수
  const formatDate = (dateValue) => {
    if (!dateValue) return '날짜 없음';
    if (dateValue.toDate) return format(dateValue.toDate(), 'yyyy-MM-dd');
    try {
      return format(new Date(dateValue), 'yyyy-MM-dd');
    } catch (e) {
      return 'Invalid Date';
    }
  };

  // 💡 이벤트 상태(진행중, 종료 등) 판별 함수
  const getEventStatus = (e) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    if (e.isActive === false) return "ENDED"; 
    if (e.endDate && e.endDate < todayStr) return "ENDED"; 
    if (e.startDate && e.startDate > todayStr) return "UPCOMING"; 
    return "ACTIVE"; 
  };

  // 필터링된 이벤트 리스트
  const filteredEvents = events.filter((e) => {
    if (eventFilter === "ALL") return true;
    return getEventStatus(e) === eventFilter; 
  });

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: '100vh', padding: window.innerWidth < 768 ? '20px 10px' : '40px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        
        {/* 상단 헤더 영역 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 18px', borderRadius: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontWeight: '800', backdropFilter: 'blur(10px)', transition: '0.3s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'} onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}>
            ◀ 뒤로
          </button>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '900', margin: 0, color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>라운지</h2>
          <div style={{ width: '80px' }}></div>
        </div>

        {/* 탭 버튼 영역 */}
        <div style={{ display: 'flex', gap: '15px', marginBottom: '35px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
          <button 
            onClick={() => setActiveTab('NOTICE')} 
            style={{ flex: 1, padding: '16px', background: activeTab === 'NOTICE' ? 'rgba(59, 130, 246, 0.8)' : 'transparent', color: activeTab === 'NOTICE' ? '#fff' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: '16px', fontSize: '1.1rem', fontWeight: '900', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: activeTab === 'NOTICE' ? '0 4px 15px rgba(59, 130, 246, 0.4)' : 'none' }}
          >
            📢 공지사항
          </button>
          <button 
            onClick={() => setActiveTab('EVENT')} 
            style={{ flex: 1, padding: '16px', background: activeTab === 'EVENT' ? 'rgba(236, 72, 153, 0.8)' : 'transparent', color: activeTab === 'EVENT' ? '#fff' : 'rgba(255,255,255,0.5)', border: 'none', borderRadius: '16px', fontSize: '1.1rem', fontWeight: '900', cursor: 'pointer', transition: 'all 0.3s ease', boxShadow: activeTab === 'EVENT' ? '0 4px 15px rgba(236, 72, 153, 0.4)' : 'none' }}
          >
            🎉 이벤트
          </button>
        </div>

        {/* 렌더링 영역 */}
        <div style={{ paddingBottom: '50px' }}>
          
          {loading ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', padding: '50px', fontWeight: '700' }}>⏳ 불러오는 중...</div>
          ) : activeTab === 'NOTICE' ? (
            
            // 💡 공지사항 리스트 (가로형 글래스 카드)
            notices.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>등록된 공지가 없습니다.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {notices.map((notice) => (
                  <div 
                    key={notice.id} 
                    // ⭐️ 핵심: 공지사항 클릭 시 onSelectNotice 호출
                    onClick={() => onSelectNotice && onSelectNotice(notice)} 
                    style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '20px', padding: '25px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.3s ease', backdropFilter: 'blur(10px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} 
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.4)'; e.currentTarget.style.boxShadow = '0 10px 20px rgba(0,0,0,0.2)'; }} 
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ flex: 1, paddingRight: '20px' }}>
                      <span style={{ display: 'inline-block', padding: '6px 12px', background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900', marginBottom: '12px', border: '1px solid rgba(59,130,246,0.3)' }}>
                        📢 공지
                      </span>
                      <h3 style={{ margin: '0 0 5px 0', fontSize: '1.25rem', color: '#fff', fontWeight: '900', wordBreak: 'keep-all', lineHeight: '1.4' }}>
                        {notice.title || notice.name}
                      </h3>
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                      {formatDate(notice.createdAt || notice.date)}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            
            // 💡 이벤트 그리드 및 필터 (장혁님 로직 완벽 이식 + 글래스 테마)
            <>
              {/* 이벤트 필터 (전체/진행/예정/종료) */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "25px", flexWrap: "wrap" }}>
                {[
                  ["ALL", "전체"], 
                  ["ACTIVE", "진행 중"], 
                  ["UPCOMING", "진행 예정"], 
                  ["ENDED", "종료"]
                ].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setEventFilter(k)}
                    style={{
                      padding: "8px 16px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.2)", fontWeight: '900', cursor: "pointer", transition: "0.2s",
                      background: eventFilter === k ? "rgba(236, 72, 153, 0.8)" : "rgba(255,255,255,0.05)",
                      color: eventFilter === k ? "#fff" : "rgba(255,255,255,0.6)",
                      backdropFilter: 'blur(10px)'
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {filteredEvents.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.6)', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '24px', border: '1px dashed rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)' }}>
                  <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800' }}>해당되는 이벤트가 없습니다.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "20px" }}>
                  {filteredEvents.map((e) => {
                    const status = getEventStatus(e);
                    let badgeBg = "rgba(255,255,255,0.1)"; let badgeColor = "rgba(255,255,255,0.6)"; let badgeText = "종료";
                    if (status === "ACTIVE") { badgeBg = "rgba(34, 197, 94, 0.2)"; badgeColor = "#86efac"; badgeText = "진행 중"; } 
                    else if (status === "UPCOMING") { badgeBg = "rgba(250, 204, 21, 0.2)"; badgeColor = "#fde047"; badgeText = "진행 예정"; }

                    return (
                      <div
                        key={e.id}
                        // ⭐️ 핵심: 이벤트 클릭 시 onSelectEvent 호출
                        onClick={() => onSelectEvent && onSelectEvent(e)}
                        style={{
                          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "20px", overflow: "hidden", cursor: "pointer", transition: "all 0.3s ease", backdropFilter: 'blur(10px)',
                          opacity: status === "ENDED" ? 0.6 : 1,
                        }}
                        onMouseOver={(ev) => { ev.currentTarget.style.borderColor = "rgba(236, 72, 153, 0.5)"; ev.currentTarget.style.transform = "translateY(-4px)"; ev.currentTarget.style.boxShadow = "0 15px 30px rgba(0,0,0,0.3)"; ev.currentTarget.style.opacity = 1; }}
                        onMouseOut={(ev) => { ev.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; ev.currentTarget.style.transform = "translateY(0)"; ev.currentTarget.style.boxShadow = "none"; ev.currentTarget.style.opacity = status === "ENDED" ? 0.6 : 1; }}
                      >
                        {/* 이미지 영역 */}
                        <div style={{ aspectRatio: "16 / 9", background: "rgba(0,0,0,0.3)" }}>
                          {e.imageUrl ? (
                            <img src={e.imageUrl} alt={e.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.3)", fontSize: "2rem" }}>🎉</div>
                          )}
                        </div>

                        {/* 텍스트 영역 */}
                        <div style={{ padding: "20px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <span style={{ background: badgeBg, color: badgeColor, padding: "4px 10px", borderRadius: "8px", fontSize: "0.75rem", fontWeight: 900 }}>
                              {badgeText}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>
                              {formatDate(e.startDate || e.createdAt)}
                            </span>
                          </div>
                          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 900, color: "#fff", lineHeight: "1.4" }}>{e.title}</h3>
                          <p style={{ margin: "10px 0 0 0", color: "rgba(255,255,255,0.6)", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", lineHeight: "1.5" }}>
                            {e.content || "상세 내용이 없습니다."}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}