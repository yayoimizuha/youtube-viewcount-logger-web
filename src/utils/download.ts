/**
 * データダウンロード & 更新チェック ユーティリティ
 */

import { decompress } from 'fzstd';

const DATA_URL = 'https://media.githubusercontent.com/media/yayoimizuha/youtube-viewcount-logger-rust/refs/heads/master/data.duckdb.zst';
const DATE_URL = 'https://raw.githubusercontent.com/yayoimizuha/youtube-viewcount-logger-rust/refs/heads/master/date.txt';

export interface DownloadProgress {
    downloadedBytes: number;
    totalBytes: number | null;
    phase: 'downloading' | 'decompressing';
}

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
            serverDataDate
        };
    }

    // 日付文字列を比較（完全一致で同一、異なれば更新あり）
    const hasUpdate = serverDataDate !== cachedDataDate;

    return {
        hasUpdate,
        serverDataDate
    };
}

/**
 * データをダウンロードして展開
 * @param onProgress 進捗コールバック
 * @returns 展開されたデータのUint8Arrayとdate.txtの内容
 */
export async function downloadAndDecompress(
    onProgress?: (progress: DownloadProgress) => void
): Promise<{
    data: Uint8Array;
    dataDate: string;
}> {
    // date.txtとデータを並行してダウンロード開始
    const datePromise = fetchServerDataDate();
    const response = await fetch(DATA_URL);

    if (!response.ok) {
        throw new Error(`Failed to download data: ${response.status}`);
    }

    const contentLength = response.headers.get('Content-Length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

    // ダウンロード (圧縮データ)
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        downloadedBytes += value.byteLength;

        onProgress?.({
            downloadedBytes,
            totalBytes,
            phase: 'downloading'
        });
    }

    // チャンクを結合
    const compressedData = new Uint8Array(downloadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
        compressedData.set(chunk, offset);
        offset += chunk.byteLength;
    }

    // 展開フェーズ通知
    onProgress?.({
        downloadedBytes,
        totalBytes,
        phase: 'decompressing'
    });

    // zstd展開
    const decompressedData = decompress(compressedData);

    // date.txtの結果を待つ
    const dataDate = await datePromise;

    return {
        data: decompressedData,
        dataDate
    };
}

/**
 * ファイルサイズを人間が読める形式に変換
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
