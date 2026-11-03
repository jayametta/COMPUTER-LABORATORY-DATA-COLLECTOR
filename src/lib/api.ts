import type {
  CurrentUserSession,
  ServerBrowseResponse,
  StudentStorageSummary,
} from '../types';

async function parseApiJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export async function requestAdminSession(username: string, password: string): Promise<CurrentUserSession> {
  const res = await fetch('/api/auth/admin-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return parseApiJson<CurrentUserSession>(res);
}

export async function requestStudentSession(params: {
  studentId: string;
  username: string;
  folderPath: string;
}): Promise<CurrentUserSession> {
  const res = await fetch('/api/auth/student-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return parseApiJson<CurrentUserSession>(res);
}

export async function ensureServerFolders(token: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const res = await fetch('/api/storage/ensure-folders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ paths }),
  });
  await parseApiJson<{ ensured: string[] }>(res);
}

export async function browseServerFolder(
  token: string,
  folderPath?: string
): Promise<ServerBrowseResponse> {
  const query = folderPath ? `?path=${encodeURIComponent(folderPath)}` : '';
  const res = await fetch(`/api/storage/browse${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseApiJson<ServerBrowseResponse>(res);
}

export async function fetchStudentStorageSummary(
  token: string,
  folderPath: string
): Promise<StudentStorageSummary> {
  const res = await fetch(
    `/api/storage/student-summary?folderPath=${encodeURIComponent(folderPath)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return parseApiJson<StudentStorageSummary>(res);
}

export async function createServerFolder(
  token: string,
  params: { parentPath?: string; folderName?: string; fullPath?: string }
): Promise<{ logicalPath: string; folderPathWithSlash: string }> {
  const res = await fetch('/api/storage/folders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  return parseApiJson<{ logicalPath: string; folderPathWithSlash: string }>(res);
}

export async function renameOrMoveServerFolder(
  token: string,
  params: { oldPath: string; newName?: string; newPath?: string }
): Promise<{ oldLogicalPath: string; logicalPath: string; folderPathWithSlash: string }> {
  const res = await fetch('/api/storage/folders', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  return parseApiJson<{ oldLogicalPath: string; logicalPath: string; folderPathWithSlash: string }>(res);
}

export async function deleteServerFolder(token: string, folderPath: string): Promise<void> {
  const res = await fetch('/api/storage/folders', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path: folderPath }),
  });
  await parseApiJson<{ deletedPath: string }>(res);
}

export async function uploadFilesToServer(
  token: string,
  targetPath: string,
  fileList: FileList | File[]
): Promise<{
  targetPath: string;
  uploaded: Array<{ name: string; size: number; date: string; logicalPath: string; mimeType: string }>;
}> {
  const formData = new FormData();
  formData.append('targetPath', targetPath);
  Array.from(fileList).forEach((file) => {
    formData.append('files', file);
  });

  const res = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  return parseApiJson(res);
}

export async function renameServerFile(
  token: string,
  filePath: string,
  newName: string
): Promise<{ oldPath: string; logicalPath: string; name: string }> {
  const res = await fetch('/api/storage/files', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ filePath, newName }),
  });
  return parseApiJson(res);
}

export async function deleteServerFile(token: string, filePath: string): Promise<void> {
  const res = await fetch('/api/storage/files', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path: filePath }),
  });
  await parseApiJson(res);
}

export interface TreeSnapshotNode {
  name: string;
  type: 'folder' | 'file';
  logicalPath: string;
  size?: number;
  children?: TreeSnapshotNode[];
}

export interface TreeSnapshotResponse {
  logicalRoot: string;
  physicalRoot: string;
  totalFiles: number;
  totalBytes: number;
  tree: TreeSnapshotNode[];
}

export async function fetchServerTreeSnapshot(token: string): Promise<TreeSnapshotResponse> {
  const res = await fetch('/api/storage/tree-snapshot', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseApiJson<TreeSnapshotResponse>(res);
}

export function buildDownloadUrl(token: string, filePath: string, fallbackName?: string): string {
  const params = new URLSearchParams({
    path: filePath,
    token,
  });
  if (fallbackName) params.set('name', fallbackName);
  return `/api/storage/download?${params.toString()}`;
}

export function buildPreviewUrl(token: string, filePath: string): string {
  const params = new URLSearchParams({
    path: filePath,
    token,
  });
  return `/api/storage/preview?${params.toString()}`;
}

export function buildZipDownloadUrl(token: string, folderPath: string): string {
  const params = new URLSearchParams({
    path: folderPath,
    token,
  });
  return `/api/storage/zip?${params.toString()}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
