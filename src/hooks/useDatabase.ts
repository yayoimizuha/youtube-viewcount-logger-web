/**
 * DuckDB管理フック
 */

import { useState, useCallback } from 'react';
import type { DbState, QueryResult } from '../types/index.ts';
import {
  initializeDuckDB,
  registerDbFile,
  openDatabase,
  executeQuery as execQuery
} from '../utils/duckdb.ts';
import { readDbFile } from '../utils/opfs.ts';

export function useDatabase() {
  const [dbState, setDbState] = useState<DbState>({ status: 'uninitialized' });

  /**
   * DBを初期化
   */
  const initializeDb = useCallback(async (): Promise<boolean> => {
    setDbState({ status: 'initializing' });

    try {
      // DuckDB-Wasmを初期化
      console.log('Initializing DuckDB-Wasm...');
      await initializeDuckDB();
      console.log('DuckDB-Wasm initialized');

      // OPFSからDBファイルを読み込み
      console.log('Reading DB file from OPFS...');
      const dbFile = await readDbFile();
      if (!dbFile) {
        throw new Error('DBファイルが見つかりません');
      }
      console.log('DB file read, size:', dbFile.size);

      // ArrayBufferに変換
      const buffer = await dbFile.arrayBuffer();
      const data = new Uint8Array(buffer);
      console.log('DB file converted to Uint8Array, length:', data.length);

      // DuckDBに登録
      console.log('Registering DB file...');
      await registerDbFile(data);
      console.log('DB file registered');

      // DBをオープン
      console.log('Opening database...');
      await openDatabase();
      console.log('Database opened');

      setDbState({ status: 'ready' });
      return true;
    } catch (error) {
      console.error('Failed to initialize database:', error);
      setDbState({
        status: 'error',
        error: error instanceof Error ? error.message : 'DBの初期化に失敗しました'
      });
      return false;
    }
  }, []);

  /**
   * クエリを実行
   */
  const executeQuery = useCallback(async (sql: string): Promise<QueryResult | null> => {
    if (dbState.status !== 'ready') {
      console.error('Database is not ready. Current status:', dbState.status);
      throw new Error(`データベースの準備ができていません (status: ${dbState.status})`);
    }

    try {
      return await execQuery(sql);
    } catch (error) {
      console.error('Query failed:', error);
      throw error;
    }
  }, [dbState.status]);

  return {
    dbState,
    initializeDb,
    executeQuery
  };
}
