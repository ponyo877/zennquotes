import { readFileSync } from 'node:fs';
const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
/**
 * ZennQuotes Manifest
 */
const manifest = {
    manifest_version: 3,
    default_locale: 'en',
    name: 'ZennQuotes', // 拡張機能名
    version: packageJson.version,
    description: 'Zennの記事から引用文を含むOGPリンクを生成します。', // 拡張機能の説明
    host_permissions: ['https://zenn.dev/*'], // Zennドメインに限定
    permissions: [
        'storage', // chrome.storage.local を使うため
        'contextMenus', // 右クリックメニューを追加するため
        'notifications', // 通知を表示するため
        'activeTab', // 現在のタブのURLなどを取得するため (scriptingと併用)
        'scripting', // content script を実行するため
    ],
    background: {
        service_worker: 'background.js', // src/background/index.ts からビルドされる想定
        type: 'module',
    },
    action: {
        default_popup: 'popup/index.html', // ポップアップ
        default_icon: {
            16: 'icon-34.png', // 小さいアイコン (34pxで代用)
            34: 'icon-34.png',
            128: 'icon-128.png'
        },
    },
    icons: {
        16: 'icon-34.png',
        34: 'icon-34.png',
        128: 'icon-128.png',
    },
    content_scripts: [
        {
            // Zennの記事ページに限定
            matches: ['https://zenn.dev/*/*/articles/*'],
            // 実行するスクリプト (src/content/index.ts からビルドされる想定)
            // 現在は background で処理しているため、必須ではないが念のため残す
            js: ['content/index.iife.js'],
            // 適用するCSS (public/content.css を想定)
            css: ['content.css'], // 空ファイルだが読み込み指定は残す
        },
        // 不要な content-ui スクリプトは削除
    ],
    web_accessible_resources: [
        {
            // content script から参照される可能性のあるリソースを指定
            resources: ['icon-128.png', 'icon-34.png', 'content.css'],
            matches: ['https://zenn.dev/*'], // Zennドメインに限定
        },
    ],
    // 不要な設定は削除
    // "default_locale": "en",
    // "browser_specific_settings": { ... },
    // "options_page": "options/index.html",
    // "chrome_url_overrides": { ... },
    // "devtools_page": "devtools/index.html",
    // "side_panel": { ... },
};
export default manifest;
