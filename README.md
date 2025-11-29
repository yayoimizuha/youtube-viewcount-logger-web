# YouTube再生回数ロガー Web

ブラウザ上で YouTube 再生回数データをインタラクティブに可視化する SPA です。

## 特徴

- **DuckDB-Wasm**: ブラウザ内で高速なSQLクエリを実行
- **OPFS (Origin Private File System)**: データをブラウザにキャッシュして高速起動
- **zstd ストリーミング展開**: 大容量データを効率的にダウンロード・展開
- **Apache ECharts**: 大量データの描画に対応した高性能グラフ
- **PWA対応**: オフラインでも動作可能

## セットアップ

### 必要環境

- [Deno](https://deno.land/) v1.40 以上

### 開発

```bash
# 依存関係のインストール
deno install

# 開発サーバーの起動
deno task dev
```

### ビルド

```bash
deno task build
```

### プレビュー

```bash
deno task preview
```

## ブラウザ要件

以下のブラウザの最新版が必要です:

- Google Chrome 102+
- Microsoft Edge 102+
- Opera 88+
- Chrome for Android 102+

**注意**: Safari および Firefox は OPFS の同期アクセス API をサポートしていないため、現時点では動作しません。

## 技術スタック

- **ランタイム**: Deno
- **フレームワーク**: Vite + React + TypeScript
- **データベース**: DuckDB-Wasm
- **展開ライブラリ**: fzstd
- **グラフ**: Apache ECharts
- **キャッシュ**: OPFS (Origin Private File System)

## データソース

- データは [youtube-viewcount-logger-rust](https://github.com/yayoimizuha/youtube-viewcount-logger-rust) の GitHub Releases から取得されます
- 毎日自動で更新されています

## ライセンス

MIT
