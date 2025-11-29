/**
 * DuckDB-Wasm ユーティリティ
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import type { QueryResult } from '../types/index.ts';

let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/**
 * DuckDB-Wasmを初期化
 */
export function initializeDuckDB(): Promise<duckdb.AsyncDuckDB> {
  // すでに初期化済み
  if (db) {
    return Promise.resolve(db);
  }

  // 初期化中なら待機
  if (initPromise) {
    return initPromise;
  }

  // 初期化を開始
  initPromise = (async () => {
    try {
      // CDNからバンドルを取得
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

      // 最適なバンドルを選択
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      const worker_url = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker!}");`], { type: 'text/javascript' })
      );

      // ワーカーを作成
      const worker = new Worker(worker_url);
      const logger = new duckdb.ConsoleLogger();
      
      const instance = new duckdb.AsyncDuckDB(logger, worker);
      await instance.instantiate(bundle.mainModule, bundle.pthreadWorker);
      
      URL.revokeObjectURL(worker_url);
      
      db = instance;
      return instance;
    } catch (error) {
      initPromise = null; // エラー時はリセットして再試行可能に
      throw error;
    }
  })();

  return initPromise;
}

/**
 * OPFSからDBファイルを登録
 */
export async function registerDbFile(fileData: Uint8Array): Promise<void> {
  if (!db) {
    throw new Error('DuckDB is not initialized');
  }

  // ファイルをDuckDBに登録
  await db.registerFileBuffer('data.duckdb', fileData);
}

/**
 * DBをオープン
 */
export async function openDatabase(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!db) {
    throw new Error('DuckDB is not initialized');
  }

  if (conn) {
    return conn;
  }

  // DBファイルをオープン
  await db.open({
    path: 'data.duckdb',
    query: {
      castBigIntToDouble: true
    }
  });

  conn = await db.connect();
  return conn;
}

/**
 * クエリを実行
 */
export async function executeQuery(sql: string): Promise<QueryResult> {
  if (!db) {
    throw new Error('DuckDB is not initialized. Call initializeDuckDB() first.');
  }
  if (!conn) {
    throw new Error('Database connection is not established. Call openDatabase() first.');
  }

  const result = await conn.query(sql);
  const columns = result.schema.fields.map(f => f.name);
  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < result.numRows; i++) {
    const row: Record<string, unknown> = {};
    for (const col of columns) {
      const column = result.getChild(col);
      if (column) {
        row[col] = column.get(i);
      }
    }
    rows.push(row);
  }

  return { columns, rows };
}

/**
 * テーブル一覧を取得
 */
export async function getTables(): Promise<string[]> {
  const result = await executeQuery("SHOW TABLES");
  return result.rows.map(row => row.name as string);
}

/**
 * テーブルのレコード数を取得
 */
export async function getTableCount(tableName: string): Promise<number> {
  const result = await executeQuery(`SELECT COUNT(*) as count FROM "${tableName}"`);
  return result.rows[0]?.count as number || 0;
}

/**
 * DB接続を閉じる
 */
export async function closeDatabase(): Promise<void> {
  if (conn) {
    await conn.close();
    conn = null;
  }
}

/**
 * DuckDBをシャットダウン
 */
export async function shutdownDuckDB(): Promise<void> {
  await closeDatabase();
  if (db) {
    await db.terminate();
    db = null;
  }
}
