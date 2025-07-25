<!-- @ts-nocheck -->
<script lang="ts">
  import { 
    Card, 
    Button, 
    Textarea, 
    Table, 
    TableHead, 
    TableHeadCell, 
    TableBody, 
    TableBodyRow, 
    TableBodyCell,
    Badge,
    Alert,
    Spinner
  } from 'flowbite-svelte';
  import { 
    PlaySolid, 
    FloppyDiskSolid, 
    FolderOpenSolid, 
    ClipboardSolid,
    DownloadSolid 
  } from 'flowbite-svelte-icons';

  let sqlQuery = `-- DuckDB クエリエディタ
SELECT 
  video_title,
  view_count,
  published_at,
  channel_name
FROM youtube_videos 
WHERE view_count > 10000 
ORDER BY view_count DESC 
LIMIT 10;`;

  let queryResults = [
    {
      video_title: "SvelteKit チュートリアル",
      view_count: 25000,
      published_at: "2024-01-15",
      channel_name: "Tech Channel"
    },
    {
      video_title: "DuckDB 入門",
      view_count: 18500,
      published_at: "2024-02-10", 
      channel_name: "Data Science Hub"
    },
    {
      video_title: "WebAssembly の基礎",
      view_count: 12300,
      published_at: "2024-03-05",
      channel_name: "Dev Community"
    }
  ];

  let isExecuting = false;
  let queryError: string | null = null;
  let executionTime = "142ms";
  let resultCount = 3;

  function executeQuery() {
    isExecuting = true;
    queryError = null;
    
    // 実際のクエリ実行ロジックはここに実装予定
    setTimeout(() => {
      isExecuting = false;
    }, 1000);
  }

  function saveQuery() {
    // クエリ保存ロジックは後で実装
    console.log("クエリを保存");
  }

  function loadQuery() {
    // クエリ読み込みロジックは後で実装
    console.log("クエリを読み込み");
  }

  function copyQuery() {
    navigator.clipboard.writeText(sqlQuery);
  }

  function exportResults() {
    // 結果エクスポートロジックは後で実装
    console.log("結果をエクスポート");
  }
</script>

<div class="container mx-auto p-6 space-y-6">
  <!-- ヘッダー -->
  <div class="text-center">
    <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-2">
      DuckDB クエリエディタ
    </h1>
    <p class="text-lg text-gray-600 dark:text-gray-400">
      YouTube 視聴回数データを分析・可視化
    </p>
  </div>

  <!-- クエリエディタセクション -->
  <Card class="w-full">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
        SQLクエリエディタ
      </h2>
      
      <!-- ツールバー -->
      <div class="flex space-x-2">
        <Button on:click={executeQuery} disabled={isExecuting} size="sm">
          {#if isExecuting}
            <Spinner class="w-4 h-4 mr-2" />
          {:else}
            <PlaySolid class="w-4 h-4 mr-2" />
          {/if}
          実行
        </Button>
        
        <Button on:click={saveQuery} size="sm" color="alternative">
          <FloppyDiskSolid class="w-4 h-4 mr-2" />
          保存
        </Button>
        
        <Button on:click={loadQuery} size="sm" color="alternative">
          <FolderOpenSolid class="w-4 h-4 mr-2" />
          読み込み
        </Button>
        
        <Button on:click={copyQuery} size="sm" color="alternative">
          <ClipboardSolid class="w-4 h-4 mr-2" />
          コピー
        </Button>
      </div>
    </div>

    <Textarea 
      bind:value={sqlQuery}
      rows={12}
      placeholder="SQLクエリを入力してください..."
      class="font-mono text-sm"
    />

    {#if queryError}
      <Alert color="red" class="mt-4">
        <span class="font-medium">エラー:</span> {queryError}
      </Alert>
    {/if}
  </Card>

  <!-- 実行ボタンとステータス -->
  <div class="flex items-center justify-between">
    <div class="flex items-center space-x-4">
      <Button 
        on:click={executeQuery} 
        disabled={isExecuting}
        size="lg"
        color="primary"
      >
        {#if isExecuting}
          <Spinner class="w-4 h-4 mr-2" />
          実行中...
        {:else}
          <PlaySolid class="w-4 h-4 mr-2" />
          クエリを実行
        {/if}
      </Button>
      
      {#if !isExecuting && resultCount > 0}
        <div class="flex items-center space-x-2">
          <Badge color="green">{resultCount}件の結果</Badge>
          <Badge color="blue">実行時間: {executionTime}</Badge>
        </div>
      {/if}
    </div>

    {#if resultCount > 0}
      <!-- @ts-ignore -->
      <Button on:click={exportResults} color="alternative">
        <DownloadSolid class="w-4 h-4 mr-2" />
        結果をエクスポート
      </Button>
    {/if}
  </div>

  <!-- 結果表示セクション -->
  {#if resultCount > 0}
    <Card class="w-full">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
          クエリ結果
        </h2>
        <Badge color="indigo">{resultCount}行</Badge>
      </div>

      <Table hoverable={true} classes={{ div: 'relative overflow-x-auto' }}>
        <TableHead>
          <TableHeadCell>動画タイトル</TableHeadCell>
          <TableHeadCell>視聴回数</TableHeadCell>
          <TableHeadCell>公開日</TableHeadCell>
          <TableHeadCell>チャンネル名</TableHeadCell>
        </TableHead>
        <TableBody>
          {#each queryResults as result}
            <TableBodyRow>
              <TableBodyCell class="font-medium text-gray-900 dark:text-white">
                {result.video_title}
              </TableBodyCell>
              <TableBodyCell>
                <Badge color="purple">
                  {result.view_count.toLocaleString()}
                </Badge>
              </TableBodyCell>
              <TableBodyCell>{result.published_at}</TableBodyCell>
              <TableBodyCell>{result.channel_name}</TableBodyCell>
            </TableBodyRow>
          {/each}
        </TableBody>
      </Table>
    </Card>
  {:else if !isExecuting}
    <Card class="w-full">
      <div class="text-center py-12">
        <div class="text-gray-400 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 1v10h12V5H4z" clip-rule="evenodd" />
            <path fill-rule="evenodd" d="M6 8a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zM6 11a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clip-rule="evenodd" />
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          結果なし
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          クエリを実行して結果を表示します
        </p>
      </div>
    </Card>
  {/if}

  <!-- 実行中の表示 -->
  {#if isExecuting}
    <Card class="w-full">
      <div class="text-center py-12">
        <Spinner class="w-8 h-8 mx-auto mb-4" />
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          クエリを実行中...
        </h3>
        <p class="text-gray-600 dark:text-gray-400">
          DuckDBでデータを処理しています
        </p>
      </div>
    </Card>
  {/if}
</div>
