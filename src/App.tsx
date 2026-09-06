import { lazy, Suspense, useEffect } from "react";
import { Header } from "./components/Header.tsx";
import { Welcome } from "./components/Welcome.tsx";
import { DataStatus } from "./components/DataStatus.tsx";
import { useDatabase } from "./hooks/useDatabase.ts";
import { useDataManager } from "./hooks/useDataManager.ts";

const Dashboard = lazy(() =>
  import("./components/Dashboard.tsx").then((module) => ({
    default: module.Dashboard,
  }))
);

function App() {
  const { dbState, initializeDb, executeQuery } = useDatabase();
  const {
    dataState,
    checkForUpdates,
    downloadData,
    loadCachedData,
    metadata,
  } = useDataManager();

  useEffect(() => {
    // アプリ起動時にキャッシュ済みデータを確認
    loadCachedData().then(async (hasCache) => {
      if (hasCache) {
        await initializeDb();
      }
    });
  }, [loadCachedData, initializeDb]);

  const handleDownload = async () => {
    const success = await downloadData();
    if (success) {
      await initializeDb(true);
    }
  };

  const handleCheckUpdates = async () => {
    await checkForUpdates();
  };

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        {dbState.status !== "ready"
          ? (
            dbState.status === "initializing"
              ? (
                <div className="loading">
                  <div className="spinner" />
                  <p>データベースを初期化中...</p>
                </div>
              )
              : (
                <Welcome
                  dataState={dataState}
                  onDownload={handleDownload}
                  onCheckUpdates={handleCheckUpdates}
                  metadata={metadata}
                />
              )
          )
          : (
            <>
              <DataStatus
                metadata={metadata}
                onCheckUpdates={handleCheckUpdates}
                onRedownload={handleDownload}
                dataState={dataState}
              />
              <Suspense
                fallback={
                  <div className="loading">
                    <div className="spinner" />
                    <p>画面を読み込み中...</p>
                  </div>
                }
              >
                <Dashboard dbState={dbState} executeQuery={executeQuery} />
              </Suspense>
            </>
          )}
      </main>
    </div>
  );
}

export default App;
