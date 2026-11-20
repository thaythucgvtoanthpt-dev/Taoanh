/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CardTemplateSettings,
  ExamQuestion,
  ExportContentMode,
  ParseExamResponse,
  SolveQuestionResponse,
} from './types/exam';
import {
  DEFAULT_TEMPLATE_SETTINGS,
  SAMPLE_EXAM_TITLE,
  SAMPLE_QUESTIONS,
} from './data/sampleExam';
import { QuestionCardCanvas } from './components/QuestionCardCanvas';
import { ScaledCardPreview } from './components/ScaledCardPreview';
import { InspectorPanel } from './components/InspectorPanel';
import { ImportExamModal } from './components/ImportExamModal';
import { BatchExportModal } from './components/BatchExportModal';
import { ReferenceSampleModal } from './components/ReferenceSampleModal';
import {
  buildImageFilename,
  buildQuestionFilenameMap,
  captureElementToPngBlob,
  createZipArchive,
  sanitizePrefix,
  triggerBrowserDownload,
  ZipFileEntry,
} from './utils/exportImages';
import { safeFetchJson } from './utils/api';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wand2,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';

const STORAGE_QUESTIONS_KEY = 'gdpt2018_exam_questions_v1';
const STORAGE_TITLE_KEY = 'gdpt2018_exam_title_v1';
const STORAGE_SETTINGS_KEY = 'gdpt2018_card_settings_v2';
const LEGACY_SETTINGS_KEY = 'gdpt2018_card_settings_v1';

function loadStoredQuestions(): ExamQuestion[] {
  try {
    const raw = localStorage.getItem(STORAGE_QUESTIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback to sample
  }
  return SAMPLE_QUESTIONS;
}

function loadStoredSettings(): CardTemplateSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      return { ...DEFAULT_TEMPLATE_SETTINGS, ...JSON.parse(raw) };
    }
    const legacyRaw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as Partial<CardTemplateSettings>;
      return {
        ...DEFAULT_TEMPLATE_SETTINGS,
        brandText: legacy.brandText ?? DEFAULT_TEMPLATE_SETTINGS.brandText,
        showBrandBanner:
          legacy.showBrandBanner ?? DEFAULT_TEMPLATE_SETTINGS.showBrandBanner,
        filePrefix: legacy.filePrefix ?? DEFAULT_TEMPLATE_SETTINGS.filePrefix,
        themeId: legacy.themeId ?? DEFAULT_TEMPLATE_SETTINGS.themeId,
        exportScale: legacy.exportScale ?? DEFAULT_TEMPLATE_SETTINGS.exportScale,
      };
    }
  } catch {
    // fallback
  }
  return DEFAULT_TEMPLATE_SETTINGS;
}

function loadStoredTitle(): string {
  try {
    return localStorage.getItem(STORAGE_TITLE_KEY) || SAMPLE_EXAM_TITLE;
  } catch {
    return SAMPLE_EXAM_TITLE;
  }
}

function stripLatexForSnippet(text: string): string {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, ' [công thức] ')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function App() {
  const [examTitle, setExamTitle] = useState<string>(loadStoredTitle);
  const [questions, setQuestions] = useState<ExamQuestion[]>(loadStoredQuestions);
  const [settings, setSettings] = useState<CardTemplateSettings>(loadStoredSettings);
  const [activeId, setActiveId] = useState<string>(() => loadStoredQuestions()[0]?.id || '');
  const [viewMode, setViewMode] = useState<'studio' | 'gallery'>('studio');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isBatchExportOpen, setIsBatchExportOpen] = useState(false);
  const [isReferenceOpen, setIsReferenceOpen] = useState(false);

  // Async states
  const [solvingQuestionId, setSolvingQuestionId] = useState<string | null>(null);
  const [batchSolvingStatus, setBatchSolvingStatus] = useState<string>('');
  const [isExportingSingle, setIsExportingSingle] = useState(false);
  const [exportProgress, setExportProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    label: '',
  });
  const [exportError, setExportError] = useState('');
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Offscreen native 1600px export stage
  const exportCanvasRef = useRef<HTMLDivElement>(null);
  const renderSeqRef = useRef(0);
  const [exportRenderState, setExportRenderState] = useState<{
    renderId: string;
    question: ExamQuestion;
    forceShowSolution: boolean;
  } | null>(null);

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_QUESTIONS_KEY, JSON.stringify(questions));
    } catch {
      // ignore quota errors
    }
  }, [questions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TITLE_KEY, examTitle);
    } catch {
      // ignore
    }
  }, [examTitle]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Ensure activeId stays valid
  useEffect(() => {
    if (questions.length === 0) {
      setActiveId('');
      return;
    }
    if (!questions.some((q) => q.id === activeId)) {
      setActiveId(questions[0].id);
    }
  }, [questions, activeId]);

  const activeIndex = useMemo(
    () => questions.findIndex((q) => q.id === activeId),
    [questions, activeId]
  );

  const activeQuestion = activeIndex >= 0 ? questions[activeIndex] : null;

  const filteredQuestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return questions;
    return questions.filter((item) => {
      const numText = `câu ${item.questionNumber}`;
      return (
        numText.includes(q) ||
        item.content.toLowerCase().includes(q) ||
        item.partTitle.toLowerCase().includes(q)
      );
    });
  }, [questions, searchQuery]);

  const stats = useMemo(() => {
    const total = questions.length;
    const solved = questions.filter((q) => q.solution.trim().length > 0).length;
    const selected = questions.filter((q) => q.selectedForExport).length;
    const unsolved = total - solved;
    return { total, solved, selected, unsolved };
  }, [questions]);

  const filenameMap = useMemo(
    () => buildQuestionFilenameMap(questions, settings.filePrefix),
    [questions, settings.filePrefix]
  );

  const getQuestionFilename = useCallback(
    (q: ExamQuestion) =>
      filenameMap.get(q.id) || buildImageFilename(settings.filePrefix, q.questionNumber),
    [filenameMap, settings.filePrefix]
  );

  const handleUpdateSettings = useCallback(
    (patch: Partial<CardTemplateSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    []
  );

  const handleUpdateQuestion = useCallback((updated: ExamQuestion) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === updated.id ? updated : q))
    );
  }, []);

  const solveUnsolvedInChunks = useCallback(
    async (targetList: ExamQuestion[], subjectTitle: string) => {
      const unsolvedList = targetList.filter(
        (q) => !q.solution.trim() && (q.solutionImages || []).length === 0
      );
      if (unsolvedList.length === 0) return;

      const CHUNK_SIZE = 3;
      let solvedCount = 0;

      for (let i = 0; i < unsolvedList.length; i += CHUNK_SIZE) {
        const chunk = unsolvedList.slice(i, i + CHUNK_SIZE);
        const firstNum = chunk[0].questionNumber;
        const lastNum = chunk[chunk.length - 1].questionNumber;
        const rangeText =
          chunk.length === 1 ? `Câu ${firstNum}` : `Câu ${firstNum}–${lastNum}`;

        setBatchSolvingStatus(
          `Đang tự giải ${rangeText} (${Math.min(i + chunk.length, unsolvedList.length)}/${unsolvedList.length}) theo GDPT 2018...`
        );
        setSolvingQuestionId(chunk[0].id);

        try {
          const data = await safeFetchJson<{
            solutions: Array<{
              id: string;
              correctAnswer: string;
              solution: string;
              correctLabels?: string[];
            }>;
          }>('/api/solve-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subjectHint: subjectTitle,
              questions: chunk.map((q) => ({
                id: q.id,
                questionNumber: q.questionNumber,
                partTitle: q.partTitle,
                type: q.type,
                content: q.content,
                options: q.options,
                questionImages: q.questionImages || [],
              })),
            }),
          });

          const byId = new Map(data.solutions.map((s) => [s.id, s]));
          setQuestions((prev) =>
            prev.map((q) => {
              const solved = byId.get(q.id);
              if (!solved) return q;
              const labelSet = new Set(
                (solved.correctLabels || []).map((l) => l.trim().toLowerCase())
              );
              return {
                ...q,
                correctAnswer: solved.correctAnswer || q.correctAnswer,
                solution: solved.solution || q.solution,
                options:
                  labelSet.size > 0
                    ? q.options.map((opt) => ({
                        ...opt,
                        isCorrect: labelSet.has(opt.label.trim().toLowerCase()),
                      }))
                    : q.options,
                isAiSolved: true,
              };
            })
          );
          solvedCount += data.solutions.length;
        } catch (err: unknown) {
          setToast({
            type: 'error',
            message: `Tạm dừng ở ${rangeText}: ${err instanceof Error ? err.message : 'Lỗi kết nối AI'}. Bạn có thể nhấn "Giải các câu chưa có đáp án" để tiếp tục.`,
          });
          break;
        }
      }

      setSolvingQuestionId(null);
      setBatchSolvingStatus('');
      if (solvedCount > 0) {
        setToast({
          type: 'success',
          message: `Đã tự giải chi tiết ${solvedCount} câu hỏi theo chuẩn Chương trình GDPT 2018.`,
        });
      }
    },
    []
  );

  const handleImportSuccess = useCallback(
    (result: ParseExamResponse, shouldAutoSolve: boolean) => {
      const mapped: ExamQuestion[] = result.questions.map((item, idx) => ({
        id: `q-${Date.now()}-${idx}`,
        questionNumber: item.questionNumber || idx + 1,
        partTitle:
          item.partTitle ||
          (item.type === 'true_false'
            ? 'PHẦN II. Câu trắc nghiệm đúng sai.'
            : item.type === 'short_answer'
              ? 'PHẦN III. Câu trắc nghiệm trả lời ngắn.'
              : item.type === 'essay'
                ? 'PHẦN TỰ LUẬN.'
                : 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.'),
        type: item.type || 'multiple_choice',
        content: item.content || '',
        options: Array.isArray(item.options) ? item.options : [],
        correctAnswer: item.correctAnswer || '',
        solution: item.solution || '',
        hasOriginalSolution: Boolean(item.hasOriginalSolution),
        isAiSolved: Boolean(item.isAiSolved),
        selectedForExport: true,
        optionColumns: 'auto',
        questionImages: Array.isArray(item.questionImages) ? item.questionImages : [],
        solutionImages: Array.isArray(item.solutionImages) ? item.solutionImages : [],
        questionImagePosition:
          Array.isArray(item.questionImages) && item.questionImages.length === 1
            ? 'right'
            : 'below',
      }));

      const nextTitle = result.examTitle || 'Đề thi mới nhập';
      setExamTitle(nextTitle);
      setQuestions(mapped);
      setActiveId(mapped[0]?.id || '');
      setViewMode('studio');

      const totalFigures = mapped.reduce(
        (sum, q) =>
          sum + (q.questionImages?.length || 0) + (q.solutionImages?.length || 0),
        0
      );
      const figNote = totalFigures > 0 ? ` và giữ nguyên ${totalFigures} hình vẽ gốc` : '';

      const missingCount = mapped.filter(
        (q) => !q.solution.trim() && (q.solutionImages || []).length === 0
      ).length;
      if (shouldAutoSolve && missingCount > 0) {
        setToast({
          type: 'success',
          message: `Đã tách nguyên văn ${mapped.length} câu hỏi${figNote}. Đang tự giải ${missingCount} câu chưa có lời giải theo GDPT 2018...`,
        });
        void solveUnsolvedInChunks(mapped, nextTitle);
      } else {
        setToast({
          type: 'success',
          message: `Đã tách nguyên văn ${mapped.length} câu hỏi${figNote} từ đề thi.`,
        });
      }
    },
    [solveUnsolvedInChunks]
  );

  const handleAddBlankQuestion = () => {
    const maxNum =
      questions.length > 0
        ? Math.max(...questions.map((q) => q.questionNumber))
        : 0;
    const nextNum = maxNum + 1;
    const newQ: ExamQuestion = {
      id: `q-manual-${Date.now()}`,
      questionNumber: nextNum,
      partTitle: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.',
      type: 'multiple_choice',
      content: 'Nhập nội dung câu hỏi tại đây...',
      options: [
        { label: 'A', content: '', isCorrect: false },
        { label: 'B', content: '', isCorrect: false },
        { label: 'C', content: '', isCorrect: false },
        { label: 'D', content: '', isCorrect: false },
      ],
      correctAnswer: '',
      solution: '',
      hasOriginalSolution: false,
      isAiSolved: false,
      selectedForExport: true,
      optionColumns: 'auto',
    };
    setQuestions((prev) => [...prev, newQ]);
    setActiveId(newQ.id);
    setViewMode('studio');
  };

  const handleDeleteQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const handleToggleSelectAll = (selected: boolean) => {
    setQuestions((prev) =>
      prev.map((q) => ({ ...q, selectedForExport: selected }))
    );
  };

  const handleToggleSelectOne = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === id ? { ...q, selectedForExport: !q.selectedForExport } : q
      )
    );
  };

  const handleResetSample = () => {
    setExamTitle(SAMPLE_EXAM_TITLE);
    setQuestions(SAMPLE_QUESTIONS);
    setActiveId(SAMPLE_QUESTIONS[0].id);
    setToast({
      type: 'success',
      message: 'Đã nạp lại bộ đề mẫu Toán 12 — GDPT 2018.',
    });
  };

  const solveSingleQuestion = async (question: ExamQuestion): Promise<ExamQuestion> => {
    const solved = await safeFetchJson<SolveQuestionResponse>('/api/solve-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionNumber: question.questionNumber,
        partTitle: question.partTitle,
        type: question.type,
        content: question.content,
        options: question.options,
        subjectHint: examTitle,
        questionImages: question.questionImages || [],
      }),
    });
    return {
      ...question,
      correctAnswer: solved.correctAnswer || question.correctAnswer,
      solution: solved.solution || question.solution,
      options:
        Array.isArray(solved.options) && solved.options.length > 0
          ? solved.options
          : question.options,
      isAiSolved: true,
    };
  };

  const handleSolveOne = async (question: ExamQuestion) => {
    if (solvingQuestionId) return;
    setSolvingQuestionId(question.id);
    try {
      const updated = await solveSingleQuestion(question);
      handleUpdateQuestion(updated);
      setToast({
        type: 'success',
        message: `Đã tự giải chi tiết Câu ${question.questionNumber} theo chương trình GDPT 2018.`,
      });
    } catch (err: unknown) {
      setToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Lỗi khi tự động giải câu hỏi.',
      });
    } finally {
      setSolvingQuestionId(null);
    }
  };

  const handleSolveAllMissing = async () => {
    const unsolvedList = questions.filter((q) => !q.solution.trim());
    if (unsolvedList.length === 0) {
      setToast({
        type: 'success',
        message: 'Tất cả các câu hỏi trong đề đều đã có lời giải chi tiết.',
      });
      return;
    }
    await solveUnsolvedInChunks(questions, examTitle);
  };

  // Render a specific question in the hidden 1600px native stage and wait deterministically for DOM commit
  const captureQuestionBlob = async (
    question: ExamQuestion,
    forceShowSolution: boolean
  ): Promise<Blob> => {
    renderSeqRef.current += 1;
    const renderId = `exp-${renderSeqRef.current}-${question.id}-${forceShowSolution ? 'sol' : 'q'}`;
    setExportRenderState({ renderId, question, forceShowSolution });

    // Wait until React commits the exact renderId into the hidden export DOM node
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      const node = exportCanvasRef.current;
      if (node && node.getAttribute('data-export-render-id') === renderId) {
        return captureElementToPngBlob(node, settings.exportScale);
      }
    }

    const fallbackNode = exportCanvasRef.current;
    if (!fallbackNode) {
      throw new Error('Không tìm thấy vùng kết xuất ảnh.');
    }
    return captureElementToPngBlob(fallbackNode, settings.exportScale);
  };

  const handleExportSingleQuestion = async (question: ExamQuestion) => {
    if (isExportingSingle || exportProgress.active) return;
    setIsExportingSingle(true);
    try {
      const blob = await captureQuestionBlob(question, settings.showSolutionBox);
      const filename = getQuestionFilename(question);
      triggerBrowserDownload(blob, filename);
      setToast({
        type: 'success',
        message: `Đã tải xuống hình ảnh ${filename}`,
      });
    } catch (err: unknown) {
      setToast({
        type: 'error',
        message:
          err instanceof Error ? err.message : 'Không thể xuất ảnh câu hỏi.',
      });
    } finally {
      setIsExportingSingle(false);
      setExportRenderState(null);
    }
  };

  const handleRunBatchExport = async ({
    contentMode,
    format,
  }: {
    contentMode: ExportContentMode;
    format: 'zip' | 'individual';
  }) => {
    const targets = questions.filter((q) => q.selectedForExport);
    if (targets.length === 0) return;

    setExportError('');
    const totalSteps =
      contentMode === 'split_zip' ? targets.length * 2 : targets.length;
    setExportProgress({
      active: true,
      current: 0,
      total: totalSteps,
      label: 'Đang chuẩn bị kết xuất hình ảnh...',
    });

    try {
      const zipEntries: ZipFileEntry[] = [];
      const batchFilenames = buildQuestionFilenameMap(targets, settings.filePrefix);
      let completed = 0;

      for (const q of targets) {
        const filename =
          batchFilenames.get(q.id) ||
          buildImageFilename(settings.filePrefix, q.questionNumber);

        if (contentMode === 'both' || contentMode === 'question_only') {
          const showSol = contentMode === 'both';
          setExportProgress({
            active: true,
            current: completed,
            total: totalSteps,
            label: `Đang kết xuất ${filename} (${completed + 1}/${totalSteps})...`,
          });

          const blob = await captureQuestionBlob(q, showSol);

          if (format === 'zip') {
            zipEntries.push({ path: filename, blob });
          } else {
            triggerBrowserDownload(blob, filename);
            await new Promise((r) => setTimeout(r, 480));
          }
          completed++;
        } else {
          // split_zip: capture question-only AND question+solution into two folders
          setExportProgress({
            active: true,
            current: completed,
            total: totalSteps,
            label: `Đang kết xuất đề ${filename} (${completed + 1}/${totalSteps})...`,
          });
          const qOnlyBlob = await captureQuestionBlob(q, false);
          zipEntries.push({
            path: `01_De_bai/${filename}`,
            blob: qOnlyBlob,
          });
          completed++;

          setExportProgress({
            active: true,
            current: completed,
            total: totalSteps,
            label: `Đang kết xuất lời giải ${filename} (${completed + 1}/${totalSteps})...`,
          });
          const fullBlob = await captureQuestionBlob(q, true);
          zipEntries.push({
            path: `02_De_va_Loi_giai/${filename}`,
            blob: fullBlob,
          });
          completed++;
        }
      }

      if (format === 'zip') {
        setExportProgress({
          active: true,
          current: totalSteps,
          total: totalSteps,
          label: `Đang đóng gói ${zipEntries.length} ảnh vào tệp ZIP...`,
        });
        const zipBlob = await createZipArchive(zipEntries);
        const zipName = `${sanitizePrefix(examTitle).slice(0, 42) || 'De_Thi_GDPT_2018'}_Anh.zip`;
        triggerBrowserDownload(zipBlob, zipName);
        setToast({
          type: 'success',
          message: `Đã tải xong tệp ${zipName} (đầy đủ ${zipEntries.length}/${totalSteps} hình ảnh).`,
        });
      } else {
        setToast({
          type: 'success',
          message: `Đã tải lần lượt ${targets.length} tệp ảnh PNG.`,
        });
      }

      setIsBatchExportOpen(false);
    } catch (err: unknown) {
      setExportError(
        err instanceof Error
          ? err.message
          : 'Đã xảy ra lỗi khi kết xuất ảnh hàng loạt.'
      );
    } finally {
      setExportProgress({ active: false, current: 0, total: 0, label: '' });
      setExportRenderState(null);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[#F8FAFC] text-slate-900 overflow-hidden">
      {/* TOP BAR CONTRACT: 3 clean zones separated by gap-8 */}
      <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 z-20">
        {/* Zone 1: Single-line Brand Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setViewMode('studio');
          }}
          className="text-base font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Tạo Ảnh Đề Thi
        </a>

        {/* Zone 2: 4 clean single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => setViewMode('studio')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              viewMode === 'studio'
                ? 'text-blue-700 border-blue-700 font-semibold'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Studio biên tập
          </button>
          <button
            type="button"
            onClick={() => setViewMode('gallery')}
            className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
              viewMode === 'gallery'
                ? 'text-blue-700 border-blue-700 font-semibold'
                : 'text-slate-600 border-transparent hover:text-slate-900'
            }`}
          >
            Lưới xem toàn bộ
          </button>
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="py-1 text-slate-600 border-b-2 border-transparent hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Nhập file đề
          </button>
          <button
            type="button"
            onClick={() => setIsReferenceOpen(true)}
            className="py-1 text-slate-600 border-b-2 border-transparent hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Ảnh mẫu gốc
          </button>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsBatchExportOpen(true)}
            disabled={questions.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Xuất ảnh hàng loạt</span>
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT SIDEBAR: Question List & Exam Controls */}
        <aside className="w-[268px] xl:w-[288px] shrink-0 bg-white border-r border-slate-200 hidden md:flex flex-col h-full">
          {/* Exam Title + Clean Unboxed Metadata */}
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div>
              <input
                type="text"
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                aria-label="Tên đề thi"
                className="w-full text-sm font-bold text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-600 focus:bg-white rounded-md px-1.5 py-1 -mx-1.5 focus:outline-none truncate"
              />
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 tabular-nums">
                <span>{stats.total} câu</span>
                <span aria-hidden="true">·</span>
                <span>{stats.solved} đã giải</span>
                <span aria-hidden="true">·</span>
                <span>{stats.selected} chọn xuất</span>
              </div>
            </div>

            {/* Primary Upload / Import trigger inside sidebar */}
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Tải tệp đề (.docx, .pdf, ảnh)</span>
            </button>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm câu hỏi..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Selection + Batch Solve row */}
            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="inline-flex items-center gap-2 text-slate-600 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stats.total > 0 && stats.selected === stats.total}
                  onChange={(e) => handleToggleSelectAll(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700"
                />
                <span>Chọn xuất tất cả</span>
              </label>

              <button
                type="button"
                onClick={handleAddBlankQuestion}
                className="inline-flex items-center gap-1 text-blue-700 font-semibold hover:text-blue-900 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm câu</span>
              </button>
            </div>

            {/* Batch solve missing questions CTA when unsolved questions exist */}
            {stats.unsolved > 0 && (
              <button
                type="button"
                onClick={handleSolveAllMissing}
                disabled={Boolean(batchSolvingStatus) || Boolean(solvingQuestionId)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors disabled:opacity-60"
              >
                {batchSolvingStatus ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="truncate">{batchSolvingStatus}</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    <span>Giải {stats.unsolved} câu chưa có đáp án</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Scrollable Question List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
            {filteredQuestions.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Không tìm thấy câu hỏi phù hợp.
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const isActive = q.id === activeId;
                const hasSol = q.solution.trim().length > 0;
                const snippet = stripLatexForSnippet(q.content);
                return (
                  <div
                    key={q.id}
                    onClick={() => {
                      setActiveId(q.id);
                      if (viewMode === 'gallery') setViewMode('studio');
                    }}
                    className={`group flex items-start gap-2.5 px-3.5 py-3 cursor-pointer transition-colors ${
                      isActive ? 'bg-blue-50/90' : 'hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={q.selectedForExport}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => handleToggleSelectOne(q.id)}
                      aria-label={`Chọn xuất Câu ${q.questionNumber}`}
                      className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-blue-700 shrink-0"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            isActive ? 'text-blue-800' : 'text-slate-900'
                          }`}
                        >
                          Câu {q.questionNumber}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
                            hasSol ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {hasSol
                            ? q.isAiSolved
                              ? 'AI đã giải'
                              : 'Có lời giải'
                            : 'Chưa giải'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 mt-0.5 leading-snug">
                        {snippet || 'Chưa có nội dung'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteQuestion(q.id);
                      }}
                      title="Xóa câu này"
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded transition-opacity shrink-0"
                      aria-label={`Xóa Câu ${q.questionNumber}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Quiet Sidebar Footer */}
          <div className="px-4 py-2.5 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetSample}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Nạp đề mẫu</span>
            </button>
            <span className="text-[11px] text-slate-400">Chuẩn GDPT 2018</span>
          </div>
        </aside>

        {/* CENTER STAGE */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#EEF2F7] overflow-hidden relative">
          {/* Notification Toast */}
          {toast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-lg w-[92%] sm:w-auto">
              <div
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border shadow-lg text-xs font-semibold ${
                  toast.type === 'success'
                    ? 'bg-white border-emerald-200 text-emerald-900'
                    : 'bg-white border-red-200 text-red-900'
                }`}
              >
                {toast.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{toast.message}</span>
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="ml-2 p-0.5 text-slate-400 hover:text-slate-700"
                  aria-label="Đóng thông báo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {batchSolvingStatus && (
            <div className="shrink-0 bg-emerald-50 border-b border-emerald-200 px-6 py-2 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-900">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700 shrink-0" />
              <span>{batchSolvingStatus}</span>
            </div>
          )}

          {viewMode === 'studio' ? (
            <>
              {/* Compact Workspace Toolbar */}
              <div className="h-12 shrink-0 bg-white/90 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {/* Mobile Import Shortcut */}
                  <button
                    type="button"
                    onClick={() => setIsImportOpen(true)}
                    className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-md whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Nhập đề</span>
                  </button>

                  {/* Question Prev / Next */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={activeIndex <= 0}
                      onClick={() =>
                        activeIndex > 0 && setActiveId(questions[activeIndex - 1].id)
                      }
                      className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      aria-label="Câu trước"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="px-2 text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                      {activeQuestion
                        ? `Câu ${activeQuestion.questionNumber} (${activeIndex + 1}/${questions.length})`
                        : '0/0'}
                    </span>
                    <button
                      type="button"
                      disabled={activeIndex < 0 || activeIndex >= questions.length - 1}
                      onClick={() =>
                        activeIndex >= 0 &&
                        activeIndex < questions.length - 1 &&
                        setActiveId(questions[activeIndex + 1].id)
                      }
                      className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                      aria-label="Câu tiếp theo"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quick toggle Solution visibility */}
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateSettings({
                        showSolutionBox: !settings.showSolutionBox,
                      })
                    }
                    className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
                  >
                    {settings.showSolutionBox ? (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Đang hiện lời giải</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                        <span>Chỉ hiện đề bài</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Single-question quick actions */}
                {activeQuestion && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSolveOne(activeQuestion)}
                      disabled={Boolean(solvingQuestionId)}
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors whitespace-nowrap disabled:opacity-60"
                    >
                      {solvingQuestionId === activeQuestion.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang giải...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>Tự giải câu này</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportSingleQuestion(activeQuestion)}
                      disabled={isExportingSingle}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors whitespace-nowrap disabled:opacity-60"
                    >
                      {isExportingSingle ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Đang lưu...</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-3.5 h-3.5" />
                          <span>Tải ảnh Câu {activeQuestion.questionNumber}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Preview Stage */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 lg:p-8 flex flex-col items-center">
                {activeQuestion ? (
                  <div className="w-full max-w-[1040px] space-y-3">
                    <div className="rounded-2xl shadow-[0_14px_38px_rgba(15,23,42,0.12)] bg-white/40 p-1.5">
                      <ScaledCardPreview
                        question={activeQuestion}
                        settings={settings}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                      <span className="tabular-nums">
                        Tên tệp xuất:{' '}
                        <strong className="font-mono text-slate-700">
                          {getQuestionFilename(activeQuestion)}
                        </strong>
                      </span>
                      <span className="tabular-nums">
                        Độ phân giải xuất:{' '}
                        {settings.exportScale === 2
                          ? '3200px (Siêu nét 2x)'
                          : '1600px (Tiêu chuẩn)'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="my-auto max-w-md text-center space-y-4 bg-white p-8 rounded-2xl border border-slate-200">
                    <h2 className="text-lg font-bold text-slate-900">
                      Chưa có câu hỏi nào
                    </h2>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Tải lên tệp đề thi Word (.docx), PDF hoặc ảnh để hệ thống tự tách câu hỏi, giải chi tiết theo GDPT 2018 và xuất ảnh hàng loạt.
                    </p>
                    <div className="flex items-center justify-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsImportOpen(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Tải tệp đề thi</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleResetSample}
                        className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                      >
                        Dùng đề mẫu
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* GALLERY GRID VIEW */
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="max-w-6xl mx-auto space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                      Xem trước toàn bộ hình ảnh ({questions.length} câu)
                    </h1>
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                      Đã chọn {stats.selected} câu để xuất hàng loạt · Nhấn vào từng ảnh để chỉnh sửa chi tiết
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleUpdateSettings({
                          showSolutionBox: !settings.showSolutionBox,
                        })
                      }
                      className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {settings.showSolutionBox
                        ? 'Ẩn phần lời giải'
                        : 'Hiện phần lời giải'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBatchExportOpen(true)}
                      disabled={stats.selected === 0}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Xuất {stats.selected} ảnh đã chọn</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {questions.map((q) => (
                    <div
                      key={q.id}
                      className="bg-white rounded-xl border border-slate-200 p-3 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 px-1">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={q.selectedForExport}
                            onChange={() => handleToggleSelectOne(q.id)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-700"
                          />
                          <span className="text-sm font-bold text-slate-900 tabular-nums">
                            Câu {q.questionNumber}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {getQuestionFilename(q)}
                          </span>
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveId(q.id);
                              setViewMode('studio');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
                          >
                            Biên tập
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportSingleQuestion(q)}
                            disabled={isExportingSingle}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            <span>PNG</span>
                          </button>
                        </div>
                      </div>

                      <div
                        onClick={() => {
                          setActiveId(q.id);
                          setViewMode('studio');
                        }}
                        className="cursor-pointer rounded-lg overflow-hidden border border-slate-200 hover:border-blue-400 transition-colors"
                      >
                        <ScaledCardPreview question={q} settings={settings} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* RIGHT INSPECTOR PANEL (in Studio Mode) */}
        {viewMode === 'studio' && (
          <InspectorPanel
            question={activeQuestion}
            settings={settings}
            isSolvingSingle={
              Boolean(activeQuestion) && solvingQuestionId === activeQuestion?.id
            }
            onUpdateQuestion={handleUpdateQuestion}
            onUpdateSettings={handleUpdateSettings}
            onSolveQuestion={handleSolveOne}
            onOpenReferenceSample={() => setIsReferenceOpen(true)}
          />
        )}
      </div>

      {/* HIDDEN NATIVE 1600px EXPORT STAGE (origin-positioned full-width wrapper prevents browser offscreen/zero-size paint culling) */}
      {exportRenderState && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            width: '1600px',
            opacity: 0,
            pointerEvents: 'none',
            zIndex: -50,
          }}
        >
          <QuestionCardCanvas
            key={exportRenderState.renderId}
            cardRef={exportCanvasRef}
            exportRenderId={exportRenderState.renderId}
            question={exportRenderState.question}
            settings={settings}
            forceShowSolution={exportRenderState.forceShowSolution}
          />
        </div>
      )}

      {/* MODALS */}
      <ImportExamModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onImportSuccess={handleImportSuccess}
      />

      <BatchExportModal
        isOpen={isBatchExportOpen}
        onClose={() => setIsBatchExportOpen(false)}
        questions={questions}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onSelectAll={handleToggleSelectAll}
        onRunBatchExport={handleRunBatchExport}
        exportProgress={exportProgress}
        exportError={exportError}
      />

      <ReferenceSampleModal
        isOpen={isReferenceOpen}
        onClose={() => setIsReferenceOpen(false)}
      />
    </div>
  );
}
