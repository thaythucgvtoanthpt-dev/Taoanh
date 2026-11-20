import { toBlob } from 'html-to-image';
import JSZip from 'jszip';
import type { ExamQuestion } from '../types/exam';

export function padQuestionNumber(num: number): string {
  return String(num).padStart(2, '0');
}

export function sanitizePrefix(prefix: string): string {
  const cleaned = prefix
    .trim()
    .replace(/[^a-zA-Z0-9_\-\u00C0-\u024F\u1E00-\u1EFF ]/g, '')
    .replace(/\s+/g, '_');
  return cleaned || 'Cau';
}

/**
 * Extracts a short, filesystem-safe part tag from a GDPT 2018 part title
 * (e.g. "PHẦN I. ..." -> "P1", "PHẦN II. ..." -> "P2", "PHẦN III. ..." -> "P3", "PHẦN TỰ LUẬN" -> "TL").
 */
export function extractPartTag(partTitle: string, type?: string): string {
  const normalized = (partTitle || '').trim().toUpperCase();
  const romanMatch = normalized.match(/PHẦN\s+(IV|III|II|I|V)\b/);
  if (romanMatch) {
    const map: Record<string, string> = {
      I: 'Phan1',
      II: 'Phan2',
      III: 'Phan3',
      IV: 'Phan4',
      V: 'Phan5',
    };
    return map[romanMatch[1]] || `Phan_${romanMatch[1]}`;
  }
  const numMatch = normalized.match(/PHẦN\s+(\d+)\b/);
  if (numMatch) {
    return `Phan${numMatch[1]}`;
  }
  if (normalized.includes('TỰ LUẬN') || type === 'essay') return 'TuLuan';
  if (type === 'true_false') return 'DungSai';
  if (type === 'short_answer') return 'TraLoiNgan';
  return 'Phan1';
}

export function buildImageFilename(
  prefix: string,
  questionNumber: number,
  suffix = ''
): string {
  const cleanPrefix = sanitizePrefix(prefix);
  const numStr = padQuestionNumber(questionNumber);
  return suffix ? `${cleanPrefix}_${numStr}_${suffix}.png` : `${cleanPrefix}_${numStr}.png`;
}

/**
 * Builds a guaranteed-unique filename map (`question.id -> filename.png`) for all
 * questions in an exam.
 * - If all question numbers are unique, uses clean names: `Cau_01.png`, `Cau_02.png`...
 * - If numbers repeat across GDPT 2018 parts (e.g. Phần I Câu 1..12, Phần II Câu 1..4,
 *   Phần III Câu 1..6), automatically prefixes each with its part tag (`Phan1_Cau_01.png`,
 *   `Phan2_Cau_01.png`, `Phan3_Cau_01.png`) so ZIP export NEVER overwrites any image!
 */
export function buildQuestionFilenameMap(
  questions: ExamQuestion[],
  prefix: string
): Map<string, string> {
  const cleanPrefix = sanitizePrefix(prefix);
  const numberCounts = new Map<number, number>();
  for (const q of questions) {
    numberCounts.set(q.questionNumber, (numberCounts.get(q.questionNumber) || 0) + 1);
  }
  const hasDuplicateNumbers = Array.from(numberCounts.values()).some((c) => c > 1);

  const used = new Set<string>();
  const result = new Map<string, string>();

  for (const q of questions) {
    const numStr = padQuestionNumber(q.questionNumber);
    const baseName = hasDuplicateNumbers
      ? `${extractPartTag(q.partTitle, q.type)}_${cleanPrefix}_${numStr}`
      : `${cleanPrefix}_${numStr}`;

    let candidate = `${baseName}.png`;
    let dupIndex = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${baseName}_${dupIndex}.png`;
      dupIndex++;
    }

    used.add(candidate.toLowerCase());
    result.set(q.id, candidate);
  }

  return result;
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function waitForEmbeddedImages(element: HTMLElement): Promise<void> {
  const imgs = Array.from(element.querySelectorAll('img'));
  if (imgs.length === 0) return;

  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          const finish = () => {
            if (typeof img.decode === 'function') {
              img
                .decode()
                .catch(() => undefined)
                .finally(() => resolve());
            } else {
              resolve();
            }
          };

          if (img.complete && img.naturalWidth > 0) {
            finish();
            return;
          }

          const timer = setTimeout(() => resolve(), 3000);
          img.addEventListener(
            'load',
            () => {
              clearTimeout(timer);
              finish();
            },
            { once: true }
          );
          img.addEventListener(
            'error',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        })
    )
  );
}

export async function captureElementToPngBlob(
  element: HTMLElement,
  pixelRatio: 1 | 2 = 2
): Promise<Blob> {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  // Ensure all embedded figures/diagrams are decoded BEFORE measuring height
  await waitForEmbeddedImages(element);

  // Wait 2 animation frames so flexbox/grid + KaTeX + images settle to final dimensions
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined)))
  );

  const rect = element.getBoundingClientRect();
  const width = Math.ceil(Math.max(element.scrollWidth, element.offsetWidth, rect.width, 1600));
  const height = Math.ceil(
    Math.max(element.scrollHeight, element.offsetHeight, rect.height) + 2
  );

  // Protect against browser canvas max height (~16384px) on exceptionally long essay solutions
  const maxSafeCanvasHeight = 14000;
  const effectiveRatio =
    height * pixelRatio > maxSafeCanvasHeight
      ? Math.max(1, Math.floor((maxSafeCanvasHeight / height) * 10) / 10)
      : pixelRatio;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const blob = await toBlob(element, {
        width,
        height,
        canvasWidth: Math.round(width * effectiveRatio),
        canvasHeight: Math.round(height * effectiveRatio),
        pixelRatio: effectiveRatio,
        cacheBust: false,
        skipAutoScale: true,
        backgroundColor: '#eef5fc',
        style: {
          transform: 'none',
          margin: '0',
          width: `${width}px`,
          height: `${height}px`,
        },
      });

      if (blob && blob.size > 0) {
        return blob;
      }
      lastErr = new Error('Ảnh PNG tạo ra bị rỗng.');
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Không thể kết xuất hình ảnh PNG từ khung câu hỏi.');
}

export interface ZipFileEntry {
  path: string;
  blob: Blob;
}

export async function createZipArchive(entries: ZipFileEntry[]): Promise<Blob> {
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, entry.blob);
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
