/**
 * OPFS (Origin Private File System) ユーティリティ
 * ブラウザのプライベートファイルシステムを使用してデータをキャッシュする
 */

const DB_FILE_NAME = "data.duckdb";
const MISC_DB_FILE_NAME = "misc.duckdb";
const DATE_FILE_NAME = "date.txt";
const METADATA_FILE_NAME = "metadata.json";

import type { DataMetadata } from "../types/index.ts";

/**
 * OPFSが利用可能かチェック
 */
export function isOPFSAvailable(): boolean {
  return "storage" in navigator && "getDirectory" in navigator.storage;
}

/**
 * OPFSのルートディレクトリを取得
 */
async function getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
  if (!isOPFSAvailable()) {
    throw new Error("OPFS is not available in this browser");
  }
  return await navigator.storage.getDirectory();
}

/**
 * date.txtを保存
 */
export async function saveMetadata(metadata: DataMetadata): Promise<void> {
  const root = await getOPFSRoot();
  const fileHandle = await root.getFileHandle(METADATA_FILE_NAME, {
    create: true,
  });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(metadata));
  await writable.close();
}

export async function loadMetadata(): Promise<DataMetadata | null> {
  try {
    const root = await getOPFSRoot();
    const file = await (await root.getFileHandle(METADATA_FILE_NAME)).getFile();
    const value = JSON.parse(await file.text()) as Partial<DataMetadata>;
    return typeof value.dataDate === "string" &&
        typeof value.lastDownloadedAt === "string"
      ? value as DataMetadata
      : null;
  } catch {
    // 旧形式の date.txt は引き続き読み込めるようにする。
    const dataDate = await loadDateFile();
    return dataDate ? { dataDate, lastDownloadedAt: "" } : null;
  }
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

export async function hasMiscDbFile(): Promise<boolean> {
  try {
    const root = await getOPFSRoot();
    await root.getFileHandle(MISC_DB_FILE_NAME);
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

export async function createDbWritable(): Promise<
  FileSystemWritableFileStream
> {
  const fileHandle = await getDbFileHandle();
  return await fileHandle.createWritable();
}

export async function createMiscDbWritable(): Promise<
  FileSystemWritableFileStream
> {
  const root = await getOPFSRoot();
  const fileHandle = await root.getFileHandle(MISC_DB_FILE_NAME, {
    create: true,
  });
  return await fileHandle.createWritable();
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

export async function readMiscDbFile(): Promise<File | null> {
  try {
    const root = await getOPFSRoot();
    const fileHandle = await root.getFileHandle(MISC_DB_FILE_NAME);
    return await fileHandle.getFile();
  } catch {
    return null;
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
    await root.removeEntry(MISC_DB_FILE_NAME);
  } catch {
    // ファイルが存在しない場合は無視
  }

  try {
    await root.removeEntry(DATE_FILE_NAME);
  } catch {
    // ファイルが存在しない場合は無視
  }

  try {
    await root.removeEntry(METADATA_FILE_NAME);
  } catch {
    // ファイルが存在しない場合は無視
  }
}

/**
 * 使用中のストレージサイズを取得
 */
export async function getStorageUsage(): Promise<
  { usage: number; quota: number } | null
> {
  if ("storage" in navigator && "estimate" in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || 0,
    };
  }
  return null;
}
