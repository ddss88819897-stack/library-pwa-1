// api/search.js
export default async function handler(req, res) {
  // 1. CORS 처리
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ error: "검색어를 입력해주세요." });
  }

  try {
    // 2. 서버 딜레이 시뮬레이션
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. 진짜 같은 더미 도서 데이터베이스 (원하시는 책을 더 추가하셔도 됩니다!)
    const dummyDatabase = [
      {
        id: "bk-001", title: "해리포터와 마법사의 돌", author: "J.K. 롤링",
        publisher: "문학수첩", publishYear: "1999", callNumber: "843.5 롤23마",
        status: "대출가능", location: "2층 일반열람실 (입구쪽)"
      },
      {
        id: "bk-002", title: "해리포터와 비밀의 방", author: "J.K. 롤링",
        publisher: "문학수첩", publishYear: "1999", callNumber: "843.5 롤23비",
        status: "대출중 (반납예정: 2026-10-05)", location: "2층 일반열람실 (입구쪽)"
      },
      {
        id: "bk-003", title: "자바스크립트 완벽 가이드", author: "데이비드 플래너건",
        publisher: "인사이트", publishYear: "2022", callNumber: "005.133 플23자",
        status: "대출가능", location: "4층 전공도서관"
      },
      {
        id: "bk-004", title: "모던 리액트 Deep Dive", author: "김용찬",
        publisher: "위키북스", publishYear: "2023", callNumber: "005.133 김45모",
        status: "대출가능", location: "4층 전공도서관"
      },
      {
        id: "bk-005", title: "스마트폰 앱 프로그래밍", author: "박상열", // 슬쩍 상열님 이름도 넣어봤습니다 😎
        publisher: "울산과학대출판부", publishYear: "2025", callNumber: "005.133 박12스",
        status: "대출가능", location: "4층 전공도서관"
      }
    ];

    // 4. 핵심 로직: 검색어(q)가 제목이나 저자에 포함된 책만 골라내기!
    const filteredBooks = dummyDatabase.filter(book => 
      book.title.includes(q) || book.author.includes(q)
    );

    // 5. 프론트엔드로 데이터 쏴주기
    res.status(200).json({
      success: true,
      query: q,
      totalCount: filteredBooks.length,
      books: filteredBooks // 필터링된 결과만 보냄
    }); //

  } catch (error) {
    console.error("API 요청 실패:", error);
    res.status(500).json({ error: "도서 검색 서버에 문제가 발생했습니다." });
  }
}