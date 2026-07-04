import React from 'react';

export default function Header({
  availableDates,
  selectedDate,
  onDateChange,
  searchTerm,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  theme,
  onToggleTheme
}) {
  // 日付（週の期間）の表示名を日本語でフレンドリーにするためのマッピング
  const formatDateLabel = (weekStr) => {
    const parts = weekStr.split(' ~ ');
    if (parts.length === 2) {
      const formatDate = (dateStr) => {
        const [y, m, d] = dateStr.split('-');
        return `${parseInt(m)}月${parseInt(d)}日`;
      };
      const isLatest = weekStr === availableDates[0];
      return `${formatDate(parts[0])} 〜 ${formatDate(parts[1])}号${isLatest ? ' (最新号)' : ''}`;
    }
    return weekStr;
  };

  // カテゴリ一覧
  const categories = ["すべて", "リテールメディア", "店内販促", "導入事例", "実証実験", "成功事例", "グローバル動向"];

  return (
    <header className="site-header">
      {/* ヘッダー最上部: メタ情報とテーマ切り替え */}
      <div className="header-top">
        <div className="header-top-left sans">
          <span>WEEKLY ESL & RETAIL MEDIA NEWS</span>
          <span>•</span>
          <span>EST. 2026</span>
          <span>•</span>
          <span>RETAIL TECH</span>
        </div>
        <div className="header-top-right sans">
          <span>VOL. 01 / NO. 18</span>
          <span>•</span>
          <button 
            className="theme-toggle-btn" 
            onClick={onToggleTheme}
            title={theme === 'light' ? 'ダークモードへ' : 'ライトモードへ'}
            aria-label="Theme toggle"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      {/* VOGUE調の巨大なロゴ */}
      <div className="logo-container">
        <a href="/" className="logo serif" onClick={(e) => { e.preventDefault(); onDateChange(availableDates[0]); onCategoryChange("すべて"); onSearchChange(""); }}>
          WEEKLY ESL & RETAIL MEDIA NEWS
        </a>
      </div>

      {/* ナビゲーションバー: アーカイブ日付と検索・フィルタ */}
      <div className="header-nav-bar sans">
        {/* 日付（紙面）切り替え */}
        <div className="archive-selector">
          <span className="archive-label">紙面を選択:</span>
          <select 
            className="archive-select" 
            value={selectedDate} 
            onChange={(e) => onDateChange(e.target.value)}
          >
            {availableDates.map(date => (
              <option key={date} value={date}>
                {formatDateLabel(date)}
              </option>
            ))}
          </select>
        </div>

        {/* カテゴリフィルター */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: selectedCategory === cat ? '600' : '300',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: selectedCategory === cat ? 'var(--accent-color)' : 'var(--text-primary)',
                borderBottom: selectedCategory === cat ? '1px solid var(--accent-color)' : '1px solid transparent',
                paddingBottom: '2px',
                transition: 'var(--transition-smooth)'
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 検索ボックス */}
        <div className="search-filter-box">
          <input
            type="text"
            className="search-input"
            placeholder="記事を検索..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      </div>
    </header>
  );
}
