import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Download,
  FileSpreadsheet,
  KeyRound,
  Pencil,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { normalizeStudentFolderPath } from '../lib/firebase';
import type { CsvImportCandidate, StudentAccount } from '../types';

interface StudentFormModalProps {
  isOpen: boolean;
  editingStudent: StudentAccount | null;
  existingUsernames: Set<string>;
  onClose: () => void;
  onSubmit: (data: {
    nama: string;
    username: string;
    password: string;
    folderPath: string;
    kelas: string;
    noAbsen: string;
  }) => Promise<void>;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  editingStudent,
  existingUsernames,
  onClose,
  onSubmit,
}) => {
  const [nama, setNama] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [kelas, setKelas] = useState('');
  const [noAbsen, setNoAbsen] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [customPathEdited, setCustomPathEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      if (editingStudent) {
        setNama(editingStudent.nama);
        setUsername(editingStudent.username);
        setPassword(editingStudent.password);
        setKelas(editingStudent.kelas);
        setNoAbsen(editingStudent.noAbsen);
        setFolderPath(editingStudent.folderPath);
        setCustomPathEdited(true);
      } else {
        setNama('');
        setUsername('');
        setPassword('');
        setKelas('');
        setNoAbsen('');
        setFolderPath('/storage/data_siswa/kelas/00-username/');
        setCustomPathEdited(false);
      }
    }
  }, [isOpen, editingStudent]);

  useEffect(() => {
    if (!customPathEdited && isOpen && !editingStudent) {
      const autoPath = normalizeStudentFolderPath('', kelas || 'kelas', noAbsen || '00', username || 'username');
      setFolderPath(autoPath);
    }
  }, [kelas, noAbsen, username, customPathEdited, isOpen, editingStudent]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUser = username.trim();
    const lowerUser = cleanUser.toLowerCase();
    if (lowerUser === 'admin' || lowerUser === 'superadmin') {
      setFormError('Username tersebut dicadangkan untuk Super Admin.');
      return;
    }

    const isUnchangedSelf =
      editingStudent && editingStudent.username.toLowerCase() === lowerUser;
    if (!isUnchangedSelf && existingUsernames.has(lowerUser)) {
      setFormError(`Username "${cleanUser}" sudah terdaftar pada akun siswa lain.`);
      return;
    }

    const finalFolderPath = normalizeStudentFolderPath(folderPath, kelas, noAbsen, cleanUser);

    setSubmitting(true);
    try {
      await onSubmit({
        nama: nama.trim(),
        username: cleanUser,
        password: password.trim(),
        folderPath: finalFolderPath,
        kelas: kelas.trim(),
        noAbsen: noAbsen.trim(),
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan data akun siswa.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {editingStudent ? (
              <Pencil className="w-4 h-4 text-blue-700" />
            ) : (
              <UserPlus className="w-4 h-4 text-blue-700" />
            )}
            <h3 className="text-sm font-semibold text-slate-900">
              {editingStudent ? 'Perbarui Data & Direktori Siswa' : 'Tambah Akun Siswa Baru'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kelas *
              </label>
              <input
                type="text"
                required
                value={kelas}
                onChange={(e) => setKelas(e.target.value)}
                placeholder="Contoh: XII IPA 1"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nomor Absen *
              </label>
              <input
                type="text"
                required
                value={noAbsen}
                onChange={(e) => setNoAbsen(e.target.value)}
                placeholder="Contoh: 01"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nama Lengkap Siswa *
            </label>
            <input
              type="text"
              required
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Budi Pratama"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username Login *
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Contoh: budi2026"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {editingStudent ? 'Password Saat Ini *' : 'Password Default *'}
              </label>
              <input
                type="text"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contoh: siswa123"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">
                Path Folder Data di Hosting *
              </label>
              {customPathEdited && (
                <button
                  type="button"
                  onClick={() => {
                    const auto = normalizeStudentFolderPath('', kelas, noAbsen, username);
                    setFolderPath(auto);
                    setCustomPathEdited(false);
                  }}
                  className="text-[11px] font-medium text-blue-700 hover:underline"
                >
                  Atur Otomatis
                </button>
              )}
            </div>
            <input
              type="text"
              required
              value={folderPath}
              onChange={(e) => {
                setFolderPath(e.target.value);
                setCustomPathEdited(true);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              {editingStudent
                ? 'Mengubah path ini akan memindahkan direktori fisik beserta seluruh dokumen siswa di server.'
                : 'Direktori ini otomatis dibuat di dalam /storage/data_siswa/ pada server hosting.'}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {submitting
                ? 'Menyimpan...'
                : editingStudent
                  ? 'Simpan Perubahan'
                  : 'Simpan & Buat Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ImportStudentsModalProps {
  isOpen: boolean;
  existingUsernames: Set<string>;
  onClose: () => void;
  onImportConfirm: (candidates: CsvImportCandidate[]) => Promise<void>;
}

export const ImportStudentsModal: React.FC<ImportStudentsModalProps> = ({
  isOpen,
  existingUsernames,
  onClose,
  onImportConfirm,
}) => {
  const [candidates, setCandidates] = useState<CsvImportCandidate[]>([]);
  const [selectedFileName, setSelectedFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCandidates([]);
      setSelectedFileName('');
      setParseError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const downloadExcelTemplate = () => {
    const sampleRows = [
      {
        Nama: 'Rudi Hermawan',
        Username: 'rudi2026',
        Password: 'pass123',
        PathFolder: '/storage/data_siswa/xii-ipa-1/01-rudi2026/',
        Kelas: 'XII IPA 1',
        NoAbsen: '01',
      },
      {
        Nama: 'Dewi Lestari',
        Username: 'dewi2026',
        Password: 'pass123',
        PathFolder: '/storage/data_siswa/xii-ipa-1/02-dewi2026/',
        Kelas: 'XII IPA 1',
        NoAbsen: '02',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data_Siswa');
    XLSX.writeFile(wb, 'Template_Import_Siswa_EduDrive.xlsx');
  };

  const downloadCsvTemplate = () => {
    const csv =
      'Nama,Username,Password,PathFolder,Kelas,NoAbsen\n' +
      'Rudi Hermawan,rudi2026,pass123,/storage/data_siswa/xii-ipa-1/01-rudi2026/,XII IPA 1,01\n' +
      'Dewi Lestari,dewi2026,pass123,/storage/data_siswa/xii-ipa-1/02-dewi2026/,XII IPA 1,02\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Template_Import_Siswa_EduDrive.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFileName(file.name);
    setParseError(null);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
      });

      if (rows.length === 0) {
        setParseError('File kosong atau tidak memiliki baris data siswa.');
        setCandidates([]);
        return;
      }

      const seenInBatch = new Set<string>();
      const parsed: CsvImportCandidate[] = [];

      for (const row of rows) {
        // Normalize column keys flexibly (case-insensitive & space-insensitive)
        const normalizedMap: Record<string, string> = {};
        for (const [k, v] of Object.entries(row)) {
          const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          normalizedMap[cleanKey] = String(v ?? '').trim();
        }

        const nama =
          normalizedMap['nama'] ||
          normalizedMap['namasiswa'] ||
          normalizedMap['namalengkap'] ||
          '';
        const username = normalizedMap['username'] || normalizedMap['user'] || '';
        const password = normalizedMap['password'] || normalizedMap['sandi'] || '';
        const rawPath =
          normalizedMap['pathfolder'] ||
          normalizedMap['pathfolderdata'] ||
          normalizedMap['folderpath'] ||
          normalizedMap['path'] ||
          '';
        const kelas = normalizedMap['kelas'] || '';
        const noAbsen =
          normalizedMap['noabsen'] ||
          normalizedMap['nomorabsen'] ||
          normalizedMap['absen'] ||
          '';

        if (!nama || !username || !password) continue;

        const lowerUser = username.toLowerCase();
        const isDup =
          lowerUser === 'admin' ||
          lowerUser === 'superadmin' ||
          existingUsernames.has(lowerUser) ||
          seenInBatch.has(lowerUser);
        seenInBatch.add(lowerUser);

        parsed.push({
          nama,
          username,
          password,
          folderPath: normalizeStudentFolderPath(rawPath, kelas || 'umum', noAbsen || '00', username),
          kelas: kelas || 'Umum',
          noAbsen: noAbsen || '00',
          isDuplicate: isDup,
        });
      }

      if (parsed.length === 0) {
        setParseError(
          'Format kolom tidak dikenali. Pastikan terdapat kolom: Nama, Username, Password, PathFolder, Kelas, NoAbsen.'
        );
      }
      setCandidates(parsed);
    } catch {
      setParseError('Gagal membaca file. Gunakan format .xlsx, .xls, atau .csv yang valid.');
      setCandidates([]);
    }
  };

  const validCandidates = candidates.filter((c) => !c.isDuplicate);

  const handleConfirm = async () => {
    if (validCandidates.length === 0) return;
    setImporting(true);
    try {
      await onImportConfirm(validCandidates);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menjalankan import massal.';
      setParseError(msg);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full overflow-hidden shadow-xl flex flex-col max-h-[88vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Import Massal Akun Siswa (Excel .xlsx / .csv)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-800">Format Kolom Data Wajib:</p>
              <p className="text-xs font-mono text-slate-600">
                Nama · Username · Password · PathFolder · Kelas · NoAbsen
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={downloadExcelTemplate}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template .XLSX</span>
              </button>
              <button
                type="button"
                onClick={downloadCsvTemplate}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Template .CSV</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Pilih File Excel (.xlsx, .xls) atau CSV (.csv)
            </label>
            <label className="flex items-center justify-between px-4 py-3 border border-dashed border-slate-300 hover:border-blue-600 rounded-lg cursor-pointer bg-white hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2.5 text-xs text-slate-700">
                <Upload className="w-4 h-4 text-blue-700 shrink-0" />
                <span>
                  {selectedFileName
                    ? `File terpilih: ${selectedFileName}`
                    : 'Klik untuk memilih berkas Excel atau CSV dari perangkat Anda'}
                </span>
              </div>
              <span className="text-xs font-medium text-blue-700 whitespace-nowrap shrink-0">
                Pilih Berkas
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          {parseError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {parseError}
            </div>
          )}

          {candidates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>
                  Pratinjau Data:{' '}
                  <strong className="text-slate-900 tabular-nums">{validCandidates.length}</strong>{' '}
                  akun siap dibuat
                  {candidates.length - validCandidates.length > 0 &&
                    ` · ${candidates.length - validCandidates.length} duplikat dilewati`}
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-2 px-3">Absen</th>
                      <th className="py-2 px-3">Nama Siswa</th>
                      <th className="py-2 px-3">Kelas</th>
                      <th className="py-2 px-3">Username</th>
                      <th className="py-2 px-3">Path Folder</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {candidates.map((item, idx) => (
                      <tr
                        key={`${item.username}-${idx}`}
                        className={item.isDuplicate ? 'bg-red-50/40 text-slate-400' : 'bg-white'}
                      >
                        <td className="py-2 px-3 font-mono tabular-nums">{item.noAbsen}</td>
                        <td className="py-2 px-3 font-medium text-slate-800">{item.nama}</td>
                        <td className="py-2 px-3">{item.kelas}</td>
                        <td className="py-2 px-3 font-mono">{item.username}</td>
                        <td className="py-2 px-3 font-mono text-[11px] truncate max-w-[200px]">
                          {item.folderPath}
                        </td>
                        <td className="py-2 px-3">
                          {item.isDuplicate ? (
                            <span className="text-red-600 font-medium">Duplikat</span>
                          ) : (
                            <span className="text-emerald-700 font-medium">Siap</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-2.5 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={importing || validCandidates.length === 0}
            onClick={handleConfirm}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {importing
              ? 'Membuat Akun & Direktori...'
              : `Proses Import (${validCandidates.length} Siswa)`}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ChangePasswordModalProps {
  isOpen: boolean;
  currentPassword: string;
  onClose: () => void;
  onChangePassword: (newPassword: string) => Promise<void>;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  currentPassword,
  onClose,
  onChangePassword,
}) => {
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOldPass('');
      setNewPass('');
      setConfirmPass('');
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (oldPass !== currentPassword) {
      setErrorMsg('Kata sandi lama tidak sesuai.');
      return;
    }
    if (newPass.trim().length < 4) {
      setErrorMsg('Kata sandi baru minimal terdiri dari 4 karakter.');
      return;
    }
    if (newPass !== confirmPass) {
      setErrorMsg('Konfirmasi kata sandi baru tidak cocok.');
      return;
    }

    setSaving(true);
    try {
      await onChangePassword(newPass);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui kata sandi.';
      setErrorMsg(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900">Ganti Kata Sandi Akun Saya</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kata Sandi Saat Ini *
            </label>
            <input
              type="password"
              required
              value={oldPass}
              onChange={(e) => setOldPass(e.target.value)}
              placeholder="Masukkan sandi lama"
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Kata Sandi Baru *
            </label>
            <input
              type="password"
              required
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Minimal 4 karakter"
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Konfirmasi Kata Sandi Baru *
            </label>
            <input
              type="password"
              required
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
              placeholder="Ulangi kata sandi baru"
              className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Simpan Kata Sandi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
