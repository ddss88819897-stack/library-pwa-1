import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom' // 1. 라우터 불러오기
import './index.css'
import App from './App.jsx'
import ResetPassword from './pages/ResetPassword' // 2. 페이지 불러오기

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter> {/* 3. 앱 전체를 라우터로 감싸기 */}
      <Routes>
        <Route path="/" element={<App />} /> {/* 메인 화면은 '/' 경로 */}
        <Route path="/reset-password" element={<ResetPassword />} /> {/* 비밀번호 찾기 경로는 여기! */}
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
