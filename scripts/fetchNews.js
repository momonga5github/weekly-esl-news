import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleDecoder } from 'google-news-url-decoder';

// ESModules対策
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser();
const decoder = new GoogleDecoder();

// 保存先JSONのパス
const dataFilePath = path.join(__dirname, '../src/data/newsData.json');

// Google News RSSのURL (電子棚札 OR デジタルサイネージ OR リテールメディア)
const DOMESTIC_RSS_URL = 'https://news.google.com/rss/search?q=(%E9%9B%BB%E5%AD%90%E6%A3%9A%E6%9C%AD+OR+%22%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E3%82%B5%E3%82%A4%E3%83%8D%E3%83%BC%E3%82%B8%22+OR+%22%E3%83%AA%E3%83%86%E3%83%BC%E3%83%AB%E3%83%A1%E3%83%87%E3%82%A3%E3%82%A2%22)&hl=ja&gl=JP&ceid=JP:ja';
const GLOBAL_RSS_URL = 'https://news.google.com/rss/search?q=(%22Electronic+Shelf+Label%22+OR+%22Digital+Signage%22+OR+%22Retail+Media%22)&hl=en-US&gl=US&ceid=US:en';

// Google 翻訳 API (無料Webエンドポイント)
async function translateText(text) {
  if (!text || text.trim() === '') return '';
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ja&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    const json = await res.json();
    if (json && json[0]) {
      return json[0].map(item => item[0]).join('');
    }
    return text;
  } catch (e) {
    console.error('⚠️ 翻訳エラー:', e);
    return text;
  }
}

// 記事が日本語か英語（アルファベット）かを簡易判定する
function isEnglishText(text) {
  return !/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text);
}

// 比較用にタイトルから括弧や地名、メディア名、記号を排した「ベースタイトル」を生成する
function getBaseTitle(title) {
  return title
    .replace(/【[^】]*】/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/「[^」]*」/g, '')
    .replace(/『[^』]*』/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/ - .*$/, '')
    .replace(/[^A-Za-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '')
    .trim()
    .toLowerCase();
}

// 国内・海外ニュースをスマートに分類する判定ロジック
function isStoryGlobal(item, source, title) {
  const s = source.toLowerCase();
  const t = title.toLowerCase();
  const link = item.link || '';
  
  const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(title);
  
  const isGlobalSource = s.includes('international') || 
                         s.includes('global') || 
                         s.includes('euro') || 
                         s.includes('world') || 
                         s.includes('reuters') || 
                         s.includes('bloomberg') ||
                         s.includes('forbes') ||
                         s.includes('nytimes') ||
                         (s.includes('海外') && !s.includes('海外旅行') && !s.includes('海外進出'));

  const isJapaneseSource = s.includes('pr times') || 
                           s.includes('itmedia') || 
                           s.includes('biprogy') || 
                           s.includes('toppan') || 
                           s.includes('nikkei') || 
                           s.includes('tbs') || 
                           s.includes('nhk') || 
                           s.includes('yomiuri') || 
                           s.includes('asahi') || 
                           s.includes('sankei') || 
                           s.includes('mainichi') || 
                           s.includes('impress') || 
                           s.includes('ascii') || 
                           s.includes('voix') || 
                           s.includes('日本');

  if (hasJapanese) {
    if (isGlobalSource && !isJapaneseSource) {
      return true;
    }
    return false;
  }

  return !isJapaneseSource;
}

// カテゴリを推測するロジック
function estimateCategory(title, defaultCategory) {
  const t = title.toLowerCase();
  
  if (t.includes('リテールメディア') || t.includes('retail media')) {
    return 'リテールメディア';
  }
  if (t.includes('サイネージ') || t.includes('signage')) {
    return '店内販促';
  }
  if (t.includes('実証') || t.includes('実験') || t.includes('テスト') || t.includes('trial') || t.includes('test') || t.includes('experiment')) {
    return '実証実験';
  }
  if (t.includes('導入') || t.includes('採用') || t.includes('稼働') || t.includes('展開') || t.includes('install') || t.includes('adopt') || t.includes('deploy') || t.includes('rollout')) {
    return '導入事例';
  }
  if (t.includes('成功') || t.includes('削減') || t.includes('効果') || t.includes('save') || t.includes('success') || t.includes('benefit')) {
    return '成功事例';
  }
  return defaultCategory;
}

// タイトルとソースを切り分けるロジック
function cleanTitleAndSource(rawTitle) {
  const lastDashIndex = rawTitle.lastIndexOf(' - ');
  if (lastDashIndex !== -1) {
    const title = rawTitle.substring(0, lastDashIndex).trim();
    const source = rawTitle.substring(lastDashIndex + 3).trim();
    return { title, source };
  }
  return { title: rawTitle, source: 'Google News' };
}

// 記事公開日から属する週の期間を計算する
function getWeekRange(dateObj) {
  const day = dateObj.getDay();
  const diffToMonday = dateObj.getDate() - day + (day === 0 ? -6 : 1);
  
  const monday = new Date(dateObj);
  monday.setDate(diffToMonday);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const formatDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const r = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${r}`;
  };
  
  return `${formatDate(monday)} ~ ${formatDate(sunday)}`;
}

// Google News RSSのHTML（content）から類似報道・他社リンクを抽出する
function extractRelatedNews(html) {
  if (!html) return [];
  const related = [];
  const regex = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>(?:&nbsp;)*\s*<font[^>]*color="#6f6f6f"[^>]*>([^<]+)<\/font>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const title = match[2].trim();
    const source = match[3].trim();
    if (title && source) {
      related.push(`- ${title} （ソース: ${source}）`);
    }
  }
  return related;
}

// 元記事のURLから本文を自動スクレイピングする関数
async function scrapeArticleText(url, title = '', source = '') {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000) // 6秒でタイムアウト
    });
    if (!res.ok) return null;
    let html = await res.text();
    
    // 不要な要素を完全に削除
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    html = html.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
    html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
    html = html.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
    
    // 本文が格納されている主要エリアのみをHTMLから抽出して無関係なサイドバー・フッターを極力遮断する
    let contentHtml = html;
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      contentHtml = articleMatch[1];
    } else {
      // 主要な本文クラス/IDのコンテナを検索
      const commonBodyRegex = /<div[^>]*(?:class|id)=["'][^"']*(?:article-body|entry-content|main-content|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i;
      const bodyMatch = html.match(commonBodyRegex);
      if (bodyMatch) {
        contentHtml = bodyMatch[1];
      }
    }
    
    // HTMLタグを単純除去してプレーンテキストにする
    let text = contentHtml.replace(/<[^>]+>/g, ' ');
    
    // 特殊文字のデコード
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&middot;/g, '・');
      
    const cleanTitle = title ? title.replace(/\s+/g, '').toLowerCase() : '';
    const cleanSource = source ? source.replace(/\s+/g, '').toLowerCase() : '';
    const cleanBaseTitle = title ? getBaseTitle(title) : '';

    const isJapanese = !isEnglishText(title || text.substring(0, 100));

    // 改行で分割して段落ごとにクリーンアップ
    const rawLines = text.split(/[\r\n]+/);
    const lines = [];

    // 早期ブレイク用ワード
    const breakKeywords = [
      '関連記事', '関連ニュース', 'あわせて読みたい', 'おすすめの記事',
      'relatedarticles', 'relatednews', 'youmightalsolike', 'moreonthis',
      '推奨記事', 'ニュースランキング', '最新のニュース', '他のニュース',
      '新着ニュース', '週間アクセスランキング'
    ];

    for (let line of rawLines) {
      line = line.trim();
      if (line.length < 25) continue;

      const cleanLine = line.replace(/\s+/g, '').toLowerCase();

      // 早期ブレイク判定：関連記事セクションが始まったらそれ以降は処理しない
      let shouldBreak = false;
      for (const breakWord of breakKeywords) {
        if (cleanLine.includes(breakWord)) {
          shouldBreak = true;
          break;
        }
      }
      if (shouldBreak) {
        console.log(`   └ 🛑 関連記事・最新ニュースセクション検知のためスクレイピングを打ち切ります: "${line.substring(0, 20)}..."`);
        break;
      }

      if (isJapanese) {
        // 全角スペースで区切られており、かつ句点「。」で終わっていない場合
        // （「相模台　「狭い」歩道を拡幅へ　米軍住宅地区の一部「共同使用」」のような見出しリンクを完全に弾く）
        if ((line.includes('　') || line.includes('  ')) && !line.endsWith('。')) {
          continue; // 除外
        }

        // 通常の文末表現（句点「。」）で終わっていない行のチェック
        const hasNormalEnding = /[\u3002\u3093たっだすい]$/.test(line);
        if (!hasNormalEnding) {
          // 末尾が「へ」「で」「！」「開幕」「開催」「募集」「ニュース」「選定」「開始」などで終わる体言止めのニュース見出しらしきもの
          if (/(?:へ|で|！|開幕|開催|募集|予定|決定|選定|開始|終了|ニュース|一覧|目撃|開放|サポート|最多|カフェ|に|が)$/.test(line)) {
            continue; // 除外
          }
        }
      }

      // 1. タイトルまたはベースタイトルと行が完全に包含関係にある場合、H1やTitleタグの残骸として除外
      if (cleanTitle && (cleanLine.includes(cleanTitle) || cleanTitle.includes(cleanLine))) {
        continue;
      }
      if (cleanBaseTitle && cleanBaseTitle.length > 5 && (cleanLine.includes(cleanBaseTitle) || cleanBaseTitle.includes(cleanLine))) {
        continue;
      }

      // 2. ソース名そのもの、またはソース名＋短い日付等の行を除外
      if (cleanSource && (cleanLine === cleanSource || (cleanLine.includes(cleanSource) && cleanLine.length <= cleanSource.length + 15))) {
        continue;
      }



      // 4. その他一般的なゴミキーワード・定型句・UIメッセージの除外
      const blacklist = [
        'javascript', 'cookie', '会員登録', 'ログイン', '著作権', '利用規約', 
        'プライバシー', 'お気に入り', 'フォロー', 'シェア', 'ブックマーク', 
        'ダウンロード', 'キーワード', 'メルマガ', '広告掲載', '記事掲載', 
        'アクセスランキング', 'おすすめ', 'クレジットカード', 
        'キャンペーン', '有料会員', '無料体験', '松井証琴', '松井証券', 'sanyonews.jp',
        'prtimes.jp', 'townnews.co.jp', 'businessfrontier', 'facebook', 
        'twitter', 'instagram', 'threads', 'lineで送る', 'メールで送る',
        'この記事は会員限定です', 'この記事をお気に入りに追加する',
        'その他のニュース', '新着ニュース', '週間アクセスランキング'
      ];
      
      let isBlacklisted = false;
      for (const word of blacklist) {
        if (cleanLine.includes(word)) {
          isBlacklisted = true;
          break;
        }
      }
      if (isBlacklisted) continue;

      lines.push(line);
    }
      
    // 重複行の除外（同じ段落が複数回出現するのを防ぐ）
    const seen = new Set();
    const uniqueLines = [];
    for (const line of lines) {
      const norm = line.replace(/\s+/g, '').toLowerCase().substring(0, 30); // 最初の30文字で類似判定
      if (!seen.has(norm)) {
        seen.add(norm);
        uniqueLines.push(line);
      }
    }

    // 本文と思われる段落の上位10行を抽出して2行改行で結合
    if (uniqueLines.length > 0) {
      return uniqueLines.slice(0, 10).join('\n\n');
    }
    return null;
  } catch (e) {
    console.error(`⚠️ 本文スクレイピング失敗 (${url.substring(0, 50)}...):`, e.message);
    return null;
  }
}

// ニュース要約と類似報道リストからcontentフィールドを組み立てる
function generateRichContent(title, summary, relatedNewsList) {
  const intro = `【ニュースの要約】\n${summary}`;
  
  let relatedSection = '';
  if (relatedNewsList && relatedNewsList.length > 0) {
    const cleanTitle = title.replace(/\s+/g, '').toLowerCase();
    const filteredList = relatedNewsList.filter(item => {
      // オブジェクトのタイトル部分をフィルタリング対象にする
      const cleanItem = item.title.replace(/\s+/g, '').toLowerCase();
      return !cleanItem.includes(cleanTitle) && !cleanTitle.includes(cleanItem.substring(0, 15));
    });

    if (filteredList.length > 0) {
      relatedSection = `【関連する主な報道・類似記事】\n${filteredList.slice(0, 4).join('\n')}`;
    }
  }

  const note = `※この記事は外部のニュースメディアから自動取得・整理されたものです。詳細な導入店舗数、投資対効果（ROI）、検証数値、売場画像などの全文は、以下の「元の記事を読む」ボタンから掲載元ソース of サイトにアクセスしてご確認ください。`;

  return relatedSection 
    ? `${intro}\n\n${relatedSection}\n\n${note}`
    : `${intro}\n\n${note}`;
}

// 同一トピックの類似記事をグループ化し、要約をマージする
function groupAndMergeStories(rawStories) {
  const grouped = [];

  for (const story of rawStories) {
    const baseTitle = getBaseTitle(story.title);
    
    let foundGroup = null;
    for (const g of grouped) {
      const targetBase = getBaseTitle(g.title);
      if (
        targetBase === baseTitle || 
        (targetBase.length > 5 && baseTitle.length > 5 && (targetBase.includes(baseTitle) || baseTitle.includes(targetBase)))
      ) {
        foundGroup = g;
        break;
      }
    }

    if (foundGroup) {
      if (!foundGroup.relatedNews) {
        foundGroup.relatedNews = [];
      }
      const isDuplicateSource = foundGroup.relatedNews.some(r => r.source === story.source) || foundGroup.source === story.source;
      if (!isDuplicateSource) {
        foundGroup.relatedNews.push({
          title: story.title,
          source: story.source,
          link: story.link
        });
      }

      // 要約文をマージする（すでに十分な文字数がある場合はスキップ）
      if (foundGroup.summaryRaw.length < 300 && story.summaryRaw && story.summaryRaw !== '要約は元の記事をご参照ください。') {
        const cleanSummary = story.summaryRaw.replace(/\s+/g, '');
        if (!foundGroup.summaryRaw.replace(/\s+/g, '').includes(cleanSummary.substring(0, 15))) {
          foundGroup.summaryRaw = `${foundGroup.summaryRaw}\n\n${story.summaryRaw}`;
        }
      }
    } else {
      story.relatedNews = [];
      grouped.push(story);
    }
  }

  for (const g of grouped) {
    g.content = generateRichContent(g.title, g.summaryRaw, g.relatedNews);
    
    // 一覧用スニペット
    g.summary = g.summaryRaw.substring(0, 150) + (g.summaryRaw.length > 150 ? '...' : '');
    delete g.summaryRaw;
  }

  return grouped;
}

// RSSアイテムの一次整形（ここでスクレイピングと個別翻訳を実行）
async function processRssItem(item, isGlobal) {
  const rawTitleObj = cleanTitleAndSource(item.title || '');
  let title = rawTitleObj.title;
  let source = rawTitleObj.source;
  let titleEn = null;
  let realUrl = item.link || '';

  const dateObj = item.pubDate ? new Date(item.pubDate) : new Date();
  const formattedPublishDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
  const weekRangeKey = getWeekRange(dateObj);

  const category = estimateCategory(title, isGlobal ? 'グローバル動向' : '導入事例');

  // Google NewsリダイレクトURLのデコードを試みる
  if (item.link && item.link.includes('news.google.com')) {
    try {
      console.log(`🔗 URL復号中: "${title.substring(0, 20)}..."`);
      const decoded = await decoder.decode(item.link);
      if (decoded && decoded.status && decoded.decoded_url) {
        realUrl = decoded.decoded_url;
        console.log(`   └ ✅ 復号成功: ${realUrl.substring(0, 60)}...`);
      }
    } catch (e) {
      console.error('⚠️ URL復号失敗:', e.message);
    }
  }

  // 1. 元記事の直URLから本文をスクレイピングする (10段落分取得)
  console.log(`🔍 本文取得中: "${title.substring(0, 20)}..."`);
  let summary = await scrapeArticleText(realUrl, title, source);
  
  // スクレイピングに失敗した場合は、RSSのスニペットを代用する
  if (!summary) {
    console.log(`   └ ⚠️ 本文スクレイピング不可。RSSスニペットで代替します。`);
    summary = item.contentSnippet || '要約は元の記事をご参照ください。';
  } else {
    console.log(`   └ ✅ スクレイピング成功 (${summary.split('\n\n').length}段落取得)`);
  }

  let relatedNewsList = extractRelatedNews(item.content);

  // 2. 海外ニュース判定かつ英語の場合のみ自動翻訳を適用
  if (isGlobal && isEnglishText(title)) {
    titleEn = title;
    console.log(`🌐 翻訳中: "${titleEn.substring(0, 30)}..."`);
    
    title = await translateText(title);
    source = await translateText(source);
    
    // 長文の本文は、段落ごとに個別に翻訳して結合（無料APIの容量制限エラーを回避）
    const paragraphs = summary.split('\n\n');
    const translatedParagraphs = [];
    for (const p of paragraphs) {
      if (p.trim() !== '') {
        const trans = await translateText(p);
        translatedParagraphs.push(trans);
        // 短いディレイを入れてアクセスブロックを回避
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    summary = translatedParagraphs.join('\n\n');
    
    // 類似報道もそれぞれ翻訳
    if (relatedNewsList.length > 0) {
      for (let i = 0; i < relatedNewsList.length; i++) {
        relatedNewsList[i] = await translateText(relatedNewsList[i]);
      }
    }
    
    console.log(`   └ 翻訳後: "${title.substring(0, 30)}..."`);
  }

  const id = (isGlobal ? 'g-' : 'd-') + Buffer.from(realUrl || title).toString('base64').substring(0, 12).replace(/[^a-zA-Z0-9]/g, '');

  return {
    weekRangeKey,
    story: {
      id,
      title,
      titleEn,
      summaryRaw: summary, // マージ用の生本文テキスト
      category,
      source,
      readTime: '3分で読める',
      link: realUrl, // 元記事の直URLを保存
      publishDate: formattedPublishDate
    }
  };
}

async function fetchNews() {
  console.log('🔄 週刊 ESL & Retail Media ニュース用のデータを自動収集・翻訳しています（デコーダー＆スクレイピング稼働）...');

  let existingData = {};
  if (fs.existsSync(dataFilePath)) {
    try {
      existingData = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
      console.log(`📂 既存のデータを読み込みました（${Object.keys(existingData).length}週分のアーカイブあり）`);
    } catch (e) {
      console.error('⚠️ 既存のJSONデータのパースに失敗したため、新規に作成します。', e);
    }
  }

  const domesticFeed = await parser.parseURL(DOMESTIC_RSS_URL).catch(e => {
    console.error('❌ 国内RSSの取得に失敗しました。', e);
    return { items: [] };
  });

  const globalFeed = await parser.parseURL(GLOBAL_RSS_URL).catch(e => {
    console.error('❌ 海外RSSの取得に失敗しました。', e);
    return { items: [] };
  });

  // レート制限やAPIブロックを防ぐため、最新の15件ずつに制限して処理（スクレイピング時間の増加に伴い枠を安全側に設定）
  const domesticItems = domesticFeed.items.slice(0, 15);
  const globalItems = globalFeed.items.slice(0, 15);

  console.log(`📈 フィード取得件数: 国内=${domesticItems.length}件, 海外=${globalItems.length}件`);

  const newRawData = {};

  // 国内ニュースのパース
  for (const item of domesticItems) {
    const rawTitleObj = cleanTitleAndSource(item.title || '');
    const dateObj = item.pubDate ? new Date(item.pubDate) : new Date();
    const weekRangeKey = getWeekRange(dateObj);

    const isGlobal = isStoryGlobal(item, rawTitleObj.source, rawTitleObj.title);

    const { story } = await processRssItem(item, isGlobal);
    if (!newRawData[weekRangeKey]) {
      newRawData[weekRangeKey] = { domestic: [], global: [] };
    }
    
    if (isGlobal) {
      newRawData[weekRangeKey].global.push(story);
      await new Promise(resolve => setTimeout(resolve, 800));
    } else {
      newRawData[weekRangeKey].domestic.push(story);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  // 海外ニュースのパース
  for (const item of globalItems) {
    const rawTitleObj = cleanTitleAndSource(item.title || '');
    const dateObj = item.pubDate ? new Date(item.pubDate) : new Date();
    const weekRangeKey = getWeekRange(dateObj);

    const isGlobal = isStoryGlobal(item, rawTitleObj.source, rawTitleObj.title);

    const { story } = await processRssItem(item, isGlobal);
    if (!newRawData[weekRangeKey]) {
      newRawData[weekRangeKey] = { domestic: [], global: [] };
    }
    
    if (isGlobal) {
      newRawData[weekRangeKey].global.push(story);
      await new Promise(resolve => setTimeout(resolve, 800));
    } else {
      newRawData[weekRangeKey].domestic.push(story);
      await new Promise(resolve => setTimeout(resolve, 400));
    }
  }

  // 各週のデータをマージ・重複判定して保存用データへ追加する
  let addedCount = 0;
  for (const weekKey of Object.keys(newRawData)) {
    if (!existingData[weekKey]) {
      existingData[weekKey] = { domestic: [], global: [] };
    }

    // 国内ニュースのグループ化とマージ
    const processedDomestic = groupAndMergeStories(newRawData[weekKey].domestic);
    for (const story of processedDomestic) {
      const baseTitle = getBaseTitle(story.title);
      const isDuplicate = existingData[weekKey].domestic.some(s => getBaseTitle(s.title) === baseTitle || s.link === story.link);
      if (!isDuplicate) {
        existingData[weekKey].domestic.push(story);
        addedCount++;
      }
    }

    // 海外ニュースのグループ化とマージ
    const processedGlobal = groupAndMergeStories(newRawData[weekKey].global);
    for (const story of processedGlobal) {
      const baseTitle = getBaseTitle(story.title);
      const isDuplicate = existingData[weekKey].global.some(s => getBaseTitle(s.title) === baseTitle || s.link === story.link);
      if (!isDuplicate) {
        existingData[weekKey].global.push(story);
        addedCount++;
      }
    }
  }

  // 空の週エントリを削除
  Object.keys(existingData).forEach(week => {
    const weekData = existingData[week];
    if ((!weekData.domestic || weekData.domestic.length === 0) && (!weekData.global || weekData.global.length === 0)) {
      delete existingData[week];
    }
  });

  // 保存
  fs.mkdirSync(path.dirname(dataFilePath), { recursive: true });
  fs.writeFileSync(dataFilePath, JSON.stringify(existingData, null, 2), 'utf-8');

  console.log(`✅ 週刊ニュースの収集・翻訳・グループ化マージが完了しました。`);
  console.log(`🆕 新規登録（マージ後）代表記事数: ${addedCount}件`);
  console.log(`📁 保存先: ${dataFilePath}`);
}

fetchNews();
