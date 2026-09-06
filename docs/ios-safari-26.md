# iOS Safari 26+ 対応メモ

## 結論

iOS Safari 26 は、このアプリが使う OPFS、Web Worker、WebAssembly を利用できる。従来の README にあった「OPFS の同期アクセス API がないため Safari 非対応」という制約は、現在の実装には当てはまらない。

ただし、iPhone ではデスクトップより厳しいメモリ上限とストレージ制約がある。Safari 対応の中心は API のポリフィルではなく、DB の全量コピーを避けること、タッチ操作と可変 viewport に対応すること、実機で中断系を検証することである。

## 今回対応した項目

- zstd の圧縮データと展開済み DB を全量メモリに保持せず、展開チャンクを OPFS へ順次保存する
- OPFS の `File` を DuckDB-Wasm の `BROWSER_FILEREADER` で登録し、DB 全体の `ArrayBuffer` 化を避ける
- 再ダウンロード後に古い DuckDB 接続を破棄し、新しい DB を開き直す
- `dvh`、safe-area、`viewport-fit=cover`、44px 以上の操作領域を適用する
- 狭幅時の凡例配置、タッチ端末でのピンチズーム、要素サイズ変更時のグラフ再描画に対応する
- 初回ロードで ECharts を遅延ロードし、初期 JavaScript を小さくする
- Safari で使えない古いブラウザ案内と、存在しない PWA アイコン参照を修正する
- 動的な SQL 識別子・文字列と ECharts ツールチップの HTML をエスケープする

## リリース前の実機テスト

最低限、iOS 26 の実機で次を確認する。

1. 通常タブで初回ダウンロードが完了し、ページ再読込後にキャッシュから起動できる
2. ダウンロード中の画面ロック、Safari のバックグラウンド移行、通信切断後に既存 DB が壊れない
3. データ更新後、グラフが古い DB 接続を使わず新しい値になる
4. 縦・横画面で凡例、ツールチップ、セレクト、グラフが画面外へはみ出さない
5. タップによる系列切替、ダブルタップ相当の系列絞り込み、ピンチズームがスクロールと競合しない
6. ホーム画面へ追加した Web App でオンライン起動後、オフライン再起動できる
7. 空き容量不足時に保存が失敗しても、以前のキャッシュが利用可能である
8. プライベートブラウズでは OPFS が利用できないことを分かりやすく案内する

## 残る改善候補

- 現在の DuckDB-Wasm は古いため、現行安定版への更新を別 PR で行い、DB 互換性と Safari 実機を回帰テストする
- ダウンロードに `AbortController` を追加し、画面遷移・再試行時に明示的に中断できるようにする
- `navigator.storage.estimate()` でダウンロード前に空き容量の目安を表示する
- グラフの全行・全系列取得が大きくなった場合は、期間指定と系列指定を SQL 側へ移す
- iOS 実機を含む BrowserStack 等の回帰テストを追加する。Chromium のモバイル viewport テストだけでは WebKit 固有のメモリ・OPFS 挙動は保証できない

## 参考

- WebKit: <https://webkit.org/blog/12257/the-file-system-access-api-with-origin-private-file-system/>
- Safari 26 の変更点: <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>
- DuckDB-Wasm の起動と bundle 選択: <https://duckdb.org/docs/current/clients/wasm/instantiation>
- DuckDB-Wasm の制約: <https://duckdb.org/docs/current/clients/wasm/overview>
