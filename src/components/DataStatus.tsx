import type { DataState, DataMetadata } from '../types/index.ts';

interface DataStatusProps {
  metadata: DataMetadata | null;
  onCheckUpdates: () => void;
  onRedownload: () => void;
  dataState: DataState;
}

export function DataStatus({ metadata, onCheckUpdates, onRedownload, dataState }: DataStatusProps) {
  const isLoading = dataState.status === 'downloading' || 
                    dataState.status === 'decompressing' || 
                    dataState.status === 'checking';

  return (
    <div className="data-status card">
      <div className="status-info">
        <div 
          className={`status-indicator ${isLoading ? 'updating' : ''}`} 
        />
        <div>
          <strong>データステータス:</strong>{' '}
          {dataState.status === 'checking' && '更新を確認中...'}
          {dataState.status === 'downloading' && 'ダウンロード中...'}
          {dataState.status === 'decompressing' && '展開中...'}
          {dataState.status === 'ready' && '準備完了'}
          {dataState.status === 'update-available' && '新しいデータがあります'}
          {dataState.status === 'error' && 'エラー'}
          
          {metadata && dataState.status === 'ready' && (
            <span style={{ marginLeft: '12px', color: '#666' }}>
              データ日時: {metadata.dataDate}
            </span>
          )}
        </div>
      </div>

      <div className="status-actions">
        <button 
          className="btn btn-secondary btn-sm"
          onClick={onCheckUpdates}
          disabled={isLoading}
        >
          更新をチェック
        </button>
        <button 
          className="btn btn-primary btn-sm"
          onClick={onRedownload}
          disabled={isLoading}
        >
          再ダウンロード
        </button>
      </div>
    </div>
  );
}
