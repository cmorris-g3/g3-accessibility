import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, JSON.stringify(data, null, 2), 'utf8');
}

export function slugifyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' ? 'home' : u.pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-');
    return path.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'home';
  } catch {
    return url.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }
}

export function slugifySite(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/\./g, '-');
  } catch {
    return url.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  }
}

export function runIdNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
}
