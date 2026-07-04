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
    .replace(/ - .*$/, '') // 末尾のメディア名カット
    .replace(/[^A-Za-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '') // 記号やスペースの完全除去
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

// 同一トピックの類似記事をグループ化し、要約をマージする関数
function groupAndMergeStories(rawStories) {
  const grouped = [];

  for (const story of rawStories) {
    const baseTitle = getBaseTitle(story.title);
    
    // すでにグループが存在するかチェック
    let foundGroup = null;
    for (const g of grouped) {
      const targetBase = getBaseTitle(g.title);
      // ベースタイトルが一致、またはどちらかが包含関係にある場合は類似記事とみなす
      if (
        targetBase === baseTitle || 
        (targetBase.length > 5 && baseTitle.length > 5 && (targetBase.includes(baseTitle) || baseTitle.includes(targetBase)))
      ) {
        foundGroup = g;
        break;
      }
    }

    if (foundGroup) {
      // 類似報道リストに追加
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

      // 要約文をマージする（重複しない文章を結合してボリュームを増やす）
      if (story.summaryRaw && story.summaryRaw !== '要約は元の記事をご参照ください。') {
        const cleanSummary = story.summaryRaw.replace(/\s+/g, '');
        // 既存の要約に含まれていない文言である場合のみ追記
        if (!foundGroup.summaryRaw.replace(/\s+/g, '').includes(cleanSummary.substring(0, 15))) {
          foundGroup.summaryRaw = `${foundGroup.summaryRaw} ${story.summaryRaw}`;
          // 最大文字数を制限
          if (foundGroup.summaryRaw.length > 500) {
            foundGroup.summaryRaw = foundGroup.summaryRaw.substring(0, 500) + '...';
          }
        }
      }
    } else {
      // 新規グループの作成
      story.relatedNews = [];
      grouped.push(story);
    }
  }

  // 最後に、マージされた要約と類似報道リストからcontentフィールドを組み立てる
  for (const g of grouped) {
    const intro = `【ニュースの要約】\n${g.summaryRaw}`;
    
    let relatedSection = '';
    if (g.relatedNews && g.relatedNews.length > 0) {
      const list = g.relatedNews.map(r => `- ${r.title} （ソース: ${r.source}）`);
      relatedSection = `【関連する主な報道・類似記事】\n${list.slice(0, 4).join('\n')}`;
    }

    const note = `※この記事は外部のニュースメディアから自動取得・整理されたものです。詳細な導入店舗数、投資対効果（ROI）、検証数値、売場画像などの全文は、以下の「元の記事を読む」ボタンから掲載元ソースのサイトにアクセスしてご確認ください。`;

    g.content = relatedSection 
      ? `${intro}\n\n${relatedSection}\n\n${note}`
      : `${intro}\n\n${note}`;
      
    // 一覧画面での表示用スニペット
    g.summary = g.summaryRaw.substring(0, 150) + (g.summaryRaw.length > 150 ? '...' : '');
    
    // 一時的なワーク用フィールドの削除
    delete g.summaryRaw;
  }

  return grouped;
}

// RSSアイテムの一次整形（翻訳のみ実行、マージは後段で行う）
async function processRssItem(item, isGlobal) {
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

  const id = (isGlobal ? 'g-' : 'd-') + Buffer.from(item.link || title).toString('base64').substring(0, 12).replace(/[^a-zA-Z0-9]/g, '');

  return {
    weekRangeKey,
    story: {
      id,
      title,
      titleEn,
      summaryRaw: summary, // マージ用の生スニペット
      category,
      source,
      readTime: '3分で読める',
      link: item.link || '',
      publishDate: formattedPublishDate
    }
  };
}

async function fetchNews() {
  console.log('🔄 週刊 ESL & Retail Media ニュース用のデータを自動収集・翻訳しています（類似報道マージ版）...');

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

  const domesticItems = domesticFeed.items.slice(0, 20);
  const globalItems = globalFeed.items.slice(0, 20);

  console.log(`📈 フィード取得件数: 国内=${domesticItems.length}件, 海外=${globalItems.length}件`);

  // 週ごとに取得したフラットな新規データを格納する一時マップ
  const newRawData = {}; // { weekKey: { domestic: [], global: [] } }

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
      if (isEnglishText(rawTitleObj.title)) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } else {
      newRawData[weekRangeKey].domestic.push(story);
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
      if (isEnglishText(rawTitleObj.title)) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } else {
      newRawData[weekRangeKey].domestic.push(story);
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
      // 既存データとの重複判定（ベースタイトルでの比較）
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
