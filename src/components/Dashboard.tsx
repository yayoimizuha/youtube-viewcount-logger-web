import { useState, useEffect } from 'react';
import type { DbState, QueryResult } from '../types/index.ts';
import { ViewCountChart } from './charts/ViewCountChart.tsx';

interface DashboardProps {
  dbState: DbState;
  executeQuery: (sql: string) => Promise<QueryResult | null>;
}

interface Stats {
  totalVideos: number;
  totalChannels: number;
  totalDataPoints: number;
  latestDate: string;
}

interface GroupInfo {
  name: string;
  displayName: string;
}

export function Dashboard({ dbState, executeQuery }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dbState.status !== 'ready') return;

    const loadInitialData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // __source__テーブルからグループ情報を取得
        const sourceResult = await executeQuery("SELECT DISTINCT db_key, screen_name FROM __source__");
        if (!sourceResult) {
          throw new Error('グループ情報の取得に失敗しました');
        }

        // グループ情報を構築（db_keyをvalue、screen_nameを表示名として使用）
        const groupList: GroupInfo[] = sourceResult.rows
          .map((row: Record<string, unknown>): GroupInfo => ({
            name: row.db_key as string,
            displayName: row.screen_name as string
          }))
          .filter((g: GroupInfo) => g.name && g.displayName); // 無効なエントリを除外

        setGroups(groupList);

        // 最初のグループを選択
        if (groupList.length > 0 && !selectedGroup) {
          setSelectedGroup(groupList[0].name);
        }

        setStats({
          totalVideos: 0,
          totalChannels: groupList.length,
          totalDataPoints: 0,
          latestDate: ''
        });

      } catch (err) {
        console.error('Failed to load initial data:', err);
        setError(err instanceof Error ? err.message : 'データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [dbState.status, executeQuery]);

  // 選択されたグループが変更されたら統計情報を更新
  useEffect(() => {
    if (!selectedGroup) return;

    const updateGroupStats = async () => {
      try {
        let totalDataPoints = 0;
        let latestDate = '';

        const countResult = await executeQuery(`SELECT COUNT(*) as count FROM "${selectedGroup}"`);
        if (countResult && countResult.rows.length > 0) {
          totalDataPoints = countResult.rows[0].count as number;
        }

        // 最新の日付を取得 (indexカラムを使用)
        try {
          const dateResult = await executeQuery(`
            SELECT MAX("index") as latest_date FROM "${selectedGroup}"
          `);
          if (dateResult && dateResult.rows.length > 0 && dateResult.rows[0].latest_date) {
            latestDate = String(dateResult.rows[0].latest_date);
          }
        } catch {
          // 日付カラムがない場合は無視
        }

        setStats(prev => prev ? {
          ...prev,
          totalDataPoints,
          latestDate
        } : null);
      } catch (err) {
        console.error('Failed to update group stats:', err);
      }
    };

    updateGroupStats();
  }, [selectedGroup, executeQuery]);

  if (dbState.status === 'error') {
    return (
      <div className="error-message">
        <h3>データベースエラー</h3>
        <p>{dbState.error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>データを読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <h3>エラー</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* 統計カード */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalChannels}</div>
            <div className="stat-label">グループ数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalDataPoints.toLocaleString()}</div>
            <div className="stat-label">記録日数</div>
          </div>
          {stats.latestDate && (
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: '1.25rem' }}>
                {(() => {
                  // UnixTimeの場合（秒単位）をミリ秒に変換
                  const timestamp = Number(stats.latestDate);
                  if (!isNaN(timestamp)) {
                    // 秒単位のUnixTimeをミリ秒に変換（10桁以下なら秒単位と判断）
                    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
                    return new Date(ms).toLocaleDateString('ja-JP');
                  }
                  return new Date(stats.latestDate).toLocaleDateString('ja-JP');
                })()}
              </div>
              <div className="stat-label">データ更新日</div>
            </div>
          )}
        </div>
      )}

      {/* グループ選択 */}
      <div className="chart-container">
        <div className="chart-header">
          <h3 className="chart-title">再生回数推移</h3>
          <div className="filters">
            <select 
              className="filter-select"
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              {groups.map(group => (
                <option key={group.name} value={group.name}>
                  {group.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {selectedGroup && (
          <ViewCountChart
            tableName={selectedGroup}
            executeQuery={executeQuery}
          />
        )}
      </div>

    </div>
  );
}
