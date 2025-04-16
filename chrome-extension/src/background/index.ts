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

// --- ヘルパー関数: コンテンツスクリプトでモーダルを表示 ---
const showModalInContentScript = (tabId: number, message: string) => {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: (msg) => {
      // この関数は Content Script のコンテキストで実行される
      const displayModal = (text: string): void => {
        // Remove existing modal if any
        const existingModal = document.querySelector('.zenn-quotes-notification');
        if (existingModal) {
          existingModal.remove();
        }

        // Create modal element
        const modal = document.createElement('div');
        modal.classList.add('zenn-quotes-notification');
        modal.textContent = text;
        document.body.appendChild(modal);

        // Trigger fade-in animation
        setTimeout(() => {
          modal.classList.add('show');
        }, 10); // Small delay

        // Set timeout to fade out and remove the modal
        setTimeout(() => {
          modal.classList.remove('show');
          modal.addEventListener('transitionend', () => {
            modal.remove();
          }, { once: true });
        }, 3000); // Display for 3 seconds
      };
      displayModal(msg);
    },
    args: [message]
  }).catch((err) => {
    console.error('Failed to inject script to show modal:', err);
    // フォールバックとしてネイティブ通知を表示 (任意)
    chrome.notifications.create({
      type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes Info', message: message,
    });
  });
};


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
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab || !tab.url || !tab.id) { // tab.id のチェックを追加
    console.error('Invalid tab or context menu ID.');
    return;
  }
  const targetTabId = tab.id; // tabId を取得

  // --- 開始メッセージをモーダルで表示 ---
  showModalInContentScript(targetTabId, '引用リンクを作成しています ⏳');

  const selectedText = info.selectionText?.trim();
  const pageUrl = tab.url;

  // --- バリデーション ---
  if (!selectedText) {
    console.error('No text selected.');
    showModalInContentScript(targetTabId, '引用するテキストが選択されていません。');
    return;
  }
  if (selectedText.length > 200) {
    const errorMessage = `文字数が多すぎます(${selectedText.length}/200)。200文字以内で選択してください。`;
    console.error('Selected text is too long (max 200 chars).');
    showModalInContentScript(targetTabId, errorMessage);
    return;
  }
  if (!pageUrl.startsWith('https://zenn.dev/')) {
    console.error('Invalid page URL:', pageUrl);
    showModalInContentScript(targetTabId, 'Zennの記事ページ以外では利用できません。');
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
    showModalInContentScript(targetTabId, '一時データの保存に失敗しました。');
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

    // --- 成功通知 & クリップボードコピー (executeScriptでContent Scriptの関数を呼び出す) ---
    if (tab?.id) {
      const targetTabId = tab.id;
      const notificationMessage = '引用リンクを作成しコピーしました 🎉';
      // OGPカードのURLを構築
      const quoteLinkUrl = `https://zennq.folks-chat.com/${finalId}`;

      // コンテンツスクリプトでクリップボードコピーとモーダル表示を実行
      chrome.scripting.executeScript({
        target: { tabId: targetTabId },
        func: (message, urlToCopy) => {
          // この関数は Content Script のコンテキストで実行される
          const displayModal = (text: string): void => {
            // Remove existing modal if any
            const existingModal = document.querySelector('.zenn-quotes-notification');
            if (existingModal) {
              existingModal.remove();
            }
            // Create modal element
            const modal = document.createElement('div');
            modal.classList.add('zenn-quotes-notification');
            modal.textContent = text;
            document.body.appendChild(modal);
            // Trigger fade-in animation
            setTimeout(() => { modal.classList.add('show'); }, 10);
            // Set timeout to fade out and remove the modal
            setTimeout(() => {
              modal.classList.remove('show');
              modal.addEventListener('transitionend', () => { modal.remove(); }, { once: true });
            }, 3000);
          };

          // クリップボードにコピー
          navigator.clipboard.writeText(urlToCopy).then(() => {
            console.log('Quote link copied to clipboard:', urlToCopy);
            displayModal(message); // 成功メッセージ表示
          }).catch(err => {
            console.error('Failed to copy quote link to clipboard:', err);
            displayModal(`${message} (コピー失敗)`); // 失敗メッセージ表示
          });
        },
        args: [notificationMessage, quoteLinkUrl]
      }).catch((err) => {
        console.error('Failed to inject script for copy/notify:', err);
        // フォールバックとしてネイティブ通知を表示 (任意)
        chrome.notifications.create({
          type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes', message: '引用リンクを作成しました！ (通知表示エラー)',
        });
      });

    } else {
      console.error('Could not execute script: tab ID not found.');
      // フォールバックとしてネイティブ通知を表示 (任意)
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes', message: '引用リンクをコピーしました！ (通知表示エラー)',
      });
    }

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
      if (error.message.includes('API request failed')) {
        // APIからのエラーメッセージを抽出して表示
        const apiErrorMatch = error.message.match(/API request failed: \d+ .+? - (.+)/);
        errorMessage = apiErrorMatch && apiErrorMatch[1] ? `APIエラー: ${apiErrorMatch[1]}` : 'APIリクエストに失敗しました。';
      } else if (error.message.includes('Failed to fetch')) {
        errorMessage = 'バックエンドAPIに接続できませんでした。';
      } else if (error.message.includes('Invalid API response')) {
        errorMessage = 'APIからの応答が無効です。';
      }
    }
    // エラーメッセージをモーダルで表示
    if (tab?.id) {
      showModalInContentScript(tab.id, errorMessage);
    } else {
      // フォールバック
      chrome.notifications.create({
        type: 'basic', iconUrl: 'icon-128.png', title: 'ZennQuotes エラー', message: errorMessage,
      });
    }
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
