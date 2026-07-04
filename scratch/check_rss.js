import Parser from 'rss-parser';

const parser = new Parser();
const DOMESTIC_RSS_URL = 'https://news.google.com/rss/search?q=(%E9%9B%BB%E5%AD%90%E6%A3%9A%E6%9C%AD+OR+%22%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E3%82%B5%E3%82%A4%E3%83%8D%E3%83%BC%E3%82%B8%22+OR+%22%E3%83%AA%E3%83%86%E3%83%BC%E3%83%AB%E3%83%A1%E3%83%87%E3%82%A3%E3%82%A2%22)&hl=ja&gl=JP&ceid=JP:ja';

async function check() {
  const feed = await parser.parseURL(DOMESTIC_RSS_URL);
  console.log(`Feed contains ${feed.items.length} items.`);
  for (let i = 0; i < Math.min(3, feed.items.length); i++) {
    const item = feed.items[i];
    console.log(`\n--- Item ${i} ---`);
    console.log('Title:', item.title);
    console.log('contentSnippet:', item.contentSnippet);
    console.log('content (raw):', item.content ? item.content.substring(0, 500) : 'undefined');
  }
}

check();
