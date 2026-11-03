import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FolderPlus,
  Info,
  Pencil,
  X,
  XCircle,
} from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((t) => {
        const Icon =
          t.type === 'success' ? CheckCircle2 : t.type === 'error' ? XCircle : Info;
        const iconColor =
          t.type === 'success'
            ? 'text-emerald-600'
            : t.type === 'error'
              ? 'text-red-600'
              : 'text-blue-600';

        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 bg-white border border-slate-200 shadow-lg rounded-lg px-4 py-3 text-sm text-slate-800 transition-opacity duration-150"
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
            <p className="flex-1 text-xs font-medium leading-relaxed text-slate-800">{t.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Tutup notifikasi"
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Lanjutkan',
  variant = 'danger',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const btnColors =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : variant === 'warning'
        ? 'bg-amber-600 hover:bg-amber-700 text-white'
        : 'bg-blue-700 hover:bg-blue-800 text-white';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 shadow-xl">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              variant === 'danger'
                ? 'bg-red-50 text-red-600'
                : variant === 'warning'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-blue-50 text-blue-700'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100">
          <button
            type="button"
            disabled={isLoading}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${btnColors}`}
          >
            {isLoading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

interface FolderNameModalProps {
  isOpen: boolean;
  mode: 'create-folder' | 'rename-folder' | 'rename-file';
  currentParentPath: string;
  initialValue?: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}

export const EntryNameModal: React.FC<FolderNameModalProps> = ({
  isOpen,
  mode,
  currentParentPath,
  initialValue = '',
  isSubmitting = false,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initialValue);

  useEffect(() => {
    if (isOpen) {
      setName(initialValue);
    }
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  const isCreate = mode === 'create-folder';
  const title =
    mode === 'create-folder'
      ? 'Buat Folder Baru di Server'
      : mode === 'rename-folder'
        ? 'Ubah Nama Folder'
        : 'Ubah Nama File';

  const sanitizedPreview = name.trim().replace(/[<>:"/\\|?*]/g, '_');

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sanitizedPreview) return;
    await onSubmit(sanitizedPreview);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {isCreate ? (
              <FolderPlus className="w-4 h-4 text-blue-700" />
            ) : (
              <Pencil className="w-4 h-4 text-blue-700" />
            )}
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              {mode === 'rename-file' ? 'Nama File Baru' : 'Nama Folder'}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === 'rename-file' ? 'Contoh: Laporan_Akhir.pdf' : 'Contoh: Tugas_Semester_1'
              }
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] text-slate-500">Lokasi Path di Server Hosting:</p>
            <p className="text-xs font-mono text-slate-800 break-all mt-0.5">
              {currentParentPath.replace(/\/$/, '')}/{sanitizedPreview || '...'}
              {mode !== 'rename-file' ? '/' : ''}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !sanitizedPreview}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {isSubmitting ? 'Menyimpan...' : isCreate ? 'Buat Folder' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface FilePreviewModalProps {
  isOpen: boolean;
  fileName: string;
  mimeType: string;
  previewUrl: string;
  downloadUrl: string;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  isOpen,
  fileName,
  mimeType,
  previewUrl,
  downloadUrl,
  onClose,
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [previewUrl]);

  if (!isOpen) return null;

  const isImage = mimeType.startsWith('image/');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-4xl w-full h-[82vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-blue-700 shrink-0" />
            <h3 className="text-sm font-semibold text-slate-900 truncate">{fileName}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={downloadUrl}
              download={fileName}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh File</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pratinjau"
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 overflow-auto flex items-center justify-center p-4">
          {isImage ? (
            imgError ? (
              <div className="text-center p-8 text-slate-500">
                <FileText className="w-10 h-10 mx-auto mb-2 text-slate-400" />
                <p className="text-xs">Gambar tidak dapat ditampilkan secara langsung. Silakan unduh file.</p>
              </div>
            ) : (
              <img
                src={previewUrl}
                alt={fileName}
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="max-w-full max-h-full object-contain rounded border border-slate-200 bg-white"
              />
            )
          ) : (
            <iframe
              src={previewUrl}
              title={fileName}
              className="w-full h-full bg-white rounded border border-slate-200"
            />
          )}
        </div>
      </div>
    </div>
  );
};
