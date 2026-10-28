import React, { useState, useEffect } from 'react';
import { db } from '../firebase'; 
import { collection, getDocs, doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const AdminSearch = () => {
  const [keywords, setKeywords] = useState([]);
  const [bannedKeywords, setBannedKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newBanned, setNewBanned] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('RECOMMEND');
  
  const [selectedKeywords, setSelectedKeywords] = useState([]);

  const fetchKeywords = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'SearchKeywords'));
      const keywordList = [];
      querySnapshot.forEach((doc) => {
        keywordList.push({ id: doc.id, ...doc.data() });
      });
      keywordList.sort((a, b) => (b.count || 0) - (a.count || 0));
      setKeywords(keywordList);

      const bannedSnapshot = await getDocs(collection(db, 'BannedKeywords'));
      const bannedList = [];
      bannedSnapshot.forEach((doc) => {
        bannedList.push({ id: doc.id, ...doc.data() });
      });
      setBannedKeywords(bannedList);
    } catch (error) {
      console.error("데이터 불러오기 실패:", error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchKeywords();
  }, []);

  const handleAddKeyword = async (e) => {
    e.preventDefault();
    if (!newKeyword.trim()) return alert('검색어를 입력해주세요.');
    if (keywords.find(k => k.id === newKeyword.trim())) return alert('이미 등록된 추천 검색어입니다.');

    try {
      const keywordRef = doc(db, 'SearchKeywords', newKeyword.trim());
      await setDoc(keywordRef, {
        count: 0, 
        updatedAt: serverTimestamp()
      });
      setNewKeyword('');
      fetchKeywords(); 
      alert('추천 검색어가 추가되었습니다.');
    } catch (error) {
      alert('추가 중 오류가 발생했습니다.');
    }
  };

  const handleKeywordClick = (id) => {
    if (selectedKeywords.includes(id)) {
      setSelectedKeywords(selectedKeywords.filter(item => item !== id));
    } else {
      setSelectedKeywords([...selectedKeywords, id]);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedKeywords.length === 0) return alert('삭제할 검색어를 선택해주세요. (검색어 칩을 클릭하세요)');
    if (!window.confirm(`선택한 ${selectedKeywords.length}개의 검색어를 정말 삭제하시겠습니까?`)) return;

    try {
      for (const id of selectedKeywords) {
        await deleteDoc(doc(db, 'SearchKeywords', id));
      }
      setSelectedKeywords([]);
      fetchKeywords();
      alert('선택한 검색어가 삭제되었습니다.');
    } catch (error) {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleBatchReset = async () => {
    if (selectedKeywords.length === 0) return alert('초기화할 검색어를 선택해주세요. (검색어 칩을 클릭하세요)');
    if (!window.confirm(`선택한 ${selectedKeywords.length}개의 검색 횟수를 0으로 초기화하시겠습니까?`)) return;

    try {
      for (const id of selectedKeywords) {
        await updateDoc(doc(db, 'SearchKeywords', id), { count: 0 });
      }
      setSelectedKeywords([]);
      fetchKeywords();
      alert('검색 횟수가 초기화되었습니다.');
    } catch (error) {
      alert('초기화 중 오류가 발생했습니다.');
    }
  };

  const handleAddBanned = async (e) => {
    e.preventDefault();
    if (!newBanned.trim()) return alert('금지어를 입력해주세요.');
    try {
      await setDoc(doc(db, 'BannedKeywords', newBanned.trim()), { createdAt: serverTimestamp() });
      setNewBanned('');
      fetchKeywords();
      alert('금지어가 등록되었습니다.');
    } catch (error) {
      alert('금지어 등록 오류');
    }
  };

  const handleDeleteBanned = async (bannedId) => {
    try {
      await deleteDoc(doc(db, 'BannedKeywords', bannedId));
      fetchKeywords();
    } catch (error) {
      alert('삭제 오류');
    }
  };

  const totalSearchCount = keywords.reduce((sum, item) => sum + (item.count || 0), 0);

  const pageStyle = {
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    padding: '40px 20px',
    color: '#ffffff',
    fontFamily: '"Pretendard", sans-serif',
    boxSizing: 'border-box'
  };

  const containerStyle = { maxWidth: '1400px', margin: '0 auto' };
  
  const cardStyle = {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    padding: '28px',
    height: '100%',
    boxSizing: 'border-box'
  };

  const titleWrapperStyle = { display: 'flex', alignItems: 'center', marginBottom: '20px' };
  const barStyle = { width: '4px', height: '22px', backgroundColor: '#3b82f6', borderRadius: '2px', marginRight: '10px' };
  const headingStyle = { fontSize: '1.2rem', fontWeight: 'bold', margin: 0, color: '#ffffff' };
  
  const inputStyle = {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#ffffff',
    fontSize: '0.95rem',
    outline: 'none'
  };
  
  const buttonStyle = {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '0 24px',
    fontWeight: 'bold',
    fontSize: '0.95rem',
    cursor: 'pointer',
    transition: 'background 0.2s'
  };

  const tabStyle = (isActive) => ({
    padding: '10px 20px',
    borderRadius: '12px',
    border: 'none',
    backgroundColor: isActive ? '#3b82f6' : 'rgba(255, 255, 255, 0.05)',
    color: isActive ? '#fff' : '#94a3b8',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '0.95rem',
    transition: '0.2s'
  });

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        
        {/* 상단 탭 메뉴 */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
          <button style={tabStyle(activeTab === 'RECOMMEND')} onClick={() => setActiveTab('RECOMMEND')}>
            📌 추천 검색어 및 통계 관리
          </button>
          <button style={tabStyle(activeTab === 'BANNED')} onClick={() => setActiveTab('BANNED')}>
            🚫 금지어(스팸) 관리
          </button>
        </div>

        {activeTab === 'RECOMMEND' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* 🌟 첫 번째 줄: TOP 5 카드와 점유율 통계 카드를 좌우 나란히 배치 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px' }}>
              
              {/* [왼쪽] 실시간 인기 TOP 5 카드 */}
              <div style={cardStyle}>
                <div style={titleWrapperStyle}>
                  <div style={barStyle}></div>
                  <h2 style={headingStyle}>실시간 인기 검색어 TREND (TOP 5)</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '12px' }}>
                  {keywords.slice(0, 5).map((item, index) => (
                    <div key={item.id} style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ color: '#60a5fa', fontWeight: '900', fontSize: '0.8rem', marginBottom: '4px' }}>TOP {index + 1}</div>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '6px', wordBreak: 'break-all', color: '#ffffff' }}>{item.id}</div>
                      <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>검색: <b style={{ color: '#ffffff' }}>{item.count || 0}회</b></div>
                    </div>
                  ))}
                  {keywords.length === 0 && <span style={{ color: '#94a3b8' }}>데이터가 없습니다.</span>}
                </div>
              </div>

              {/* [오른쪽] 검색어 점유율 및 비중 통계 카드 */}
              <div style={cardStyle}>
                <div style={titleWrapperStyle}>
                  <div style={barStyle}></div>
                  <h2 style={headingStyle}>검색어 점유율 및 비중 통계</h2>
                </div>
                <p style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '20px' }}>
                  전체 검색 기록 대비 각 키워드가 차지하는 이용 비율입니다.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                  {keywords.map((item) => {
                    const count = item.count || 0;
                    const percentage = totalSearchCount > 0 ? ((count / totalSearchCount) * 100).toFixed(1) : 0;
                    
                    return (
                      <div key={item.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                          <span style={{ fontWeight: '600', color: '#ffffff' }}>{item.id}</span>
                          <span style={{ fontWeight: 'bold', color: '#60a5fa' }}>{percentage}% <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'normal' }}>({count}회)</span></span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: '#3b82f6', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                        </div>
                      </div>
                    );
                  })}
                  {keywords.length === 0 && <span style={{ color: '#94a3b8' }}>통계 데이터가 없습니다.</span>}
                </div>
              </div>

            </div>

            {/* 두 번째 줄: 검색어 등록 및 관리 카드 (전체 폭 사용) */}
            <div style={cardStyle}>
              <div style={titleWrapperStyle}>
                <div style={barStyle}></div>
                <h2 style={headingStyle}>검색어 등록 및 관리</h2>
              </div>

              <form onSubmit={handleAddKeyword} style={{ display: 'flex', gap: '10px', marginBottom: '24px', maxWidth: '600px' }}>
                <input
                  type="text"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  placeholder="추가할 검색어를 입력하세요"
                  style={inputStyle}
                />
                <button type="submit" style={buttonStyle}>등록</button>
              </form>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                    💡 칩을 클릭하여 선택 ({selectedKeywords.length}개 선택됨)
                  </span>
                  
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      onClick={handleBatchReset} 
                      style={{ padding: '6px 12px', backgroundColor: 'rgba(251, 191, 36, 0.15)', border: '1px solid rgba(251, 191, 36, 0.4)', color: '#fde047', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      선택 횟수 초기화
                    </button>
                    <button 
                      onClick={handleBatchDelete} 
                      style={{ padding: '6px 12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      선택 삭제
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }}>
                  {isLoading ? (
                    <span style={{ color: '#94a3b8' }}>불러오는 중...</span>
                  ) : keywords.length === 0 ? (
                    <span style={{ color: '#94a3b8' }}>등록된 검색어가 없습니다.</span>
                  ) : (
                    keywords.map((item) => {
                      const isSelected = selectedKeywords.includes(item.id);
                      return (
                        <div 
                          key={item.id} 
                          onClick={() => handleKeywordClick(item.id)}
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.05)', 
                            border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)', 
                            borderRadius: '16px', 
                            padding: '8px 14px', 
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            transition: '0.2s',
                            boxShadow: isSelected ? '0 0 10px rgba(59, 130, 246, 0.4)' : 'none'
                          }}
                        >
                          <span style={{ fontWeight: '600', color: isSelected ? '#93c5fd' : '#fff' }}>{item.id}</span>
                          <span style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '10px', color: '#cbd5e1' }}>
                            {item.count || 0}회
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

          </div>
        ) : (
          /* 금지어 관리 탭 */
          <div style={cardStyle}>
            <div style={titleWrapperStyle}>
              <div style={barStyle}></div>
              <h2 style={headingStyle}>검색 차단 금지어 관리</h2>
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '24px' }}>
              욕설, 비속어, 혹은 검색 결과에 노출되지 않아야 할 단어를 등록하여 관리합니다.
            </p>

            <form onSubmit={handleAddBanned} style={{ display: 'flex', gap: '12px', marginBottom: '30px', maxWidth: '600px' }}>
              <input
                type="text"
                value={newBanned}
                onChange={(e) => setNewBanned(e.target.value)}
                placeholder="차단할 금지어 입력"
                style={inputStyle}
              />
              <button type="submit" style={{ ...buttonStyle, backgroundColor: '#ef4444' }}>금지어 등록</button>
            </form>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {bannedKeywords.length === 0 ? (
                <span style={{ color: '#94a3b8' }}>등록된 금지어가 없습니다.</span>
              ) : (
                bannedKeywords.map((b) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '20px', padding: '8px 16px', fontSize: '0.9rem', color: '#fca5a5' }}>
                    <span>{b.id}</span>
                    <button onClick={() => handleDeleteBanned(b.id)} style={{ background: 'none', border: 'none', color: '#ef4444', marginLeft: '12px', cursor: 'pointer', fontSize: '1rem', fontWeight: 'bold' }} title="해제">
                      [삭제]
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminSearch;



