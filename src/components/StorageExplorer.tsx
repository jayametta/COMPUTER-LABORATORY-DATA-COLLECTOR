import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  ChevronRight,
  Download,
  Eye,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  browseServerFolder,
  buildDownloadUrl,
  buildPreviewUrl,
  buildZipDownloadUrl,
  createServerFolder,
  deleteServerFile,
  deleteServerFolder,
  formatBytes,
  renameOrMoveServerFolder,
  renameServerFile,
  uploadFilesToServer,
} from '../lib/api';
import type {
  ServerBrowseResponse,
  ServerFileEntry,
  ServerFolderEntry,
  StoredFileMeta,
} from '../types';
import { ConfirmDialog, EntryNameModal, FilePreviewModal } from './Modals';

interface StorageExplorerProps {
  token: string;
  rootPath: string;
  initialPath?: string;
  role: 'admin' | 'student';
  legacyFiles?: StoredFileMeta[];
  onStorageMutated?: (affectedPath: string) => Promise<void> | void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function normalizeDisplayPath(p: string): string {
  const clean = (p || '/storage/data_siswa').trim().replace(/\/+$/, '');
  return clean || '/storage/data_siswa';
}

function getFileIcon(ext: string) {
  const lower = ext.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(lower)) {
    return <ImageIcon className="w-4 h-4 text-blue-600 shrink-0" />;
  }
  if (['xls', 'xlsx', 'csv'].includes(lower)) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(lower)) {
    return <FileArchive className="w-4 h-4 text-amber-700 shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-slate-600 shrink-0" />;
}

export const StorageExplorer: React.FC<StorageExplorerProps> = ({
  token,
  rootPath,
  initialPath,
  role,
  legacyFiles = [],
  onStorageMutated,
  onNotify,
}) => {
  const normalizedRoot = useMemo(() => normalizeDisplayPath(rootPath), [rootPath]);
  const [currentPath, setCurrentPath] = useState<string>(() =>
    normalizeDisplayPath(initialPath || rootPath)
  );
  const [browseData, setBrowseData] = useState<ServerBrowseResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Modals state
  const [nameModal, setNameModal] = useState<{
    isOpen: boolean;
    mode: 'create-folder' | 'rename-folder' | 'rename-file';
    targetPath: string;
    initialValue: string;
  }>({
    isOpen: false,
    mode: 'create-folder',
    targetPath: '',
    initialValue: '',
  });
  const [isMutating, setIsMutating] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const [previewFile, setPreviewFile] = useState<{
    isOpen: boolean;
    name: string;
    mimeType: string;
    logicalPath: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialPath) {
      setCurrentPath(normalizeDisplayPath(initialPath));
    }
  }, [initialPath]);

  const loadFolder = useCallback(
    async (targetPath: string) => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await browseServerFolder(token, targetPath);
        setBrowseData(res);
        setCurrentPath(res.currentPath);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat isi direktori.';
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadFolder(currentPath);
  }, [currentPath, loadFolder]);

  // Breadcrumbs relative to allowed rootPath
  const breadcrumbs = useMemo(() => {
    const cleanCurr = normalizeDisplayPath(currentPath);
    const rootLabel =
      role === 'admin' ? 'data_siswa' : normalizedRoot.split('/').filter(Boolean).pop() || 'Folder Saya';

    const crumbs: Array<{ label: string; path: string }> = [
      { label: rootLabel, path: normalizedRoot },
    ];

    if (cleanCurr.startsWith(normalizedRoot + '/')) {
      const rest = cleanCurr.slice(normalizedRoot.length + 1).split('/').filter(Boolean);
      let accum = normalizedRoot;
      for (const seg of rest) {
        accum = `${accum}/${seg}`;
        crumbs.push({ label: seg, path: accum });
      }
    }
    return crumbs;
  }, [currentPath, normalizedRoot, role]);

  // Merge physical files with any legacy metadata-only entries at student root
  const combinedFiles: ServerFileEntry[] = useMemo(() => {
    const serverFiles = browseData?.files || [];
    if (normalizeDisplayPath(currentPath) !== normalizedRoot || legacyFiles.length === 0) {
      return serverFiles;
    }
    const existingNames = new Set(serverFiles.map((f) => f.name.toLowerCase()));
    const merged = [...serverFiles];

    for (const lf of legacyFiles) {
      if (lf.relativePath && lf.relativePath.includes('/')) continue;
      if (!existingNames.has(lf.name.toLowerCase())) {
        const ext = lf.name.includes('.') ? lf.name.split('.').pop()!.toLowerCase() : 'file';
        merged.push({
          name: lf.name,
          logicalPath: `${normalizedRoot}/${lf.name}`,
          size: lf.size || 0,
          updatedAt: lf.date || '-',
          extension: ext,
          mimeType: lf.mimeType || 'application/octet-stream',
          isPreviewable: false,
        });
      }
    }
    return merged;
  }, [browseData?.files, currentPath, legacyFiles, normalizedRoot]);

  const filteredFolders = useMemo(() => {
    const list = browseData?.folders || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter((f) => f.name.toLowerCase().includes(q));
  }, [browseData?.folders, searchQuery]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return combinedFiles;
    return combinedFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [combinedFiles, searchQuery]);

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsUploading(true);
    try {
      const res = await uploadFilesToServer(token, currentPath, files);
      onNotify(`${res.uploaded.length} file berhasil diunggah ke server hosting.`, 'success');
      await loadFolder(currentPath);
      if (onStorageMutated) {
        await onStorageMutated(currentPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah file.';
      onNotify(msg, 'error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleNameModalSubmit = async (newValue: string) => {
    setIsMutating(true);
    try {
      if (nameModal.mode === 'create-folder') {
        await createServerFolder(token, {
          parentPath: currentPath,
          folderName: newValue,
        });
        onNotify(`Folder "${newValue}" berhasil dibuat di server.`, 'success');
      } else if (nameModal.mode === 'rename-folder') {
        await renameOrMoveServerFolder(token, {
          oldPath: nameModal.targetPath,
          newName: newValue,
        });
        onNotify(`Nama folder berhasil diubah menjadi "${newValue}".`, 'success');
      } else if (nameModal.mode === 'rename-file') {
        await renameServerFile(token, nameModal.targetPath, newValue);
        onNotify(`Nama file berhasil diubah menjadi "${newValue}".`, 'success');
      }

      setNameModal((prev) => ({ ...prev, isOpen: false }));
      await loadFolder(currentPath);
      if (onStorageMutated) {
        await onStorageMutated(currentPath);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operasi gagal dijalankan.';
      onNotify(msg, 'error');
    } finally {
      setIsMutating(false);
    }
  };

  const promptDeleteFolder = (folder: ServerFolderEntry) => {
    setConfirmState({
      isOpen: true,
      title: `Hapus Folder "${folder.name}"?`,
      message: `Seluruh subfolder dan file di dalam "${folder.logicalPath}" akan dihapus secara permanen dari storage server hosting.`,
      onConfirm: async () => {
        setIsMutating(true);
        try {
          await deleteServerFolder(token, folder.logicalPath);
          onNotify(`Folder "${folder.name}" telah dihapus dari server.`, 'info');
          setConfirmState(null);
          await loadFolder(currentPath);
          if (onStorageMutated) {
            await onStorageMutated(currentPath);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Gagal menghapus folder.';
          onNotify(msg, 'error');
        } finally {
          setIsMutating(false);
        }
      },
    });
  };

  const promptDeleteFile = (file: ServerFileEntry) => {
    setConfirmState({
      isOpen: true,
      title: `Hapus File "${file.name}"?`,
      message: `File "${file.name}" akan dihapus secara permanen dari direktori hosting "${currentPath}".`,
      onConfirm: async () => {
        setIsMutating(true);
        try {
          await deleteServerFile(token, file.logicalPath);
          onNotify(`File "${file.name}" berhasil dihapus.`, 'info');
          setConfirmState(null);
          await loadFolder(currentPath);
          if (onStorageMutated) {
            await onStorageMutated(currentPath);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Gagal menghapus file.';
          onNotify(msg, 'error');
        } finally {
          setIsMutating(false);
        }
      },
    });
  };

  const canGoUp =
    browseData?.parentPath &&
    (browseData.parentPath === normalizedRoot ||
      browseData.parentPath.startsWith(normalizedRoot + '/'));

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUploadFiles(e.dataTransfer.files);
        }
      }}
      className={`bg-white border rounded-xl transition-colors ${
        isDragging ? 'border-blue-600 bg-blue-50/20' : 'border-slate-200'
      }`}
    >
      {/* Explorer Header & Breadcrumb Navigation */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto custom-scrollbar py-0.5">
          <button
            type="button"
            disabled={!canGoUp}
            onClick={() => browseData?.parentPath && setCurrentPath(browseData.parentPath)}
            title="Naik satu level direktori"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>

          <nav aria-label="Breadcrumb direktori" className="flex items-center gap-1 text-xs font-mono">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={crumb.path}>
                  {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  <button
                    type="button"
                    onClick={() => setCurrentPath(crumb.path)}
                    className={`px-2 py-1 rounded transition-colors whitespace-nowrap shrink-0 ${
                      isLast
                        ? 'font-semibold text-slate-900 bg-slate-100'
                        : 'text-slate-600 hover:text-blue-700 hover:bg-slate-50'
                    }`}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
            className="hidden"
          />

          <button
            type="button"
            onClick={() =>
              setNameModal({
                isOpen: true,
                mode: 'create-folder',
                targetPath: currentPath,
                initialValue: '',
              })
            }
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-3.5 h-3.5 text-slate-600" />
            <span>Folder Baru</span>
          </button>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploading ? 'Mengunggah...' : 'Unggah File'}</span>
          </button>

          <a
            href={buildZipDownloadUrl(token, currentPath)}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh ZIP</span>
          </a>

          <button
            type="button"
            onClick={() => loadFolder(currentPath)}
            title="Muat ulang direktori"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Sub-bar: Physical path & live filter */}
      <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="text-xs text-slate-500 flex items-center gap-2 min-w-0">
          <span className="font-mono text-slate-700 truncate">/public_html{currentPath}/</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums shrink-0">
            {browseData ? `${browseData.folders.length} Folder` : '0 Folder'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums shrink-0">
            {combinedFiles.length} File ({formatBytes(browseData?.totalSizeBytes || 0)})
          </span>
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter nama file atau folder..."
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Drag & Drop Quick Strip */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="mx-5 mt-4 px-4 py-3 border border-dashed border-slate-300 hover:border-blue-600 bg-slate-50/60 hover:bg-blue-50/30 rounded-lg cursor-pointer transition-colors flex flex-col sm:flex-row items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2.5 text-xs text-slate-600">
          <Upload className="w-4 h-4 text-blue-700 shrink-0" />
          <span>
            Seret dan lepaskan dokumen ke area ini atau <strong className="text-blue-700 font-semibold">klik untuk memilih file</strong> (maks. 50 MB/file)
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono shrink-0">
          PDF · DOCX · XLSX · PPTX · JPG · PNG · ZIP
        </span>
      </div>

      {/* Main Directory Table */}
      <div className="p-5">
        {errorMsg ? (
          <div className="p-6 text-center border border-red-200 bg-red-50 rounded-lg text-xs text-red-700">
            {errorMsg}
          </div>
        ) : loading && !browseData ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredFolders.length === 0 && filteredFiles.length === 0 ? (
          <div className="py-12 text-center">
            <FolderOpen className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
            <p className="text-sm font-medium text-slate-700">
              {searchQuery ? 'Tidak ada item yang cocok dengan pencarian' : 'Direktori ini masih kosong'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Buat subfolder baru untuk mengorganisir berkas atau unggah dokumen langsung ke direktori ini.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4">Nama Item</th>
                    <th className="py-2.5 px-4">Jenis</th>
                    <th className="py-2.5 px-4 text-right">Ukuran / Isi</th>
                    <th className="py-2.5 px-4">Terakhir Diubah</th>
                    <th className="py-2.5 px-4 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {/* Folders */}
                  {filteredFolders.map((folder) => (
                    <tr
                      key={folder.logicalPath}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      <td className="py-2.5 px-4">
                        <button
                          type="button"
                          onClick={() => setCurrentPath(folder.logicalPath)}
                          className="flex items-center gap-2.5 font-semibold text-slate-800 hover:text-blue-700 text-left"
                        >
                          <Folder className="w-4 h-4 text-amber-500 fill-amber-500/20 shrink-0" />
                          <span className="truncate max-w-xs sm:max-w-md">{folder.name}</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">Folder</td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {folder.itemCount} item
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                        {folder.updatedAt}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setCurrentPath(folder.logicalPath)}
                            title="Buka folder"
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded transition-colors whitespace-nowrap shrink-0"
                          >
                            Buka
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setNameModal({
                                isOpen: true,
                                mode: 'rename-folder',
                                targetPath: folder.logicalPath,
                                initialValue: folder.name,
                              })
                            }
                            title="Ganti nama folder"
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={buildZipDownloadUrl(token, folder.logicalPath)}
                            title="Unduh folder sebagai ZIP"
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => promptDeleteFolder(folder)}
                            title="Hapus folder beserta isinya"
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Files */}
                  {filteredFiles.map((file) => (
                    <tr key={file.logicalPath} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {getFileIcon(file.extension)}
                          <span className="font-medium text-slate-800 truncate max-w-xs sm:max-w-md">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 font-mono">
                        {file.extension.toUpperCase()}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-600">
                        {formatBytes(file.size)}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500">
                        {file.updatedAt}
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {file.isPreviewable && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewFile({
                                  isOpen: true,
                                  name: file.name,
                                  mimeType: file.mimeType,
                                  logicalPath: file.logicalPath,
                                })
                              }
                              title="Pratinjau dokumen"
                              className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <a
                            href={buildDownloadUrl(token, file.logicalPath, file.name)}
                            download={file.name}
                            title="Unduh file"
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Unduh</span>
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setNameModal({
                                isOpen: true,
                                mode: 'rename-file',
                                targetPath: file.logicalPath,
                                initialValue: file.name,
                              })
                            }
                            title="Ganti nama file"
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => promptDeleteFile(file)}
                            title="Hapus file dari server"
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create / Rename Modal */}
      <EntryNameModal
        isOpen={nameModal.isOpen}
        mode={nameModal.mode}
        currentParentPath={currentPath}
        initialValue={nameModal.initialValue}
        isSubmitting={isMutating}
        onClose={() => setNameModal((prev) => ({ ...prev, isOpen: false }))}
        onSubmit={handleNameModalSubmit}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={Boolean(confirmState?.isOpen)}
        title={confirmState?.title || 'Konfirmasi'}
        message={confirmState?.message || ''}
        confirmLabel="Hapus Permanen"
        variant="danger"
        isLoading={isMutating}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => confirmState?.onConfirm()}
      />

      {/* File Preview Modal */}
      <FilePreviewModal
        isOpen={Boolean(previewFile?.isOpen)}
        fileName={previewFile?.name || ''}
        mimeType={previewFile?.mimeType || ''}
        previewUrl={previewFile ? buildPreviewUrl(token, previewFile.logicalPath) : ''}
        downloadUrl={
          previewFile ? buildDownloadUrl(token, previewFile.logicalPath, previewFile.name) : ''
        }
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};
