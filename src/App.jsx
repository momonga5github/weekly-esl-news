import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import NewsList from './components/NewsList';
import NewsDetailModal from './components/NewsDetailModal';
import newsData from './data/newsData.json';

export default function App() {
  // 利用可能な日付一覧（降順：新しい順）
  const availableDates = Object.keys(newsData).sort().reverse();

  // 状態管理
  const [selectedDate, setSelectedDate] = useState(availableDates[0] || "");
  const [selectedCategory, setSelectedCategory] = useState("すべて");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedNews, setSelectedNews] = useState(null);
  
  // テーマ管理（初期値はシステム設定またはローカルストレージから取得）
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // テーマ変更をHTML要素の属性に反映し、ローカルストレージに保存
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // 選択された日付のニュースデータを取得
  const dailyStories = newsData[selectedDate] || { domestic: [], global: [] };

  // フィルター処理関数
  const filterStories = (stories) => {
    return stories.filter(story => {
      // カテゴリ一致チェック
      const matchesCategory = selectedCategory === "すべて" || story.category === selectedCategory;
      // 検索ワード一致チェック（タイトル、要約、本文を対象）
      const cleanSearch = searchTerm.trim().toLowerCase();
      const matchesSearch = !cleanSearch || 
        story.title.toLowerCase().includes(cleanSearch) ||
        story.summary.toLowerCase().includes(cleanSearch) ||
        story.content.toLowerCase().includes(cleanSearch);

      return matchesCategory && matchesSearch;
    });
  };

  const filteredDomestic = filterStories(dailyStories.domestic || []);
  const filteredGlobal = filterStories(dailyStories.global || []);

  const hasNoResults = filteredDomestic.length === 0 && filteredGlobal.length === 0;

  return (
    <div className="app-container">
      {/* ヘッダー */}
      <Header
        availableDates={availableDates}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* メインレイアウト: PC時は左右2カラム、スマホ時は1カラム縦並び */}
      <main className="news-grid">
        {hasNoResults ? (
          <div className="no-news-message">
            <h2>記事が見つかりませんでした</h2>
            <p>検索キーワードやカテゴリー、または紙面の日付を変更してお試しください。</p>
          </div>
        ) : (
          <>
            {/* 左半分: 国内ニュース */}
            <NewsList
              title="国内ニュース"
              subtitle="Domestic News"
              newsItems={filteredDomestic}
              onNewsClick={setSelectedNews}
            />

            {/* 右半分: 海外ニュース */}
            <NewsList
              title="海外ニュース"
              subtitle="Global News"
              newsItems={filteredGlobal}
              onNewsClick={setSelectedNews}
            />
          </>
        )}
      </main>

      {/* 詳細モーダル */}
      {selectedNews && (
        <NewsDetailModal
          news={selectedNews}
          onClose={() => setSelectedNews(null)}
        />
      )}

      {/* フッター */}
      <footer style={{
        marginTop: '60px',
        padding: '30px 0',
        borderTop: '1px solid var(--border-primary)',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-sans)',
        letterSpacing: '0.05em'
      }}>
        <p>© 2026 Weekly ESL & Retail Media News. All rights reserved.</p>
        <p style={{ marginTop: '5px', fontSize: '0.75rem' }}>このサイトは電子棚札（ESL）、デジタルサイネージ、リテールメディアなどの導入事例や実証実験を紹介するデモサイトです。</p>
      </footer>
    </div>
  );
}
