import { useState, useEffect, useRef, useCallback } from 'react';
import * as echarts from 'echarts';
import type { QueryResult } from '../../types/index.ts';

interface ViewCountChartProps {
  tableName: string;
  executeQuery: (sql: string) => Promise<QueryResult | null>;
}

export function ViewCountChart({ tableName, executeQuery }: ViewCountChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
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

    const loadChartData = async () => {
      setLoading(true);
      setError(null);

      try {
        // まずカラム情報を取得
        const columnsResult = await executeQuery(`DESCRIBE "${tableName}"`);
        if (!columnsResult) {
          throw new Error('カラム情報の取得に失敗しました');
        }

        // データを取得
        const dataResult = await executeQuery(`SELECT * FROM "${tableName}" ORDER BY 1`);
        if (!dataResult || dataResult.rows.length === 0) {
          throw new Error('データがありません');
        }

        const columns = dataResult.columns;
        const rows = dataResult.rows;

        // 最初のカラムを日付として扱い、残りを系列データとして扱う
        const dateColumn = columns[0];
        const rawSeriesColumns = columns.slice(1);

        // 最新日の値に基づいて系列をソート（降順）
        const lastRow = rows[rows.length - 1];
        const seriesColumns = [...rawSeriesColumns].sort((a, b) => {
          const valueA = lastRow[a] === null ? 0 : Number(lastRow[a]);
          const valueB = lastRow[b] === null ? 0 : Number(lastRow[b]);
          return valueB - valueA;  // 降順
        });

        // __title__テーブルから曲名を取得してIDと名前のマップを作成
        const titleMap = new Map<string, string>();
        if (seriesColumns.length > 0) {
          const ids = seriesColumns.map((id: string) => `'${id}'`).join(',');
          const titleResult = await executeQuery(
            `SELECT youtube_id, cleaned_title FROM __title__ WHERE youtube_id IN (${ids})`
          );
          if (titleResult) {
            titleResult.rows.forEach((row: Record<string, unknown>) => {
              const id = String(row.youtube_id);
              const title = String(row.cleaned_title || id);
              titleMap.set(id, title);
            });
          }
        }

        // 日付データをタイムスタンプ（ミリ秒）に変換
        const timestamps = rows.map((row: Record<string, unknown>) => {
          const dateValue = row[dateColumn];
          if (dateValue instanceof Date) {
            return dateValue.getTime();
          }
          // UnixTimeの場合（数値として扱う）
          const timestamp = Number(dateValue);
          if (!isNaN(timestamp)) {
            // 秒単位のUnixTimeをミリ秒に変換（10桁以下なら秒単位と判断）
            return timestamp < 1e12 ? timestamp * 1000 : timestamp;
          }
          // 文字列の日付の場合
          const parsedDate = new Date(String(dateValue));
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.getTime();
          }
          return 0;
        });

        // 系列データを構築（時間軸用に [timestamp, value] 形式）
        const series: echarts.SeriesOption[] = seriesColumns.map((col: string) => ({
          name: titleMap.get(col) || col,
          type: 'line',
          data: rows.map((row: Record<string, unknown>, index: number) => {
            const value = row[col];
            const numValue = value === null || value === 0 ? null : Number(value);
            return [timestamps[index], numValue];
          }),
          connectNulls: true,
          showSymbol: false,
          emphasis: {
            focus: 'series'
          },
          triggerLineEvent: true
        }));

        // 凡例用の曲名リスト
        const legendData = seriesColumns.map((col: string) => titleMap.get(col) || col);

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
          if (cached && cached !== 'loading') {
            return cached;
          }
          
          // ロード中マーカーをセット
          thumbnailCache.set(videoId, 'loading');
          
          const qualities = ['maxresdefault', 'sddefault', 'hqdefault', 'mqdefault', 'default'];
          let resultUrl = `https://img.youtube.com/vi/${videoId}/default.jpg`;
          
          for (const quality of qualities) {
            const url = `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
            try {
              const response = await fetch(url, { method: 'HEAD' });
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
            const tooltipImg = document.querySelector('.echarts-tooltip img') as HTMLImageElement | null;
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
          const data = rows.map((row: Record<string, unknown>) => {
            const value = row[col];
            return value === null || value === 0 ? null : Number(value);
          });
          seriesDataMap.set(seriesName, data);
        });

        // 日数差を計算するヘルパー関数
        const getDaysDiff = (currentIndex: number): number => {
          if (currentIndex <= 0) return 1;
          const currentTimestamp = timestamps[currentIndex];
          const prevTimestamp = timestamps[currentIndex - 1];
          const daysDiff = Math.round((currentTimestamp - prevTimestamp) / (1000 * 60 * 60 * 24));
          return daysDiff > 0 ? daysDiff : 1;
        };

        // ホバー中の系列名を追跡
        let hoveredSeriesName: string | null = null;

        // チャートオプションを設定
        const option: echarts.EChartsOption = {
          animation: false,
          tooltip: {
            trigger: 'axis',
            axisPointer: {
              type: 'cross'
            },
            formatter: (params) => {
              if (!Array.isArray(params) || params.length === 0) return '';
              // 時間軸の場合、valueは[timestamp, value]の配列
              const firstParam = params[0] as { value?: [number, number] };
              const timestamp = firstParam.value?.[0];
              const dateStr = timestamp 
                ? new Date(timestamp).toLocaleDateString('ja-JP')
                : '';
              
              // ホバー中の系列があれば、その系列のみを表示
              const displayParams = hoveredSeriesName 
                ? params.filter(param => param.seriesName === hoveredSeriesName)
                : params;
              
              // 単一系列の場合はサムネイル付きの詳細表示
              if (hoveredSeriesName && displayParams.length === 1) {
                const param = displayParams[0];
                const paramValue = param.value as [number, number] | null;
                if (paramValue !== null && paramValue !== undefined && paramValue[1] !== null) {
                  const value = Number(paramValue[1]).toLocaleString();
                  const seriesName = param.seriesName as string;
                  const videoId = titleToIdMap.get(seriesName) || seriesName;
                  
                  // 現在ホバー中のvideoIdを更新
                  currentHoveredVideoId = videoId;
                  
                  // 1日当たりの再生回数を計算
                  let diffStr = '';
                  const currentIndex = timestampToIndexMap.get(paramValue[0]);
                  if (currentIndex !== undefined && currentIndex > 0) {
                    const seriesData = seriesDataMap.get(seriesName);
                    if (seriesData) {
                      const currentValue = paramValue[1];
                      const prevValue = seriesData[currentIndex - 1];
                      if (prevValue !== null && currentValue !== null) {
                        const diff = currentValue - prevValue;
                        const daysDiff = getDaysDiff(currentIndex);
                        const dailyViewcount = Math.round(diff / daysDiff);
                        const diffSign = dailyViewcount >= 0 ? '+' : '';
                        const daysLabel = daysDiff > 1 ? ` (${daysDiff}日平均)` : '/日';
                        diffStr = `<div style="color: ${dailyViewcount >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${diffSign}${dailyViewcount.toLocaleString()}${daysLabel}</div>`;
                      }
                    }
                  }
                  
                  // サムネイルURLを取得（キャッシュから取得、無ければ遅延ロード開始）
                  const cachedUrl = thumbnailCache.get(videoId);
                  let thumbnailUrl: string;
                  
                  if (cachedUrl && cachedUrl !== 'loading') {
                    // キャッシュ済み
                    thumbnailUrl = cachedUrl;
                  } else if (cachedUrl === 'loading') {
                    // ロード中
                    thumbnailUrl = `https://img.youtube.com/vi/${videoId}/default.jpg`;
                  } else {
                    // 初回アクセス - 遅延ロード開始（非同期で実行、結果は次回ホバー時に反映）
                    thumbnailUrl = `https://img.youtube.com/vi/${videoId}/default.jpg`;
                    findValidThumbnail(videoId); // 非同期で実行（await しない）
                  }
                  
                  return `
                    <div style="text-align: center;">
                      <img 
                        src="${thumbnailUrl}"
                        style="max-width: 200px; max-height: 120px; border-radius: 4px; margin-bottom: 8px;"
                      />
                      <div><strong>${dateStr}</strong></div>
                      <div style="margin-top: 4px;">${param.marker} ${seriesName}</div>
                      <div style="font-size: 1.1em; font-weight: bold;">${value}</div>
                      ${diffStr}
                    </div>
                  `;
                }
              }
              
              // 複数系列の場合は通常表示
              let html = `<strong>${dateStr}</strong><br/>`;
              displayParams.forEach(param => {
                const paramValue = param.value as [number, number] | null;
                if (paramValue !== null && paramValue !== undefined && paramValue[1] !== null) {
                  const value = Number(paramValue[1]).toLocaleString();
                  html += `${param.marker} ${param.seriesName}: ${value}<br/>`;
                }
              });
              return html;
            }
          },
          legend: {
            type: 'scroll',
            orient: 'vertical',
            right: 10,
            top: 40,
            bottom: 60,
            data: legendData,
            textStyle: {
              width: 250,  // 凡例テキストの最大幅
              overflow: 'truncate',  // 'truncate'で打ち切り、'break'で折り返し
              ellipsis: '...',  // 打ち切り時の省略記号
            },
            tooltip: {
              show: true,  // ホバー時に完全な名前を表示
            },
          },
          grid: {
            left: '3%',
            right: '300px',
            bottom: '5%',
            top: '10%',
            containLabel: true
          },
          toolbox: {
            feature: {
              dataZoom: {
                yAxisIndex: 'all'  // Y軸方向のズームも有効化
              },
              restore: {},
              saveAsImage: {
                name: tableName,
                pixelRatio: 2
              }
            }
          },
          dataZoom: [
            {
              type: 'inside',
              disabled: true,
              start: 0,
              end: 100
            },
            {
              show: false,
              start: 0,
              end: 100
            }
          ],
          xAxis: {
            type: 'time',
            axisLabel: {
              formatter: (value: number) => {
                const date = new Date(value);
                return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
              },
              rotate: 45
            }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              formatter: (value: number) => {
                if (value >= 1000000) {
                  return (value / 1000000).toFixed(1) + 'M';
                } else if (value >= 1000) {
                  return (value / 1000).toFixed(0) + 'K';
                }
                return String(value);
              }
            }
          },
          series
        };

        // チャートがまだ有効か確認してから設定
        const currentChart = getChartInstance();
        if (currentChart && !currentChart.isDisposed()) {
          // 既存のイベントハンドラを解除（テーブル切り替え時の重複登録を防ぐ）
          currentChart.off('mouseover');
          currentChart.off('mouseout');
          currentChart.off('legendselectchanged');
          
          currentChart.setOption(option, true);
          
          // デフォルトでズームモードをアクティブにする
          currentChart.dispatchAction({
            type: 'takeGlobalCursor',
            key: 'dataZoomSelect',
            dataZoomSelectActive: true
          });
          
          // 系列のホバーイベントを追跡（線上のマウスイベント）
          currentChart.on('mouseover', 'series.line', (params) => {
            const p = params as { seriesName?: string };
            if (p.seriesName) {
              hoveredSeriesName = p.seriesName;
            }
          });
          
          currentChart.on('mouseout', 'series.line', () => {
            hoveredSeriesName = null;
          });
          
          // 凡例ダブルクリックで特定の系列のみ表示
          let lastLegendClickTime = 0;
          let lastLegendClickName: string | null = null;

          currentChart.on('legendselectchanged', (params) => {
            const p = params as { name: string; selected: Record<string, boolean> };
            const currentTime = Date.now();

            // ダブルクリック判定（300ms以内の同じ凡例クリック）
            if (lastLegendClickName === p.name && currentTime - lastLegendClickTime < 300) {
              // この系列のみ選択し、それ以外は非表示
              legendData.forEach((name: string) => {
                if (name === p.name) {
                  currentChart.dispatchAction({
                    type: 'legendSelect',
                    name,
                  });
                } else {
                  currentChart.dispatchAction({
                    type: 'legendUnSelect',
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
        console.error('Failed to load chart data:', err);
        setError(err instanceof Error ? err.message : 'グラフデータの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadChartData();

    // リサイズハンドラ
    const handleResize = () => {
      const currentChart = chartInstance.current;
      if (currentChart && !currentChart.isDisposed()) {
        currentChart.resize();
      }
    };
    globalThis.addEventListener('resize', handleResize);

    return () => {
      globalThis.removeEventListener('resize', handleResize);
    };
  }, [tableName, executeQuery, getChartInstance]);

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
    <div style={{ position: 'relative' }}>
      {loading && (
        <div className="loading" style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', zIndex: 10 }}>
          <div className="spinner" />
          <p>グラフを読み込み中...</p>
        </div>
      )}
      <div 
        ref={chartRef} 
        style={{ width: '100%', height: 'calc(100vh - 250px)', minHeight: '500px' }}
      />
    </div>
  );
}
