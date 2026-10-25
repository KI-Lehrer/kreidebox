// Own background presets (no images from the original) + uploaded images.
import { getUploadUrl } from './data/uploads.js';

export const BACKGROUNDS = [
  { label: 'Morgen', type: 'gradient', value: ['#CFE0F0', '#F3E3CF'] },
  { label: 'Wiese', type: 'gradient', value: ['#D5EFD9', '#F4F1C9'] },
  { label: 'Meer', type: 'gradient', value: ['#BFE3EC', '#7FA9D6'] },
  { label: 'Abend', type: 'gradient', value: ['#F6C6B3', '#B9A6E0'] },
  { label: 'Herbst', type: 'gradient', value: ['#F2D3A0', '#D98E5E'] },
  { label: 'Nacht', type: 'gradient', value: ['#2B3245', '#4D3F6B'] },
  { label: 'Kreide', type: 'color', value: '#2F4A3A' },
  { label: 'Papier', type: 'color', value: '#F6F2E9' },
  { label: 'Hellgrau', type: 'color', value: '#E9ECF0' },
  { label: 'Weiss', type: 'color', value: '#FFFFFF' },
  { label: 'Himmelblau', type: 'color', value: '#CFE4F7' },
  { label: 'Salbei', type: 'color', value: '#CFDCCB' },
];

const FALLBACK = '#E9ECF0';

// Synchronous CSS for colours and gradients (uploads need resolveBackground)
export function backgroundCss(bg) {
  if (!bg) return FALLBACK;
  if (bg.type === 'color') return bg.value;
  if (bg.type === 'gradient') return `linear-gradient(135deg, ${bg.value[0]}, ${bg.value[1]})`;
  return FALLBACK;
}

// Slideshow: { type: 'slideshow', value: { uploadIds: [...], every: seconds } }
export const SLIDE_INTERVALS = [
  { s: 10, label: '10 Sekunden' }, { s: 30, label: '30 Sekunden' }, { s: 60, label: '1 Minute' },
  { s: 300, label: '5 Minuten' }, { s: 900, label: '15 Minuten' },
];
export const slideshowFirst = (bg) => ({ type: 'upload', value: (bg.value.uploadIds || [])[0] });
export function slideIndex(bg, nowMs = Date.now()) {
  const n = (bg.value.uploadIds || []).length;
  return n ? Math.floor(nowMs / 1000 / Math.max(5, bg.value.every || 60)) % n : 0;
}
export const slideAt = (bg, nowMs) => ({ type: 'upload', value: bg.value.uploadIds[slideIndex(bg, nowMs)] });

export async function resolveBackground(bg) {
  if (bg && bg.type === 'slideshow') return (bg.value.uploadIds || []).length ? resolveBackground(slideAt(bg)) : FALLBACK;
  if (bg && bg.type === 'upload') {
    const url = await getUploadUrl(bg.value);
    return url ? `center / cover no-repeat url("${url}"), ${FALLBACK}` : FALLBACK;
  }
  return backgroundCss(bg);
}

export const sameBackground = (a, b) => JSON.stringify(a) === JSON.stringify(b);
