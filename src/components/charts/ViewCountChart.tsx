import { useCallback, useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import type { QueryResult } from "../../types/index.ts";
import {
  calendarDaysFromPublishedAt,
  daysBetween,
  escapeHtml,
  movingAverage,
  smoothLogLog,
  toDailyViewCounts,
  toTimestamp,
} from "../../utils/format.ts";
import { quoteIdentifier, quoteLiteral } from "../../utils/sql.ts";
import { reportError } from "../../utils/logger.ts";

interface ViewCountChartProps {
  tableName: string;
  metric: ChartMetric;
  alignByPublishedAt: boolean;
  smoothingWindow: number;
  executeQuery: (sql: string) => Promise<QueryResult | null>;
}

export type ChartMetric = "total" | "daily";

interface CachedTableData {
  rawSeriesColumns: string[];
  timestamps: number[];
  totalDataByColumn: Map<string, (number | null)[]>;
  dailyDataCache: Map<string, Map<string, (number | null)[]>>;
  titleMap: Map<string, string>;
  publishedAtMap: Map<string, number>;
}

export function ViewCountChart(
  {
    tableName,
    metric,
    alignByPublishedAt,
    smoothingWindow,
    executeQuery,
  }: ViewCountChartProps,
) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const tableDataCache = useRef(
    new Map<string, Promise<CachedTableData>>(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // チャートインスタンスを安全に取得/作成
  const getChartInstance = useCallback(() => {
    if (!chartRef.current) return null;

    // 既存インスタンスがdisposedでないか確認
    if (chartInstance.current && !chartInstance.current.isDisposed()) {
      return chartInstance.current;
    }

    // 新しいインスタンスを作成
    chartInstance.current = echarts.init(chartRef.current);
    return chartInstance.current;
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;

    // チャートインスタンスを取得
    const chart = getChartInstance();
    if (!chart) return;
    let cancelled = false;

    const loadChartData = async () => {
      setLoading(true);
      setError(null);

      try {
        const useDoubleLogScale = metric === "daily" && alignByPublishedAt;
        // 指標切替では再利用しつつ、別グループの大きな配列は保持し続けない。
        for (const cachedTableName of tableDataCache.current.keys()) {
          if (cachedTableName !== tableName) {
            tableDataCache.current.delete(cachedTableName);
          }
        }
        let tableDataPromise = tableDataCache.current.get(tableName);
        if (!tableDataPromise) {
          tableDataPromise = (async (): Promise<CachedTableData> => {
            const table = quoteIdentifier(tableName);
            const dataResult = await executeQuery(
              `SELECT * FROM ${table} ORDER BY 1`,
            );
            if (!dataResult || dataResult.rows.length === 0) {
              throw new Error("データがありません");
            }

            const dateColumn = dataResult.columns[0];
            const rawSeriesColumns = dataResult.columns.slice(1);
            const timestamps = dataResult.rows.map((row) =>
              toTimestamp(row[dateColumn])
            );
            const totalDataByColumn = new Map<
              string,
              (number | null)[]
            >();
            rawSeriesColumns.forEach((column) => {
              totalDataByColumn.set(
                column,
                dataResult.rows.map((row) => {
                  const value = row[column];
                  return value === null || value === 0 ? null : Number(value);
                }),
              );
            });

            const titleMap = new Map<string, string>();
            const publishedAtMap = new Map<string, number>();
            if (rawSeriesColumns.length > 0) {
              const ids = rawSeriesColumns.map(quoteLiteral).join(",");
              const titleResult = await executeQuery(
                `SELECT youtube_id, cleaned_title, published_at FROM __title__ WHERE youtube_id IN (${ids})`,
              );
              titleResult?.rows.forEach((row) => {
                const id = String(row.youtube_id);
                titleMap.set(id, String(row.cleaned_title || id));
                if (row.published_at != null) {
                  publishedAtMap.set(id, toTimestamp(row.published_at));
                }
              });
            }

            return {
              rawSeriesColumns,
              timestamps,
              totalDataByColumn,
              dailyDataCache: new Map(),
              titleMap,
              publishedAtMap,
            };
          })();
          tableDataCache.current.set(tableName, tableDataPromise);
          void tableDataPromise.catch(() => {
            if (tableDataCache.current.get(tableName) === tableDataPromise) {
              tableDataCache.current.delete(tableName);
            }
          });
        }

        const tableData = await tableDataPromise;
        if (cancelled) return;
        const {
          rawSeriesColumns,
          timestamps,
          totalDataByColumn,
          dailyDataCache,
          titleMap,
          publishedAtMap,
        } = tableData;

        let displayedDataByColumn = totalDataByColumn;
        if (metric === "daily") {
          let baseDailyData = dailyDataCache.get("raw");
          if (!baseDailyData) {
            baseDailyData = new Map<string, (number | null)[]>();
            totalDataByColumn.forEach((totals, column) => {
              baseDailyData?.set(
                column,
                toDailyViewCounts(totals, timestamps),
              );
            });
            dailyDataCache.set("raw", baseDailyData);
          }

          if (smoothingWindow === 1) {
            displayedDataByColumn = baseDailyData;
          } else {
            const smoothingMode = useDoubleLogScale ? "log-log" : "linear";
            const cacheKey = `${smoothingMode}:${smoothingWindow}`;
            const cachedDailyData = dailyDataCache.get(cacheKey);
            if (cachedDailyData) {
              displayedDataByColumn = cachedDailyData;
            } else {
              // スライダーで多数の日数を試しても、巨大な配列は直近分だけ保持する。
              for (const key of dailyDataCache.keys()) {
                if (key !== "raw") dailyDataCache.delete(key);
              }
              const smoothedData = new Map<string, (number | null)[]>();
              baseDailyData.forEach((values, column) => {
                const publishedAt = publishedAtMap.get(column);
                const smoothedValues = useDoubleLogScale &&
                    publishedAt !== undefined
                  ? smoothLogLog(
                    values,
                    timestamps.map((timestamp) =>
                      calendarDaysFromPublishedAt(publishedAt, timestamp) + 1
                    ),
                    smoothingWindow,
                  )
                  : movingAverage(values, timestamps, smoothingWindow);
                smoothedData.set(
                  column,
                  smoothedValues,
                );
              });
              dailyDataCache.set(cacheKey, smoothedData);
              displayedDataByColumn = smoothedData;
            }
          }
        }

        // 表示中の指標の最新値に基づいて系列をソート（降順）
        const latestValueByColumn = new Map<string, number>();
        displayedDataByColumn.forEach((values, column) => {
          let latestValue = 0;
          for (let index = values.length - 1; index >= 0; index--) {
            if (values[index] !== null) {
              latestValue = values[index] ?? 0;
              break;
            }
          }
          latestValueByColumn.set(column, latestValue);
        });
        let seriesColumns = [...rawSeriesColumns].sort((a, b) =>
          (latestValueByColumn.get(b) ?? 0) -
          (latestValueByColumn.get(a) ?? 0)
        );

        if (alignByPublishedAt) {
          seriesColumns = seriesColumns.filter((column) => {
            const publishedAt = publishedAtMap.get(column);
            const totals = totalDataByColumn.get(column);
            if (publishedAt === undefined || !totals) return false;
            const firstRecordIndex = totals.findIndex((value) =>
              value !== null
            );
            if (firstRecordIndex < 0) return false;
            const firstRecordDay = calendarDaysFromPublishedAt(
              publishedAt,
              timestamps[firstRecordIndex],
            );
            return firstRecordDay >= 0 && firstRecordDay <= 7;
          });
          if (seriesColumns.length === 0) {
            throw new Error(
              "公開後7日以内に記録が始まった動画がありません",
            );
          }
        }

        // 系列データを構築（時間軸用に [timestamp, value] 形式）
        const series: echarts.SeriesOption[] = seriesColumns.map((
          col: string,
        ) => ({
          name: titleMap.get(col) || col,
          type: "line",
          data: (displayedDataByColumn.get(col) ?? []).flatMap(
            (value, index) => {
              if (!alignByPublishedAt) return [[timestamps[index], value]];
              const publishedAt = publishedAtMap.get(col);
              if (publishedAt === undefined) return [];
              const elapsedDays = calendarDaysFromPublishedAt(
                publishedAt,
                timestamps[index],
              );
              if (elapsedDays < 0) return [];
              // 対数軸では0日目を扱えないため x は +1 し、表示時に戻す。
              const xValue = useDoubleLogScale ? elapsedDays + 1 : elapsedDays;
              // 0以下の日次値（訂正による減少を含む）は対数軸に描画できない。
              const yValue = useDoubleLogScale && (value === null || value <= 0)
                ? null
                : value;
              return [[xValue, yValue]];
            },
          ),
          connectNulls: true,
          showSymbol: false,
          emphasis: {
            focus: "series",
          },
          triggerLineEvent: true,
        }));

        // 凡例用の曲名リスト
        const legendData = seriesColumns.map((col: string) =>
          titleMap.get(col) || col
        );

        // タイトルからYouTube IDへの逆引きマップを作成
        const titleToIdMap = new Map<string, string>();
        titleMap.forEach((title, id) => {
          titleToIdMap.set(title, id);
        });
        // IDそのものも登録（titleMapに無いカラムの場合）
        seriesColumns.forEach((col: string) => {
          if (!titleToIdMap.has(col)) {
            titleToIdMap.set(col, col);
          }
        });

        // サムネイルURLのキャッシュ（videoId -> 有効なURL | 'loading' | null）
        const thumbnailCache = new Map<string, string | null>();

        // 現在ホバー中のvideoIdを追跡（ロード完了時のツールチップ更新用）
        let currentHoveredVideoId: string | null = null;

        // サムネイルURLを確認する関数（ホバー時に遅延実行）
        const findValidThumbnail = async (videoId: string): Promise<string> => {
          // キャッシュ済みの場合はそれを返す
          const cached = thumbnailCache.get(videoId);
          if (cached && cached !== "loading") {
            return cached;
          }

          // ロード中マーカーをセット
          thumbnailCache.set(videoId, "loading");

          const qualities = [
            "maxresdefault",
            "sddefault",
            "hqdefault",
            "mqdefault",
            "default",
          ];
          let resultUrl = `https://img.youtube.com/vi/${videoId}/default.jpg`;

          for (const quality of qualities) {
            const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
            try {
              const response = await fetch(url, { method: "HEAD" });
              if (response.ok) {
                resultUrl = url;
                break;
              }
            } catch {
              // 次の品質を試す
            }
          }

          thumbnailCache.set(videoId, resultUrl);

          // ロード完了時に同じvideoIdがまだホバー中ならツールチップ内の画像を更新
          if (currentHoveredVideoId === videoId) {
            // DOM経由でツールチップ内の画像を更新
            const tooltipImg = document.querySelector(".echarts-tooltip img") as
              | HTMLImageElement
              | null;
            if (tooltipImg) {
              tooltipImg.src = resultUrl;
            }
          }

          return resultUrl;
        };

        // タイムスタンプからデータインデックスへのマップを作成
        const timestampToIndexMap = new Map<number, number>();
        timestamps.forEach((ts: number, index: number) => {
          timestampToIndexMap.set(ts, index);
        });

        // 系列名からデータ配列へのマップを作成（前日データ取得用）
        const seriesDataMap = new Map<string, (number | null)[]>();
        seriesColumns.forEach((col: string) => {
          const seriesName = titleMap.get(col) || col;
          const data = totalDataByColumn.get(col) ?? [];
          seriesDataMap.set(seriesName, data);
        });

        // 日数差を計算するヘルパー関数
        const getDaysDiff = (currentIndex: number): number => {
          if (currentIndex <= 0) return 1;
          return daysBetween(
            timestamps[currentIndex - 1],
            timestamps[currentIndex],
          );
        };

        // ホバー中の系列名を追跡
        let hoveredSeriesName: string | null = null;

        // チャートオプションを設定
        const formatYAxisValue = (value: number): string => {
          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
          if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
          return String(value);
        };

        // Canvas描画ではCSSのfont-familyを継承しないため、明示的に渡す。
        const chartFontFamily = globalThis.getComputedStyle(document.body)
          .getPropertyValue("--font-family-ja")
          .trim() || globalThis.getComputedStyle(document.body).fontFamily;

        const yAxis: NonNullable<echarts.EChartsOption["yAxis"]> =
          useDoubleLogScale
            ? {
              type: "log",
              min: 1,
              logBase: 10,
              name: "再生回数 / 日",
              axisLabel: {
                formatter: formatYAxisValue,
                fontFamily: chartFontFamily,
              },
              nameTextStyle: { fontFamily: chartFontFamily },
            }
            : {
              type: "value",
              name: metric === "daily" ? "再生回数 / 日" : "総再生回数",
              axisLabel: {
                formatter: formatYAxisValue,
                fontFamily: chartFontFamily,
              },
              nameTextStyle: { fontFamily: chartFontFamily },
            };

        const option: echarts.EChartsOption = {
          animation: false,
          textStyle: { fontFamily: chartFontFamily },
          tooltip: {
            trigger: "axis",
            confine: true,
            textStyle: { fontFamily: chartFontFamily },
            axisPointer: {
              type: "cross",
            },
            formatter: (params) => {
              if (!Array.isArray(params) || params.length === 0) return "";
              // 時間軸の場合、valueは[timestamp, value]の配列
              const firstParam = params[0] as { value?: [number, number] };
              const timestamp = firstParam.value?.[0];
              const dateStr = alignByPublishedAt
                ? `公開${
                  useDoubleLogScale ? (timestamp ?? 1) - 1 : timestamp ?? 0
                }日目`
                : timestamp
                ? new Date(timestamp).toLocaleDateString("ja-JP")
                : "";

              // ホバー中の系列があれば、その系列のみを表示
              const displayParams = hoveredSeriesName
                ? params.filter((param) =>
                  param.seriesName === hoveredSeriesName
                )
                : params;

              // 単一系列の場合はサムネイル付きの詳細表示
              if (hoveredSeriesName && displayParams.length === 1) {
                const param = displayParams[0];
                const paramValue = param.value as [number, number] | null;
                if (
                  paramValue !== null && paramValue !== undefined &&
                  paramValue[1] !== null
                ) {
                  const value = Number(paramValue[1]).toLocaleString();
                  const valueSuffix = metric === "daily"
                    ? ` /日${
                      smoothingWindow > 1
                        ? useDoubleLogScale
                          ? `（対数平滑化・${smoothingWindow}点）`
                          : `（${smoothingWindow}日移動平均）`
                        : ""
                    }`
                    : "";
                  const seriesName = param.seriesName as string;
                  const videoId = titleToIdMap.get(seriesName) || seriesName;

                  // 現在ホバー中のvideoIdを更新
                  currentHoveredVideoId = videoId;

                  // 総再生回数ビューでは、補足として前回記録との差分も表示する。
                  let diffStr = "";
                  const currentIndex = timestampToIndexMap.get(paramValue[0]);
                  if (
                    metric === "total" && !alignByPublishedAt &&
                    currentIndex !== undefined &&
                    currentIndex > 0
                  ) {
                    const seriesData = seriesDataMap.get(seriesName);
                    if (seriesData) {
                      const currentValue = paramValue[1];
                      const prevValue = seriesData[currentIndex - 1];
                      if (prevValue !== null && currentValue !== null) {
                        const diff = currentValue - prevValue;
                        const daysDiff = getDaysDiff(currentIndex);
                        const dailyViewcount = Math.round(diff / daysDiff);
                        const diffSign = dailyViewcount >= 0 ? "+" : "";
                        const daysLabel = daysDiff > 1
                          ? ` (${daysDiff}日平均)`
                          : "/日";
                        diffStr = `<div style="color: ${
                          dailyViewcount >= 0 ? "#4caf50" : "#f44336"
                        }; font-weight: bold;">${diffSign}${dailyViewcount.toLocaleString()}${daysLabel}</div>`;
                      }
                    }
                  } else if (
                    metric === "daily" && !alignByPublishedAt &&
                    currentIndex !== undefined &&
                    currentIndex > 0
                  ) {
                    const daysDiff = getDaysDiff(currentIndex);
                    if (daysDiff > 1) {
                      diffStr =
                        `<div style="color: #666;">前回記録から${daysDiff}日平均</div>`;
                    }
                  }

                  // サムネイルURLを取得（キャッシュから取得、無ければ遅延ロード開始）
                  const cachedUrl = thumbnailCache.get(videoId);
                  let thumbnailUrl: string;

                  if (cachedUrl && cachedUrl !== "loading") {
                    // キャッシュ済み
                    thumbnailUrl = cachedUrl;
                  } else if (cachedUrl === "loading") {
                    // ロード中
                    thumbnailUrl =
                      `https://img.youtube.com/vi/${videoId}/default.jpg`;
                  } else {
                    // 初回アクセス - 遅延ロード開始（非同期で実行、結果は次回ホバー時に反映）
                    thumbnailUrl =
                      `https://img.youtube.com/vi/${videoId}/default.jpg`;
                    findValidThumbnail(videoId); // 非同期で実行（await しない）
                  }
                  const safeSeriesName = escapeHtml(seriesName);
                  const safeThumbnailUrl = escapeHtml(thumbnailUrl);

                  return `
                    <div style="text-align: center;">
                      <img
                        src="${safeThumbnailUrl}"
                        alt=""
                        style="max-width: 200px; max-height: 120px; border-radius: 4px; margin-bottom: 8px;"
                      />
                      <div><strong>${dateStr}</strong></div>
                      <div style="margin-top: 4px;">${param.marker} ${safeSeriesName}</div>
                      <div style="font-size: 1.1em; font-weight: bold;">${value}${valueSuffix}</div>
                      ${diffStr}
                    </div>
                  `;
                }
              }

              // 複数系列の場合は通常表示
              let html = `<strong>${dateStr}</strong><br/>`;
              displayParams.forEach((param) => {
                const paramValue = param.value as [number, number] | null;
                if (
                  paramValue !== null && paramValue !== undefined &&
                  paramValue[1] !== null
                ) {
                  const value = Number(paramValue[1]).toLocaleString();
                  html += `${param.marker} ${
                    escapeHtml(param.seriesName)
                  }: ${value}${
                    metric === "daily"
                      ? ` /日${
                        smoothingWindow > 1
                          ? useDoubleLogScale
                            ? `（対数平滑化・${smoothingWindow}点）`
                            : `（${smoothingWindow}日平均）`
                          : ""
                      }`
                      : ""
                  }<br/>`;
                }
              });
              return html;
            },
          },
          legend: {
            type: "scroll",
            orient: "vertical",
            right: 10,
            top: 40,
            bottom: 60,
            data: legendData,
            textStyle: {
              fontFamily: chartFontFamily,
              width: 250, // 凡例テキストの最大幅
              overflow: "truncate", // 'truncate'で打ち切り、'break'で折り返し
              ellipsis: "...", // 打ち切り時の省略記号
            },
            tooltip: {
              show: true, // ホバー時に完全な名前を表示
            },
          },
          grid: {
            left: "3%",
            right: "300px",
            bottom: "5%",
            top: "10%",
            containLabel: true,
          },
          toolbox: {
            feature: {
              dataZoom: {
                yAxisIndex: "all", // Y軸方向のズームも有効化
              },
              restore: {},
              saveAsImage: {
                name: `${tableName}-${metric}${
                  alignByPublishedAt ? "-published-at" : ""
                }${
                  smoothingWindow > 1
                    ? useDoubleLogScale
                      ? `-${smoothingWindow}point-log-smoothing`
                      : `-${smoothingWindow}day-average`
                    : ""
                }`,
                pixelRatio: 2,
              },
            },
          },
          dataZoom: [
            {
              type: "inside",
              disabled: !globalThis.matchMedia("(pointer: coarse)").matches,
              zoomOnMouseWheel: false,
              moveOnMouseWheel: false,
              start: 0,
              end: 100,
            },
            {
              show: false,
              start: 0,
              end: 100,
            },
          ],
          xAxis: {
            type: useDoubleLogScale
              ? "log"
              : alignByPublishedAt
              ? "value"
              : "time",
            name: alignByPublishedAt ? "公開からの日数" : undefined,
            min: useDoubleLogScale ? 1 : alignByPublishedAt ? 0 : undefined,
            logBase: useDoubleLogScale ? 10 : undefined,
            axisLabel: {
              fontFamily: chartFontFamily,
              formatter: (value: number) => {
                if (alignByPublishedAt) {
                  return `${useDoubleLogScale ? value - 1 : value}日`;
                }
                const date = new Date(value);
                return `${date.getFullYear()}/${
                  date.getMonth() + 1
                }/${date.getDate()}`;
              },
              rotate: 45,
            },
            nameTextStyle: { fontFamily: chartFontFamily },
          },
          yAxis,
          series,
          media: [{
            query: { maxWidth: 700 },
            option: {
              legend: {
                orient: "horizontal",
                left: 0,
                right: 0,
                top: "auto",
                bottom: 0,
                height: 72,
              },
              grid: {
                left: 8,
                right: 8,
                top: 24,
                bottom: 112,
                containLabel: true,
              },
              toolbox: { right: 0, top: 0 },
            },
          }],
        };

        // チャートがまだ有効か確認してから設定
        if (cancelled) return;
        const currentChart = getChartInstance();
        if (currentChart && !currentChart.isDisposed()) {
          // 既存のイベントハンドラを解除（テーブル切り替え時の重複登録を防ぐ）
          currentChart.off("mouseover");
          currentChart.off("mouseout");
          currentChart.off("legendselectchanged");

          currentChart.setOption(option, true);

          // デフォルトでズームモードをアクティブにする
          currentChart.dispatchAction({
            type: "takeGlobalCursor",
            key: "dataZoomSelect",
            dataZoomSelectActive: true,
          });

          // 系列のホバーイベントを追跡（線上のマウスイベント）
          currentChart.on("mouseover", "series.line", (params) => {
            const p = params as { seriesName?: string };
            if (p.seriesName) {
              hoveredSeriesName = p.seriesName;
            }
          });

          currentChart.on("mouseout", "series.line", () => {
            hoveredSeriesName = null;
          });

          // 凡例ダブルクリックで特定の系列のみ表示
          let lastLegendClickTime = 0;
          let lastLegendClickName: string | null = null;

          currentChart.on("legendselectchanged", (params) => {
            const p = params as {
              name: string;
              selected: Record<string, boolean>;
            };
            const currentTime = Date.now();

            // ダブルクリック判定（300ms以内の同じ凡例クリック）
            if (
              lastLegendClickName === p.name &&
              currentTime - lastLegendClickTime < 300
            ) {
              // この系列のみ選択し、それ以外は非表示
              legendData.forEach((name: string) => {
                if (name === p.name) {
                  currentChart.dispatchAction({
                    type: "legendSelect",
                    name,
                  });
                } else {
                  currentChart.dispatchAction({
                    type: "legendUnSelect",
                    name,
                  });
                }
              });

              // ダブルクリック後はリセット
              lastLegendClickName = null;
              lastLegendClickTime = 0;
            } else {
              // シングルクリック - 記録を更新（通常のトグル動作はEChartsに任せる）
              lastLegendClickName = p.name;
              lastLegendClickTime = currentTime;
            }
          });
        }
      } catch (err) {
        if (cancelled) return;
        reportError("chart:youtube", err);
        setError(
          err instanceof Error
            ? err.message
            : "グラフデータの読み込みに失敗しました",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadChartData();

    // iOS Safari のアドレスバーや端末回転による要素サイズ変更も追従する。
    const resizeObserver = new ResizeObserver(() => {
      const currentChart = chartInstance.current;
      if (currentChart && !currentChart.isDisposed()) {
        currentChart.resize();
      }
    });
    resizeObserver.observe(chartRef.current);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      chart.off("mouseover");
      chart.off("mouseout");
      chart.off("legendselectchanged");
    };
  }, [
    tableName,
    metric,
    alignByPublishedAt,
    smoothingWindow,
    executeQuery,
    getChartInstance,
  ]);

  // クリーンアップ (コンポーネントのアンマウント時のみ)
  useEffect(() => {
    return () => {
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <div className="error-message">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="chart-body">
      {loading && (
        <div
          className="loading"
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(255,255,255,0.8)",
            zIndex: 10,
          }}
        >
          <div className="spinner" />
          <p>グラフを読み込み中...</p>
        </div>
      )}
      <div ref={chartRef} className="view-count-chart" />
    </div>
  );
}
