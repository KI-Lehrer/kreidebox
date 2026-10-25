// Images and other files stored as Blobs in IndexedDB ("uploads").
import { get, getAll, put, del } from './db.js';
import { uid } from './store.js';

export const MAX_BYTES = 25 * 1024 * 1024;
const MAX_EDGE = 1920;
const urlCache = new Map(); // id -> object URL

// Shrinks large photos to max 1920 px (saves space); GIFs and SVGs stay untouched (animation, vector).
async function downscale(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close && bmp.close(); return file; }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res) => c.toBlob(res, type, 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

export async function putUpload(file, kind = 'image') {
  if (kind === 'pdf') { if (!file || file.type !== 'application/pdf') throw new Error('Bitte eine PDF-Datei wählen.'); }
  else if (!file || !/^image\//.test(file.type)) throw new Error('Bitte ein Bild wählen (PNG, JPG, GIF, WebP oder SVG).');
  if (file.size > MAX_BYTES) throw new Error('Die Datei ist grösser als 25 MB.');
  const blob = await downscale(file);
  const rec = { id: uid(), kind, name: file.name || 'Bild', mime: blob.type || file.type, bytes: blob.size, blob, starred: false, createdAt: new Date().toISOString() };
  await put('uploads', rec);
  return rec;
}

export async function putUploadRecord(rec) { await put('uploads', rec); urlCache.delete(rec.id); }
export const getUpload = (id) => get('uploads', id);

export async function getUploadUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await get('uploads', id);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  urlCache.set(id, url);
  return url;
}

export async function listUploads(kind) {
  const all = await getAll('uploads');
  return all.filter((u) => !kind || u.kind === kind).sort((a, b) => (b.starred - a.starred) || b.createdAt.localeCompare(a.createdAt));
}

export async function deleteUpload(id) {
  await del('uploads', id);
  if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
}

// File picker that resolves with the chosen file (or null)
export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
