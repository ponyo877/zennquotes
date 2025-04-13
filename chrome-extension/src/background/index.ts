// 型定義: chrome.storage.local に保存するデータ形式
interface StoredQuoteLink {
  id: string; // UUID
  quote: string;
  originalUrl: string; // 元記事のURL (Text Fragment なし)
  ogpImageUrl: string; // バックエンドから取得したOGP画像のURL
  createdAt: number; // Unix timestamp (ms)
  // title, author はここでは保存せず、表示時に必要なら再取得 or OGP画像から推測
}

// 定数
const CONTEXT_MENU_ID = 'createZennQuoteLink';
// バックエンドAPIのエンドポイント (ローカル開発環境を想定)
// TODO: 本番環境デプロイ時に変更する
const API_ENDPOINT = 'http://localhost:8787/api/ogp';
const STORAGE_KEY = 'quoteLinks';

// 拡張機能インストール時またはアップデート時にコンテキストメニューを作成・更新
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'ZennQuotesリンクを作成',
    contexts: ['selection'], // テキスト選択時のみ表示
    documentUrlPatterns: ['https://zenn.dev/*/articles/*'], // Zennの記事ページに限定
  });
  console.log('ZennQuotes context menu created.');
});

// ★★★ onClicked リスナーの登録を onInstalled の中に移動 ★★★
// コンテキストメニュークリック時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked!');
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab) {
    return;
  }

  const selectedText = info.selectionText?.trim();
  const pageUrl = tab.url;

  // --- バリデーション ---
  if (!selectedText) {
    console.error('No text selected.');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'ZennQuotes エラー',
      message: '引用するテキストが選択されていません。',
    });
    return;
  }

  if (selectedText.length > 200) {
    console.error('Selected text is too long (max 200 chars).');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'ZennQuotes エラー',
      message: `文字数が多すぎます(${selectedText.length}/200)。200文字以内で選択してください。`,
    });
    return;
  }

  if (!pageUrl || !pageUrl.startsWith('https://zenn.dev/')) {
    console.error('Invalid page URL:', pageUrl);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'ZennQuotes エラー',
      message: 'Zennの記事ページ以外では利用できません。',
    });
    return;
  }

  // --- API呼び出し ---
  try {
    console.log('Sending request to API:', { quote: selectedText, url: pageUrl });
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ quote: selectedText, url: pageUrl }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    const ogpImageUrl = result?.ogpImageUrl;

    if (!ogpImageUrl || typeof ogpImageUrl !== 'string') {
      throw new Error('Invalid API response: ogpImageUrl not found or invalid.');
    }

    console.log('Received ogpImageUrl:', ogpImageUrl);

    // --- ストレージ保存 ---
    const newLink: StoredQuoteLink = {
      id: crypto.randomUUID(),
      quote: selectedText,
      originalUrl: pageUrl, // Text Fragment なしの元URL
      ogpImageUrl: ogpImageUrl,
      createdAt: Date.now(),
    };

    // 既存のデータを取得して新しいリンクを追加
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const existingLinks: StoredQuoteLink[] = data[STORAGE_KEY] || [];
    const updatedLinks = [newLink, ...existingLinks]; // 新しいものを先頭に追加

    await chrome.storage.local.set({ [STORAGE_KEY]: updatedLinks });
    console.log('Quote link saved to storage.');

    // --- 成功通知 ---
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png', // or ogpImageUrl ?
      title: 'ZennQuotes',
      message: '引用リンクを作成しました！',
      // contextMessage: selectedText, // 通知に追加情報
    });

  } catch (error) {
    console.error('Error creating quote link:', error);
    let errorMessage = 'リンクの作成中にエラーが発生しました。';
    if (error instanceof Error) {
      // ネットワークエラーなどを判定
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'バックエンドAPIに接続できませんでした。ローカルサーバーが起動しているか確認してください。';
      } else {
        errorMessage += `\n${error.message}`;
      }
    }
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon-128.png',
      title: 'ZennQuotes エラー',
      message: errorMessage,
    });
  }
});

// メッセージリスナー (Popup や Content Script からの通信用 - 今回は未使用だが将来用に残す)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message);
  // if (message.type === 'GET_QUOTE_LINKS') {
  //   chrome.storage.local.get(STORAGE_KEY, (data) => {
  //     sendResponse({ links: data[STORAGE_KEY] || [] });
  //   });
  //   return true; // 非同期レスポンスを示す
  // }
  // 他のメッセージタイプを処理...
});

console.log('ZennQuotes background script loaded.');
