import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  FigureBoundingBox,
  ParseExamResponse,
  QuestionFigure,
} from '../types/exam';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function cropFromSourceCanvas(
  source: HTMLCanvasElement | HTMLImageElement,
  sourceWidth: number,
  sourceHeight: number,
  box: FigureBoundingBox
): string | null {
  const ymin = Math.max(0, Math.min(1000, box.ymin));
  const xmin = Math.max(0, Math.min(1000, box.xmin));
  const ymax = Math.max(0, Math.min(1000, box.ymax));
  const xmax = Math.max(0, Math.min(1000, box.xmax));

  if (ymax - ymin < 15 || xmax - xmin < 15) {
    return null;
  }

  // Add subtle 1.2% margin so axis/vertex labels near figure boundaries are never clipped
  const padY = 12;
  const padX = 12;
  const sy = Math.floor((Math.max(0, ymin - padY) / 1000) * sourceHeight);
  const sx = Math.floor((Math.max(0, xmin - padX) / 1000) * sourceWidth);
  const ey = Math.ceil((Math.min(1000, ymax + padY) / 1000) * sourceHeight);
  const ex = Math.ceil((Math.min(1000, xmax + padX) / 1000) * sourceWidth);

  const cw = Math.max(1, ex - sx);
  const ch = Math.max(1, ey - sy);
  if (cw < 20 || ch < 20) return null;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = cw;
  outCanvas.height = ch;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, cw, ch);
  return outCanvas.toDataURL('image/png');
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

/**
 * Crops original figures/diagrams from an uploaded PDF or image file using
 * normalized [0..1000] bounding boxes returned by Gemini.
 */
export async function hydrateFiguresFromUploadedFile(
  file: File | null,
  parsed: ParseExamResponse
): Promise<ParseExamResponse> {
  if (!file) return parsed;

  const hasAnyBoxes = parsed.questions.some(
    (q) =>
      (q.questionFigureBoxes && q.questionFigureBoxes.length > 0) ||
      (q.solutionFigureBoxes && q.solutionFigureBoxes.length > 0)
  );
  if (!hasAnyBoxes) return parsed;

  const ext = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || ext.endsWith('.pdf');
  const isImage =
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp)$/i.test(ext);

  if (!isPdf && !isImage) return parsed;

  try {
    if (isImage) {
      const img = await loadImageElement(file);
      const w = img.naturalWidth;
      const h = img.naturalHeight;

      const updatedQuestions = parsed.questions.map((q, qIdx) => {
        const qImgs: QuestionFigure[] = [...(q.questionImages || [])];
        const sImgs: QuestionFigure[] = [...(q.solutionImages || [])];

        (q.questionFigureBoxes || []).forEach((box, bIdx) => {
          const dataUrl = cropFromSourceCanvas(img, w, h, box);
          if (dataUrl) {
            qImgs.push({
              id: `fig-q-${qIdx}-${bIdx}-${Date.now()}`,
              dataUrl,
              caption: box.caption || '',
              widthPercent: 45,
            });
          }
        });

        (q.solutionFigureBoxes || []).forEach((box, bIdx) => {
          const dataUrl = cropFromSourceCanvas(img, w, h, box);
          if (dataUrl) {
            sImgs.push({
              id: `fig-s-${qIdx}-${bIdx}-${Date.now()}`,
              dataUrl,
              caption: box.caption || '',
              widthPercent: 52,
            });
          }
        });

        return { ...q, questionImages: qImgs, solutionImages: sImgs };
      });

      return { ...parsed, questions: updatedQuestions };
    }

    // PDF high-DPI page rendering & cropping
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageCache = new Map<number, HTMLCanvasElement>();

    const getRenderedPage = async (pageNum: number): Promise<HTMLCanvasElement | null> => {
      const safePage = Math.max(1, Math.min(pdfDoc.numPages, Math.round(pageNum || 1)));
      if (pageCache.has(safePage)) {
        return pageCache.get(safePage)!;
      }
      const page = await pdfDoc.getPage(safePage);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      pageCache.set(safePage, canvas);
      return canvas;
    };

    const updatedQuestions = [];
    for (let qIdx = 0; qIdx < parsed.questions.length; qIdx++) {
      const q = parsed.questions[qIdx];
      const qImgs: QuestionFigure[] = [...(q.questionImages || [])];
      const sImgs: QuestionFigure[] = [...(q.solutionImages || [])];

      for (let bIdx = 0; bIdx < (q.questionFigureBoxes || []).length; bIdx++) {
        const box = q.questionFigureBoxes![bIdx];
        const pageCanvas = await getRenderedPage(box.page);
        if (pageCanvas) {
          const dataUrl = cropFromSourceCanvas(
            pageCanvas,
            pageCanvas.width,
            pageCanvas.height,
            box
          );
          if (dataUrl) {
            qImgs.push({
              id: `pdf-fig-q-${qIdx}-${bIdx}-${Date.now()}`,
              dataUrl,
              caption: box.caption || '',
              widthPercent: 46,
            });
          }
        }
      }

      for (let bIdx = 0; bIdx < (q.solutionFigureBoxes || []).length; bIdx++) {
        const box = q.solutionFigureBoxes![bIdx];
        const pageCanvas = await getRenderedPage(box.page);
        if (pageCanvas) {
          const dataUrl = cropFromSourceCanvas(
            pageCanvas,
            pageCanvas.width,
            pageCanvas.height,
            box
          );
          if (dataUrl) {
            sImgs.push({
              id: `pdf-fig-s-${qIdx}-${bIdx}-${Date.now()}`,
              dataUrl,
              caption: box.caption || '',
              widthPercent: 52,
            });
          }
        }
      }

      updatedQuestions.push({
        ...q,
        questionImages: qImgs,
        solutionImages: sImgs,
      });
    }

    return { ...parsed, questions: updatedQuestions };
  } catch (err) {
    console.warn('Could not crop figures from uploaded file:', err);
    return parsed;
  }
}
