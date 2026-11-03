import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import type { ArchiverError } from 'archiver';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const LOGICAL_ROOT = '/storage/data_siswa';
const PHYSICAL_ROOT = path.resolve(process.cwd(), 'storage', 'data_siswa');

// Ensure physical root directory exists on startup
fs.mkdirSync(PHYSICAL_ROOT, { recursive: true });

// Ephemeral HMAC key for signing session tokens (consistent during server runtime)
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`edudrive-storage-${process.cwd()}`).digest('hex');

// Default Super Admin SHA-256 credentials ('admin' or 'superadmin' / 'admin123')
const ADMIN_USER_HASHES = new Set([
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // admin
  'c7ad44cbad762a5da0a452f9e854fdc1e0e7a52a38015f23f3eab1d80b931dd4', // superadmin
]);
const DEFAULT_ADMIN_PASS_HASH =
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'; // admin123

interface SessionPayload {
  role: 'admin' | 'student';
  username: string;
  studentId?: string;
  folderPath?: string;
  exp: number;
}

interface AuthedRequest extends Request {
  session?: SessionPayload;
}

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function signSession(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 12, // 12 hours
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function normalizeLogicalPath(rawInput: string | undefined | null): string {
  if (!rawInput) return LOGICAL_ROOT;
  let cleaned = String(rawInput).trim().replace(/\\/g, '/');
  cleaned = cleaned.replace(/^\/public_html(?=\/storage\/)/i, '');
  cleaned = cleaned.replace(/\/+/g, '/');

  if (cleaned === '' || cleaned === '/' || cleaned === '/storage' || cleaned === '/storage/') {
    return LOGICAL_ROOT;
  }

  if (!cleaned.startsWith('/')) {
    cleaned = '/' + cleaned;
  }

  if (cleaned === LOGICAL_ROOT || cleaned === `${LOGICAL_ROOT}/`) {
    return LOGICAL_ROOT;
  }

  if (!cleaned.startsWith(`${LOGICAL_ROOT}/`)) {
    const stripped = cleaned.replace(/^\/+/, '');
    cleaned = `${LOGICAL_ROOT}/${stripped}`;
  }

  // Strip trailing slash
  if (cleaned.length > LOGICAL_ROOT.length && cleaned.endsWith('/')) {
    cleaned = cleaned.slice(0, -1);
  }

  const segments = cleaned.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '.' || seg === '..') {
      throw new Error('Path tidak valid: karakter navigasi direktori tidak diizinkan.');
    }
  }

  return '/' + segments.join('/');
}

function sanitizeEntryName(rawName: string): string {
  const trimmed = String(rawName || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+$/, '');
  if (!trimmed || trimmed === '.' || trimmed === '..') {
    throw new Error('Nama file atau folder tidak valid.');
  }
  return trimmed.slice(0, 180);
}

function resolveDiskPath(logicalPath: string): { normalized: string; diskPath: string } {
  const normalized = normalizeLogicalPath(logicalPath);
  const rel = normalized.slice(LOGICAL_ROOT.length).replace(/^\/+/, '');
  const diskPath = rel ? path.resolve(PHYSICAL_ROOT, rel) : PHYSICAL_ROOT;

  if (diskPath !== PHYSICAL_ROOT && !diskPath.startsWith(PHYSICAL_ROOT + path.sep)) {
    throw new Error('Akses di luar direktori storage tidak diizinkan.');
  }
  return { normalized, diskPath };
}

function assertPathAccess(
  session: SessionPayload,
  targetLogicalPath: string,
  options?: { requireStrictSubpath?: boolean }
): string {
  const normalizedTarget = normalizeLogicalPath(targetLogicalPath);

  if (session.role === 'admin') {
    if (options?.requireStrictSubpath && normalizedTarget === LOGICAL_ROOT) {
      throw new Error('Direktori utama /storage/data_siswa tidak dapat dihapus atau diubah namanya.');
    }
    return normalizedTarget;
  }

  if (!session.folderPath) {
    throw new Error('Akun siswa tidak memiliki konfigurasi folder storage.');
  }

  const studentRoot = normalizeLogicalPath(session.folderPath);
  const isRootMatch = normalizedTarget === studentRoot;
  const isChildMatch = normalizedTarget.startsWith(studentRoot + '/');

  if (!isRootMatch && !isChildMatch) {
    throw new Error('Akses ditolak: Anda hanya dapat mengakses folder milik akun Anda sendiri.');
  }

  if (options?.requireStrictSubpath && isRootMatch) {
    throw new Error('Folder utama akun siswa tidak dapat dihapus atau diubah namanya.');
  }

  return normalizedTarget;
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
  };
  return map[ext] || 'application/octet-stream';
}

function isPreviewableExt(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.csv', '.md', '.json'].includes(ext);
}

function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

async function computeRecursiveStats(dirPath: string): Promise<{ filesCount: number; totalBytes: number }> {
  let filesCount = 0;
  let totalBytes = 0;

  async function walk(current: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        try {
          const st = await fsp.stat(full);
          filesCount += 1;
          totalBytes += st.size;
        } catch {
          // ignore transient stat errors
        }
      }
    }
  }

  await walk(dirPath);
  return { filesCount, totalBytes };
}

async function collectStudentFolderSnapshot(studentRootLogical: string) {
  const { normalized, diskPath } = resolveDiskPath(studentRootLogical);
  await fsp.mkdir(diskPath, { recursive: true });

  const files: Array<{
    name: string;
    size: number;
    date: string;
    relativePath: string;
    logicalPath: string;
    mimeType: string;
  }> = [];
  const subFolders: Array<{
    name: string;
    logicalPath: string;
    createdAt: string;
  }> = [];

  async function walk(currentDisk: string, currentLogical: string) {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fsp.readdir(currentDisk, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const childDisk = path.join(currentDisk, entry.name);
      const childLogical = `${currentLogical}/${entry.name}`;
      try {
        const st = await fsp.stat(childDisk);
        if (entry.isDirectory()) {
          subFolders.push({
            name: entry.name,
            logicalPath: childLogical,
            createdAt: formatDateStr(st.birthtime || st.mtime),
          });
          await walk(childDisk, childLogical);
        } else if (entry.isFile()) {
          const relFromStudent = childLogical.slice(normalized.length + 1);
          files.push({
            name: entry.name,
            size: st.size,
            date: formatDateStr(st.mtime),
            relativePath: relFromStudent,
            logicalPath: childLogical,
            mimeType: getMimeType(entry.name),
          });
        }
      } catch {
        // ignore stat errors
      }
    }
  }

  await walk(diskPath, normalized);
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  return {
    folderPath: normalized + '/',
    files,
    subFolders,
    totalBytes,
  };
}

function requireSession(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  const session = verifySession(token);
  if (!session) {
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.' });
    return;
  }
  req.session = session;
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file
    files: 20,
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // 1. Auth Endpoints
  app.post('/api/auth/admin-session', (req: Request, res: Response) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
      return;
    }

    const uHash = sha256Hex(String(username).trim().toLowerCase());
    const pHash = sha256Hex(String(password).trim());

    if (!ADMIN_USER_HASHES.has(uHash) || pHash !== DEFAULT_ADMIN_PASS_HASH) {
      res.status(401).json({ error: 'Kredensial Super Admin tidak sesuai.' });
      return;
    }

    const token = signSession({
      role: 'admin',
      username: String(username).trim().toLowerCase(),
    });

    res.json({
      token,
      role: 'admin',
      username: String(username).trim(),
    });
  });

  app.post('/api/auth/student-session', async (req: Request, res: Response) => {
    try {
      const { studentId, username, folderPath } = req.body || {};
      if (!studentId || !username || !folderPath) {
        res.status(400).json({ error: 'Data sesi siswa tidak lengkap.' });
        return;
      }

      const { normalized, diskPath } = resolveDiskPath(String(folderPath));
      await fsp.mkdir(diskPath, { recursive: true });

      const token = signSession({
        role: 'student',
        username: String(username).trim(),
        studentId: String(studentId),
        folderPath: normalized,
      });

      res.json({
        token,
        role: 'student',
        username: String(username).trim(),
        studentId: String(studentId),
        folderPath: normalized + '/',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat sesi siswa.';
      res.status(400).json({ error: msg });
    }
  });

  // 2. Ensure Folders Exist on Server Disk (Batch Sync)
  app.post('/api/storage/ensure-folders', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const rawPaths: unknown = req.body?.paths;
      if (!Array.isArray(rawPaths)) {
        res.status(400).json({ error: 'Parameter paths harus berupa array.' });
        return;
      }

      const created: string[] = [];
      for (const p of rawPaths) {
        if (typeof p !== 'string' || !p.trim()) continue;
        const allowedPath = assertPathAccess(req.session!, p);
        const { normalized, diskPath } = resolveDiskPath(allowedPath);
        await fsp.mkdir(diskPath, { recursive: true });
        created.push(normalized + '/');
      }

      res.json({ ensured: created });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyiapkan direktori storage.';
      res.status(400).json({ error: msg });
    }
  });

  // 3. Browse Directory (Read Folder & Files Real-Time)
  app.get('/api/storage/browse', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const requestedPath =
        typeof req.query.path === 'string' && req.query.path.trim()
          ? req.query.path
          : req.session!.role === 'student'
            ? req.session!.folderPath || LOGICAL_ROOT
            : LOGICAL_ROOT;

      const allowedLogical = assertPathAccess(req.session!, requestedPath);
      const { normalized, diskPath } = resolveDiskPath(allowedLogical);
      await fsp.mkdir(diskPath, { recursive: true });

      const dirents = await fsp.readdir(diskPath, { withFileTypes: true });
      const folders = [];
      const files = [];

      for (const d of dirents) {
        const entryDisk = path.join(diskPath, d.name);
        const entryLogical = `${normalized}/${d.name}`;
        try {
          const st = await fsp.stat(entryDisk);
          if (d.isDirectory()) {
            const subEntries = await fsp.readdir(entryDisk).catch(() => []);
            folders.push({
              name: d.name,
              logicalPath: entryLogical,
              updatedAt: formatDateStr(st.mtime),
              itemCount: subEntries.length,
            });
          } else if (d.isFile()) {
            files.push({
              name: d.name,
              logicalPath: entryLogical,
              size: st.size,
              updatedAt: formatDateStr(st.mtime),
              extension: path.extname(d.name).replace('.', '').toLowerCase() || 'file',
              mimeType: getMimeType(d.name),
              isPreviewable: isPreviewableExt(d.name),
            });
          }
        } catch {
          // ignore transient stat issue
        }
      }

      folders.sort((a, b) => a.name.localeCompare(b.name, 'id'));
      files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const minRoot =
        req.session!.role === 'student' && req.session!.folderPath
          ? normalizeLogicalPath(req.session!.folderPath)
          : LOGICAL_ROOT;

      let parentPath: string | null = null;
      if (normalized !== minRoot && normalized.startsWith(minRoot + '/')) {
        const idx = normalized.lastIndexOf('/');
        parentPath = idx > 0 ? normalized.slice(0, idx) : minRoot;
      }

      const recursiveStats = await computeRecursiveStats(diskPath);

      res.json({
        currentPath: normalized,
        parentPath,
        folders,
        files,
        totalSizeBytes: recursiveStats.totalBytes,
        totalFilesCount: recursiveStats.filesCount,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membaca direktori server.';
      res.status(403).json({ error: msg });
    }
  });

  // 4. Student Folder Summary (for syncing physical folder state to Firestore)
  app.get('/api/storage/student-summary', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const targetPath = typeof req.query.folderPath === 'string' ? req.query.folderPath : '';
      if (!targetPath) {
        res.status(400).json({ error: 'Parameter folderPath diperlukan.' });
        return;
      }
      const allowed = assertPathAccess(req.session!, targetPath);
      const snapshot = await collectStudentFolderSnapshot(allowed);
      res.json(snapshot);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat ringkasan folder siswa.';
      res.status(400).json({ error: msg });
    }
  });

  // 5. Create Folder (CRUD - Create)
  app.post('/api/storage/folders', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const { parentPath, folderName, fullPath } = req.body || {};

      let targetLogical: string;
      if (typeof fullPath === 'string' && fullPath.trim()) {
        targetLogical = assertPathAccess(req.session!, fullPath);
      } else {
        const safeParent = assertPathAccess(req.session!, parentPath || LOGICAL_ROOT);
        const safeName = sanitizeEntryName(folderName);
        targetLogical = `${safeParent}/${safeName}`;
        assertPathAccess(req.session!, targetLogical);
      }

      const { normalized, diskPath } = resolveDiskPath(targetLogical);
      await fsp.mkdir(diskPath, { recursive: true });

      res.json({
        logicalPath: normalized,
        folderPathWithSlash: normalized + '/',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat folder baru di server.';
      res.status(400).json({ error: msg });
    }
  });

  // 6. Rename or Move Folder (CRUD - Update)
  app.patch('/api/storage/folders', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const { oldPath, newName, newPath } = req.body || {};
      if (!oldPath) {
        res.status(400).json({ error: 'Path folder asal wajib diisi.' });
        return;
      }

      const allowedOld = assertPathAccess(req.session!, oldPath, { requireStrictSubpath: true });
      const oldResolved = resolveDiskPath(allowedOld);

      let destinationLogical: string;
      if (typeof newPath === 'string' && newPath.trim()) {
        destinationLogical = assertPathAccess(req.session!, newPath, { requireStrictSubpath: true });
      } else {
        const cleanNewName = sanitizeEntryName(newName);
        const parentLogical = allowedOld.slice(0, allowedOld.lastIndexOf('/')) || LOGICAL_ROOT;
        destinationLogical = assertPathAccess(req.session!, `${parentLogical}/${cleanNewName}`, {
          requireStrictSubpath: true,
        });
      }

      const newResolved = resolveDiskPath(destinationLogical);
      if (oldResolved.diskPath === newResolved.diskPath) {
        res.json({ logicalPath: newResolved.normalized, folderPathWithSlash: newResolved.normalized + '/' });
        return;
      }

      if (fs.existsSync(newResolved.diskPath)) {
        res.status(409).json({ error: 'Folder dengan nama atau path tujuan tersebut sudah ada.' });
        return;
      }

      await fsp.mkdir(path.dirname(newResolved.diskPath), { recursive: true });
      if (fs.existsSync(oldResolved.diskPath)) {
        await fsp.rename(oldResolved.diskPath, newResolved.diskPath);
      } else {
        await fsp.mkdir(newResolved.diskPath, { recursive: true });
      }

      res.json({
        oldLogicalPath: oldResolved.normalized,
        logicalPath: newResolved.normalized,
        folderPathWithSlash: newResolved.normalized + '/',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah nama/path folder.';
      res.status(400).json({ error: msg });
    }
  });

  // 7. Delete Folder Recursively (CRUD - Delete)
  app.delete('/api/storage/folders', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const target = typeof req.body?.path === 'string' ? req.body.path : String(req.query.path || '');
      if (!target) {
        res.status(400).json({ error: 'Path folder yang akan dihapus wajib diisi.' });
        return;
      }

      const allowed = assertPathAccess(req.session!, target, { requireStrictSubpath: true });
      const { normalized, diskPath } = resolveDiskPath(allowed);

      if (fs.existsSync(diskPath)) {
        await fsp.rm(diskPath, { recursive: true, force: true });
      }

      res.json({ deletedPath: normalized });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus folder dari server.';
      res.status(400).json({ error: msg });
    }
  });

  // 8. Upload Files to Folder
  app.post(
    '/api/storage/upload',
    requireSession,
    upload.array('files', 20),
    async (req: AuthedRequest, res: Response) => {
      try {
        const targetFolderRaw = typeof req.body?.targetPath === 'string' ? req.body.targetPath : '';
        const allowedFolder = assertPathAccess(
          req.session!,
          targetFolderRaw || req.session!.folderPath || LOGICAL_ROOT
        );
        const { normalized, diskPath } = resolveDiskPath(allowedFolder);
        await fsp.mkdir(diskPath, { recursive: true });

        const uploadedFiles = (req.files as Express.Multer.File[]) || [];
        if (uploadedFiles.length === 0) {
          res.status(400).json({ error: 'Tidak ada file yang diterima oleh server.' });
          return;
        }

        const savedItems = [];
        for (const file of uploadedFiles) {
          // Decode UTF-8 filenames properly from multipart headers
          const decodedOriginal = Buffer.from(file.originalname, 'latin1').toString('utf8');
          const safeFileName = sanitizeEntryName(decodedOriginal);
          const ext = path.extname(safeFileName);
          const base = path.basename(safeFileName, ext);

          let finalName = safeFileName;
          let candidateDiskPath = path.join(diskPath, finalName);
          let counter = 1;
          while (fs.existsSync(candidateDiskPath)) {
            finalName = `${base}_${counter}${ext}`;
            candidateDiskPath = path.join(diskPath, finalName);
            counter += 1;
          }

          await fsp.writeFile(candidateDiskPath, file.buffer);
          const st = await fsp.stat(candidateDiskPath);
          savedItems.push({
            name: finalName,
            size: st.size,
            date: formatDateStr(st.mtime),
            logicalPath: `${normalized}/${finalName}`,
            mimeType: getMimeType(finalName),
          });
        }

        res.json({
          targetPath: normalized,
          uploaded: savedItems,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal mengunggah file ke server.';
        res.status(400).json({ error: msg });
      }
    }
  );

  // 9. Rename File
  app.patch('/api/storage/files', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const { filePath, newName } = req.body || {};
      if (!filePath || !newName) {
        res.status(400).json({ error: 'Path file dan nama baru wajib diisi.' });
        return;
      }

      const allowedOld = assertPathAccess(req.session!, filePath, { requireStrictSubpath: true });
      const oldResolved = resolveDiskPath(allowedOld);
      if (!fs.existsSync(oldResolved.diskPath)) {
        res.status(404).json({ error: 'File tidak ditemukan di server.' });
        return;
      }

      const cleanNewName = sanitizeEntryName(newName);
      const parentLogical = allowedOld.slice(0, allowedOld.lastIndexOf('/'));
      const newLogical = assertPathAccess(req.session!, `${parentLogical}/${cleanNewName}`, {
        requireStrictSubpath: true,
      });
      const newResolved = resolveDiskPath(newLogical);

      if (oldResolved.diskPath !== newResolved.diskPath && fs.existsSync(newResolved.diskPath)) {
        res.status(409).json({ error: 'File dengan nama tersebut sudah ada di folder ini.' });
        return;
      }

      await fsp.rename(oldResolved.diskPath, newResolved.diskPath);
      res.json({
        oldPath: oldResolved.normalized,
        logicalPath: newResolved.normalized,
        name: cleanNewName,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengganti nama file.';
      res.status(400).json({ error: msg });
    }
  });

  // 10. Delete File
  app.delete('/api/storage/files', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const target = typeof req.body?.path === 'string' ? req.body.path : String(req.query.path || '');
      if (!target) {
        res.status(400).json({ error: 'Path file wajib diisi.' });
        return;
      }

      const allowed = assertPathAccess(req.session!, target, { requireStrictSubpath: true });
      const { normalized, diskPath } = resolveDiskPath(allowed);

      if (fs.existsSync(diskPath)) {
        const st = await fsp.stat(diskPath);
        if (st.isDirectory()) {
          res.status(400).json({ error: 'Target adalah folder, gunakan endpoint hapus folder.' });
          return;
        }
        await fsp.unlink(diskPath);
      }

      res.json({ deletedPath: normalized });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus file dari server.';
      res.status(400).json({ error: msg });
    }
  });

  // 11. Download Physical File
  app.get('/api/storage/download', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const target = typeof req.query.path === 'string' ? req.query.path : '';
      const fallbackName = typeof req.query.name === 'string' ? req.query.name : '';
      if (!target) {
        res.status(400).json({ error: 'Path file wajib diisi.' });
        return;
      }

      const allowed = assertPathAccess(req.session!, target);
      const { diskPath } = resolveDiskPath(allowed);

      if (fs.existsSync(diskPath) && fs.statSync(diskPath).isFile()) {
        res.download(diskPath, path.basename(diskPath));
        return;
      }

      // Graceful fallback for legacy metadata-only files from previous client-side SPA
      const downloadName = sanitizeEntryName(fallbackName || path.basename(diskPath) || 'dokumen.txt');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(downloadName)}"`
      );
      res.send(
        `Arsip Dokumen EduDrive Storage\nNama File: ${downloadName}\nLokasi: ${allowed}\nCatatan: File ini merupakan metadata lama sebelum integrasi fisik server.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunduh file.';
      res.status(403).json({ error: msg });
    }
  });

  // 12. Inline File Preview
  app.get('/api/storage/preview', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const target = typeof req.query.path === 'string' ? req.query.path : '';
      if (!target) {
        res.status(400).json({ error: 'Path file wajib diisi.' });
        return;
      }

      const allowed = assertPathAccess(req.session!, target);
      const { diskPath } = resolveDiskPath(allowed);

      if (!fs.existsSync(diskPath) || !fs.statSync(diskPath).isFile()) {
        res.status(404).json({ error: 'File fisik tidak ditemukan di storage server.' });
        return;
      }

      const mime = getMimeType(diskPath);
      res.setHeader('Content-Type', mime);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(path.basename(diskPath))}"`);
      fs.createReadStream(diskPath).pipe(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memuat pratinjau file.';
      res.status(403).json({ error: msg });
    }
  });

  // 13. Download Directory as ZIP Archive
  app.get('/api/storage/zip', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      const target =
        typeof req.query.path === 'string' && req.query.path.trim()
          ? req.query.path
          : req.session!.role === 'student'
            ? req.session!.folderPath || LOGICAL_ROOT
            : LOGICAL_ROOT;

      const allowed = assertPathAccess(req.session!, target);
      const { normalized, diskPath } = resolveDiskPath(allowed);
      await fsp.mkdir(diskPath, { recursive: true });

      const folderLabel =
        normalized === LOGICAL_ROOT ? 'edudrive_seluruh_data_siswa' : path.basename(normalized);
      const zipFilename = `${sanitizeEntryName(folderLabel)}.zip`;

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFilename)}"`);

      const archive = new ZipArchive({ zlib: { level: 6 } });
      archive.on('error', (archiveErr: ArchiverError) => {
        if (!res.headersSent) {
          res.status(500).json({ error: archiveErr.message });
        } else {
          res.end();
        }
      });

      archive.pipe(res);
      archive.directory(diskPath, false);
      await archive.finalize();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuat arsip ZIP folder.';
      if (!res.headersSent) {
        res.status(403).json({ error: msg });
      }
    }
  });

  // 14. Admin Directory Tree Snapshot (for Direct FTP & Hosting Inspector)
  app.get('/api/storage/tree-snapshot', requireSession, async (req: AuthedRequest, res: Response) => {
    try {
      if (req.session!.role !== 'admin') {
        res.status(403).json({ error: 'Hanya Super Admin yang dapat melihat struktur penuh server.' });
        return;
      }

      interface TreeNode {
        name: string;
        type: 'folder' | 'file';
        logicalPath: string;
        size?: number;
        children?: TreeNode[];
      }

      async function buildTree(currDisk: string, currLogical: string, depth: number): Promise<TreeNode[]> {
        if (depth > 5) return [];
        const entries = await fsp.readdir(currDisk, { withFileTypes: true }).catch(() => []);
        const nodes: TreeNode[] = [];

        for (const entry of entries) {
          const fullDisk = path.join(currDisk, entry.name);
          const fullLogical = `${currLogical}/${entry.name}`;
          if (entry.isDirectory()) {
            const children = await buildTree(fullDisk, fullLogical, depth + 1);
            nodes.push({
              name: entry.name,
              type: 'folder',
              logicalPath: fullLogical,
              children,
            });
          } else if (entry.isFile()) {
            const st = await fsp.stat(fullDisk).catch(() => null);
            nodes.push({
              name: entry.name,
              type: 'file',
              logicalPath: fullLogical,
              size: st?.size || 0,
            });
          }
        }

        nodes.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name, 'id');
        });
        return nodes;
      }

      const tree = await buildTree(PHYSICAL_ROOT, LOGICAL_ROOT, 0);
      const stats = await computeRecursiveStats(PHYSICAL_ROOT);

      res.json({
        logicalRoot: `/public_html${LOGICAL_ROOT}/`,
        physicalRoot: PHYSICAL_ROOT,
        totalFiles: stats.filesCount,
        totalBytes: stats.totalBytes,
        tree,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membaca pohon direktori server.';
      res.status(500).json({ error: msg });
    }
  });

  // Normalize /indexadmin.html, /indexadmin.php, /index.php to clean SPA routes
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'GET') {
      const lowerPath = req.path.toLowerCase();
      if (lowerPath === '/indexadmin.html' || lowerPath === '/indexadmin.php') {
        req.url = '/indexadmin';
      } else if (lowerPath === '/index.php') {
        req.url = '/';
      }
    }
    next();
  });

  // Vite middleware in development, static dist serving in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EduDrive Storage server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
