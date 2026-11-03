import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Folder,
  FolderKanban,
  FolderOpen,
  HardDrive,
  KeyRound,
  LogOut,
  Menu,
  Network,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  buildZipDownloadUrl,
  createServerFolder,
  deleteServerFolder,
  ensureServerFolders,
  fetchServerTreeSnapshot,
  fetchStudentStorageSummary,
  formatBytes,
  renameOrMoveServerFolder,
  type TreeSnapshotNode,
  type TreeSnapshotResponse,
} from '../lib/api';
import {
  deleteStudentFromFirestore,
  saveStudentsBatchToFirestore,
  saveStudentToFirestore,
} from '../lib/firebase';
import type { CsvImportCandidate, StudentAccount } from '../types';
import { ConfirmDialog } from './Modals';
import { StorageExplorer } from './StorageExplorer';
import { ImportStudentsModal, StudentFormModal } from './StudentModals';

type AdminTab = 'students' | 'storage' | 'ftp';

interface AdminDashboardProps {
  token: string;
  adminUsername: string;
  students: StudentAccount[];
  onLogout: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function normalizePathNoSlash(p: string): string {
  const c = (p || '').trim().replace(/\/+$/, '');
  return c || '/storage/data_siswa';
}

const TreeNodeItem: React.FC<{
  node: TreeSnapshotNode;
  depth: number;
  onOpenFolder: (logicalPath: string) => void;
}> = ({ node, depth, onOpenFolder }) => {
  if (node.type === 'folder') {
    return (
      <div>
        <button
          type="button"
          onClick={() => onOpenFolder(node.logicalPath)}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          className="w-full py-1 pr-3 flex items-center justify-between text-left hover:bg-slate-800 rounded text-xs font-mono text-slate-200 transition-colors"
        >
          <span className="flex items-center gap-2 truncate">
            <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{node.name}/</span>
          </span>
          <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
            {node.children?.length || 0} item
          </span>
        </button>
        {node.children &&
          node.children.map((child) => (
            <TreeNodeItem
              key={child.logicalPath}
              node={child}
              depth={depth + 1}
              onOpenFolder={onOpenFolder}
            />
          ))}
      </div>
    );
  }

  return (
    <div
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      className="py-1 pr-3 flex items-center justify-between text-xs font-mono text-slate-400"
    >
      <span className="truncate">📄 {node.name}</span>
      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
        {formatBytes(node.size || 0)}
      </span>
    </div>
  );
};

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  token,
  adminUsername,
  students,
  onLogout,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('students');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Student filtering & password reveal
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [revealedPassIds, setRevealedPassIds] = useState<Set<string>>(new Set());

  // Modals
  const [studentModalOpen, setStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentAccount | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);

  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'warning';
    action: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Explorer selection
  const [explorerTargetPath, setExplorerTargetPath] = useState<string>('/storage/data_siswa');

  // FTP Tree Snapshot
  const [treeSnapshot, setTreeSnapshot] = useState<TreeSnapshotResponse | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

  // Ensure all student directories and subfolders exist physically on server storage
  useEffect(() => {
    if (students.length === 0) return;
    const allPaths: string[] = [];
    for (const s of students) {
      if (s.folderPath) allPaths.push(s.folderPath);
      if (s.subFolders) {
        for (const sf of s.subFolders) {
          if (sf.logicalPath) allPaths.push(sf.logicalPath);
        }
      }
    }
    ensureServerFolders(token, allPaths).catch(() => {
      // Non-fatal background directory sync
    });
  }, [students, token]);

  const loadTreeSnapshot = useCallback(async () => {
    setTreeLoading(true);
    try {
      const snap = await fetchServerTreeSnapshot(token);
      setTreeSnapshot(snap);
    } catch {
      // Ignore if transient
    } finally {
      setTreeLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'ftp') {
      loadTreeSnapshot();
    }
  }, [activeTab, loadTreeSnapshot]);

  // Unique classes for filter bar
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.kelas?.trim()) set.add(s.kelas.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [students]);

  const existingUsernames = useMemo(
    () => new Set(students.map((s) => s.username.toLowerCase())),
    [students]
  );

  // Metrics
  const stats = useMemo(() => {
    let totalFiles = 0;
    let totalBytes = 0;
    for (const s of students) {
      const files = s.files || [];
      totalFiles += files.length;
      for (const f of files) {
        totalBytes += f.size || 0;
      }
    }
    return {
      totalStudents: students.length,
      totalFolders: students.length,
      totalFiles,
      totalBytes,
    };
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      if (selectedClassFilter !== 'ALL' && s.kelas !== selectedClassFilter) {
        return false;
      }
      if (!q) return true;
      return (
        s.nama.toLowerCase().includes(q) ||
        s.username.toLowerCase().includes(q) ||
        s.kelas.toLowerCase().includes(q) ||
        s.noAbsen.toLowerCase().includes(q) ||
        s.folderPath.toLowerCase().includes(q)
      );
    });
  }, [students, selectedClassFilter, searchQuery]);

  // Sync physical folder summary back to Firestore when Explorer mutates inside a student's directory
  const handleStorageMutated = useCallback(
    async (mutatedPath: string) => {
      const cleanMutated = normalizePathNoSlash(mutatedPath);
      const ownerStudent = students.find((s) => {
        const sRoot = normalizePathNoSlash(s.folderPath);
        return cleanMutated === sRoot || cleanMutated.startsWith(sRoot + '/');
      });

      if (ownerStudent) {
        try {
          const summary = await fetchStudentStorageSummary(token, ownerStudent.folderPath);
          await saveStudentToFirestore({
            ...ownerStudent,
            files: summary.files,
            subFolders: summary.subFolders,
          });
        } catch {
          // Non-fatal sync
        }
      }
    },
    [students, token]
  );

  // Create or Update Student
  const handleSaveStudentForm = async (formData: {
    nama: string;
    username: string;
    password: string;
    folderPath: string;
    kelas: string;
    noAbsen: string;
  }) => {
    if (editingStudent) {
      const oldClean = normalizePathNoSlash(editingStudent.folderPath);
      const newClean = normalizePathNoSlash(formData.folderPath);

      if (oldClean !== newClean) {
        await renameOrMoveServerFolder(token, {
          oldPath: oldClean,
          newPath: newClean,
        });
      } else {
        await createServerFolder(token, { fullPath: newClean });
      }

      const summary = await fetchStudentStorageSummary(token, formData.folderPath);
      const updated: StudentAccount = {
        ...editingStudent,
        nama: formData.nama,
        username: formData.username,
        password: formData.password,
        kelas: formData.kelas,
        noAbsen: formData.noAbsen,
        folderPath: formData.folderPath,
        files: summary.files,
        subFolders: summary.subFolders,
      };
      await saveStudentToFirestore(updated);
      onNotify(`Data akun dan direktori ${formData.nama} berhasil diperbarui.`, 'success');
    } else {
      await createServerFolder(token, { fullPath: formData.folderPath });
      const newStudent: StudentAccount = {
        id: `std-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        nama: formData.nama,
        username: formData.username,
        password: formData.password,
        defaultPassword: formData.password,
        kelas: formData.kelas,
        noAbsen: formData.noAbsen,
        folderPath: formData.folderPath,
        files: [],
        subFolders: [],
        createdAt: new Date().toISOString(),
      };
      await saveStudentToFirestore(newStudent);
      onNotify(
        `Akun ${formData.nama} beserta direktori hosting berhasil dibuat.`,
        'success'
      );
    }
  };

  // Batch Import Students from Excel/CSV
  const handleBatchImport = async (candidates: CsvImportCandidate[]) => {
    const pathsToCreate = candidates.map((c) => c.folderPath);
    await ensureServerFolders(token, pathsToCreate);

    const nowIso = new Date().toISOString();
    const newRecords: StudentAccount[] = candidates.map((c, idx) => ({
      id: `std-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      nama: c.nama,
      username: c.username,
      password: c.password,
      defaultPassword: c.password,
      kelas: c.kelas,
      noAbsen: c.noAbsen,
      folderPath: c.folderPath,
      files: [],
      subFolders: [],
      createdAt: nowIso,
    }));

    await saveStudentsBatchToFirestore(newRecords);
    onNotify(
      `Berhasil mengimport ${newRecords.length} akun siswa dan membuat seluruh folder di server.`,
      'success'
    );
  };

  // Export Student Accounts to Excel
  const handleExportStudentsExcel = () => {
    if (students.length === 0) {
      onNotify('Belum ada data akun siswa untuk diekspor.', 'info');
      return;
    }
    const rows = students.map((s) => ({
      NoAbsen: s.noAbsen,
      Nama: s.nama,
      Kelas: s.kelas,
      Username: s.username,
      PasswordAktif: s.password,
      PasswordDefault: s.defaultPassword,
      PathFolder: s.folderPath,
      JumlahFile: (s.files || []).length,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daftar_Akun_Siswa');
    XLSX.writeFile(wb, 'Daftar_Akun_Siswa_EduDrive.xlsx');
    onNotify('Daftar akun siswa berhasil diekspor ke file Excel.', 'success');
  };

  // Reset Single Student Password to Default
  const handleResetSinglePassword = async (student: StudentAccount) => {
    try {
      await saveStudentToFirestore({
        ...student,
        password: student.defaultPassword,
      });
      onNotify(
        `Kata sandi ${student.nama} dikembalikan ke default (${student.defaultPassword}).`,
        'success'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mereset kata sandi.';
      onNotify(msg, 'error');
    }
  };

  // Reset ALL Student Passwords to Default
  const promptResetAllPasswords = () => {
    if (students.length === 0) {
      onNotify('Tidak ada akun siswa yang terdaftar.', 'info');
      return;
    }

    setConfirmState({
      isOpen: true,
      title: 'Reset Seluruh Kata Sandi Siswa?',
      message: `Tindakan ini akan mengembalikan kata sandi seluruh ${students.length} akun siswa ke password default masing-masing saat pertama kali didaftarkan oleh Guru.`,
      confirmLabel: 'Reset Semua Sandi',
      variant: 'warning',
      action: async () => {
        const resetList = students.map((s) => ({
          ...s,
          password: s.defaultPassword,
        }));
        await saveStudentsBatchToFirestore(resetList);
        onNotify('Seluruh kata sandi siswa telah dikembalikan ke pengaturan default.', 'success');
      },
    });
  };

  // Delete Student Account + Physical Server Folder
  const promptDeleteStudent = (student: StudentAccount) => {
    setConfirmState({
      isOpen: true,
      title: `Hapus Akun & Direktori ${student.nama}?`,
      message: `Akun "${student.username}" beserta direktori fisik "${student.folderPath}" dan seluruh file di dalamnya akan dihapus permanen dari database serta storage server hosting.`,
      confirmLabel: 'Hapus Akun & Folder',
      variant: 'danger',
      action: async () => {
        await deleteServerFolder(token, student.folderPath);
        await deleteStudentFromFirestore(student.id);
        onNotify(
          `Akun ${student.nama} beserta seluruh direktori hosting telah dihapus.`,
          'info'
        );
      },
    });
  };

  const executeConfirmedAction = async () => {
    if (!confirmState) return;
    setConfirmLoading(true);
    try {
      await confirmState.action();
      setConfirmState(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Operasi gagal dijalankan.';
      onNotify(msg, 'error');
    } finally {
      setConfirmLoading(false);
    }
  };

  const toggleRevealPassword = (id: string) => {
    setRevealedPassIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openStudentFolderInExplorer = (student: StudentAccount) => {
    setExplorerTargetPath(normalizePathNoSlash(student.folderPath));
    setActiveTab('storage');
  };

  const tabTitle =
    activeTab === 'students'
      ? 'Manajemen Siswa'
      : activeTab === 'storage'
        ? 'Explorer Storage Hosting'
        : 'Akses Direct FTP';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col shrink-0 transition-transform duration-150 ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 px-5 border-b border-slate-800 flex items-center justify-between">
          <span className="text-base font-bold text-white tracking-tight font-display whitespace-nowrap">
            EduDrive Storage
          </span>
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 border-b border-slate-800">
          <p className="text-xs font-semibold text-white">Panel Super Admin (Guru)</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Kontrol penuh akun & direktori server
          </p>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('students');
              setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'students'
                ? 'bg-blue-700 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Manajemen Akun Siswa</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('storage');
              setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'storage'
                ? 'bg-blue-700 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FolderKanban className="w-4 h-4 shrink-0" />
            <span>Explorer Storage Hosting</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('ftp');
              setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === 'ftp'
                ? 'bg-blue-700 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Network className="w-4 h-4 shrink-0" />
            <span>Akses Direct FTP</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500">
          Root Direktori:
          <p className="font-mono text-slate-300 mt-0.5 truncate">/storage/data_siswa/</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, primary user action on right */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-6 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Buka navigasi"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                Super Admin
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 truncate">{tabTitle}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="text-xs text-slate-600 hidden sm:inline whitespace-nowrap">
              Masuk sebagai <strong className="text-slate-900">{adminUsername}</strong>
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar</span>
            </button>
          </div>
        </header>

        {/* Viewport Body */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* TAB 1: MANAJEMEN SISWA */}
          {activeTab === 'students' && (
            <>
              {/* 4-Column Metric Summary Strip (Single Elevation, Tabular Figures) */}
              <div className="bg-white border border-slate-200 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                <div className="p-5">
                  <p className="text-xs font-medium text-slate-500">Total Akun Siswa</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 font-display tabular-nums">
                    {stats.totalStudents}
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-xs font-medium text-slate-500">Direktori Hosting Aktif</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 font-display tabular-nums">
                    {stats.totalFolders}
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-xs font-medium text-slate-500">Total File Terkumpul</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 font-display tabular-nums">
                    {stats.totalFiles}
                  </p>
                </div>
                <div className="p-5">
                  <p className="text-xs font-medium text-slate-500">Total Kapasitas Terpakai</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 font-display tabular-nums">
                    {formatBytes(stats.totalBytes)}
                  </p>
                </div>
              </div>

              {/* Action & Search Toolbar */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStudent(null);
                      setStudentModalOpen(true);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Tambah Siswa Baru</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Import Excel / CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportStudentsExcel}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ekspor .XLSX</span>
                  </button>

                  <button
                    type="button"
                    onClick={promptResetAllPasswords}
                    className="px-3.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Semua Password</span>
                  </button>
                </div>

                <div className="relative w-full lg:w-72 shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nama, username, kelas, folder..."
                    className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              {/* Interactive Class Filter Controls */}
              {availableClasses.length > 0 && (
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg overflow-x-auto w-fit max-w-full custom-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedClassFilter('ALL')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      selectedClassFilter === 'ALL'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua Kelas ({students.length})
                  </button>
                  {availableClasses.map((kls) => (
                    <button
                      key={kls}
                      type="button"
                      onClick={() => setSelectedClassFilter(kls)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        selectedClassFilter === kls
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {kls}
                    </button>
                  ))}
                </div>
              )}

              {/* Student Data Grid */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {filteredStudents.length === 0 ? (
                  <div className="py-14 px-6 text-center">
                    <Users className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
                    <p className="text-sm font-semibold text-slate-800">
                      {students.length === 0
                        ? 'Belum ada akun siswa yang didaftarkan'
                        : 'Tidak ada data siswa yang cocok dengan filter'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      {students.length === 0
                        ? 'Tambahkan akun siswa secara manual atau import massal dari berkas Excel (.xlsx) maupun CSV untuk membuat direktori siswa di server.'
                        : 'Coba ubah kata kunci pencarian atau pilih filter kelas lainnya.'}
                    </p>
                    {students.length === 0 && (
                      <div className="mt-4 flex items-center justify-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStudent(null);
                            setStudentModalOpen(true);
                          }}
                          className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                        >
                          Tambah Siswa Pertama
                        </button>
                        <button
                          type="button"
                          onClick={() => setImportModalOpen(true)}
                          className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          Import Excel / CSV
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                          <th className="py-3 px-4 w-20">Absen</th>
                          <th className="py-3 px-4">Nama Siswa & Akun</th>
                          <th className="py-3 px-4">Kelas</th>
                          <th className="py-3 px-4">Path Folder Hosting</th>
                          <th className="py-3 px-4">Kata Sandi</th>
                          <th className="py-3 px-4 text-right">Berkas</th>
                          <th className="py-3 px-4 text-right">Tindakan Guru</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {filteredStudents.map((s) => {
                          const filesCount = (s.files || []).length;
                          const studentBytes = (s.files || []).reduce(
                            (acc, f) => acc + (f.size || 0),
                            0
                          );
                          const isPassRevealed = revealedPassIds.has(s.id);
                          const isDefaultPass = s.password === s.defaultPassword;

                          return (
                            <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-700">
                                {s.noAbsen}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-slate-900">{s.nama}</div>
                                <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                                  @{s.username}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">
                                {s.kelas}
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  type="button"
                                  onClick={() => openStudentFolderInExplorer(s)}
                                  className="font-mono text-[11px] text-slate-600 hover:text-blue-700 flex items-center gap-1.5 text-left"
                                >
                                  <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <span className="truncate max-w-[220px]">{s.folderPath}</span>
                                </button>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-slate-700">
                                    {isPassRevealed ? s.password : '••••••••'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => toggleRevealPassword(s.id)}
                                    title={isPassRevealed ? 'Sembunyikan sandi' : 'Lihat sandi'}
                                    className="text-slate-400 hover:text-slate-700"
                                  >
                                    {isPassRevealed ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5">
                                  {isDefaultPass ? 'Sandi default' : 'Diubah siswa'}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                                <span className="font-semibold text-slate-800">
                                  {filesCount} file
                                </span>
                                <span className="text-slate-400 mx-1" aria-hidden="true">
                                  ·
                                </span>
                                <span className="font-mono text-slate-500">
                                  {formatBytes(studentBytes)}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openStudentFolderInExplorer(s)}
                                    title="Buka & kelola folder siswa di Explorer"
                                    className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                                  >
                                    <FolderOpen className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingStudent(s);
                                      setStudentModalOpen(true);
                                    }}
                                    title="Edit data atau path folder siswa"
                                    className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleResetSinglePassword(s)}
                                    title={`Reset sandi ke default (${s.defaultPassword})`}
                                    className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                  >
                                    <KeyRound className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => promptDeleteStudent(s)}
                                    title="Hapus akun siswa & direktori hosting"
                                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* TAB 2: EXPLORER STORAGE HOSTING (CRUD FOLDER & FILE REAL-TIME) */}
          {activeTab === 'storage' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Quick Directory Jump */}
              <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between">
                  <h2 className="text-xs font-semibold text-slate-800">Pintasan Direktori</h2>
                  <button
                    type="button"
                    onClick={() => setExplorerTargetPath('/storage/data_siswa')}
                    className="text-[11px] font-medium text-blue-700 hover:underline"
                  >
                    Root Server
                  </button>
                </div>

                <div className="p-2 max-h-[540px] overflow-y-auto custom-scrollbar space-y-0.5">
                  <button
                    type="button"
                    onClick={() => setExplorerTargetPath('/storage/data_siswa')}
                    className={`w-full px-3 py-2 rounded-lg text-left text-xs font-mono flex items-center gap-2 transition-colors ${
                      explorerTargetPath === '/storage/data_siswa'
                        ? 'bg-blue-50 text-blue-800 font-semibold'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <HardDrive className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="truncate">/storage/data_siswa/</span>
                  </button>

                  {students.length > 0 && (
                    <div className="pt-2 pb-1 px-3 text-[11px] font-semibold text-slate-400">
                      Direktori Akun Siswa ({students.length})
                    </div>
                  )}

                  {students.map((s) => {
                    const cleanSPath = normalizePathNoSlash(s.folderPath);
                    const isSelected = explorerTargetPath === cleanSPath;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setExplorerTargetPath(cleanSPath)}
                        className={`w-full px-3 py-2 rounded-lg text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-blue-50 text-blue-800 font-semibold'
                            : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">{s.nama}</div>
                          <div className="text-[11px] font-mono text-slate-400 truncate">
                            {s.kelas} · {s.noAbsen}
                          </div>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                          {(s.files || []).length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Full CRUD File & Folder Explorer */}
              <div className="lg:col-span-9">
                <StorageExplorer
                  token={token}
                  rootPath="/storage/data_siswa"
                  initialPath={explorerTargetPath}
                  role="admin"
                  legacyFiles={
                    students.find(
                      (s) => normalizePathNoSlash(s.folderPath) === explorerTargetPath
                    )?.files || []
                  }
                  onStorageMutated={handleStorageMutated}
                  onNotify={onNotify}
                />
              </div>
            </div>
          )}

          {/* TAB 3: AKSES DIRECT FTP & STRUKTUR HOSTING */}
          {activeTab === 'ftp' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="border-b border-slate-200 pb-4">
                  <h2 className="text-base font-bold text-slate-900 font-display">
                    Akses Langsung Berkas via FTP / SFTP Hosting
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    Seluruh folder dan dokumen yang dikelola melalui web ini disimpan dalam struktur
                    direktori fisik standar sehingga pemilik hosting/Guru dapat mengaksesnya
                    langsung menggunakan FileZilla, WinSCP, atau File Manager cPanel.
                  </p>
                </div>

                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg text-xs">
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <span className="text-slate-500">Protokol Koneksi</span>
                    <span className="font-mono font-medium text-slate-900">
                      FTP (Port 21) / SFTP (Port 22)
                    </span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <span className="text-slate-500">Host Server</span>
                    <span className="font-mono font-medium text-slate-900 truncate">
                      {typeof window !== 'undefined' ? window.location.hostname : 'ftp.domainsekolah.sch.id'}
                    </span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <span className="text-slate-500">Direktori Root Data Siswa</span>
                    <span className="font-mono font-semibold text-blue-700">
                      /public_html/storage/data_siswa/
                    </span>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between gap-4">
                    <span className="text-slate-500">Pola Folder Otomatis</span>
                    <span className="font-mono text-slate-800">
                      /[kelas]/[no_absen]-[username]/
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <a
                    href={buildZipDownloadUrl(token, '/storage/data_siswa')}
                    className="px-4 py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Arsip Seluruh Storage (.ZIP)</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setExplorerTargetPath('/storage/data_siswa');
                      setActiveTab('storage');
                    }}
                    className="px-4 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Buka di Web Explorer
                  </button>
                </div>
              </div>

              {/* Live Physical Server Directory Tree */}
              <div className="lg:col-span-6 bg-slate-900 text-slate-100 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold text-white">
                      Inspeksi Pohon Direktori Server Real-Time
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {treeSnapshot?.logicalRoot || '/public_html/storage/data_siswa/'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadTreeSnapshot}
                    title="Segarkan struktur direktori"
                    className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${treeLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="p-4 max-h-[420px] overflow-y-auto custom-scrollbar">
                  {treeLoading && !treeSnapshot ? (
                    <p className="text-xs text-slate-400 font-mono py-6 text-center">
                      Membaca direktori fisik server...
                    </p>
                  ) : !treeSnapshot || treeSnapshot.tree.length === 0 ? (
                    <p className="text-xs text-slate-400 font-mono py-8 text-center">
                      Direktori /storage/data_siswa/ masih kosong.
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {treeSnapshot.tree.map((node) => (
                        <TreeNodeItem
                          key={node.logicalPath}
                          node={node}
                          depth={0}
                          onOpenFolder={(p) => {
                            setExplorerTargetPath(p);
                            setActiveTab('storage');
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {treeSnapshot && (
                  <div className="px-5 py-3 border-t border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
                    <span className="tabular-nums">{treeSnapshot.totalFiles} berkas fisik</span>
                    <span className="tabular-nums">{formatBytes(treeSnapshot.totalBytes)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Student Modal */}
      <StudentFormModal
        isOpen={studentModalOpen}
        editingStudent={editingStudent}
        existingUsernames={existingUsernames}
        onClose={() => {
          setStudentModalOpen(false);
          setEditingStudent(null);
        }}
        onSubmit={handleSaveStudentForm}
      />

      {/* Batch Excel / CSV Import Modal */}
      <ImportStudentsModal
        isOpen={importModalOpen}
        existingUsernames={existingUsernames}
        onClose={() => setImportModalOpen(false)}
        onImportConfirm={handleBatchImport}
      />

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmState?.isOpen)}
        title={confirmState?.title || 'Konfirmasi'}
        message={confirmState?.message || ''}
        confirmLabel={confirmState?.confirmLabel || 'Lanjutkan'}
        variant={confirmState?.variant || 'danger'}
        isLoading={confirmLoading}
        onCancel={() => setConfirmState(null)}
        onConfirm={executeConfirmedAction}
      />
    </div>
  );
};
