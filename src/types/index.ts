// データメタデータの型定義（date.txtの内容を保持）
export interface DataMetadata {
  dataDate: string; // date.txtの内容 (例: "2025-11-29 08:02:42")
  lastDownloadedAt: string; // ローカル取得日時 (ISO 8601)
}

// データ状態の型定義
export type DataStateStatus = 
  | 'idle' 
  | 'checking' 
  | 'downloading' 
  | 'decompressing' 
  | 'ready' 
  | 'error'
  | 'update-available';

export interface DataState {
  status: DataStateStatus;
  progress?: number; // 0-100
  downloadedBytes?: number;
  totalBytes?: number;
  message?: string;
  error?: string;
}

// DB状態の型定義
export type DbStateStatus = 
  | 'uninitialized' 
  | 'initializing' 
  | 'ready' 
  | 'error';

export interface DbState {
  status: DbStateStatus;
  error?: string;
}

// クエリ結果の型定義
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
}

// チャンネル情報
export interface Channel {
  id: string;
  name: string;
  totalViews: number;
}

// 動画情報
export interface Video {
  id: string;
  title: string;
  channelId: string;
  channelName: string;
  viewCount: number;
  publishedAt: string;
}

// 再生数データポイント
export interface ViewCountDataPoint {
  date: string;
  viewCount: number;
}

// グラフ用データ
export interface ChartData {
  name: string;
  data: ViewCountDataPoint[];
}
