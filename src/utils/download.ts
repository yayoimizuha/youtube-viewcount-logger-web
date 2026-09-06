/**
 * データダウンロード & 更新チェック ユーティリティ
 */

import { Decompress } from "fzstd";

const DATA_URL =
  "https://media.githubusercontent.com/media/yayoimizuha/youtube-viewcount-logger-rust/refs/heads/master/data.duckdb.zst";
const MISC_DATA_URL =
  "https://media.githubusercontent.com/media/yayoimizuha/youtube-viewcount-logger-rust/refs/heads/master/misc.duckdb.zst";
const DATE_URL =
  "https://raw.githubusercontent.com/yayoimizuha/youtube-viewcount-logger-rust/refs/heads/master/date.txt";

export interface DownloadProgress {
  database: DatabaseKind;
  downloadedBytes: number;
  totalBytes: number | null;
  phase: "downloading" | "decompressing";
}

export type DatabaseKind = "youtube" | "instagram";

/**
 * date.txtからサーバー上のデータ作成日時を取得
 */
export async function fetchServerDataDate(): Promise<string> {
  const response = await fetch(DATE_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch date.txt: ${response.status}`);
  }

  const text = await response.text();
  return text.trim();
}

/**
 * 更新があるかチェック（date.txtの日付比較）
 * @param cachedDataDate キャッシュ済みのdate.txtの内容
 * @returns 更新がある場合はtrue
 */
export async function checkForUpdate(cachedDataDate: string | null): Promise<{
  hasUpdate: boolean;
  serverDataDate: string;
}> {
  const serverDataDate = await fetchServerDataDate();

  // キャッシュがない場合は更新あり
  if (!cachedDataDate) {
    return {
      hasUpdate: true,
      serverDataDate,
    };
  }

  // 日付文字列を比較（完全一致で同一、異なれば更新あり）
  const hasUpdate = serverDataDate !== cachedDataDate;

  return {
    hasUpdate,
    serverDataDate,
  };
}

/**
 * データをダウンロードして展開
 * @param onProgress 進捗コールバック
 * @returns 展開されたデータのUint8Arrayとdate.txtの内容
 */
export async function downloadAndDecompress(
  onChunk: (database: DatabaseKind, chunk: Uint8Array) => Promise<void>,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<{
  dataDate: string;
}> {
  const dataDate = await fetchServerDataDate();
  const sources: { database: DatabaseKind; url: string }[] = [
    { database: "youtube", url: DATA_URL },
    { database: "instagram", url: MISC_DATA_URL },
  ];

  for (const source of sources) {
    const response = await fetch(source.url);

    if (!response.ok) {
      throw new Error(
        `Failed to download ${source.database} data: ${response.status}`,
      );
    }

    const contentLength = response.headers.get("Content-Length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

    if (!response.body) {
      throw new Error("The download response does not contain a body");
    }

    // fzstd の出力を入力チャンクごとに OPFS へ書き出す。圧縮データと
    // 展開済み DB を同時にメモリへ保持しないため、モバイルでも安定する。
    const reader = response.body.getReader();
    let downloadedBytes = 0;
    let outputChunks: Uint8Array[] = [];
    const decompressor = new Decompress((chunk) => {
      if (chunk.byteLength > 0) outputChunks.push(chunk);
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        downloadedBytes += value.byteLength;
        onProgress?.({
          database: source.database,
          downloadedBytes,
          totalBytes,
          phase: "downloading",
        });

        decompressor.push(value);
        const chunksToWrite = outputChunks;
        outputChunks = [];
        for (const chunk of chunksToWrite) {
          await onChunk(source.database, chunk);
        }
      }

      onProgress?.({
        database: source.database,
        downloadedBytes,
        totalBytes,
        phase: "decompressing",
      });
      decompressor.push(new Uint8Array(), true);
      for (const chunk of outputChunks) {
        await onChunk(source.database, chunk);
      }
    } finally {
      reader.releaseLock();
    }
  }

  return { dataDate };
}

/**
 * ファイルサイズを人間が読める形式に変換
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
