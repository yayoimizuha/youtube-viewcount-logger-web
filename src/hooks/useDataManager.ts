/**
 * データ管理フック
 * OPFSへのデータ保存/読み込み、更新チェック、ダウンロードを管理
 */

import { useCallback, useState } from "react";
import type { DataMetadata, DataState } from "../types/index.ts";
import {
  createDbWritable,
  createMiscDbWritable,
  hasDbFile,
  hasMiscDbFile,
  isOPFSAvailable,
  loadMetadata,
  saveMetadata,
} from "../utils/opfs.ts";
import {
  checkForUpdate,
  downloadAndDecompress,
  type DownloadProgress,
} from "../utils/download.ts";
import { reportError } from "../utils/logger.ts";

function storageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException) {
    if (error.name === "QuotaExceededError") {
      return "保存容量が不足しています。端末の空き容量を確認してください。";
    }
    if (error.name === "SecurityError" || error.name === "NotAllowedError") {
      return "この閲覧モードでは端末内ストレージを利用できません。Safari の通常タブで開いてください。";
    }
  }
  return fallback;
}

export function useDataManager() {
  const [dataState, setDataState] = useState<DataState>({ status: "idle" });
  const [metadata, setMetadata] = useState<DataMetadata | null>(null);

  /**
   * キャッシュ済みデータを読み込み
   */
  const loadCachedData = useCallback(async (): Promise<boolean> => {
    if (!isOPFSAvailable()) {
      setDataState({
        status: "error",
        error:
          "このブラウザでは端末内ストレージを利用できません。iOS Safari 26 以降などの対応ブラウザをお使いください。",
      });
      return false;
    }

    try {
      const [hasFile, hasMiscFile, cachedMetadata] = await Promise.all([
        hasDbFile(),
        hasMiscDbFile(),
        loadMetadata(),
      ]);

      if (cachedMetadata) setMetadata(cachedMetadata);
      if (hasFile && hasMiscFile && cachedMetadata) {
        setDataState({ status: "ready" });
        return true;
      }

      setDataState({ status: "idle" });
      return false;
    } catch (error) {
      reportError("data:cache", error);
      setDataState({
        status: "error",
        error: storageErrorMessage(
          error,
          "キャッシュデータの読み込みに失敗しました",
        ),
      });
      return false;
    }
  }, []);

  /**
   * 更新をチェック
   */
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    setDataState({ status: "checking", message: "更新を確認中..." });

    try {
      const updateInfo = await checkForUpdate(metadata?.dataDate || null);

      if (updateInfo.hasUpdate) {
        setDataState({
          status: "update-available",
          message: `新しいデータがあります (${updateInfo.serverDataDate})`,
        });
        return true;
      } else {
        setDataState({
          status: "ready",
          message: "データは最新です",
        });
        return false;
      }
    } catch (error) {
      reportError("data:update-check", error);
      setDataState({
        status: "error",
        error: "更新の確認に失敗しました。ネットワーク接続を確認してください。",
      });
      return false;
    }
  }, [metadata]);

  /**
   * データをダウンロード
   */
  const downloadData = useCallback(async (): Promise<boolean> => {
    if (!isOPFSAvailable()) {
      setDataState({
        status: "error",
        error: "このブラウザでは端末内ストレージを利用できません",
      });
      return false;
    }

    try {
      // ダウンロード開始
      setDataState({
        status: "downloading",
        progress: 0,
        downloadedBytes: 0,
        message: "ダウンロード中...",
      });

      const [youtubeWritable, instagramWritable] = await Promise.all([
        createDbWritable(),
        createMiscDbWritable(),
      ]);
      let dataDate: string;
      try {
        ({ dataDate } = await downloadAndDecompress(
          async (database, chunk) => {
            // FileSystemWritableFileStream requires an ArrayBuffer-backed view.
            const writableChunk = chunk.buffer instanceof ArrayBuffer
              ? new Uint8Array(
                chunk.buffer,
                chunk.byteOffset,
                chunk.byteLength,
              )
              : new Uint8Array(chunk);
            const writable = database === "youtube"
              ? youtubeWritable
              : instagramWritable;
            await writable.write(writableChunk);
          },
          (progress: DownloadProgress) => {
            const databaseLabel = progress.database === "youtube"
              ? "YouTube"
              : "Instagram";
            if (progress.phase === "downloading") {
              const percent = progress.totalBytes
                ? Math.round(
                  (progress.downloadedBytes / progress.totalBytes) * 100,
                )
                : 0;
              setDataState({
                status: "downloading",
                progress: percent,
                downloadedBytes: progress.downloadedBytes,
                totalBytes: progress.totalBytes || undefined,
                message: `${databaseLabel}データをダウンロード中...`,
              });
            } else {
              setDataState({
                status: "decompressing",
                message: `${databaseLabel}データを展開中...`,
              });
            }
          },
        ));
        setDataState({
          status: "decompressing",
          message: "ファイルを保存中...",
        });
        await Promise.all([
          youtubeWritable.close(),
          instagramWritable.close(),
        ]);
      } catch (error) {
        await Promise.allSettled([
          youtubeWritable.abort(error),
          instagramWritable.abort(error),
        ]);
        throw error;
      }

      const fullMetadata: DataMetadata = {
        dataDate,
        lastDownloadedAt: new Date().toISOString(),
      };
      await saveMetadata(fullMetadata);
      setMetadata(fullMetadata);

      setDataState({
        status: "ready",
        message: "ダウンロード完了",
      });

      return true;
    } catch (error) {
      reportError("data:download", error);
      setDataState({
        status: "error",
        error: storageErrorMessage(
          error,
          "データのダウンロードに失敗しました",
        ),
      });
      return false;
    }
  }, []);

  return {
    dataState,
    metadata,
    loadCachedData,
    checkForUpdates,
    downloadData,
  };
}
