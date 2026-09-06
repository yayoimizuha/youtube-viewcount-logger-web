/**
 * DuckDB管理フック
 */

import { useCallback, useRef, useState } from "react";
import type { DbState, QueryResult } from "../types/index.ts";
import {
  executeQuery as execQuery,
  initializeDuckDB,
  openDatabase,
  registerDbFiles,
  shutdownDuckDB,
} from "../utils/duckdb.ts";
import { readDbFile, readMiscDbFile } from "../utils/opfs.ts";
import { reportError } from "../utils/logger.ts";

export function useDatabase() {
  const [dbState, setDbState] = useState<DbState>({ status: "uninitialized" });
  const initialization = useRef<Promise<boolean> | null>(null);

  /**
   * DBを初期化
   */
  const initializeDb = useCallback((force = false): Promise<boolean> => {
    if (initialization.current && !force) return initialization.current;

    const run = async (): Promise<boolean> => {
      setDbState({ status: "initializing" });

      try {
        if (force) await shutdownDuckDB();
        await initializeDuckDB();

        // OPFSからDBファイルを読み込み
        const [dbFile, miscDbFile] = await Promise.all([
          readDbFile(),
          readMiscDbFile(),
        ]);
        if (!dbFile || !miscDbFile) {
          throw new Error(
            "DBファイルが不足しています。データを再ダウンロードしてください",
          );
        }
        // FileReader 経由で必要な範囲だけ読めるよう登録する。
        await registerDbFiles(dbFile, miscDbFile);

        // DBをオープン
        await openDatabase();

        setDbState({ status: "ready" });
        return true;
      } catch (error) {
        reportError("database:init", error);
        setDbState({
          status: "error",
          error: error instanceof Error
            ? error.message
            : "DBの初期化に失敗しました",
        });
        return false;
      }
    };

    const promise = run();
    initialization.current = promise;
    promise.finally(() => {
      if (initialization.current === promise) initialization.current = null;
    });
    return promise;
  }, []);

  /**
   * クエリを実行
   */
  const executeQuery = useCallback(
    async (sql: string): Promise<QueryResult | null> => {
      if (dbState.status !== "ready") {
        throw new Error(
          `データベースの準備ができていません (status: ${dbState.status})`,
        );
      }

      return await execQuery(sql);
    },
    [dbState.status],
  );

  return {
    dbState,
    initializeDb,
    executeQuery,
  };
}
