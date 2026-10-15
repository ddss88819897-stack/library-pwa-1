// api/reserve.js
export default async function handler(req, res) {
    // 1. CORS 처리 (프론트와 통신 허용)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
    // 사전 요청(OPTIONS) 통과
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    // 예약은 무조건 POST 방식으로만 받음 (보안)
    if (req.method !== 'POST') {
      return res.status(405).json({ error: "POST 메서드만 허용됩니다." });
    }
  
    try {
      // 2. 프론트엔드에서 보낸 데이터 꺼내기 (도서 ID 등)
      const { bookId, title } = req.body;
  
      console.log(`[서버 로그] 도서 예약 요청 들어옴: ${title} (${bookId})`);
  
      // 3. 실제 서버처럼 처리 시간 0.8초 지연 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, 800));
  
      // 4. 성공 응답 쏴주기
      res.status(200).json({
        success: true,
        message: "정상적으로 예약이 승인되었습니다.",
        reservedBookId: bookId
      });
  
    } catch (error) {
      console.error("예약 처리 실패:", error);
      res.status(500).json({ error: "도서관 서버 통신 오류" });
    }
  }