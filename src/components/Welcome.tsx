import type { DataState, DataMetadata } from '../types/index.ts';
import { formatFileSize } from '../utils/download.ts';

interface WelcomeProps {
  dataState: DataState;
  onDownload: () => void;
  onCheckUpdates: () => void;
  metadata: DataMetadata | null;
}

export function Welcome({ dataState, onDownload, onCheckUpdates, metadata }: WelcomeProps) {
  const isLoading = dataState.status === 'downloading' || 
                    dataState.status === 'decompressing' || 
                    dataState.status === 'checking';

  return (
    <div className="welcome card">
      <h2 className="welcome-title">YouTube再生回数ロガー</h2>
      
      <div className="welcome-description">
        <p>
          ハロー!プロジェクト及びアップフロント所属のアーティストのYouTubeにあるMVのプレイリストを毎日自動で巡回して再生回数を取得し、データベースにまとめています。
        </p>
        <p>
          このツールでは、グラフをインタラクティブに操作して、特定の曲の再生回数を比較したり、期間を絞り込んで表示することができます。
        </p>
      </div>

      <div className="feature-list">
        <div className="feature-item">
          <h4>📊 インタラクティブなグラフ</h4>
          <p>凡例をクリックして特定の曲のみ表示、ドラッグで期間を拡大</p>
        </div>
        <div className="feature-item">
          <h4>💾 オフライン対応</h4>
          <p>データはブラウザにキャッシュされ、オフラインでも閲覧可能</p>
        </div>
        <div className="feature-item">
          <h4>🔄 毎日更新</h4>
          <p>データは毎日自動で更新され、最新の再生回数を確認できます</p>
        </div>
      </div>

      {metadata && (
        <div className="status-info" style={{ marginBottom: '20px', justifyContent: 'center' }}>
          <p>
            キャッシュ済みデータあり（データ日時: {metadata.dataDate}）
          </p>
        </div>
      )}

      {dataState.status === 'error' && (
        <div className="error-message">
          {dataState.error}
        </div>
      )}

      {dataState.status === 'update-available' && (
        <div className="card" style={{ background: '#e3f2fd', marginBottom: '20px' }}>
          <p>
            <strong>新しいデータがあります！</strong>
            {dataState.totalBytes && (
              <span> (約 {formatFileSize(dataState.totalBytes)})</span>
            )}
          </p>
        </div>
      )}

      {(dataState.status === 'downloading' || dataState.status === 'decompressing') && (
        <div className="progress-container">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${dataState.progress || 0}%` }}
            />
          </div>
          <div className="progress-text">
            <span>{dataState.message}</span>
            {dataState.downloadedBytes && (
              <span>
                {formatFileSize(dataState.downloadedBytes)}
                {dataState.totalBytes && ` / ${formatFileSize(dataState.totalBytes)}`}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '24px' }}>
        <button 
          className="btn btn-primary"
          onClick={onDownload}
          disabled={isLoading}
        >
          {isLoading && <span className="spinner" style={{ width: '16px', height: '16px', marginRight: '8px' }} />}
          {metadata ? 'データを再ダウンロード' : 'データをダウンロード'}
        </button>
        
        {metadata && (
          <button 
            className="btn btn-secondary"
            onClick={onCheckUpdates}
            disabled={isLoading}
          >
            更新をチェック
          </button>
        )}
      </div>

      {/* <p style={{ marginTop: '16px', fontSize: '0.875rem', color: '#666' }}>
        ※ 初回ダウンロードには約100MB程度のデータ転送が必要です
      </p> */}
    </div>
  );
}
