import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocFromServer,
  writeBatch,
} from 'firebase/firestore';
import type { CustomFolderRecord, StudentAccount } from '../types';

export const firebaseConfig = {
  apiKey: 'AIzaSyBqoMyT0o47X0XsVZMB5crxYaymj5X1FoQ',
  authDomain: 'myclassroom-2006f.firebaseapp.com',
  projectId: 'myclassroom-2006f',
  storageBucket: 'myclassroom-2006f.firebasestorage.app',
  messagingSenderId: '1087632587340',
  appId: '1:1087632587340:web:d4dc8884843489373d12e9',
};

const APP_NAMESPACE = 'CloudStorage';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const STUDENTS_PATH = `artifacts/${APP_NAMESPACE}/public/data/students`;
const CUSTOM_FOLDERS_PATH = `artifacts/${APP_NAMESPACE}/public/data/custom_folders`;

let authInitPromise: Promise<void> | null = null;

export function ensureFirebaseReady(): Promise<void> {
  if (!authInitPromise) {
    authInitPromise = (async () => {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
      try {
        await getDocFromServer(doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'health', 'ping'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error('Please check your Firebase configuration.');
        }
      }
    })();
  }
  return authInitPromise;
}

export function normalizeStudentFolderPath(rawPath: string, kelas: string, noAbsen: string, username: string): string {
  const trimmed = (rawPath || '').trim().replace(/\\/g, '/').replace(/^\/public_html/i, '');
  if (trimmed) {
    let p = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    if (!p.startsWith('/storage/data_siswa/')) {
      p = `/storage/data_siswa/${p.replace(/^\/+/, '')}`;
    }
    p = p.replace(/\/+/g, '/');
    return p.endsWith('/') ? p : `${p}/`;
  }
  const safeKelas = (kelas || 'umum').trim().replace(/\s+/g, '-').toLowerCase();
  const safeAbsen = (noAbsen || '00').trim().padStart(2, '0').toLowerCase();
  const safeUser = (username || 'siswa').trim().replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
  return `/storage/data_siswa/${safeKelas}/${safeAbsen}-${safeUser}/`;
}

export function subscribeToStudents(
  onData: (students: StudentAccount[]) => void,
  onError?: (err: unknown) => void
): () => void {
  const colRef = collection(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'students');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: StudentAccount[] = [];
      snapshot.forEach((docSnap) => {
        const raw = docSnap.data() as Partial<StudentAccount>;
        if (!raw) return;
        const username = String(raw.username || '').trim();
        const kelas = String(raw.kelas || '').trim();
        const noAbsen = String(raw.noAbsen || '').trim();
        const password = String(raw.password || '');
        list.push({
          id: raw.id || docSnap.id,
          nama: String(raw.nama || ''),
          username,
          password,
          defaultPassword: String(raw.defaultPassword ?? password),
          kelas,
          noAbsen,
          folderPath: normalizeStudentFolderPath(raw.folderPath || '', kelas, noAbsen, username),
          files: Array.isArray(raw.files) ? raw.files : [],
          subFolders: Array.isArray(raw.subFolders) ? raw.subFolders : [],
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        });
      });

      list.sort((a, b) => {
        const classCmp = a.kelas.localeCompare(b.kelas, 'id');
        if (classCmp !== 0) return classCmp;
        return a.noAbsen.localeCompare(b.noAbsen, 'id', { numeric: true });
      });

      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      try {
        handleFirestoreError(error, OperationType.LIST, STUDENTS_PATH);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export function subscribeToCustomFolders(
  onData: (folders: CustomFolderRecord[]) => void
): () => void {
  const colRef = collection(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'custom_folders');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: CustomFolderRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CustomFolderRecord;
        if (data && data.logicalPath) {
          list.push({ ...data, id: data.id || docSnap.id });
        }
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, CUSTOM_FOLDERS_PATH);
      } catch {
        // Logged via handleFirestoreError
      }
    }
  );
}

export async function saveStudentToFirestore(student: StudentAccount): Promise<void> {
  await ensureFirebaseReady();
  const docPath = `${STUDENTS_PATH}/${student.id}`;
  try {
    const docRef = doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'students', student.id);
    await setDoc(docRef, {
      ...student,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function saveStudentsBatchToFirestore(students: StudentAccount[]): Promise<void> {
  await ensureFirebaseReady();
  // Firestore batches support up to 500 writes
  const chunkSize = 400;
  for (let i = 0; i < students.length; i += chunkSize) {
    const chunk = students.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    const nowIso = new Date().toISOString();
    for (const st of chunk) {
      const ref = doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'students', st.id);
      batch.set(ref, {
        ...st,
        updatedAt: nowIso,
      });
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, STUDENTS_PATH);
    }
  }
}

export async function deleteStudentFromFirestore(studentId: string): Promise<void> {
  await ensureFirebaseReady();
  const docPath = `${STUDENTS_PATH}/${studentId}`;
  try {
    const docRef = doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'students', studentId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function saveCustomFolderToFirestore(folder: CustomFolderRecord): Promise<void> {
  await ensureFirebaseReady();
  const docPath = `${CUSTOM_FOLDERS_PATH}/${folder.id}`;
  try {
    const docRef = doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'custom_folders', folder.id);
    await setDoc(docRef, folder);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCustomFolderFromFirestore(folderId: string): Promise<void> {
  await ensureFirebaseReady();
  const docPath = `${CUSTOM_FOLDERS_PATH}/${folderId}`;
  try {
    const docRef = doc(db, 'artifacts', APP_NAMESPACE, 'public', 'data', 'custom_folders', folderId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
