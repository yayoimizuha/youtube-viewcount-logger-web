/**
 * OPFS (Origin Private File System) ユーティリティ
 * ブラウザのプライベートファイルシステムを使用してデータをキャッシュする
 */

const DB_FILE_NAME = 'data.duckdb';
const DATE_FILE_NAME = 'date.txt';

/**
 * OPFSが利用可能かチェック
 */
export function isOPFSAvailable(): boolean {
  return 'storage' in navigator && 'getDirectory' in navigator.storage;
}

/**
 * OPFSのルートディレクトリを取得
 */
async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  if (!isOPFSAvailable()) {
    throw new Error('OPFS is not available in this browser');
  }
  return await navigator.storage.getDirectory();
}

/**
 * date.txtを保存
 */
export async function saveDateFile(dataDate: string): Promise<void> {
  const root = await getOPFSRoot();
  const fileHandle = await root.getFileHandle(DATE_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(dataDate);
  await writable.close();
}

/**
 * date.txtを読み込み
 */
export async function loadDateFile(): Promise<string | null> {
  try {
    const root = await getOPFSRoot();
    const fileHandle = await root.getFileHandle(DATE_FILE_NAME);
    const file = await fileHandle.getFile();
    const text = await file.text();
    return text.trim();
  } catch {
    // ファイルが存在しない場合
    return null;
  }
}

/**
 * DBファイルが存在するかチェック
 */
export async function hasDbFile(): Promise<boolean> {
  try {
    const root = await getOPFSRoot();
    await root.getFileHandle(DB_FILE_NAME);
    return true;
  } catch {
    return false;
  }
}

/**
 * DBファイルのFileHandleを取得
 */
export async function getDbFileHandle(): Promise<FileSystemFileHandle> {
  const root = await getOPFSRoot();
  return await root.getFileHandle(DB_FILE_NAME, { create: true });
}

/**
 * DBファイルを読み込み
 */
export async function readDbFile(): Promise<File | null> {
  try {
    const root = await getOPFSRoot();
    const fileHandle = await root.getFileHandle(DB_FILE_NAME);
    return await fileHandle.getFile();
  } catch {
    return null;
  }
}

/**
 * ストリームをOPFSファイルに書き込む
 * @param stream 書き込むReadableStream
 * @param onProgress 進捗コールバック (bytesWritten)
 */
export async function writeStreamToDbFile(
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytesWritten: number) => void
): Promise<void> {
  const root = await getOPFSRoot();
  const fileHandle = await root.getFileHandle(DB_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  
  const reader = stream.getReader();
  let bytesWritten = 0;
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await writable.write(value as any);
      bytesWritten += value.byteLength;
      onProgress?.(bytesWritten);
    }
  } finally {
    reader.releaseLock();
    await writable.close();
  }
}

/**
 * OPFSのデータを削除
 */
export async function clearOPFSData(): Promise<void> {
  const root = await getOPFSRoot();
  
  try {
    await root.removeEntry(DB_FILE_NAME);
  } catch {
    // ファイルが存在しない場合は無視
  }
  
  try {
    await root.removeEntry(DATE_FILE_NAME);
  } catch {
    // ファイルが存在しない場合は無視
  }
}

/**
 * 使用中のストレージサイズを取得
 */
export async function getStorageUsage(): Promise<{ usage: number; quota: number } | null> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0
    };
  }
  return null;
}
