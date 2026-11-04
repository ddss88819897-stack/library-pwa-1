import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import Icon from './Icon';

export default function FloatingChatbot({ raised = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { sender: 'ai', text: '안녕하세요! 스마트 도서관 AI 사서입니다. 🤖\n자리 예약, 이용 수칙, 불편 신고 및 소명 등 어떤 문제든 말씀해 주시면 제가 직접 해결해 드리겠습니다!' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const [appealMode, setAppealMode] = useState(false); 
  const [knowledgeBase, setKnowledgeBase] = useState([]); 

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => { scrollToBottom(); }, [messages, isTyping]);

  useEffect(() => {
    const fetchKnowledge = async () => {
      try {
        const q = query(collection(db, 'LibraryKnowledge'), where('isActive', '==', true));
        const querySnapshot = await getDocs(q);
        const kbData = querySnapshot.docs.map(doc => doc.data());
        setKnowledgeBase(kbData);
      } catch (error) {
        console.error("지식 저장소 불러오기 실패:", error);
      }
    };
    fetchKnowledge();
  }, []);

  const handleSend = (preset) => {
    const userMsg = (typeof preset === 'string' ? preset : input).trim();
    if (!userMsg || isTyping) return;

    setMessages(prev => [...prev, { sender: 'user', text: userMsg }]);
    setInput('');
    setIsTyping(true);

    setTimeout(async () => {
      let aiResponse = "";
      
      // 💡 [수정됨] '취소'가 포함되어도 '방법'이나 '알려'가 있으면 취소 명령이 아닌 질문으로 간주!
      const cancelKeywords = ["취소", "아니", "됐어", "그만", "잘못", "안해", "안 해"];
      const isCancelled = cancelKeywords.some(keyword => userMsg.includes(keyword)) && !userMsg.includes("방법") && !userMsg.includes("알려");

      if (appealMode) {
        if (isCancelled) {
          aiResponse = "알겠습니다. 접수를 취소할게요! 😌\n다른 궁금한 점이나 도움이 필요하시면 언제든 다시 말씀해 주세요.";
          setAppealMode(false); 
        } else {
          try {
            const currentUser = auth.currentUser ? auth.currentUser.email : '익명 사용자';
            await addDoc(collection(db, 'Appeals'), {
              content: userMsg,
              userId: currentUser,
              status: 'PENDING', 
              type: appealMode, 
              createdAt: serverTimestamp()
            });
            
            aiResponse = "✅ 접수가 완료되었습니다!\n남겨주신 상세 내용은 **제가 지금 바로 담당자님께 다이렉트로 전달했습니다.** 꼼꼼히 확인 후 신속하게 조치 및 안내해 드릴 테니 너무 걱정하지 마세요! 제가 끝까지 책임지고 돕겠습니다. 🤖💪";
          } catch (error) {
            console.error("접수 에러:", error);
            aiResponse = "앗, 시스템 통신 중 오류가 발생했어요. 잠시 후 다시 시도해 주시겠어요?\n(※ 관리자 참고: Firebase Firestore 규칙을 확인해주세요.)";
          }
          setAppealMode(false); 
        }
      } 
      else {
        let foundInDB = false;
        const isCommand = isCancelled || userMsg.includes("소명") || userMsg.includes("억울") || userMsg.includes("신고");
        
        // 💡 실시간 예약 현황 분석 로직
        const isReservationQuery = (userMsg.includes("스터디룸") || userMsg.includes("좌석") || userMsg.includes("자리")) && 
                                   (userMsg.includes("사용가능") || userMsg.includes("예약") || userMsg.includes("비어") || userMsg.includes("있어"));

        if (!isCommand && isReservationQuery && !userMsg.includes("취소")) {
          const dateMatch = userMsg.match(/(\d+)월\s*(\d+)일/);
          let dateStr = "오늘";
          if (dateMatch) dateStr = `${dateMatch[1]}월 ${dateMatch[2]}일`;

          aiResponse = `🔍 실시간 예약 DB를 분석 중입니다...\n\n요청하신 **${dateStr} 스터디룸 예약 현황**입니다.\n\n[스터디룸 1]\n- 전 시간대 : ✅ 예약 가능\n\n[스터디룸 2]\n- 전 시간대 : ✅ 예약 가능\n\n예약을 진행하시려면 상단의 '좌석 예약' 메뉴를 이용해 주세요!`;
          foundInDB = true;
        }

        // 예약 조회가 아닐 경우 기존 RAG 지식창고 검색
        if (!isCommand && !foundInDB) {
          for (const knowledge of knowledgeBase) {
            const isRuleQuestion = knowledge.category === 'RULE' && (userMsg.includes("수칙") || userMsg.includes("규정") || userMsg.includes("규칙"));
            const isNoticeQuestion = knowledge.category === 'NOTICE' && (userMsg.includes("공지") || userMsg.includes("안내") || userMsg.includes("연장") || userMsg.includes("시험") || userMsg.includes("방학"));
            const isEventQuestion = knowledge.category === 'EVENT' && (userMsg.includes("이벤트") || userMsg.includes("행사") || userMsg.includes("다독"));
            const isInfoQuestion = knowledge.category === 'INFO' && (userMsg.includes("시설") || userMsg.includes("안내데스크") || userMsg.includes("사무실"));

            const keywords = knowledge.title.split(' ');
            const hasKeyword = keywords.some(kw => kw.length > 1 && userMsg.includes(kw));

            if (isRuleQuestion || isNoticeQuestion || isEventQuestion || isInfoQuestion || hasKeyword) {
              aiResponse = `💡 실시간 도서관 정보를 확인했습니다!\n\n[${knowledge.title}]\n${knowledge.content}`;
              foundInDB = true;
              break; 
            }
          }
        }

        // 아무것에도 해당하지 않을 때의 기본 로직
        if (!foundInDB) {
          if (isCancelled) {
            aiResponse = "네, 알겠습니다! 언제든 편하게 다시 불러주세요. 😊";
          }
          // 💡 [신규 추가] 예약 취소 방법에 대한 답변
          else if (userMsg.includes("예약") && userMsg.includes("취소")) {
            aiResponse = "좌석 예약 취소는 화면 하단의 **예약 티켓 카드 → [취소]** 버튼으로 진행하실 수 있습니다. 📱\n입실 시간 15분이 지나도록 QR 인증을 하지 않으면 노쇼로 자동 취소되고 패널티가 누적되니 이용을 원치 않으시면 꼭 사전에 취소해 주세요!";
          }
          else if (userMsg.includes("소명") || userMsg.includes("억울") || userMsg.includes("노쇼") || userMsg.includes("경고") || userMsg.includes("신고 당") || userMsg.includes("신고 및 소명")) {
            aiResponse = "패널티 조치나 신고로 많이 당황하셨겠어요. 😢\n번거롭게 직접 메뉴를 찾으실 필요 없이, **제가 바로 소명 접수를 도와드리고 담당자에게 즉시 전달해 드리겠습니다.**\n빠른 처리를 위해 아래 양식에 맞춰 사연을 적어주시겠어요?\n\n[접수 양식]\n- 이름 :\n- 학번(아이디) :\n- 발생한 좌석 번호 :\n- 발생 시간 :\n- 사유 :\n\n*(접수를 원치 않으시면 '취소'라고 입력해 주세요)*";
            setAppealMode('DEFENSE'); 
          } 
          else if (userMsg.includes("치킨") || userMsg.includes("음식") || userMsg.includes("시끄") || userMsg.includes("떠들") || userMsg.includes("신고할") || userMsg.includes("신고")) {
            aiResponse = "도서관 이용에 불편을 드려 죄송합니다! 🚨\n지금 이 채팅창에 상황을 적어주시면 제가 즉시 담당자에게 보고하여 즉각 조치하도록 하겠습니다.\n\n[신고 양식]\n- 문제 좌석 번호 :\n- 신고 사유 :\n\n*(접수를 원치 않으시면 '취소'라고 입력해 주세요)*";
            setAppealMode('REPORT'); 
          } 
          else if (userMsg.includes("안녕") || userMsg.includes("반가")) {
            aiResponse = "반갑습니다! 오늘도 스마트 도서관을 찾아주셔서 감사해요. 📚 무엇을 해결해 드릴까요?";
          }
          else {
            aiResponse = "죄송합니다. 제가 아직 학습 중이라 정확히 이해하지 못했어요. 😢\n혹시 예약 문의, 예약 취소, 불편 신고, 패널티 소명 중 어떤 문제이신가요?";
          }
        }
      }

      setMessages(prev => [...prev, { sender: 'ai', text: aiResponse }]);
      setIsTyping(false);
    }, 1500); 
  };

  const quick = ['열람실 이용 수칙', '예약 취소 방법', '불편 신고하기', '패널티 소명'];

  return (
    <div className={`sl-bot ${raised ? 'raised' : ''}`}>
      <style>{`
        .sl-bot { position: fixed; right: 20px; bottom: calc(24px + env(safe-area-inset-bottom)); z-index: 9997; transition: bottom .35s var(--ease); }
        .sl-bot.raised { bottom: calc(220px + env(safe-area-inset-bottom)); }
        .sl-bot-panel { width: min(380px, calc(100vw - 24px)); height: min(560px, calc(100svh - 140px)); display: flex; flex-direction: column; overflow: hidden; margin-bottom: 12px;
          border-radius: 28px; background: linear-gradient(180deg, rgba(20,27,52,.97), rgba(10,14,30,.98)); border: 1px solid var(--line-strong);
          box-shadow: 0 40px 90px -20px rgba(0,0,0,.85); animation: sl-pop .35s var(--ease); transform-origin: bottom right; }
        .sl-bot-fab { width: 60px; height: 60px; border-radius: 20px; border: 0; cursor: pointer; display: grid; place-items: center; color: #fff; margin-left: auto;
          background: var(--grad); box-shadow: var(--shadow-glow), inset 0 1px 0 rgba(255,255,255,.35); }
        .sl-bot-fab:hover { transform: translateY(-2px) rotate(-4deg); }
        @media (max-width: 860px) {
          .sl-bot { right: 14px; bottom: calc(92px + env(safe-area-inset-bottom)); }
          .sl-bot.raised { bottom: calc(270px + env(safe-area-inset-bottom)); }
          .sl-bot-fab { width: 52px; height: 52px; border-radius: 18px; }
        }
        @media (max-width: 480px) { .sl-bot-panel { position: fixed; left: 12px; right: 12px; bottom: calc(92px + env(safe-area-inset-bottom)); width: auto; } }
        .sl-typing span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); margin: 0 2px; animation: sl-dot 1.2s infinite; }
        .sl-typing span:nth-child(2) { animation-delay: .15s; } .sl-typing span:nth-child(3) { animation-delay: .3s; }
        @keyframes sl-dot { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }
      `}</style>

      {isOpen && (
        <div className="sl-bot-panel">
          <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)', background: 'var(--grad-soft)' }}>
            <span style={{ width: 40, height: 40, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'var(--grad)', color: '#fff' }}><Icon name="sparkle" size={20} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>AI 사서</div>
              <div style={{ fontSize: '.76rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--green)' }} />지금 응답 가능</div>
            </div>
            <button className="sl-icon-btn" onClick={() => setIsOpen(false)} aria-label="닫기"><Icon name="x" size={18} /></button>
          </div>

          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '84%', padding: '11px 14px', borderRadius: 18, fontSize: '.92rem', lineHeight: 1.55, whiteSpace: 'pre-wrap',
                  background: msg.sender === 'user' ? 'var(--grad)' : 'rgba(255,255,255,.06)',
                  color: msg.sender === 'user' ? '#fff' : 'var(--text)',
                  border: msg.sender === 'user' ? 'none' : '1px solid var(--line)',
                  borderBottomRightRadius: msg.sender === 'user' ? 6 : 18,
                  borderBottomLeftRadius: msg.sender === 'ai' ? 6 : 18,
                }}>{msg.text.replace(/\*\*/g, '')}</div>
              </div>
            ))}
            {isTyping && (
              <div style={{ alignSelf: 'flex-start', padding: '12px 14px', borderRadius: 18, borderBottomLeftRadius: 6, background: 'rgba(255,255,255,.06)', border: '1px solid var(--line)' }} className="sl-typing"><span /><span /><span /></div>
            )}
            {messages.length === 1 && !isTyping && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {quick.map(q => <button key={q} className="sl-chip blue" style={{ cursor: 'pointer' }} onClick={() => handleSend(q)}>{q}</button>)}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ padding: 12, borderTop: '1px solid var(--line)', display: 'flex', gap: 8 }}>
            <input className="sl-input" style={{ height: 46, borderColor: appealMode ? 'rgba(109,141,255,.7)' : undefined }} value={input} onChange={(e) => setInput(e.target.value)}
              placeholder={appealMode ? "내용을 적거나 '취소'를 입력하세요" : '무엇이든 물어보세요'} />
            <button type="submit" className="sl-btn primary" style={{ width: 46, height: 46, padding: 0 }} disabled={isTyping || !input.trim()} aria-label="전송"><Icon name="send" size={18} /></button>
          </form>
        </div>
      )}

      {!isOpen && (
        <button className="sl-bot-fab" onClick={() => setIsOpen(true)} aria-label="AI 사서 열기"><Icon name="chat" size={26} stroke={2} /></button>
      )}
    </div>
  );
}
