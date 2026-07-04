import React from 'react';
import NewsCard from './NewsCard';

export default function NewsList({ title, subtitle, newsItems, onNewsClick }) {
  return (
    <div className="column-section">
      {/* VOGUE調のダブルボーダー付きセクションヘッダー */}
      <h2 className="column-title">
        <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 300, letterSpacing: '0.15em', color: 'var(--text-muted)' }}>{subtitle}</span>
        {title}
      </h2>

      {newsItems.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {newsItems.map((item, index) => (
            <NewsCard 
              key={item.id} 
              news={item} 
              index={index}
              onClick={() => onNewsClick(item)}
            />
          ))}
        </div>
      ) : (
        <div style={{ 
          padding: '40px 0', 
          textAlign: 'center', 
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          fontSize: '0.9rem'
        }}>
          本日のこのセクションに関連する記事はありません。
        </div>
      )}
    </div>
  );
}
