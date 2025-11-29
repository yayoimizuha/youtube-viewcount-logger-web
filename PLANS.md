# youtube-viewcount-logger-web-renew PLANS

## ゴール

ブラウザ上で `data.duckdb.zst` を扱い、YouTube
再生数データをインタラクティブに可視化できる SPA を、最新の Web
フロントエンド技術で実装する。

- DuckDB-Wasm で DuckDB データベース (`data.duckdb`)
  をブラウザ内でクエリ可能にする
- OPFS (Origin Private File System) を使ってブラウザに DB
  ファイルをキャッシュする
- ユーザー操作によりのみデータファイルをダウンロード
  (自動ダウンロードは行わない)
- 「最新」判定のロジックを実装し、必要なときのみファイルを更新する
- クエリ結果をグラフ描画ライブラリでビジュアライズする

## 全体アーキテクチャ案

- ランタイム: Deno (開発・ビルド環境)
- フレームワーク: Vite + React + TypeScript
- ビルドツール: Vite
- 言語: TypeScript
- UI ライブラリ: React + 任意の軽量コンポーネント / CSS (最初はプレーン CSS /
  Tailwind 未定)
- グラフ描画: Apache ECharts (大量データの描画パフォーマンス重視)
- DuckDB: `@duckdb/duckdb-wasm`
- zstd: `fzstd` (ストリーミング展開・WebAssembly 対応)
- ストレージ: OPFS (File System Access API) + `FileSystemSyncAccessHandle` /
  `FileSystemFileHandle`

## 機能要件 (詳細)

1. データ取得
   - GitHub Releases 最新版:
     `https://github.com/yayoimizuha/youtube-viewcount-logger-rust/releases/latest/download/data.duckdb.zst`
   - ユーザーが「データをダウンロード」ボタンを押したときのみフェッチを実行
   - ダウンロード前に HEAD リクエストで `Content-Length`
     ヘッダを取得し、概算サイズ (MB 単位) をユーザーに通知
   - `fzstd` と `DecompressionStream` (またはTransformStream)
     を用い、ダウンロードしながらストリーミング展開を行う
   - 進捗表示 (ダウンロード中のスピナー/プログレスバー +
     ダウンロード済みバイト数)

2. キャッシュ & アップデート (OPFS)
   - OPFS 内に展開済みの `data.duckdb` を保存 (起動高速化のため)
   - メタデータとして以下を保存
     - `Last-Modified` ヘッダ (RFC 2822 形式のタイムスタンプ)
     - ローカル取得日時 (lastDownloadedAt)
     - 元 URL
     - 任意で ETag (可能であれば)
   - アプリ起動時
     - OPFS に既存ファイルがあるか確認
     - メタデータを読み込み、"最終更新日" を UI に表示
   - ユーザーが「更新チェック」を選択したときのみネットワークアクセス
     - HEAD リクエストで `Last-Modified` ヘッダを取得
     - 保存済みメタデータの `Last-Modified` と比較
     - サーバー側のタイムスタンプが新しい場合のみ「新しいデータがあります」と通知
     - 最終更新日はUTCに変換して保存し、確認を行う。
   - ユーザーが「ダウンロード/再ダウンロード」を実行
   - GET リクエストで `Last-Modified` ヘッダを取得してメタデータに保存
   - ストリーム展開して OPFS に保存

3. データベースロード & クエリ
   - OPFS 上の `data.duckdb` (展開済み) を DuckDB-Wasm に登録
     (`registerFileHandle`)
   - 展開処理が不要なため、即座にクエリ実行可能
   - DB から取得したタイムスタンプはタイムゾーン(JST)が付与されている。
   - UI 表示時はブラウザのロケールに合わせて表示
   - 代表的なクエリ
     - チャンネルごとの総再生数
     - 日別再生数推移 (時系列)
     - 上位 N 動画

4. グラフ描画
   - Apache ECharts (`echarts-for-react`) を使用
   - 時系列ラインチャート
   - ランキングバーグラフ
   - フィルタ UI (チャンネル / 期間など)

5. UX
   - 初回起動時: 簡単な説明と「データをダウンロード」CTA
   - モバイル/デスクトップ両対応のレスポンシブデザイン
   - ダウンロード/解凍/ロード/クエリ各フェーズの状態表示

6. PWA 化
   - Service Worker を用いたオフライン対応
   - manifest.json の作成 (アプリ名、アイコン、テーマカラーなど)
   - OPFS にキャッシュ済みのデータがあれば完全オフラインでクエリ・可視化可能
   - インストール可能な Web アプリとして動作

## 実装ステップ (ロードマップ)

### 1. プロジェクト初期化

- [ ] Deno + Vite + React + TypeScript プロジェクトの作成 (`deno.json` 設定含む)
- [ ] `old/index.html` のデザイン・要素を確認し、必要な UI を洗い出す
- [ ] ESLint / Prettier 設定 (任意)

### 2. 依存パッケージ導入

- [ ] `@duckdb/duckdb-wasm` の導入 & 最小サンプル
- [ ] `fzstd` の導入 & ストリーミング展開のサンプル実装
- [ ] `echarts-for-react` の導入と簡易表示

### 3. OPFS ユーティリティ層

- [ ] OPFS 利用可能かの feature detection 実装
- [ ] `data.duckdb` (Raw) を保存/読み込みするラッパー
- [ ] メタデータ (JSON) の保存/取得 API
- [ ] エラーハンドリング (ブラウザ非対応時のフォールバックメッセージ)

### 4. ダウンロード & 更新ロジック

- [ ] 「ダウンロード」ボタンと「更新チェック」ボタンの UI 実装
- [ ] fetch による `data.duckdb.zst` ダウンロード (ユーザー操作起点のみ)
- [ ] 受信ストリームを `fzstd` で展開しつつ OPFS に保存 (Pipeline 実装)
- [ ] HEAD リクエストで `Last-Modified` ヘッダを取得する関数実装
- [ ] 保存済みメタデータの `Last-Modified` と比較するロジック実装
  - パース: `new Date(lastModifiedHeader)` でタイムスタンプ化
  - 比較: `serverDate > cachedDate` なら更新あり
- [ ] GET リクエスト実行時に `Last-Modified` をメタデータとして保存
- [ ] UI に更新有無を表示 (「最新です」 or 「新しいデータがあります」)

### 5. DuckDB + zstd 連携

- [ ] OPFS 上の展開済み `data.duckdb` を DuckDB-Wasm に登録
- [ ] 簡易クエリ (テーブル一覧/レコード数) を走らせる

### 6. アプリ UI 実装

- [ ] 初期画面 (説明 + ダウンロードボタン)
- [ ] ダッシュボード画面 (基本統計 + グラフコンポーネント)
- [ ] クエリ/フィルタ UI コンポーネント
- [ ] 状態管理 (React hooks or Zustand/Recoil などシンプルなもの)

### 7. パフォーマンス & UX 改善

- [ ] 大規模データ時のクエリ/描画の最適化
- [ ] 部分集計クエリのプリセット化
- [ ] ローディング/エラーメッセージの改善

### 8. PWA 化

- [ ] Service Worker の実装 (Vite PWA Plugin 使用)
- [ ] `manifest.json` の作成 (アプリメタデータ、アイコン設定)
- [ ] オフライン時の動作確認とフォールバック UI
- [ ] インストール促進 UI (任意)

### 9. ドキュメント整備

- [ ] `README.md` にセットアップ/開発手順/ブラウザ要件を記載
- [ ] 今後の拡張アイデア (例: チャンネル比較、ブックマーク機能など) をメモ
