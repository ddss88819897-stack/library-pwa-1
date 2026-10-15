// api/cancelReserve.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
  
    if (req.method !== 'POST') {
      return res.status(405).json({ error: "POST 메서드만 허용됩니다." });
    }
  
    try {
      const { bookId, title } = req.body;
      console.log(`[관리자 권한] 예약 강제 취소 요청: ${title} (${bookId})`);
  
      // 서버 딜레이 0.6초
      await new Promise(resolve => setTimeout(resolve, 600));
  
      res.status(200).json({
        success: true,
        message: "관리자 권한으로 예약이 강제 취소되었습니다.",
        canceledBookId: bookId
      });
  
    } catch (error) {
      console.error("취소 처리 실패:", error);
      res.status(500).json({ error: "도서관 서버 통신 오류" });
    }
  }