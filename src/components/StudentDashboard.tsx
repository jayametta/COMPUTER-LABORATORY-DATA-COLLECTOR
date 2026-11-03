import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import {
  ensureServerFolders,
  fetchStudentStorageSummary,
  formatBytes,
} from '../lib/api';
import { saveStudentToFirestore } from '../lib/firebase';
import type { StudentAccount } from '../types';
import { StorageExplorer } from './StorageExplorer';
import { ChangePasswordModal } from './StudentModals';

interface StudentDashboardProps {
  token: string;
  student: StudentAccount;
  onLogout: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const MAX_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB per student indicator

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  token,
  student,
  onLogout,
  onNotify,
}) => {
  const [changePassOpen, setChangePassOpen] = useState(false);

  // Ensure student's root folder & recorded subfolders exist on disk
  useEffect(() => {
    const paths = [
      student.folderPath,
      ...(student.subFolders || []).map((sf) => sf.logicalPath),
    ].filter(Boolean);
    ensureServerFolders(token, paths).catch(() => {
      // Non-fatal
    });
  }, [student.folderPath, student.subFolders, token]);

  const syncMyFolderSnapshot = useCallback(async () => {
    try {
      const summary = await fetchStudentStorageSummary(token, student.folderPath);
      await saveStudentToFirestore({
        ...student,
        files: summary.files,
        subFolders: summary.subFolders,
      });
    } catch {
      // Non-fatal sync
    }
  }, [student, token]);

  const handlePasswordChange = async (newPassword: string) => {
    await saveStudentToFirestore({
      ...student,
      password: newPassword,
    });
    onNotify('Kata sandi akun Anda berhasil diperbarui.', 'success');
  };

  const totalUsedBytes = (student.files || []).reduce((acc, f) => acc + (f.size || 0), 0);
  const quotaPct = Math.min((totalUsedBytes / MAX_QUOTA_BYTES) * 100, 100);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between gap-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0">
              EduDrive Storage
            </span>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
              /
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline truncate">
              Ruang Penyimpanan Siswa
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setChangePassOpen(true)}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-600" />
              <span>Ganti Kata Sandi</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 space-y-6">
        {/* Student Identity & Storage Summary Strip */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Kelas {student.kelas}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">No. Absen {student.noAbsen}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">@{student.username}</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 font-display truncate">
              {student.nama}
            </h1>
            <p className="text-xs font-mono text-slate-500 truncate">
              Direktori Hosting: /public_html{student.folderPath}
            </p>
          </div>

          <div className="w-full lg:w-72 shrink-0 space-y-2 border-t lg:border-t-0 lg:border-l border-slate-200 pt-4 lg:pt-0 lg:pl-6">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Penyimpanan Terpakai</span>
              <span className="font-mono font-semibold text-slate-800 tabular-nums">
                {formatBytes(totalUsedBytes)} / 100 MB
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                style={{ width: `${quotaPct}%` }}
                className="h-full bg-blue-700 rounded-full transition-opacity duration-150"
              />
            </div>
            <p className="text-[11px] text-slate-500 tabular-nums">
              {(student.files || []).length} berkas tersimpan ·{' '}
              {(student.subFolders || []).length} subfolder
            </p>
          </div>
        </div>

        {/* Scoped File & Subfolder Manager */}
        <StorageExplorer
          token={token}
          rootPath={student.folderPath}
          initialPath={student.folderPath}
          role="student"
          legacyFiles={student.files || []}
          onStorageMutated={syncMyFolderSnapshot}
          onNotify={onNotify}
        />
      </main>

      <ChangePasswordModal
        isOpen={changePassOpen}
        currentPassword={student.password}
        onClose={() => setChangePassOpen(false)}
        onChangePassword={handlePasswordChange}
      />
    </div>
  );
};
