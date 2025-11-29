/**
 * データ管理フック
 * OPFSへのデータ保存/読み込み、更新チェック、ダウンロードを管理
 */

import { useState, useCallback } from 'react';
import type { DataState, DataMetadata } from '../types/index.ts';
import {
  isOPFSAvailable,
  hasDbFile,
  loadDateFile,
  saveDateFile,
  writeStreamToDbFile
} from '../utils/opfs.ts';
import {
  checkForUpdate,
  downloadAndDecompress,
  type DownloadProgress
} from '../utils/download.ts';

export function useDataManager() {
  const [dataState, setDataState] = useState<DataState>({ status: 'idle' });
  const [metadata, setMetadata] = useState<DataMetadata | null>(null);

  /**
   * キャッシュ済みデータを読み込み
   */
  const loadCachedData = useCallback(async (): Promise<boolean> => {
    if (!isOPFSAvailable()) {
      setDataState({
        status: 'error',
        error: 'このブラウザはOPFSをサポートしていません。Chrome、Edge、またはOperaの最新版をお使いください。'
      });
      return false;
    }

    try {
      const [hasFile, cachedDataDate] = await Promise.all([
        hasDbFile(),
        loadDateFile()
      ]);

      if (hasFile && cachedDataDate) {
        setMetadata({
          dataDate: cachedDataDate,
          lastDownloadedAt: new Date().toISOString() // 読み込み時は現在時刻
        });
        setDataState({ status: 'ready' });
        return true;
      }

      setDataState({ status: 'idle' });
      return false;
    } catch (error) {
      console.error('Failed to load cached data:', error);
      setDataState({
        status: 'error',
        error: 'キャッシュデータの読み込みに失敗しました'
      });
      return false;
    }
  }, []);

  /**
   * 更新をチェック
   */
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    setDataState({ status: 'checking', message: '更新を確認中...' });

    try {
      const updateInfo = await checkForUpdate(metadata?.dataDate || null);

      if (updateInfo.hasUpdate) {
        setDataState({
          status: 'update-available',
          message: `新しいデータがあります (${updateInfo.serverDataDate})`
        });
        return true;
      } else {
        setDataState({
          status: 'ready',
          message: 'データは最新です'
        });
        return false;
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setDataState({
        status: 'error',
        error: '更新の確認に失敗しました。ネットワーク接続を確認してください。'
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
        status: 'error',
        error: 'このブラウザはOPFSをサポートしていません'
      });
      return false;
    }

    try {
      // ダウンロード開始
      setDataState({
        status: 'downloading',
        progress: 0,
        downloadedBytes: 0,
        message: 'ダウンロード中...'
      });

      const { data, dataDate } = await downloadAndDecompress(
        (progress: DownloadProgress) => {
          if (progress.phase === 'downloading') {
            const percent = progress.totalBytes
              ? Math.round((progress.downloadedBytes / progress.totalBytes) * 100)
              : 0;
            setDataState({
              status: 'downloading',
              progress: percent,
              downloadedBytes: progress.downloadedBytes,
              totalBytes: progress.totalBytes || undefined,
              message: 'ダウンロード中...'
            });
          } else {
            setDataState({
              status: 'decompressing',
              message: '展開中...'
            });
          }
        }
      );

      // OPFSに保存
      setDataState({
        status: 'decompressing',
        message: 'ファイルを保存中...'
      });

      // ReadableStreamを作成してOPFSに書き込み
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        }
      });

      await writeStreamToDbFile(stream);

      // date.txtを保存
      await saveDateFile(dataDate);
      
      const fullMetadata: DataMetadata = {
        dataDate,
        lastDownloadedAt: new Date().toISOString()
      };
      setMetadata(fullMetadata);

      setDataState({
        status: 'ready',
        message: 'ダウンロード完了'
      });

      return true;
    } catch (error) {
      console.error('Failed to download data:', error);
      setDataState({
        status: 'error',
        error: 'データのダウンロードに失敗しました'
      });
      return false;
    }
  }, []);

  return {
    dataState,
    metadata,
    loadCachedData,
    checkForUpdates,
    downloadData
  };
}
