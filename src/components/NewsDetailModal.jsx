import React, { useEffect } from 'react';

export default function NewsDetailModal({ news, onClose }) {
  // モーダル表示時にスクロールをロックする
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  if (!news) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} // モーダル内クリックで閉じないようにする
      >
        {/* 閉じるボタン */}
        <button 
          className="modal-close-btn sans" 
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>

        {/* 記事のメタデータ */}
        <div className="modal-meta sans">
          <span style={{ color: 'var(--accent-gold)', fontWeight: 600 }}>{news.category}</span>
          <span>•</span>
          <a 
            href={news.link} 
            target="_blank" 
            rel="noopener noreferrer"
            className="modal-source-link"
          >
            {news.source}
          </a>
          <span>•</span>
          <span>{news.publishDate || news.readTime}</span>
        </div>

        {/* 記事タイトル */}
        <h2 className="modal-title serif" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {news.title}
          {news.titleEn && (
            <span className="sans" style={{ 
              fontSize: '0.95rem', 
              color: 'var(--text-muted)', 
              fontWeight: '300',
              fontStyle: 'italic',
              lineHeight: '1.4',
              textTransform: 'none',
              letterSpacing: 'normal'
            }}>
              {news.titleEn}
            </span>
          )}
        </h2>

        {/* 記事本文 */}
        <div className="modal-body">
          {news.content.split('\n\n').map((paragraph, index) => {
            const isFootnote = paragraph.trim().startsWith('※');
            return (
              <p key={index} className={isFootnote ? "modal-footnote sans" : "modal-paragraph sans"}>
                {paragraph}
              </p>
            );
          })}
        </div>

        {/* 元の記事へのリンクボタン（実際のニュース動作用） */}
        {news.link && (
          <div style={{ marginTop: '40px', textAlign: 'center' }}>
            <a 
              href={news.link} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: 'inline-block',
                padding: '12px 30px',
                border: '1px solid var(--border-primary)',
                backgroundColor: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                textDecoration: 'none',
                fontFamily: 'var(--font-sans)',
                fontSize: '0.85rem',
                fontWeight: '600',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                transition: 'var(--transition-smooth)'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'var(--text-primary)';
                e.target.style.color = 'var(--bg-primary)';
              }}
            >
              元の記事を読む →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
