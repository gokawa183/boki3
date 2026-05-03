# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要

日商簿記3級学習アプリ。ビルドツール・依存パッケージなし。GitHub Pages で静的ファイルとして動作する。

## ファイル構成

| ファイル | 役割 | 編集頻度 |
|---------|------|---------|
| `index.html` | HTMLシェル（タブ・静的コンテンツ・スクリプト参照） | 低 |
| `style.css` | 全CSS（CSS変数・コンポーネント）| 低 |
| `data.js` | 教育コンテンツデータ（問題・レッスン・仕訳）| **高** |
| `app.js` | アプリロジック（UI・ストレージ・模擬試験）| 中 |
| `CLAUDE.md` | このファイル | - |

`data.js` だけ編集すれば問題・レッスンの追加・修正ができる。

### スクリプト読み込み順（`index.html` 末尾）

```html
<script src="data.js"></script>   <!-- 先：定数・データを定義 -->
<script src="app.js"></script>    <!-- 後：データを参照するロジック -->
```

`type="module"` は**使用しない**。HTML 内の `onclick="..."` ハンドラがグローバルスコープの関数を参照するため。

## デプロイ

```
git add index.html style.css data.js app.js
git commit -m "..."
git push origin main
```

ローカルの `boki3.html`（旧単一ファイル）は参照・バックアップ用として残してある。

## データ構造（data.js）

### `rawQs`（練習問題 150問）

```js
{
  cat: string,   // カテゴリ（下記 cats 配列の値）
  lk:  string,   // レッスンキー（lessons オブジェクトのキー）
  q:   string,   // 問題文
  opts: string[],// 選択肢 ★ opts[0] が**必ず正解**
  exp: string    // 解説
}
```

カテゴリ: `'現金・預金'` / `'売掛買掛'` / `'固定資産'` / `'決算整理'` / `'その他'`

### `lessons`（基礎学習 15テーマ）

キー例: `'deposit'`, `'cashcontent'`, `'koguchi'`, `'kakeuri'`, `'kotei'`, `'mibarai'` …

各レッスン: `{ title, sections:[{h,p,eg}], practice:[{q,opts,ans,exp}] }`

### `journals`（仕訳辞典 47パターン）

各エントリ: `{ group, title, d:[借方行], c:[貸方行], note }`

### `QUIZ_COUNT`

1セッションの出題数（デフォルト `10`）。

## タブ構成

`showTab(tab, el)` で切り替え。`index.html` のタブボタンの `onclick` 第1引数が tab ID。

| tab引数 | タブ名 |
|---------|--------|
| `quiz` | 練習問題 |
| `stats` | 成績 |
| `study` | 基礎学習 |
| `exam` | 試験対策 |
| `q2study` | 第2問対策 |
| `q3study` | 第3問対策 |
| `kessan` | 決算対策 |
| `mock` | 模擬試験 |
| `reference` | 用語集 |
| `journal` | 仕訳辞典 |

## ストレージ（app.js）

```js
const useCloudStorage = window.storage && typeof window.storage.get === 'function';
```

`window.storage` API（非同期）が利用できない場合は `localStorage` にフォールバック。キー: `'boki3_v1'`。

保存データ: `{ statsData, pqState, missedQs, visited }`

## 主要関数（app.js）

| 関数 | 役割 |
|------|------|
| `startApp(tab)` | ウェルカム画面からアプリ起動 |
| `shuffleQ(raw)` | opts をシャッフル・正解インデックスを追跡 |
| `loadQs()` | カテゴリフィルタ後にランダム10問選出 |
| `renderQ()` | 現在の問題を描画 |
| `pick(i)` | 選択肢クリック・正誤判定・stats更新 |
| `renderStudyTab()` | 基礎学習タブ全体を描画 |
| `startMock()` | 模擬試験開始（60分タイマー） |
| `submitMock()` | 模擬試験採点・結果表示 |
| `checkKessan(no,correct,ansId,resId,expId)` | 決算対策の入力問題を採点 |

## CSS設計（style.css）

`:root` CSS変数でテーマを一元管理:

- `--ink` / `--paper`: 基本文字・背景
- `--accent` / `--accent2`: 強調色（赤系・青系）
- `--gold`: サブ強調色
- `--cg` / `--wg`: 正解色・不正解色

## コミュニケーション

- ユーザーへの確認・質問・コマンド実行前の確認はすべて**日本語**で行う

## rawQs の品質チェック観点

問題文を確認・追加するときは以下の点に注意する:

- 問題文に**借方・貸方の両方が特定できるコンテキスト**があるか（例：「売掛金の回収として〜を受け取った」など）
- 同じ問題文・選択肢が**異なるカテゴリに重複していないか**
- 解説の増減方向（「増えた（左）」「発生した（左）」など）が仕訳と一致しているか

## 修正依頼を受けたときのワークフロー

1. 原因を見つけて修正する
2. 修正内容を CLAUDE.md に反映させる
3. GitHub にプッシュする（`git add` → `git commit` → `git push origin master:main`）
