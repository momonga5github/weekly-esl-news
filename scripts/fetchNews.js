import Parser from 'rss-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESModules対策
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parser = new Parser();

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
    console.error('⚠️ 翻訳エラー (元のテキストを使用します):', e);
    return text;
  }
}

// 記事が日本語か英語（アルファベット）かを簡易判定する
function isEnglishText(text) {
  // 日本語の文字（ひらがな、カタカナ、漢字）が含まれていない場合は英語（あるいは外国語）とみなす
  return !/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(text);
}

// 国内・海外ニュースをスマートに分類する判定ロジック
function isStoryGlobal(item, source, title) {
  const s = source.toLowerCase();
  const t = title.toLowerCase();
  const link = item.link || '';
  
  // A. タイトルに日本語（ひらがな、カタカナ、漢字）が含まれているかどうか
  const hasJapanese = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(title);
  
  // B. 明確な海外ソース名のキーワード定義
  const isGlobalSource = s.includes('international') || 
                         s.includes('global') || 
                         s.includes('euro') || 
                         s.includes('world') || 
                         s.includes('reuters') || 
                         s.includes('bloomberg') ||
                         s.includes('forbes') ||
                         s.includes('nytimes') ||
                         (s.includes('海外') && !s.includes('海外旅行') && !s.includes('海外進出'));

  // C. 明確な国内ソース名の定義（アルファベットを含むが国内メディアなもの）
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

  // 日本語が含まれている場合
  if (hasJapanese) {
    // ソース名が明確に海外メディアで、かつ国内メディアではない場合は「海外ニュース」
    if (isGlobalSource && !isJapaneseSource) {
      return true;
    }
    // それ以外（一般的な日本語記事、国内メディア）はすべて「国内ニュース」
    return false;
  }

  // 日本語が含まれていない（英語などのアルファベット見出し）場合
  // 国内メディアが配信した英語リリースではない限り、「海外ニュース」
  return !isJapaneseSource;
}

// カテゴリを推測するロジック (リテールメディア・店内販促を追加)
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

// 記事公開日から属する週の期間 (月曜 ~ 日曜) を計算する
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

// 10行程度のリッチ解説文を生成する
function generateRichContent(title, summary, isGlobal) {
  const t = title.toLowerCase();
  const intro = `【ニュースの要約】\n${summary}`;
  
  let background = '';
  let details = '';

  if (t.includes('サイネージ') || t.includes('signage') || t.includes('メディア') || t.includes('media')) {
    // デジタルサイネージ & リテールメディア用
    background = `【社会的背景】\nコンビニやドラッグストアにおいて、店頭（売場やレジ横など）を広告媒体として活用する「リテールメディア」の動きが急成長しています。実店舗ならではの強みを活かし、購買行動に最も近い場所で来店客にアプローチを行うための手段として、デジタルサイネージのネットワーク化が急速に進んでいます。`;
    details = `【実務でのポイント】\n店内デジタルサイネージを活用した販促は、静的なポスターの代替に留まりません。POSデータや時間帯に応じた最適な広告の切り替え、スマートフォンアプリと連携した割引情報の通知などにより、客単価向上や衝動買いを促すほか、メーカーから広告収入を得る新たなビジネスモデル（店舗のメディア化）が定着し始めています。`;
  } else {
    // 電子棚札（ESL）用
    background = `【社会的背景】\n食品スーパーやドラッグストアなどにおいて、度重なる価格改定や特売時の値札の貼り替え作業は、店舗スタッフの大きな業務負担となっています。人手不足が深刻化する中、これを解消するリテールDX（デジタルトランスフォーメーション）の強力な手段として、電子棚札（ESL）の導入が世界規模で急速に推進されています。`;
    details = `【実務でのポイント】\n電子棚札の導入は、単なる紙の値札の削減に留まりません。基幹システムとの連携による「レジと棚札の価格の完全一致」や、時間帯・在庫数に応じて自動で段階値下げを行う「ダイナミック・プライシング」の実施による生鮮・惣薬の廃棄ロス削減など、ビジネスに直結する具体的な成功事例が多数報告されています。`;
  }

  const note = `※この記事は外部のニュースメディアから自動取得・整理されたものです。詳細な導入店舗数、投資対効果（ROI）、検証数値、売場画像などの全文は、以下の「元の記事を読む」ボタンから掲載元ソース of サイトにアクセスしてご確認ください。`;

  return `${intro}\n\n${background}\n\n${details}\n\n${note}`;
}

// RSSアイテムを非同期で整形する
async function formatItem(item, isGlobal) {
  const rawTitleObj = cleanTitleAndSource(item.title || '');
  let title = rawTitleObj.title;
  let source = rawTitleObj.source;
  let titleEn = null;

  const dateObj = item.pubDate ? new Date(item.pubDate) : new Date();
  const formattedPublishDate = `${dateObj.getFullYear()}年${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
  const weekRangeKey = getWeekRange(dateObj);

  const category = estimateCategory(title, isGlobal ? 'グローバル動向' : '導入事例');

  let summary = item.contentSnippet || '要約は元の記事をご参照ください。';
  summary = summary.trim();

  // 海外ニュース判定かつ英語の場合のみ自動翻訳を適用
  if (isGlobal && isEnglishText(title)) {
    titleEn = title;
    console.log(`🌐 翻訳中: "${titleEn.substring(0, 30)}..."`);
    
    title = await translateText(title);
    summary = await translateText(summary);
    source = await translateText(source);
    
    console.log(`   └ 翻訳後: "${title.substring(0, 30)}..."`);
  }

  const content = generateRichContent(title, summary, isGlobal);

  const id = (isGlobal ? 'g-' : 'd-') + Buffer.from(item.link || title).toString('base64').substring(0, 12).replace(/[^a-zA-Z0-9]/g, '');

  return {
    weekRangeKey,
    story: {
      id,
      title,
      titleEn,
      summary: summary.substring(0, 150) + (summary.length > 150 ? '...' : ''),
      category,
      source,
      readTime: '3分で読める',
      link: item.link || '',
      publishDate: formattedPublishDate,
      content
    }
  };
}

async function fetchNews() {
  console.log('🔄 週刊 ESL & Retail Media ニュース用のデータを自動収集・翻訳しています（スマート分類稼働）...');

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

  // レート制限やAPIブロックを防ぐため、最新の20件ずつに制限して処理
  const domesticItems = domesticFeed.items.slice(0, 20);
  const globalItems = globalFeed.items.slice(0, 20);

  console.log(`📈 フィード取得件数: 国内=${domesticItems.length}件, 海外=${globalItems.length}件`);

  let addedCount = 0;

  // 国内ニュース処理 (非同期逐次実行)
  for (const item of domesticItems) {
    const rawTitleObj = cleanTitleAndSource(item.title || '');
    const dateObj = item.pubDate ? new Date(item.pubDate) : new Date();
    const weekRangeKey = getWeekRange(dateObj);

    // スマート判定: 国内/海外を中身で厳密判定
    const isGlobal = isStoryGlobal(item, rawTitleObj.source, rawTitleObj.title);

    // 重複チェック (isGlobalの判定に基づいて対応する配列を確認)
    const isDuplicate = existingData[weekRangeKey] && (
      isGlobal 
        ? existingData[weekRangeKey].global.some(s => s.title === rawTitleObj.title || s.link === item.link)
        : existingData[weekRangeKey].domestic.some(s => s.title === rawTitleObj.title || s.link === item.link)
    );

    if (!isDuplicate) {
      const { story } = await formatItem(item, isGlobal);
      if (!existingData[weekRangeKey]) {
        existingData[weekRangeKey] = { domestic: [], global: [] };
      }
      
      if (isGlobal) {
        existingData[weekRangeKey].global.push(story);
      } else {
        existingData[weekRangeKey].domestic.push(story);
      }
      addedCount++;
      
      if (isGlobal && isEnglishText(rawTitleObj.title)) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }
  }

  // 海外ニュース処理 (非同期逐次実行、翻訳を伴う)
  for (const item of globalItems) {
    const rawTitleObj = cleanTitleAndSource(item.title || '');
    const dateObj = item.pubDate ? new Date(item.pubDate) : new Date();
    const weekRangeKey = getWeekRange(dateObj);

    // スマート判定: 海外フィードから来ても日本語や国内ソースなら国内ニュースに分類
    const isGlobal = isStoryGlobal(item, rawTitleObj.source, rawTitleObj.title);

    // 重複チェック
    const isDuplicate = existingData[weekRangeKey] && (
      isGlobal
        ? existingData[weekRangeKey].global.some(s => s.titleEn === rawTitleObj.title || s.title === rawTitleObj.title || s.link === item.link)
        : existingData[weekRangeKey].domestic.some(s => s.title === rawTitleObj.title || s.link === item.link)
    );

    if (!isDuplicate) {
      const { story } = await formatItem(item, isGlobal);
      if (!existingData[weekRangeKey]) {
        existingData[weekRangeKey] = { domestic: [], global: [] };
      }
      
      if (isGlobal) {
        existingData[weekRangeKey].global.push(story);
      } else {
        existingData[weekRangeKey].domestic.push(story);
      }
      addedCount++;
      
      if (isGlobal && isEnglishText(rawTitleObj.title)) {
        await new Promise(resolve => setTimeout(resolve, 800));
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

  console.log(`✅ 週刊ニュースの収集・翻訳・マージが完了しました。`);
  console.log(`🆕 新規追加記事: ${addedCount}件`);
  console.log(`📁 保存先: ${dataFilePath}`);
}

fetchNews();
