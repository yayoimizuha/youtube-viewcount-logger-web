import { useState, useEffect } from 'react';
import { Header } from './components/Header.tsx';
import { Welcome } from './components/Welcome.tsx';
import { Dashboard } from './components/Dashboard.tsx';
import { DataStatus } from './components/DataStatus.tsx';
import { useDatabase } from './hooks/useDatabase.ts';
import { useDataManager } from './hooks/useDataManager.ts';

function App() {
  const { dbState, initializeDb, executeQuery } = useDatabase();
  const { 
    dataState, 
    checkForUpdates, 
    downloadData, 
    loadCachedData,
    metadata 
  } = useDataManager();

  const [isDataReady, setIsDataReady] = useState(false);

  useEffect(() => {
    // アプリ起動時にキャッシュ済みデータを確認
    loadCachedData().then(async (hasCache) => {
      if (hasCache) {
        const success = await initializeDb();
        if (success) {
          setIsDataReady(true);
        }
      }
    });
  }, [loadCachedData, initializeDb]);

  const handleDownload = async () => {
    const success = await downloadData();
    if (success) {
      const dbSuccess = await initializeDb();
      if (dbSuccess) {
        setIsDataReady(true);
      }
    }
  };

  const handleCheckUpdates = async () => {
    await checkForUpdates();
  };

  return (
    <div className="app">
      <Header />
      <main className="main-content">
        {!isDataReady || dbState.status !== 'ready' ? (
          dbState.status === 'initializing' ? (
            <div className="loading">
              <div className="spinner" />
              <p>データベースを初期化中...</p>
            </div>
          ) : (
            <Welcome
              dataState={dataState}
              onDownload={handleDownload}
              onCheckUpdates={handleCheckUpdates}
              metadata={metadata}
            />
          )
        ) : (
          <>
            <DataStatus
              metadata={metadata}
              onCheckUpdates={handleCheckUpdates}
              onRedownload={handleDownload}
              dataState={dataState}
            />
            <Dashboard
              dbState={dbState}
              executeQuery={executeQuery}
            />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
