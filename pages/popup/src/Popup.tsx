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

// ★★★ SVG アイコンコンポーネント ★★★
const IconCopy = () => ( // ★★★ 新しいコピーアイコン SVG に変更 ★★★
  <svg id="emoji" viewBox="0 0 72 72" version="1.1" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    {/* g#color は fill 属性を持つ */}
    <g id="color">
      <rect x="23.8246" y="9.2081" width="32.1283" height="47.7648" fill="#9B9B9A"/>
      <rect x="19.9359" y="13.0968" width="32.1283" height="47.7648" fill="#FFFFFF"/>
    </g>
    {/* g#line は stroke 属性を持つ */}
    <g id="line">
      <polyline fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="2" points="52.06,56.9698 55.95,56.9698 55.95,9.2098 23.82,9.2098 23.82,13.0998"/>
      <rect x="19.9359" y="13.0968" width="32.1283" height="47.7648" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="2"/>
      <line x1="31.1709" x2="40.8291" y1="37.0208" y2="37.0208" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="2"/>
      <line x1="36" x2="36" y1="41.8499" y2="32.1917" fill="none" stroke="#000000" strokeLinecap="round" strokeLinejoin="round" strokeMiterlimit="10" strokeWidth="2"/>
    </g>
  </svg>
);
const IconShare = () => ( // ★★★ X ロゴ SVG に変更 ★★★
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 271" fill="currentColor" className="w-5 h-5">
    <path d="m236 0h46l-101 115 118 156h-92.6l-72.5-94.8-83 94.8h-46l107-123-113-148h94.9l65.5 86.6zm-16.1 244h25.5l-165-218h-27.4z"/>
  </svg>
);
const IconPreview = () => ( // ★★★ ブラウザ/地球儀 SVG に変更 ★★★
  <svg id="emoji" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    {/* g#color は fill 属性を持つ */}
    <g id="color">
      <circle cx="36" cy="36" r="28" fill="#B1CC33"/>
      <path fill="#FCEA2B" fillRule="evenodd" d="M34.3116 27.1581L34.3196 27.2048C36.3227 26.8575 38.4542 27.1834 40.3524 28.2793C44.6571 30.7646 46.1319 36.2689 43.6467 40.5735L30.3856 63.5424C41.8282 65.8209 53.9433 60.7391 60.1011 50.0735C64.3105 42.7826 64.8683 34.3855 62.3419 27H36C35.4229 27 34.8585 27.0543 34.3116 27.1581Z" clipRule="evenodd"/>
      <path fill="#EA5A47" fillRule="evenodd" d="M27 43.5L8.20227 32.6171C9.87243 18.7484 21.681 8 36 8C48.3156 8 58.7741 15.9511 62.5222 27H36C31.0294 27 27 31.0294 27 36C27 38.1919 27.7836 40.2008 29.0858 41.7618L27 43.5Z" clipRule="evenodd"/>
      <circle cx="36" cy="36" r="9" fill="#61B2E4"/>
    </g>
    {/* g#line は stroke 属性を持つ */}
    <g id="line">
      <circle cx="36" cy="36" r="28" fill="none" stroke="#000" strokeWidth="2"/>
      <path fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" d="M36 26H59"/>
      <path fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" d="M44.6602 41L33.1602 60.9186"/>
      <path fill="none" stroke="#000" strokeLinecap="round" strokeWidth="2" d="M11.0814 33.1603L31 44.6603"/>
      <circle cx="36" cy="36" r="10" fill="none" stroke="#000" strokeWidth="2"/>
    </g>
  </svg>
);
const IconDelete = () => ( // ★★★ ゴミ箱 SVG に変更 ★★★
  <svg id="emoji" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="w-5 h-5">
    {/* g#color は fill 属性があるので stroke 関連を削除 */}
    <g id="color">
      <polygon fill="#fff" points="49.4185 60.1783 22.4092 59.971 16.5845 18.0188 55.3223 18.0188 49.4185 60.1783"/>
      <polygon fill="#d0cfce" points="15.0757 12.0679 15.0757 18.0188 50.8205 18.0188 51.4647 12.0679 15.0757 12.0679"/>
      <polygon fill="#d0cfce" points="21.9094 54.6893 22.4092 59.971 43.9266 59.971 44.5185 54.6893 21.9094 54.6893"/>
      <polygon fill="#9b9b9a" points="42.0965 60.1783 49.4185 60.1783 49.9338 54.4471 42.696 54.4471 42.0965 60.1783"/>
      <polygon fill="#9b9b9a" points="56.5286 12.2876 48.939 12.2876 48.3108 17.9011 56.5286 17.9011 56.5286 12.2876"/>
    </g>
    {/* g#line は stroke 属性があるので fill="none" を削除 */}
    <g id="line">
      <line x1="21.3803" x2="17.7729" y1="50.393" y2="22.0118"/>
      <line x1="54.2631" x2="50.5056" y1="21.9835" y2="50.3779"/>
      <line x1="40.5756" x2="48.7493" y1="22.0889" y2="32.1094"/>
      <line x1="30.4171" x2="47.5692" y1="22.1297" y2="42.7723"/>
      <line x1="22.3519" x2="44.2156" y1="24.2532" y2="50.4248"/>
      <line x1="23.9019" x2="35.928" y1="36.996" y2="50.6301"/>
      <line x1="25.3172" x2="26.68" y1="49.3963" y2="50.7533"/>
      <line x1="23.228" x2="31.8134" y1="31.2338" y2="22.103"/>
      <line x1="24.6095" x2="42.853" y1="41.882" y2="22.1297"/>
      <line x1="26.8854" x2="49.3815" y1="50.6301" y2="26.7148"/>
      <line x1="36.5741" x2="48.1171" y1="50.6301" y2="38.6841"/>
      <line x1="44.2156" x2="46.3434" y1="50.7533" y2="48.96"/>
      <rect x="14.9055" y="12.0285" width="42.045" height="5.9459"/>
      <line x1="42.853" x2="50.1245" y1="54.4035" y2="54.4035" stroke-miterlimit="10"/>
      <polyline points="50.1245 54.4035 49.4158 59.9663 22.4302 59.9663 21.7487 54.4035 50.1245 54.4035"/>
    </g>
  </svg>
);


interface LinkItemProps {
  link: StoredQuoteLink;
  onDelete: (id: string) => void;
  className?: string; // ★★★ className プロパティを追加 (オプショナル) ★★★
}

const LinkItem: React.FC<LinkItemProps> = ({ link, onDelete, className = '' }) => {
  const generatedUrl = `${WORKER_BASE_URL}/${link.id}`;
  // ★★★ ツールチップ表示状態管理 ★★★
  const [showTooltip, setShowTooltip] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(generatedUrl)
      .then(() => {
        // ★★★ alert の代わりにツールチップを表示 ★★★
        setShowTooltip(true);
        // 1.5秒後にツールチップを非表示にする
        setTimeout(() => setShowTooltip(false), 1500);
      })
      .catch(err => {
        console.error('コピー失敗:', err);
        // エラー時にも通知を出す場合 (任意)
        // alert('コピーに失敗しました。');
      });
  }, [generatedUrl]);

  const handleShare = useCallback(() => {
    const text = `"${link.quote}"`; // 共有テキスト (タイトル/著者がないため引用文のみ)
    // ★★★ URL 文字列の改行を削除 ★★★
    const shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(generatedUrl)}&text=${encodeURIComponent(text)}`;
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
    // ★★★ ルート要素に className を適用 ★★★
    <div className={`flex items-start p-3 mb-3 bg-white rounded-lg shadow hover:shadow-md transition-shadow duration-200 border border-gray-200 ${className}`}>
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
        {/* ★★★ アクションボタン (スタイル改善) ★★★ */}
        <div className="flex space-x-2 mt-2 relative"> {/* ★★★ relative を追加 ★★★ */}
          {/* コピーボタンとツールチップ */}
          <div className="relative"> {/* ツールチップの位置決め用コンテナ */}
            <button onClick={handleCopy} title="コピー" className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"><IconCopy /></button>
            {/* ★★★ ツールチップ要素 ★★★ */}
            {showTooltip && (
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-700 text-white text-xs rounded shadow-lg whitespace-nowrap z-10">
                コピーしました！
              </div>
            )}
          </div>
          <button onClick={handleShare} title="Xで共有" className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-black transition-colors"><IconShare /></button>
          <button onClick={handlePreview} title="プレビュー" className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-green-600 transition-colors"><IconPreview /></button>
          <button onClick={handleDelete} title="削除" className="p-1.5 rounded text-gray-500 hover:bg-gray-100 hover:text-red-600 transition-colors"><IconDelete /></button>
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
    // ★★★ items-center を削除してみる ★★★
    <div className="w-80 p-4 bg-gray-50 min-h-[100px] max-h-[500px] overflow-y-auto flex flex-col">
      {/* 見出しは左揃えのままにする */}
      <h1 className="text-lg font-semibold mb-4 text-gray-800 self-start w-full">保存した引用リンク</h1>
      {links.length === 0 ? (
        <p className="text-center text-gray-500 mt-6"> {/* メッセージは中央揃え */}
          まだ引用リンクはありません。
          <br />
          Zennの記事ページでテキストを選択し、
          <br />
          右クリックメニューから作成してください。
        </p>
      ) : (
        // ★★★ リストコンテナから flex を削除 ★★★
        <div className="w-full">
          {links.map(link => (
            // ★★★ LinkItem に mx-auto を適用 ★★★
            <LinkItem key={link.id} link={link} onDelete={handleDeleteLink} className="w-full mx-auto" />
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
