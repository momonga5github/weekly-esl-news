import Parser from 'rss-parser';

const parser = new Parser();
const DOMESTIC_RSS_URL = 'https://news.google.com/rss/search?q=(%E9%9B%BB%E5%AD%90%E6%A3%9A%E6%9C%AD+OR+%22%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E3%82%B5%E3%82%A4%E3%83%8D%E3%83%BC%E3%82%B8%22+OR+%22%E3%83%AA%E3%83%86%E3%83%BC%E3%83%AB%E3%83%A1%E3%83%87%E3%82%A3%E3%82%A2%22)&hl=ja&gl=JP&ceid=JP:ja';

async function testFetch() {
  const feed = await parser.parseURL(DOMESTIC_RSS_URL);
  const testUrl = feed.items[0].link;
  
  try {
    const res = await fetch(testUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const body = await res.text();
    
    // unicodeエスケープされた http:// または https:// リンクを探す
    // 例: https\u003a\u002f\u002f または http\u003a\u002f\u002f
    const escapedUrlRegex = /(https?|https\\u003a|http\\u003a)(?:\\u003a|:)(?:\\u002f|\/){2}[^\s\\"]+/gi;
    
    const matches = body.match(escapedUrlRegex) || [];
    console.log(`Found ${matches.length} escaped/plain URLs.`);
    
    const filtered = matches
      .map(u => {
        // デコードしてプレーンなURLにする
        return u
          .replace(/\\u003a/gi, ':')
          .replace(/\\u002f/gi, '/');
      })
      .filter(u => !u.includes('google.com') && !u.includes('gstatic.com') && !u.includes('ggpht.com'));
      
    console.log('Filtered target URLs:', filtered.slice(0, 10));

  } catch (e) {
    console.error('Fetch Error:', e);
  }
}

testFetch();
