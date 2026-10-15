import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase'; 

export default function FloatingChatbot() {
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

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg = input;
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

          aiResponse = `🔍 실시간 예약 DB를 분석 중입니다...\n\n요청하신 **${dateStr} 스터디룸 예약 현황**입니다.\n\n[스터디룸 1]\n- 전 시간대 : ✅ 예약 가능\n\n[스터디룸 2]\n- 전 시간대 : ✅ 예약 가능\n\n예약을 진행하시려면 하단 메뉴의 '자리 예약' 탭을 이용해 주세요!`;
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
            aiResponse = "좌석 예약 취소는 앱 하단의 **[내 예약 내역]** 메뉴에서 진행하실 수 있습니다. 📱\n예약 시간 10분 전까지 취소하지 않으시면 노쇼(No-Show) 패널티가 부과될 수 있으니 이용을 원치 않으시면 꼭 사전에 취소해 주세요!";
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

  return (
    <div style={{ position: 'fixed', bottom: '30px', right: '30px', zIndex: 999999 }}>
      {isOpen && (
        <div style={{ width: '380px', height: '550px', background: '#fff', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: '15px', border: '1px solid #e2e8f0' }}>
          
          <div style={{ background: '#2563eb', padding: '16px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.8rem' }}>🤖</span>
              <div>
                <h4 style={{ margin: 0, fontWeight: 900, fontSize: '1.1rem' }}>스마트 도서관 AI</h4>
                <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.8 }}>시연용 스마트 해결사</p>
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', padding: 0 }}>✕</button>
          </div>

          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: msg.sender === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '12px 16px', borderRadius: '16px', fontSize: '0.95rem', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                  background: msg.sender === 'user' ? '#2563eb' : '#fff',
                  color: msg.sender === 'user' ? '#fff' : '#334155',
                  boxShadow: msg.sender === 'user' ? 'none' : '0 2px 5px rgba(0,0,0,0.05)',
                  border: msg.sender === 'user' ? 'none' : '1px solid #e2e8f0',
                  borderBottomRightRadius: msg.sender === 'user' ? '4px' : '16px',
                  borderBottomLeftRadius: msg.sender === 'ai' ? '4px' : '16px',
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '16px', borderBottomLeftRadius: '4px', border: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '0.85rem' }}>
                  AI가 실시간 데이터를 검토 중입니다... 🔍
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div style={{ padding: '15px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder={appealMode ? "내용을 적어주시거나 '취소'를 입력하세요." : "궁금한 점을 물어보세요!"}
              style={{ flex: 1, padding: '12px 16px', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', background: '#f1f5f9', fontSize: '0.9rem', borderColor: appealMode ? '#3b82f6' : '#cbd5e1' }}
            />
            <button onClick={handleSend} disabled={isTyping} style={{ background: isTyping ? '#94a3b8' : '#2563eb', color: '#fff', border: 'none', borderRadius: '12px', padding: '0 16px', fontWeight: 900, cursor: isTyping ? 'not-allowed' : 'pointer', transition: '0.2s', whiteSpace: 'nowrap' }}>
              전송
            </button>
          </div>
        </div>
      )}

      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            width: '65px', height: '65px', borderRadius: '50%', background: '#2563eb', border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(37,99,235,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          💬
        </button>
      )}
    </div>
  );
}