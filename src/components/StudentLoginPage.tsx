import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, User } from 'lucide-react';

interface StudentLoginPageProps {
  isLoading: boolean;
  onStudentLogin: (username: string, password: string) => Promise<void>;
}

export const StudentLoginPage: React.FC<StudentLoginPageProps> = ({
  isLoading,
  onStudentLogin,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    setErrorText(null);
    setSubmitting(true);
    try {
      await onStudentLogin(username.trim(), password.trim());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal masuk ke sistem.';
      setErrorText(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Header Aplikasi */}
      <header className="h-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center">
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
            EduDrive Storage
          </span>
        </div>
      </header>

      {/* Form Login Siswa */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900 font-display">Masuk Akun Siswa</h1>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {errorText && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                {errorText}
              </div>
            )}

            <div>
              <label
                htmlFor="student-username"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="student-username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username"
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="student-password"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Kata Sandi
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="student-password"
                  type={showPass ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
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
              <span>{submitting ? 'Memproses...' : 'Masuk'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </main>
    </div>
  );
};
