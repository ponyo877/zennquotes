// 型定義: chrome.storage.local に保存するデータ形式
interface StoredQuoteLink {
  id: string; // 完了時は実際のID, pending時は一時ID
  quote: string;
  originalUrl: string;
  ogpImageUrl?: string; // pending 時は存在しない
  createdAt?: number; // pending 時は存在しない
  status?: 'pending' | 'error'; // ローディング状態を示す
}

// 定数
const CONTEXT_MENU_ID = 'createZennQuoteLink';
const API_ENDPOINT = 'https://zennq.folks-chat.com/api/ogp'; // デプロイ済み URL
const STORAGE_KEY = 'quoteLinks';

// 拡張機能インストール時またはアップデート時にコンテキストメニューを作成・更新
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'ZennQuotesリンクを作成',
    contexts: ['selection'],
    documentUrlPatterns: ['https://zenn.dev/*/articles/*'],
  });
  console.log('ZennQuotes context menu created.');
});

// コンテキストメニュークリック時の処理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('Context menu clicked!');
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab || !tab.url) {
    return;
  }

  const selectedText = info.selectionText?.trim();
  const pageUrl = tab.url;

  // --- バリデーション ---
  if (!selectedText) {
    console.error('No text selected.');
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes エラー', message: '引用するテキストが選択されていません。',
    });
    return;
  }
  if (selectedText.length > 200) {
    console.error('Selected text is too long (max 200 chars).');
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes エラー', message: `文字数が多すぎます(${selectedText.length}/200)。200文字以内で選択してください。`,
    });
    return;
  }
  if (!pageUrl.startsWith('https://zenn.dev/')) {
    console.error('Invalid page URL:', pageUrl);
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes エラー', message: 'Zennの記事ページ以外では利用できません。',
    });
    return;
  }

  // --- プレースホルダーをストレージに追加 ---
  const temporaryId = `pending-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const placeholderLink: StoredQuoteLink = {
    id: temporaryId,
    quote: selectedText,
    originalUrl: pageUrl,
    status: 'pending',
  };

  let currentLinks: StoredQuoteLink[] = [];
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    currentLinks = data[STORAGE_KEY] || [];
    const updatedLinksWithPlaceholder = [placeholderLink, ...currentLinks];
    await chrome.storage.local.set({ [STORAGE_KEY]: updatedLinksWithPlaceholder });
    console.log('Pending placeholder saved to storage.');
  } catch (storageError) {
    console.error('Error saving placeholder link:', storageError);
    // ストレージ保存失敗時のエラー通知 (任意)
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes エラー', message: '一時データの保存に失敗しました。',
    });
    return; // API 呼び出しに進まない
  }

  // --- API呼び出し ---
  try {
    console.log('Sending request to API:', { quote: selectedText, url: pageUrl });
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote: selectedText, url: pageUrl }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    const { id: finalId, ogpImageUrl } = result; // バックエンドから返される ID を使用

    if (!finalId || typeof finalId !== 'string' || !ogpImageUrl || typeof ogpImageUrl !== 'string') {
      throw new Error('Invalid API response: id or ogpImageUrl not found or invalid.');
    }

    console.log('Received data:', { finalId, ogpImageUrl });

    // --- ストレージ更新 (プレースホルダーを完全なデータに置換) ---
    const finalLink: StoredQuoteLink = {
      id: finalId, // API から取得した ID
      quote: selectedText,
      originalUrl: pageUrl,
      ogpImageUrl: ogpImageUrl,
      createdAt: Date.now(),
      // status は削除
    };

    // 既存データを再取得し、プレースホルダーを置換
    const currentData = await chrome.storage.local.get(STORAGE_KEY);
    const linksIncludingPlaceholder: StoredQuoteLink[] = currentData[STORAGE_KEY] || [];
    const finalLinks = linksIncludingPlaceholder.map(link =>
      link.id === temporaryId ? finalLink : link
    );

    await chrome.storage.local.set({ [STORAGE_KEY]: finalLinks });
    console.log('Placeholder replaced with final link in storage.');

    // --- 成功通知 ---
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes', message: '引用リンクを作成しました！',
    });

  } catch (error) {
    console.error('Error creating quote link:', error);
    // --- エラー時はプレースホルダーを削除 ---
    try {
      const currentDataOnError = await chrome.storage.local.get(STORAGE_KEY);
      const currentLinksOnError: StoredQuoteLink[] = currentDataOnError[STORAGE_KEY] || [];
      const linksWithoutPlaceholder = currentLinksOnError.filter(link => link.id !== temporaryId);
      await chrome.storage.local.set({ [STORAGE_KEY]: linksWithoutPlaceholder });
      console.log('Pending placeholder removed due to error.');
    } catch (removeError) {
      console.error('Error removing placeholder link after API error:', removeError);
    }

    let errorMessage = 'リンクの作成中にエラーが発生しました。';
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'バックエンドAPIに接続できませんでした。';
      } else {
        errorMessage += `\n${error.message}`;
      }
    }
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes エラー', message: errorMessage,
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
});

console.log('ZennQuotes background script loaded.');
