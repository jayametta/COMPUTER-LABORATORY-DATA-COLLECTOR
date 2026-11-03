export interface StoredFileMeta {
  name: string;
  size: number;
  date: string;
  relativePath?: string;
  logicalPath?: string;
  mimeType?: string;
}

export interface SubFolderMeta {
  name: string;
  logicalPath: string;
  createdAt: string;
}

export interface StudentAccount {
  id: string;
  nama: string;
  username: string;
  password: string;
  defaultPassword: string;
  kelas: string;
  noAbsen: string;
  folderPath: string;
  files: StoredFileMeta[];
  subFolders?: SubFolderMeta[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomFolderRecord {
  id: string;
  name: string;
  logicalPath: string;
  createdBy: string;
  createdAt: string;
}

export interface ServerFolderEntry {
  name: string;
  logicalPath: string;
  updatedAt: string;
  itemCount: number;
}

export interface ServerFileEntry {
  name: string;
  logicalPath: string;
  size: number;
  updatedAt: string;
  extension: string;
  mimeType: string;
  isPreviewable: boolean;
}

export interface ServerBrowseResponse {
  currentPath: string;
  parentPath: string | null;
  folders: ServerFolderEntry[];
  files: ServerFileEntry[];
  totalSizeBytes: number;
  totalFilesCount: number;
}

export interface StudentStorageSummary {
  folderPath: string;
  files: StoredFileMeta[];
  subFolders: SubFolderMeta[];
  totalBytes: number;
}

export interface CurrentUserSession {
  role: 'admin' | 'student';
  token: string;
  username: string;
  studentId?: string;
  folderPath?: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface CsvImportCandidate {
  nama: string;
  username: string;
  password: string;
  folderPath: string;
  kelas: string;
  noAbsen: string;
  isDuplicate?: boolean;
}
