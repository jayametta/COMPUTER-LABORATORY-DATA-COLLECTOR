import React, { useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';

interface LoginPortalProps {
  isLoading: boolean;
  isDbConnected: boolean;
  totalStudentsCount: number;
  onAdminLogin: (username: string, password: string) => Promise<void>;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({
  isLoading,
  totalStudentsCount,
  onAdminLogin,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      await onAdminLogin(username.trim(), password.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk ke panel Super Admin.';
      setErrorText(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/indexadmin"
            className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            EduDrive Storage
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#fitur"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Manajemen Direktori
            </a>
            <a
              href="#alur"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Kontrol Siswa
            </a>
            <a
              href="#akses-ftp"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Akses FTP Server
            </a>
            <a
              href="/"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Halaman Siswa
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => usernameInputRef.current?.focus()}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Login Admin
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Workspace for Admin (indexadmin) */}
      <main id="portal" className="flex-1 flex items-center py-10 lg:py-16">
        <div className="max-w-7xl mx-auto px-6 w-full grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
          {/* Left Institutional Admin Brief */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <p className="text-xs font-medium text-blue-700">
                Portal Administrasi Guru · Akses Super Admin (/indexadmin)
              </p>
              <h1
                className="text-3xl sm:text-4xl lg:text-[2.6rem] font-bold tracking-tight text-slate-900 leading-[1.15] font-display max-w-2xl"
                style={{ textWrap: 'balance' }}
              >
                Kendali Penuh Akun Siswa, Direktori Hosting, dan Pengumpulan Berkas
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-2xl">
                Halaman ini dikhususkan bagi Guru dan Super Admin untuk mengelola pembuatan akun
                siswa (tunggal maupun import Excel/CSV), mengatur direktori fisik server secara
                real-time, serta memantau seluruh berkas yang telah dikumpulkan.
              </p>
            </div>

            <div id="alur" className="border-t border-slate-200 pt-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div id="fitur" className="space-y-1.5">
                <h2 className="text-sm font-semibold text-slate-900">
                  01. Direktori Otomatis
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pembuatan akun tunggal maupun import Excel/CSV langsung membentuk folder fisik
                  sesuai kelas dan nomor absen di server.
                </p>
              </div>

              <div id="keamanan" className="space-y-1.5">
                <h2 className="text-sm font-semibold text-slate-900">
                  02. CRUD Folder & Reset Sandi
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Kelola folder di seluruh ruang penyimpanan siswa dan kembalikan kata sandi siswa
                  ke pengaturan awal secara spesifik atau massal.
                </p>
              </div>

              <div id="akses-ftp" className="space-y-1.5">
                <h2 className="text-sm font-semibold text-slate-900">
                  03. Inspeksi Server & FTP
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Pantau pohon direktori fisik secara langsung, unduh arsip ZIP seluruh storage,
                  atau akses melalui protokol FTP hosting.
                </p>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>Akses terbatas Super Admin</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{totalStudentsCount} akun siswa terdaftar</span>
              <span aria-hidden="true">·</span>
              <span>Path dasar: /public_html/storage/data_siswa/</span>
            </div>
          </div>

          {/* Right Admin Login Card */}
          <div className="lg:col-span-5 flex items-center">
            <div className="w-full bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
              <div className="pb-5 border-b border-slate-200">
                <div className="flex items-center gap-2 text-blue-700 mb-1">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-semibold">Otorisasi Guru / Administrator</span>
                </div>
                <h2 className="text-xl font-bold text-slate-900 font-display">
                  Portal Masuk Super Admin
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Masukkan kredensial administrator untuk mengelola sistem dan penyimpanan server.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {errorText && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                    {errorText}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="admin-username"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Username Admin / NIP
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      ref={usernameInputRef}
                      id="admin-username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Masukkan username admin"
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-password"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Kata Sandi Admin
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="admin-password"
                      type={showPass ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Masukkan kata sandi admin"
                      className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      aria-label={showPass ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || isLoading}
                  className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <span>{submitting ? 'Memverifikasi Otorisasi...' : 'Masuk Dashboard Admin'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
                Halaman ini khusus untuk akses Super Admin. Siswa dapat masuk melalui halaman utama
                aplikasi.
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200 py-4">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>EduDrive Storage · Panel Administrasi Guru</span>
          <span>Penyimpanan Terintegrasi Server & Cloud Database</span>
        </div>
      </footer>
    </div>
  );
};
