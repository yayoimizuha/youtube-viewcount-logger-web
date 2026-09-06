# YouTube / Instagramデータロガー Web

ブラウザ上でYouTube再生回数とInstagramフォロワー数をインタラクティブに可視化するSPAです。

## 特徴

- **DuckDB-Wasm**: ブラウザ内で高速なSQLクエリを実行
- **OPFS (Origin Private File System)**:
  データをブラウザにキャッシュして高速起動
- **zstd ストリーミング展開**: 展開結果を順次 OPFS
  に書き込み、ピークメモリを抑制
- **Apache ECharts**: 大量データの描画に対応した高性能グラフ
- **比較軸の切り替え**:
  総再生回数／1日あたり再生回数と、動画公開日にそろえる／実日付で見るを独立して切り替え
- **公開直後の伸びを比較**: 「1日あたり再生回数 ×
  動画公開日基準」は両対数グラフで表示し、対数空間での局所回帰による平滑化幅を調整可能
- **PWA対応**: オフラインでも動作可能
- **Instagram表示**: 143アカウントのフォロワー数推移を別タブで比較

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

以下のブラウザを対象にしています:

- Safari / iOS Safari 26+
- その他の Chromium / Firefox 系ブラウザは、OPFS・WebAssembly・Web Worker
  が利用できる最新版

Safari のプライベートブラウズでは OPFS
を利用できないため、通常のタブまたはホーム画面に追加した Web App
で利用してください。大きなデータファイルを端末内に保存するため、十分な空き容量も必要です。

## 技術スタック

- **ランタイム**: Deno
- **フレームワーク**: Vite + React + TypeScript
- **データベース**: DuckDB-Wasm
- **展開ライブラリ**: fzstd
- **グラフ**: Apache ECharts
- **キャッシュ**: OPFS (Origin Private File System)

## データソース

- YouTube／Instagramデータは
  [youtube-viewcount-logger-rust](https://github.com/yayoimizuha/youtube-viewcount-logger-rust)
  の GitHub Releases から取得されます
- 毎日自動で更新されています

## ライセンス

MIT
