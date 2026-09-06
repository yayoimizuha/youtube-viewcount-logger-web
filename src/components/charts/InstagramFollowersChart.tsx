import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import type { QueryResult } from "../../types/index.ts";
import { escapeHtml, toTimestamp } from "../../utils/format.ts";
import { quoteLiteral } from "../../utils/sql.ts";
import { reportError } from "../../utils/logger.ts";

interface InstagramFollowersChartProps {
  executeQuery: (sql: string) => Promise<QueryResult | null>;
}

interface InstagramSeries {
  username: string;
  name: string;
  profileHash: string | null;
  data: [number, number][];
}

function detectImageMimeType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return "image/webp";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  return "image/jpeg";
}

function toImageBytes(value: unknown): Uint8Array<ArrayBuffer> | null {
  let bytes: Uint8Array | null = null;
  if (value instanceof Uint8Array) {
    bytes = value;
  } else if (value instanceof ArrayBuffer) {
    bytes = new Uint8Array(value);
  } else if (ArrayBuffer.isView(value)) {
    bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (!bytes || bytes.byteLength === 0) return null;
  const copy: Uint8Array<ArrayBuffer> = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function InstagramFollowersChart(
  { executeQuery }: InstagramFollowersChartProps,
) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({ accounts: 0, latestDate: 0 });

  useEffect(() => {
    if (!chartRef.current) return;
    let cancelled = false;
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;
    const objectUrls = new Set<string>();

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await executeQuery(`
          SELECT date, username, followers_count, full_name, profile_pic_hash
          FROM misc.instagram_stats
          WHERE followers_count IS NOT NULL
          ORDER BY date, username
        `);
        if (!result || result.rows.length === 0) {
          throw new Error("Instagramのフォロワー履歴がありません");
        }

        const byUsername = new Map<string, InstagramSeries>();
        let latestDate = 0;
        result.rows.forEach((row) => {
          const username = String(row.username);
          const timestamp = toTimestamp(row.date);
          const followers = Number(row.followers_count);
          latestDate = Math.max(latestDate, timestamp);
          let account = byUsername.get(username);
          if (!account) {
            account = {
              username,
              name: `${String(row.full_name || username)} (@${username})`,
              profileHash: row.profile_pic_hash
                ? String(row.profile_pic_hash)
                : null,
              data: [],
            };
            byUsername.set(username, account);
          } else if (row.full_name) {
            account.name = `${String(row.full_name)} (@${username})`;
          }
          if (row.profile_pic_hash) {
            account.profileHash = String(row.profile_pic_hash);
          }
          account.data.push([timestamp, followers]);
        });

        const accounts = [...byUsername.values()].sort((a, b) =>
          (b.data.at(-1)?.[1] ?? 0) - (a.data.at(-1)?.[1] ?? 0)
        );
        const accountByName = new Map(
          accounts.map((account) => [account.name, account]),
        );
        const profileHashes = [
          ...new Set(
            accounts.flatMap((account) =>
              account.profileHash ? [account.profileHash] : []
            ),
          ),
        ];
        const profileUrlByHash = new Map<string, string>();
        if (profileHashes.length > 0) {
          const imageResult = await executeQuery(
            `SELECT hash, image_blob FROM misc.instagram_profile_pics WHERE hash IN (${
              profileHashes.map(quoteLiteral).join(",")
            })`,
          );
          imageResult?.rows.forEach((row) => {
            const bytes = toImageBytes(row.image_blob);
            if (!bytes) return;
            const url = URL.createObjectURL(
              new Blob([bytes], { type: detectImageMimeType(bytes) }),
            );
            objectUrls.add(url);
            profileUrlByHash.set(String(row.hash), url);
          });
        }
        const chartFontFamily = globalThis.getComputedStyle(document.body)
          .getPropertyValue("--font-family-ja")
          .trim() || globalThis.getComputedStyle(document.body).fontFamily;
        let hoveredSeriesName: string | null = null;
        const axisTooltipCache = new Map<number, string>();
        const maxCachedTooltips = 32;

        const option: echarts.EChartsOption = {
          animation: false,
          textStyle: { fontFamily: chartFontFamily },
          tooltip: {
            trigger: "axis",
            confine: true,
            textStyle: { fontFamily: chartFontFamily },
            axisPointer: { type: "cross" },
            formatter: (params) => {
              if (!Array.isArray(params) || params.length === 0) return "";
              const firstParam = params[0] as { value?: [number, number] };
              const timestamp = firstParam.value?.[0];
              const dateStr = timestamp
                ? new Date(timestamp).toLocaleDateString("ja-JP")
                : "";
              if (hoveredSeriesName) {
                const param = params.find((candidate) =>
                  candidate.seriesName === hoveredSeriesName
                );
                if (!param) return "";
                const value = param.value as [number, number] | null;
                if (value && value[1] !== null) {
                  const account = accountByName.get(param.seriesName ?? "");
                  const profileHash = account?.profileHash;
                  const profileUrl = profileHash
                    ? profileUrlByHash.get(profileHash)
                    : undefined;
                  const avatar = profileUrl
                    ? `<img src="${
                      escapeHtml(profileUrl)
                    }" alt="" style="width:72px;height:72px;border-radius:50%;object-fit:cover;margin-bottom:8px;">`
                    : "";
                  return `<div style="text-align:center">${avatar}<div><strong>${dateStr}</strong></div><div style="margin-top:4px">${
                    param.marker ?? ""
                  } ${
                    escapeHtml(param.seriesName)
                  }</div><div style="font-size:1.1em;font-weight:bold">${
                    Number(value[1]).toLocaleString()
                  }人</div></div>`;
                }
                return "";
              }

              if (timestamp !== undefined) {
                const cachedTooltip = axisTooltipCache.get(timestamp);
                if (cachedTooltip !== undefined) return cachedTooltip;
              }

              let html = `<strong>${dateStr}</strong><br/>`;
              params.forEach((param) => {
                const value = param.value as [number, number] | null;
                if (value && value[1] !== null) {
                  html += `${param.marker ?? ""} ${
                    escapeHtml(param.seriesName)
                  }: ${Number(value[1]).toLocaleString()}人<br/>`;
                }
              });
              if (timestamp !== undefined) {
                if (axisTooltipCache.size >= maxCachedTooltips) {
                  const oldestTimestamp = axisTooltipCache.keys().next().value;
                  if (oldestTimestamp !== undefined) {
                    axisTooltipCache.delete(oldestTimestamp);
                  }
                }
                axisTooltipCache.set(timestamp, html);
              }
              return html;
            },
          },
          legend: {
            type: "scroll",
            orient: "vertical",
            right: 10,
            top: 40,
            bottom: 60,
            data: accounts.map((account) => account.name),
            textStyle: {
              fontFamily: chartFontFamily,
              width: 250,
              overflow: "truncate",
              ellipsis: "...",
            },
            tooltip: { show: true },
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
              dataZoom: { yAxisIndex: "all" },
              restore: {},
              saveAsImage: { name: "instagram-followers", pixelRatio: 2 },
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
            { show: false, start: 0, end: 100 },
          ],
          xAxis: {
            type: "time",
            axisLabel: { fontFamily: chartFontFamily },
          },
          yAxis: {
            type: "value",
            name: "フォロワー数",
            axisLabel: {
              fontFamily: chartFontFamily,
              formatter: (value: number) =>
                value >= 1_000_000
                  ? `${(value / 1_000_000).toFixed(1)}M`
                  : value >= 1_000
                  ? `${(value / 1_000).toFixed(0)}K`
                  : String(value),
            },
            nameTextStyle: { fontFamily: chartFontFamily },
          },
          series: accounts.map((account) => ({
            name: account.name,
            type: "line",
            data: account.data,
            connectNulls: true,
            showSymbol: false,
            emphasis: { focus: "series" },
            triggerLineEvent: true,
          })),
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

        if (cancelled) return;
        chart.off("mouseover");
        chart.off("mouseout");
        chart.off("legendselectchanged");
        chart.setOption(option, true);
        chart.dispatchAction({
          type: "takeGlobalCursor",
          key: "dataZoomSelect",
          dataZoomSelectActive: true,
        });
        chart.on("mouseover", "series.line", (params) => {
          const event = params as { seriesName?: string };
          if (event.seriesName) hoveredSeriesName = event.seriesName;
        });
        chart.on("mouseout", "series.line", () => {
          hoveredSeriesName = null;
        });
        let lastLegendClickTime = 0;
        let lastLegendClickName: string | null = null;
        chart.on("legendselectchanged", (params) => {
          axisTooltipCache.clear();
          const event = params as { name: string };
          const now = Date.now();
          if (
            event.name === lastLegendClickName &&
            now - lastLegendClickTime < 300
          ) {
            accounts.forEach((account) => {
              chart.dispatchAction({
                type: account.name === event.name
                  ? "legendSelect"
                  : "legendUnSelect",
                name: account.name,
              });
            });
            lastLegendClickTime = 0;
            lastLegendClickName = null;
          } else {
            lastLegendClickTime = now;
            lastLegendClickName = event.name;
          }
        });
        setSummary({ accounts: accounts.length, latestDate });
      } catch (caught) {
        if (cancelled) return;
        reportError("chart:instagram", caught);
        setError(
          caught instanceof Error
            ? caught.message
            : "Instagramデータの読み込みに失敗しました",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(chartRef.current);
    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.clear();
      chart.off("mouseover");
      chart.off("mouseout");
      chart.off("legendselectchanged");
      chart.dispose();
      if (chartInstance.current === chart) chartInstance.current = null;
    };
  }, [executeQuery]);

  return (
    <div className="chart-container instagram-chart-container">
      <div className="chart-header">
        <div>
          <h3 className="chart-title">Instagramフォロワー数の推移</h3>
          {!loading && !error && (
            <p className="chart-note instagram-chart-note">
              {summary.accounts}アカウントを全件表示しています。
              {summary.latestDate > 0 && (
                <>
                  最終記録日:{" "}
                  {new Date(summary.latestDate).toLocaleDateString("ja-JP")}
                </>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="chart-body">
        {loading && (
          <div className="loading chart-loading-overlay">
            <div className="spinner" />
            <p>Instagramデータを読み込み中...</p>
          </div>
        )}
        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}
        <div ref={chartRef} className="view-count-chart" />
      </div>
    </div>
  );
}
