import React, { useEffect, useState } from "react";
import { fetchActiveEvents } from "../api/eventApi";
import { fetchActiveNotices } from "../api/noticeApi"; // 💡 공지사항 데이터를 불러오기 위해 추가!

// 👤 메인 화면 상단 활성 이벤트/공지사항 자동 슬라이드 배너
//    - 로그인된 사용자에게만 노출 (App.jsx에서 user 체크 후 렌더)
//    - isActive === true 글만 4초 간격으로 순환

export default function EventBanner({ onSeeAll, onSelectEvent }) {
  const [items, setItems] = useState([]); // 💡 events에서 items로 변경 (공지+이벤트)
  const [idx, setIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true); // 💡 자동 슬라이드 재생 상태
  
  // 💡 [추가] 로딩 상태를 관리하는 변수 (처음엔 무조건 로딩 중!)
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 💡 공지사항과 이벤트를 동시에 불러와서 합칩니다.
    Promise.all([
      fetchActiveEvents().catch(() => []),
      fetchActiveNotices().catch(() => [])
    ]).then(([eventsData, noticesData]) => {
      const combined = [
        ...eventsData.map(e => ({ ...e, _type: 'EVENT' })),
        ...noticesData.map(n => ({ ...n, _type: 'NOTICE' }))
      ];

      // ====================================================================
      // 💡 정렬 우선순위: 1. 관리자가 고정한 글(isPinned) -> 2. 날짜 최신순
      // ====================================================================
      combined.sort((a, b) => {
        // 1순위: 고정된 글(isPinned)이 무조건 위로 오게 함
        if (!!b.isPinned !== !!a.isPinned) {
          return b.isPinned ? 1 : -1;
        }
        // 2순위: 고정 여부가 같다면 날짜 최신순 정렬
        const timeA = new Date(a.createdAt || a.startDate || 0).getTime();
        const timeB = new Date(b.createdAt || b.startDate || 0).getTime();
        return timeB - timeA;
      });

      setItems(combined);
    })
    .finally(() => {
      // 💡 [추가] 데이터를 다 가져왔든 에러가 났든 로딩은 끝났다고 알려줌!
      setIsLoading(false);
    });
  }, []);

  // 💡 isPlaying이 true일 때만 4초마다 넘어갑니다!
  useEffect(() => {
    if (items.length <= 1 || !isPlaying) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, 4000);
    return () => clearInterval(t);
  }, [items, isPlaying]);

  // ====================================================================
  // 💡 데이터를 불러오는 1초 동안 보여줄 "가짜 로딩 배너 (스켈레톤)"
  // ====================================================================
  if (isLoading) {
    return (
      <div style={{ background: "#fff", borderRadius: "20px", padding: "20px", marginBottom: "20px", boxShadow: "0 4px 15px rgba(0,0,0,0.05)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h3 style={{ margin: 0, fontWeight: 900, color: "#cbd5e1", fontSize: "1.1rem" }}>
            데이터를 불러오는 중...
          </h3>
          <div style={{ width: "60px", height: "24px", background: "#f1f5f9", borderRadius: "10px" }} />
        </div>
        <div style={{ borderRadius: "16px", background: "#f1f5f9", aspectRatio: "16 / 7", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e2e8f0" }}>
          <span style={{ color: "#94a3b8", fontWeight: 800, fontSize: "1rem" }}>
            로딩 중... ⏳
          </span>
        </div>
      </div>
    );
  }

  // 로딩이 끝났는데도 등록된 글이 하나도 없으면 아무것도 안 보여줌
  if (items.length === 0) return null;

  const e = items[idx]; // 현재 보여줄 아이템

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "20px",
        padding: "20px",
        marginBottom: "20px",
        boxShadow: "0 4px 15px rgba(0,0,0,0.05)",
      }}
    >
      {/* 💡 [수정 완료] 앱 메인(App.jsx)의 공지사항/시설안내 폰트 규격과 100% 동일하게 세팅했습니다! */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "15px", // 💡 간격 통일
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <h3
            style={{
              margin: 0,
              fontSize: "1.25rem",  // 💡 1.25rem으로 크기 업!
              fontWeight: "900",    // 💡 굵게
              color: "#0f172a",     // 💡 검정 텍스트
              letterSpacing: "-0.5px" // 💡 자간 통일
            }}
          >
            이벤트
          </h3>
        </div>
        <button
          onClick={onSeeAll}
          style={{
            background: "#eff6ff",
            color: "#2563eb",
            border: "none",
            borderRadius: "12px", // 💡 모서리 둥글기 통일
            padding: "6px 14px",  // 💡 패딩 통일
            fontSize: "0.8rem",   // 💡 글자 크기 통일
            fontWeight: "800",    // 💡 굵기 통일
            cursor: "pointer",
            transition: "0.2s",
          }}
        >
          더 보기 →
        </button>
      </div>

      <div
        onClick={() => onSelectEvent && onSelectEvent(e)}
        style={{
          position: "relative",
          borderRadius: "16px",
          overflow: "hidden",
          cursor: "pointer",
          background: "#f1f5f9",
          aspectRatio: "16 / 7",
        }}
      >
        {e.imageUrl ? (
          <img
            src={e.imageUrl}
            alt={e.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontWeight: 900,
            }}
          >
            이미지 없음
          </div>
        )}

        {/* 글씨 배경 그라데이션 */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            padding: "50px 16px 16px 16px",
            background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 60%, rgba(0,0,0,0) 100%)",
            color: "#fff",
            zIndex: 10,
          }}
        >
          {/* 제목 옆에 [공지] / [이벤트] 뱃지 추가 */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
            <span style={{ 
              background: e._type === 'NOTICE' ? '#2563eb' : '#f59e0b', 
              color: '#fff', 
              padding: '2px 8px', 
              borderRadius: '6px', 
              fontSize: '0.7rem', 
              fontWeight: 900 
            }}>
              {e._type === 'NOTICE' ? '공지' : '이벤트'}
            </span>
            <div style={{ fontWeight: 900, fontSize: "1.1rem", textShadow: "0 2px 4px rgba(0,0,0,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {e.title}
            </div>
          </div>
          
          {/* 날짜 구분: 공지사항은 작성일, 이벤트는 기간 */}
          <div style={{ fontSize: "0.8rem", opacity: 0.9, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
            {e._type === 'NOTICE' 
              ? `작성일: ${e.createdAt ? new Date(e.createdAt).toLocaleDateString('ko-KR') : ''}`
              : `${e.startDate} ~ ${e.endDate}`
            }
          </div>
        </div>
      </div>

      {/* 하단 네비게이션 구역 (도트 + 재생버튼 우측 정렬) */}
      {items.length > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "16px", // 버튼과 도트 사이 간격
            marginTop: "16px", // 배너와의 간격
          }}
        >
          {/* 기존 슬라이드 도트 (좌측) */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {items.map((_, i) => (
              <div
                key={i}
                onClick={() => {
                  setIdx(i);
                  setIsPlaying(false); // 💡 사용자가 직접 누르면 자동으로 멈추게 센스 추가!
                }}
                style={{
                  width: i === idx ? "20px" : "6px",
                  height: "6px",
                  borderRadius: "3px",
                  background: i === idx ? "#2563eb" : "#cbd5e1",
                  cursor: "pointer",
                  transition: "0.2s",
                }}
              />
            ))}
          </div>

          {/* 재생 / 일시정지 버튼 (우측) */}
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              background: "#f1f5f9", 
              border: "none",
              color: "#475569", 
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "42px", 
              height: "42px",
              borderRadius: "50%", 
              padding: "0",
              transition: "0.2s ease",
              boxShadow: "0 2px 5px rgba(0,0,0,0.05)" 
            }}
            title={isPlaying ? "일시정지" : "자동 재생"}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.color = '#0f172a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#475569'; }}
          >
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}