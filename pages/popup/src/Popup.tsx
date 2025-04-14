import React, { useState, useEffect, useCallback } from 'react';
import { withErrorBoundary, withSuspense } from '@extension/shared'; // エラー/ローディング境界 (既存のものを流用)

// 型定義 (background script と共通)
interface StoredQuoteLink {
  id: string;
  quote: string;
  originalUrl: string;
  ogpImageUrl: string;
  createdAt: number;
}

// 定数
const STORAGE_KEY = 'quoteLinks';
const WORKER_BASE_URL = 'https://zennq.folks-chat.com'; // ★★★ デプロイした URL に更新 ★★★

// --- Helper Components ---

// アイコンのプレースホルダー (必要なら react-icons などを導入)
const IconCopy = () => <span title="コピー">📋</span>;
const IconShare = () => <span title="共有">🐦</span>;
const IconPreview = () => <span title="プレビュー">🔍</span>;
const IconDelete = () => <span title="削除">🗑️</span>;

interface LinkItemProps {
  link: StoredQuoteLink;
  onDelete: (id: string) => void;
}

const LinkItem: React.FC<LinkItemProps> = ({ link, onDelete }) => {
  const generatedUrl = `${WORKER_BASE_URL}/${link.id}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedUrl)
      .then(() => alert('リンクをコピーしました！'))
      .catch(err => console.error('コピー失敗:', err));
  }, [generatedUrl]);

  const handleShare = useCallback(() => {
    const text = `"${link.quote}" (Zennより引用)`; // 共有テキスト (タイトル/著者がないため引用文のみ)
    const shareUrl = `https://twitter.com/inte
    nt/tweet?url=${encodeURIComponent(generatedUrl)}&text=${encodeURIComponent(text)}`;
    chrome.tabs.create({ url: shareUrl });
  }, [generatedUrl, link.quote]);

  const handlePreview = useCallback(() => {
    chrome.tabs.create({ url: generatedUrl });
  }, [generatedUrl]);

  const handleDelete = useCallback(() => {
    if (window.confirm('このリンクを削除しますか？')) {
      onDelete(link.id);
    }
  }, [link.id, onDelete]);

  return (
    <div className="flex items-start p-3 mb-3 bg-white rounded-lg shadow hover:shadow-md transition-shadow duration-200 border border-gray-200">
      {/* OGP画像 */}
      <img
        src={link.ogpImageUrl}
        alt="OGP Image"
        className="w-24 h-auto mr-3 rounded object-cover border border-gray-100"
        // エラー時の代替表示 (任意)
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
      <div className="flex-1 min-w-0">
        {/* 引用文 */}
        <p className="text-sm text-gray-700 mb-2 line-clamp-3" title={link.quote}>
          “{link.quote}”
        </p>
        {/* 元記事URL (任意で表示) */}
        {/* <a href={link.originalUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline truncate block mb-2">
          {link.originalUrl.replace('https://', '')}
        </a> */}
        {/* アクションボタン */}
        <div className="flex space-x-3">
          <button onClick={handleCopy} className="text-gray-500 hover:text-blue-600 transition-colors"><IconCopy /></button>
          <button onClick={handleShare} className="text-gray-500 hover:text-blue-400 transition-colors"><IconShare /></button>
          <button onClick={handlePreview} className="text-gray-500 hover:text-green-600 transition-colors"><IconPreview /></button>
          <button onClick={handleDelete} className="text-gray-500 hover:text-red-600 transition-colors"><IconDelete /></button>
        </div>
      </div>
    </div>
  );
};


// --- Main Popup Component ---

const Popup = () => {
  const [links, setLinks] = useState<StoredQuoteLink[]>([]);
  const [loading, setLoading] = useState(true);

  // ストレージからリンクを読み込む関数
  const loadLinks = useCallback(async () => {
    try {
      // 型アサーションを追加して、戻り値の型を明確にする
      const data: { [key: string]: StoredQuoteLink[] } = await chrome.storage.local.get(STORAGE_KEY);
      setLinks(data[STORAGE_KEY] || []);
    } catch (error) {
      console.error('Failed to load links from storage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // リンク削除処理
  const handleDeleteLink = useCallback(async (idToDelete: string) => {
    try {
      const data: { [key: string]: StoredQuoteLink[] } = await chrome.storage.local.get(STORAGE_KEY);
      const currentLinks: StoredQuoteLink[] = data[STORAGE_KEY] || [];
      const updatedLinks = currentLinks.filter(link => link.id !== idToDelete);
      await chrome.storage.local.set({ [STORAGE_KEY]: updatedLinks });
      // setLinks(updatedLinks); // storage.onChanged で更新されるので不要な場合もある
      console.log(`Link ${idToDelete} deleted.`);
    } catch (error) {
      console.error('Failed to delete link:', error);
      alert('リンクの削除中にエラーが発生しました。');
    }
  }, []);

  // 初期読み込み
  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  // ストレージ変更監視
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes[STORAGE_KEY]) {
        console.log('Storage changed, reloading links...');
        // newValue が存在しない場合 (削除時など) も考慮して空配列をデフォルトにする
        setLinks(changes[STORAGE_KEY].newValue || []);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // クリーンアップ関数
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  if (loading) {
    return <div className="p-4 text-center text-gray-500">読み込み中...</div>;
  }

  return (
    <div className="w-80 p-4 bg-gray-50 min-h-[100px] max-h-[500px] overflow-y-auto">
      <h1 className="text-lg font-semibold mb-4 text-gray-800">保存した引用リンク</h1>
      {links.length === 0 ? (
        <p className="text-center text-gray-500 mt-6">
          まだ引用リンクはありません。
          <br />
          Zennの記事ページでテキストを選択し、
          <br />
          右クリックメニューから作成してください。
        </p>
      ) : (
        <div>
          {links.map(link => (
            <LinkItem key={link.id} link={link} onDelete={handleDeleteLink} />
          ))}
        </div>
      )}
    </div>
  );
};

// エラー境界と Suspense でラップ (既存のものを流用)
// ローディング/エラーメッセージも Tailwind でスタイル調整
const SuspenseFallback = <div className="w-80 p-4 text-center text-gray-500">読み込み中...</div>;
const ErrorFallback = <div className="w-80 p-4 text-center text-red-500">エラーが発生しました</div>;

export default withErrorBoundary(withSuspense(Popup, SuspenseFallback), ErrorFallback);
