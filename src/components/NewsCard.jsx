import React from 'react';

export default function NewsCard({ news, onClick, index }) {
  // 最初の記事は「Featured」として大きく表示する
  const isFeatured = index === 0;

  return (
    <article 
      className={`news-card ${isFeatured ? 'featured' : ''}`} 
      onClick={onClick}
    >
      <div className="news-card-meta sans">
        <span className="news-card-category">{news.category}</span>
        <span>{news.readTime}</span>
      </div>

      <h3 className="news-card-title serif" style={{ display: 'flex', flexDirection: 'column' }}>
        {news.title}
        {news.titleEn && (
          <span className="sans" style={{ 
            fontSize: '0.8rem', 
            color: 'var(--text-muted)', 
            fontWeight: '300',
            fontStyle: 'italic',
            marginTop: '6px',
            lineHeight: '1.3',
            letterSpacing: 'normal',
            textTransform: 'none'
          }}>
            {news.titleEn}
          </span>
        )}
      </h3>

      <p className="news-card-summary sans">
        {news.summary}
      </p>

      <div className="news-card-footer sans">
        <a 
          href={news.link} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="news-card-source-link"
          onClick={(e) => e.stopPropagation()}
        >
          ソース: {news.source}
        </a>
        <span style={{ 
          fontSize: '1.2rem', 
          lineHeight: '1', 
          color: 'var(--accent-color)',
          fontWeight: '300'
        }}>→</span>
      </div>
    </article>
  );
}
