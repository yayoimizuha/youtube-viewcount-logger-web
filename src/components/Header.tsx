export function Header() {
  return (
    <header className="header">
      <div className="header-main">
        <h1>YouTube ViewCount Logger Graph Page</h1>
        {/* <p>Hello!Projectやアップフロント所属アーティストのYouTube再生回数を可視化</p> */}
      </div>

      <div className="header-twitter" >
        <p><strong>Twitter毎日更新中！</strong></p>
        <a className="twitter-handle" href="https://x.com/hello_counter" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}><b style={{ fontSize: "2rem" }}>𝕏</b> @hello_counter</a>
        <p>Twitterで毎日，再生回数の表とグラフ，再生回数トップ3を公開しています！ぜひフォローしてください！</p>
      </div>
      <div className="header-description">
        <p>
          ハロー!プロジェクト及びアップフロント所属のアーティストのYouTubeにあるMVのプレイリストを毎日自動で巡回して再生回数を取得し、データベースにまとめています。
        </p>
        <p>
          Twitterで毎日表とグラフを生成して投稿していますが、画像で拡大したり、特定の曲のみを比較したりは出来ません。
          そこで、オンラインでグラフを操作して比較できるようなツールを作成することにしました。
        </p>

        <div className="header-tips">
          <span className="tip-label">📖 使い方</span>
          <ul>
            <li>グラフ右部の凡例の色線部分を<strong>ダブルクリック</strong>すると、その曲だけのグラフを表示できます</li>
            <li>グラフ上で<strong>クリック＆ドラッグ</strong>すると、その部分を拡大表示できます</li>
            <li>グラフの何もないところを<strong>ダブルクリック</strong>すると拡大表示をリセットできます</li>
            <li>グラフ右上部の操作ボタンも利用してください</li>
          </ul>
        </div>
      </div>
    </header>
  );
}
