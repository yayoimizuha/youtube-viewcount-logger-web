import { useEffect, useState } from "react";
import type { DbState, QueryResult } from "../types/index.ts";
import { type ChartMetric, ViewCountChart } from "./charts/ViewCountChart.tsx";
import { InstagramFollowersChart } from "./charts/InstagramFollowersChart.tsx";
import { toTimestamp } from "../utils/format.ts";
import { quoteIdentifier } from "../utils/sql.ts";
import { reportError } from "../utils/logger.ts";

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

const MIN_SMOOTHING_DAYS = 1;
const MAX_SMOOTHING_DAYS = 30;
const DEFAULT_SMOOTHING_DAYS = 7;

export function Dashboard({ dbState, executeQuery }: DashboardProps) {
  const [activePlatform, setActivePlatform] = useState<"youtube" | "instagram">(
    "youtube",
  );
  const [stats, setStats] = useState<Stats | null>(null);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("total");
  const [alignByPublishedAt, setAlignByPublishedAt] = useState(false);
  const [smoothingDays, setSmoothingDays] = useState(DEFAULT_SMOOTHING_DAYS);
  const [smoothingInput, setSmoothingInput] = useState(
    String(DEFAULT_SMOOTHING_DAYS),
  );
  const [appliedSmoothingDays, setAppliedSmoothingDays] = useState(
    DEFAULT_SMOOTHING_DAYS,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // スライダー操作中に大きなグラフを毎フレーム再構築しない。
  useEffect(() => {
    const timeoutId = globalThis.setTimeout(
      () => setAppliedSmoothingDays(smoothingDays),
      180,
    );
    return () => globalThis.clearTimeout(timeoutId);
  }, [smoothingDays]);

  const updateSmoothingDays = (value: number) => {
    const normalized = Math.min(
      MAX_SMOOTHING_DAYS,
      Math.max(MIN_SMOOTHING_DAYS, Math.round(value)),
    );
    setSmoothingDays(normalized);
    setSmoothingInput(String(normalized));
  };

  const commitSmoothingInput = () => {
    const parsed = Number(smoothingInput);
    updateSmoothingDays(Number.isFinite(parsed) ? parsed : smoothingDays);
  };

  useEffect(() => {
    if (dbState.status !== "ready") return;

    const loadInitialData = async () => {
      setLoading(true);
      setError(null);

      try {
        // __source__テーブルからグループ情報を取得
        const sourceResult = await executeQuery(
          "SELECT DISTINCT db_key, screen_name FROM __source__",
        );
        if (!sourceResult) {
          throw new Error("グループ情報の取得に失敗しました");
        }

        // グループ情報を構築（db_keyをvalue、screen_nameを表示名として使用）
        const groupList: GroupInfo[] = sourceResult.rows
          .map((row: Record<string, unknown>): GroupInfo => ({
            name: row.db_key as string,
            displayName: row.screen_name as string,
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
          latestDate: "",
        });
      } catch (err) {
        reportError("dashboard:init", err);
        setError(
          err instanceof Error ? err.message : "データの読み込みに失敗しました",
        );
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
        let latestDate = "";

        const table = quoteIdentifier(selectedGroup);
        const countResult = await executeQuery(
          `SELECT COUNT(*) as count FROM ${table}`,
        );
        if (countResult && countResult.rows.length > 0) {
          totalDataPoints = countResult.rows[0].count as number;
        }

        // 最新の日付を取得 (indexカラムを使用)
        try {
          const dateResult = await executeQuery(`
            SELECT MAX("index") as latest_date FROM ${table}
          `);
          if (
            dateResult && dateResult.rows.length > 0 &&
            dateResult.rows[0].latest_date
          ) {
            latestDate = String(dateResult.rows[0].latest_date);
          }
        } catch {
          // 日付カラムがない場合は無視
        }

        setStats((prev) =>
          prev
            ? {
              ...prev,
              totalDataPoints,
              latestDate,
            }
            : null
        );
      } catch (err) {
        reportError("dashboard:group-stats", err);
      }
    };

    updateGroupStats();
  }, [selectedGroup, executeQuery]);

  if (dbState.status === "error") {
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
      <div
        className="platform-tabs"
        role="tablist"
        aria-label="表示するサービス"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activePlatform === "youtube"}
          className={`platform-tab ${
            activePlatform === "youtube" ? "active" : ""
          }`}
          onClick={() => setActivePlatform("youtube")}
        >
          YouTube
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePlatform === "instagram"}
          className={`platform-tab ${
            activePlatform === "instagram" ? "active" : ""
          }`}
          onClick={() => setActivePlatform("instagram")}
        >
          Instagram
        </button>
      </div>

      {activePlatform === "youtube"
        ? (
          <>
            {/* 統計カード */}
            {stats && (
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{stats.totalChannels}</div>
                  <div className="stat-label">グループ数</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {stats.totalDataPoints.toLocaleString()}
                  </div>
                  <div className="stat-label">記録日数</div>
                </div>
                {stats.latestDate && (
                  <div className="stat-card">
                    <div className="stat-value" style={{ fontSize: "1.25rem" }}>
                      {(() => {
                        return new Date(toTimestamp(stats.latestDate))
                          .toLocaleDateString("ja-JP");
                      })()}
                    </div>
                    <div className="stat-label">データ更新日</div>
                  </div>
                )}
              </div>
            )}

            {/* グループ選択 */}
            <div className="chart-container">
              <div className="chart-controls">
                <div
                  className="metric-tabs"
                  role="tablist"
                  aria-label="再生回数の指標"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartMetric === "total"}
                    className={`metric-tab ${
                      chartMetric === "total" ? "active" : ""
                    }`}
                    onClick={() => setChartMetric("total")}
                  >
                    総再生回数
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={chartMetric === "daily"}
                    className={`metric-tab ${
                      chartMetric === "daily" ? "active" : ""
                    }`}
                    onClick={() => setChartMetric("daily")}
                  >
                    1日あたり再生回数
                  </button>
                </div>
                <button
                  type="button"
                  className={`alignment-toggle ${
                    alignByPublishedAt ? "active" : ""
                  }`}
                  aria-pressed={alignByPublishedAt}
                  onClick={() => setAlignByPublishedAt((current) => !current)}
                >
                  公開日にそろえる
                </button>
                {chartMetric === "daily" && (
                  <div className="smoothing-control">
                    <label htmlFor="smoothing-days">平滑化</label>
                    <input
                      id="smoothing-days"
                      className="smoothing-slider"
                      type="range"
                      min={MIN_SMOOTHING_DAYS}
                      max={MAX_SMOOTHING_DAYS}
                      step="1"
                      value={smoothingDays}
                      aria-valuetext={smoothingDays === 1
                        ? "平滑化なし"
                        : alignByPublishedAt
                        ? `${smoothingDays}点の対数平滑化`
                        : `${smoothingDays}日移動平均`}
                      onChange={(event) =>
                        updateSmoothingDays(Number(event.target.value))}
                    />
                    <input
                      className="smoothing-number"
                      type="number"
                      min={MIN_SMOOTHING_DAYS}
                      max={MAX_SMOOTHING_DAYS}
                      step="1"
                      inputMode="numeric"
                      value={smoothingInput}
                      aria-label={alignByPublishedAt
                        ? "対数平滑化に使う近傍点数"
                        : "平滑化の日数"}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSmoothingInput(value);
                        const parsed = Number(value);
                        if (
                          value !== "" && Number.isInteger(parsed) &&
                          parsed >= MIN_SMOOTHING_DAYS &&
                          parsed <= MAX_SMOOTHING_DAYS
                        ) {
                          setSmoothingDays(parsed);
                        }
                      }}
                      onBlur={commitSmoothingInput}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          commitSmoothingInput();
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <span>{alignByPublishedAt ? "点" : "日"}</span>
                  </div>
                )}
              </div>
              <div className="chart-header">
                <h3 className="chart-title">
                  {chartMetric === "total" ? "総再生回数" : "1日あたり再生回数"}
                  {alignByPublishedAt
                    ? `（動画公開日基準${
                      chartMetric === "daily"
                        ? `・両対数${
                          appliedSmoothingDays > 1
                            ? `・対数平滑化${appliedSmoothingDays}点`
                            : ""
                        }`
                        : ""
                    }）`
                    : `${
                      chartMetric === "daily" && appliedSmoothingDays > 1
                        ? `（${appliedSmoothingDays}日移動平均）`
                        : ""
                    }の推移`}
                </h3>
                <div className="filters">
                  <select
                    className="filter-select"
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                  >
                    {groups.map((group) => (
                      <option key={group.name} value={group.name}>
                        {group.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {(alignByPublishedAt ||
                (chartMetric === "daily" && appliedSmoothingDays > 1)) && (
                <p className="chart-note">
                  {alignByPublishedAt && (
                    <>
                      動画公開日を0日目として表示します。公開後7日以内に記録が始まった動画だけが対象です。
                    </>
                  )}
                  {alignByPublishedAt && chartMetric === "daily" && (
                    <>
                      両対数表示のため、1日あたり再生回数が0以下の点は表示されません。
                    </>
                  )}
                  {chartMetric === "daily" && appliedSmoothingDays > 1 && (
                    alignByPublishedAt
                      ? (
                        <>
                          日数と再生回数を対数化し、近傍{appliedSmoothingDays}
                          点による局所線形回帰で平滑化しています。
                        </>
                      )
                      : (
                        <>
                          直近{appliedSmoothingDays}日間にある記録の平均値で平滑化しています。
                          期間がそろう前は最初の観測値で先頭を補完します。
                        </>
                      )
                  )}
                </p>
              )}

              {selectedGroup && (
                <ViewCountChart
                  tableName={selectedGroup}
                  metric={chartMetric}
                  alignByPublishedAt={alignByPublishedAt}
                  smoothingWindow={chartMetric === "daily"
                    ? appliedSmoothingDays
                    : 1}
                  executeQuery={executeQuery}
                />
              )}
            </div>
          </>
        )
        : <InstagramFollowersChart executeQuery={executeQuery} />}
    </div>
  );
}
