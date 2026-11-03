import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { LoginPortal } from './components/LoginPortal';
import { ToastContainer } from './components/Modals';
import { StudentDashboard } from './components/StudentDashboard';
import { StudentLoginPage } from './components/StudentLoginPage';
import { requestAdminSession, requestStudentSession } from './lib/api';
import { ensureFirebaseReady, subscribeToStudents } from './lib/firebase';
import type { CurrentUserSession, StudentAccount, ToastMessage } from './types';

const STUDENT_SESSION_KEY = 'edudrive_student_session_v1';
const ADMIN_SESSION_KEY = 'edudrive_admin_session_v1';

function detectIsAdminRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const cleanPath = window.location.pathname.toLowerCase().replace(/\/+$/, '');
  if (
    cleanPath === '/indexadmin' ||
    cleanPath === '/indexadmin.html' ||
    cleanPath === '/indexadmin.php' ||
    cleanPath.endsWith('/indexadmin')
  ) {
    return true;
  }
  const hash = window.location.hash.toLowerCase();
  if (hash.startsWith('#/indexadmin') || hash === '#indexadmin') {
    return true;
  }
  return false;
}

export default function App() {
  const [isAdminPortal, setIsAdminPortal] = useState<boolean>(() => detectIsAdminRoute());
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [isDbReady, setIsDbReady] = useState<boolean>(false);

  const [studentSession, setStudentSession] = useState<CurrentUserSession | null>(() => {
    try {
      const saved = sessionStorage.getItem(STUDENT_SESSION_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as CurrentUserSession;
      return parsed.role === 'student' ? parsed : null;
    } catch {
      return null;
    }
  });

  const [adminSession, setAdminSession] = useState<CurrentUserSession | null>(() => {
    try {
      const saved = sessionStorage.getItem(ADMIN_SESSION_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved) as CurrentUserSession;
      return parsed.role === 'admin' ? parsed : null;
    } catch {
      return null;
    }
  });

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const syncRoute = () => setIsAdminPortal(detectIsAdminRoute());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const notify = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Initialize Firestore real-time subscription
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    ensureFirebaseReady()
      .then(() => {
        if (cancelled) return;
        setIsDbReady(true);
        unsub = subscribeToStudents(
          (updatedStudents) => {
            setStudents(updatedStudents);
          },
          () => {
            notify('Gagal memuat sinkronisasi database cloud.', 'error');
          }
        );
      })
      .catch(() => {
        if (!cancelled) {
          setIsDbReady(true);
        }
      });

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [notify]);

  // Persist student session
  useEffect(() => {
    try {
      if (studentSession) {
        sessionStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify(studentSession));
      } else {
        sessionStorage.removeItem(STUDENT_SESSION_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [studentSession]);

  // Persist admin session
  useEffect(() => {
    try {
      if (adminSession) {
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSession));
      } else {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [adminSession]);

  // Handler khusus halaman utama (/) -> Login Siswa saja
  const handleStudentLogin = async (usernameInput: string, passwordInput: string) => {
    const lowerUser = usernameInput.trim().toLowerCase();

    if (lowerUser === 'admin' || lowerUser === 'superadmin') {
      throw new Error('Halaman ini khusus untuk akun siswa.');
    }

    const matchedStudent = students.find(
      (s) => s.username.trim().toLowerCase() === lowerUser && s.password === passwordInput
    );

    if (!matchedStudent) {
      throw new Error('Username atau kata sandi tidak sesuai.');
    }

    const nextSession = await requestStudentSession({
      studentId: matchedStudent.id,
      username: matchedStudent.username,
      folderPath: matchedStudent.folderPath,
    });

    setStudentSession(nextSession);
    notify(`Selamat datang, ${matchedStudent.nama}.`, 'success');
  };

  // Handler khusus halaman /indexadmin -> Login Super Admin saja
  const handleAdminLogin = async (usernameInput: string, passwordInput: string) => {
    const lowerUser = usernameInput.trim().toLowerCase();

    if (lowerUser !== 'admin' && lowerUser !== 'superadmin') {
      throw new Error('Akses ditolak. Halaman ini khusus untuk Super Admin (Guru).');
    }

    const nextAdminSession = await requestAdminSession(usernameInput, passwordInput);
    setAdminSession(nextAdminSession);
    notify('Selamat datang di Panel Super Admin Guru.', 'success');
  };

  const handleStudentLogout = useCallback(() => {
    setStudentSession(null);
    notify('Anda telah keluar dari akun siswa.', 'info');
  }, [notify]);

  const handleAdminLogout = useCallback(() => {
    setAdminSession(null);
    notify('Anda telah keluar dari sesi Super Admin.', 'info');
  }, [notify]);

  const activeStudent =
    studentSession?.role === 'student'
      ? students.find((s) => s.id === studentSession.studentId) || null
      : null;

  useEffect(() => {
    if (isDbReady && studentSession && students.length > 0 && !activeStudent) {
      setStudentSession(null);
    }
  }, [isDbReady, studentSession, students, activeStudent]);

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {isAdminPortal ? (
        !adminSession ? (
          <LoginPortal
            isLoading={!isDbReady}
            isDbConnected={isDbReady}
            totalStudentsCount={students.length}
            onAdminLogin={handleAdminLogin}
          />
        ) : (
          <AdminDashboard
            token={adminSession.token}
            adminUsername={adminSession.username}
            students={students}
            onLogout={handleAdminLogout}
            onNotify={notify}
          />
        )
      ) : !studentSession ? (
        <StudentLoginPage
          isLoading={!isDbReady}
          onStudentLogin={handleStudentLogin}
        />
      ) : activeStudent ? (
        <StudentDashboard
          token={studentSession.token}
          student={activeStudent}
          onLogout={handleStudentLogout}
          onNotify={notify}
        />
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
          Memuat ruang penyimpanan siswa...
        </div>
      )}
    </>
  );
}
