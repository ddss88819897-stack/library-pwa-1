import React from "react";

export default function RankingBanner({ onEnter, onClose }) {
  return (
    <div
      onClick={onEnter}
      style={{
        background: "linear-gradient(135deg, #f59e0b, #f97316)",
        borderRadius: "20px",
        padding: "20px 25px",
        marginBottom: "20px",
        cursor: "pointer",
        boxShadow: "0 4px 15px rgba(245, 158, 11, 0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "15px",
        transition: "all 0.2s ease-in-out",
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(245, 158, 11, 0.4)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 15px rgba(245, 158, 11, 0.3)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
        <div style={{ fontSize: "2.5rem" }}>🏆</div>
        <div>
          <h3 style={{ margin: 0, color: "#fff", fontWeight: 900, fontSize: "1.15rem" }}>도서관 이용자 순위</h3>
          <p style={{ margin: "4px 0 0 0", color: "rgba(255,255,255,0.9)", fontWeight: 700, fontSize: "0.85rem" }}>
            가장 오래 이용한 TOP 10 확인하기
          </p>
        </div>
      </div>
      
      {/* 🆕 보러가기 버튼과 닫기(X) 버튼을 나란히 묶음 */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{ background: "rgba(255,255,255,0.25)", color: "#fff", padding: "8px 16px", borderRadius: "12px", fontWeight: 900, fontSize: "0.9rem", whiteSpace: "nowrap" }}>
          보러가기 →
        </div>
        
        {/* ❌ 닫기 버튼 추가 */}
        <button
          onClick={(e) => {
            e.stopPropagation(); // 이 영역을 클릭하면 배너 전체 클릭(onEnter)이 무시됨
            if (onClose) onClose(); // X버튼 클릭 시 숨김 처리 함수 실행
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.6)",
            fontSize: "1.2rem",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "0.2s"
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = "#fff")}
          onMouseOut={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.6)")}
          title="배너 닫기"
        >
          ✕
        </button>
      </div>
    </div>
  );
}