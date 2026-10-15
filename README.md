# 📚 스마트 도서관 PWA 상세 기술 분석 문서

## 1. 서비스 및 비즈니스 로직 계층 (`/api`, `/services`)
데이터베이스와 직접 통신하며 복잡한 비즈니스 규칙과 데이터 정합성을 담당

| 파일명 | 상세 기능 및 로직 분석 |
| :--- | :--- |
| **`libraryService.js`** | 도서관의 핵심 정책 수행. `runTransaction`을 사용하여 좌석 상태 변경과 동시에 예약 내역을 갱신함으로써 데이터 무결성 보장. 예약 취소 시 강제 퇴실/노쇼 여부를 판단하고, 신고 처리 시 첨부파일 경로와 텍스트를 처리하는 복합 로직 담당 |
| **`seatApi.js`** | Firestore `onSnapshot`을 사용한 좌석 상태 실시간 구독. `updateSeatStatus` 함수를 통해 좌석 상태(RESERVED, OCCUPIED, AVAILABLE 등) 변경 시 사용자 ID, 예약 시간, 현재 시간을 매핑하여 Log 컬렉션에 영수증 형태의 데이터 자동 발행 |
| **`authApi.js`** | Firebase Auth 모듈을 래핑. `signInWithEmailAndPassword` 호출 시 에러 처리를 표준화하여 UI 레이어에서 일관된 에러 메시지를 표시하도록 설계 |
| **`eventApi.js` / `noticeApi.js`** | 관리자 권한 제어하에 동작. Firebase Storage를 통해 이벤트 배너 이미지 업로드 후 파일 경로와 다운로드 URL을 Firestore에 저장. `query`와 `where` 절을 사용하여 `isActive`가 true인 항목만 필터링하여 사용자에게 노출 |
| **`logger.js`** | 전역 로그 기록 모듈. 시스템의 모든 행위를 `logs` 컬렉션에 서버 타임스탬프와 함께 적재하여 향후 관리자의 통계 분석 및 분쟁 해결을 위한 감사 데이터 제공 |

## 2. 자동화 및 세션 관리 계층 (`/hooks`)
비동기 흐름 제어와 실시간 상태 감시를 통해 시스템의 무인 운영을 지원

| 파일명 | 상세 기능 및 로직 분석 |
| :--- | :--- |
| **`useLibraryData.js`** | `onAuthStateChanged`로 인증 상태 변경을 감지하고, 유효한 유저인 경우에만 `subscribeToSeats`를 호출하여 좌석 데이터를 실시간 동기화. 사용자 정보 구독 시 이메일 기반으로 User 컬렉션을 찾아 실시간 리스너를 바인딩하여 패널티 및 이용 횟수 업데이트를 즉각 반영 |
| **`useLibrarySystem.js`** | 시스템 자동화 엔진. `setInterval` 기반의 루프를 통해 1초 단위로 현재 시간을 `now` 상태로 업데이트. 해당 값을 기반으로 `mySeat`의 시작 시간과 예약 시간을 비교하여, 만료 시 강제 퇴실 처리하거나 퇴실 전 사전 알림(Notification API 활용)을 사용자에게 발송 |
| **`useUserSession.js`** | 기기 보안 강화. `localStorage`에 UUID를 생성하여 기기별 고유 값을 할당하고, 서버의 `registeredDeviceUuid`와 대조하여 다중 접속 시 차단 로직 실행. `mousemove`, `click` 등 브라우저 이벤트를 캡처하여 30분간 활동이 없는 경우 강제 로그아웃 처리 |

## 3. 화면 UI 및 인터페이스 계층 (`/components`, `/pages`)
사용자 및 관리자 간의 인터랙션과 데이터 시각화를 담당

| 파일명 | 상세 기능 및 로직 분석 |
| :--- | :--- |
| **`App.jsx`** | 앱의 중앙 허브. 전역 인증 상태 및 시스템 환경 설정을 초기화하고, `useLibraryData`와 `useLibrarySystem`을 실행하여 앱 전역에 필요한 데이터를 공급 |
| **`AdminDashboard.jsx`** | 관리자 통합 제어 모듈. `Chart.js`를 활용하여 최근 7일간 이용 현황을 시각화. 특히 시험 기간 통제 기능은 `setDoc`을 통해 전역 설정 문서를 수정하고, 이를 `useLibrarySystem`이 감시하도록 설계 |
| **`FloorMap.jsx`** | 시각화 핵심 모듈. `react-draggable`을 활용하여 각 좌석 요소를 캔버스 내에 배치. 관리자 모드에서 좌석별 좌표와 사이즈(width/height)를 수정하면 Firestore에 즉시 반영되는 데이터 바인딩 로직 포함 |
| **`SeatModal.jsx`** | 인터랙션 허브. 탭 기반 UI(예약/취소/제재)를 통해 상태값을 전환. 특히 클린 체크 기능을 위해 사용자로부터 사진 파일을 입력받고 이를 Firebase Storage에 업로드한 뒤, 그 결과를 `Log` 컬렉션에 연결하는 복잡한 상태 관리 로직 보유 |
| **`FloatingChatbot.jsx`** | 상태 기반 대화 흐름 제어. `appealMode` 상태에 따라 일반 질문, 신고 접수, 소명 절차로 모드를 분리. 접수 시 `addDoc`으로 실시간으로 관리자에게 알림 전달 |
| **`Scanner.jsx`** | 키오스크 QR 인증. 텍스트 파싱 로직(`lastIndexOf('_')`)을 통해 학번과 타임스탬프를 구분하여 인증 속도 최적화. 스캔 성공 시 `updateSeatStatus`를 호출하여 입/퇴실 비즈니스 로직 연동 |
| **`QRCodeGen.jsx`** | `qrcode.react` 라이브러리를 통해 동적 QR 생성. 15초 단위 `clearInterval/setInterval` 로직으로 QR 재생성 주기를 제어하여 캡처본을 활용한 부정 출입 방지 |
| **`EventBoard.jsx`** | 상태 필터링 렌더링. `list` 배열을 받아 공지사항/이벤트 타입별로 분류하고, 관리자가 설정한 `isActive` 및 날짜 범위를 기준으로 진행 상태 뱃지 동적 생성 |