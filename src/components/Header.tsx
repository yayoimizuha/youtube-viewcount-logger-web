export function Header() {
  return (
    <header className="header">
      <div className="header-main">
        <h1>YouTube / Instagram Logger Graph Page</h1>
        {/* <p>Hello!Projectやアップフロント所属アーティストのYouTube再生回数を可視化</p> */}
      </div>

      <div className="header-twitter">
        <p>
          <strong>Twitter毎日更新中！</strong>
        </p>
        <a
          className="twitter-handle"
          href="https://x.com/hello_counter"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <b style={{ fontSize: "2rem" }}>𝕏</b> @hello_counter
        </a>
        <p>
          Twitterで毎日，再生回数の表とグラフ，再生回数トップ3を公開しています！ぜひフォローしてください！
        </p>
      </div>
      <details className="header-description">
        <summary>このサイトについて・使い方</summary>
        <div className="header-description-content">
          <p>
            ハロー!プロジェクト及びアップフロント所属アーティストのYouTube再生回数とInstagramフォロワー数を毎日取得し、データベースにまとめています。
          </p>
          <p>
            Twitterで毎日表とグラフを生成して投稿していますが、画像で拡大したり、特定の曲のみを比較したりは出来ません。
            そこで、オンラインでグラフを操作して比較できるようなツールを作成することにしました。
          </p>

          <div className="header-tips">
            <span className="tip-label">📖 使い方</span>
            <ul>
              <li>
                凡例を<strong>
                  タップ／クリック
                </strong>すると曲の表示を切り替え、素早く2回操作するとその曲だけを表示できます
              </li>
              <li>
                パソコンではグラフ上を<strong>
                  ドラッグ
                </strong>、スマートフォンでは<strong>
                  ピンチ
                </strong>して期間を拡大できます
              </li>
              <li>
                グラフの何もないところを<strong>
                  ダブルクリック
                </strong>すると拡大表示をリセットできます
              </li>
              <li>グラフ右上部の操作ボタンも利用してください</li>
            </ul>
          </div>
        </div>
      </details>
    </header>
  );
}
