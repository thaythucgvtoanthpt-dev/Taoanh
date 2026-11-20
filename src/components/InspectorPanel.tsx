import React, { useState } from 'react';
import {
  CardFontId,
  CardTemplateSettings,
  CardThemeId,
  ExamQuestion,
  QuestionType,
} from '../types/exam';
import {
  Wand2,
  Loader2,
  Plus,
  Trash2,
  Eye,
  SlidersHorizontal,
  PenSquare,
  Check,
  ImagePlus,
  Clipboard,
} from 'lucide-react';

interface InspectorPanelProps {
  question: ExamQuestion | null;
  settings: CardTemplateSettings;
  isSolvingSingle: boolean;
  onUpdateQuestion: (updated: ExamQuestion) => void;
  onUpdateSettings: (patch: Partial<CardTemplateSettings>) => void;
  onSolveQuestion: (question: ExamQuestion) => void;
  onOpenReferenceSample: () => void;
}

const PART_PRESETS = [
  'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.',
  'PHẦN II. Câu trắc nghiệm đúng sai.',
  'PHẦN III. Câu trắc nghiệm trả lời ngắn.',
  'PHẦN TỰ LUẬN.',
];

const LATEX_SNIPPETS = [
  { label: 'Phân số', snippet: '$\\frac{a}{b}$' },
  { label: 'Căn bậc 2', snippet: '$\\sqrt{x}$' },
  { label: 'Tích phân', snippet: '$\\int_{a}^{b} f(x)\\,\\mathrm{d}x$' },
  { label: 'Vectơ', snippet: '$\\overrightarrow{AB}$' },
  { label: 'Tương đương', snippet: '$\\Leftrightarrow$' },
  { label: 'Hệ / Hoặc', snippet: '$$\\left[\\begin{array}{l}x = 1\\\\x = 2\\end{array}\\right.$$' },
];

const THEME_OPTIONS: Array<{
  id: CardThemeId;
  name: string;
  swatchPrimary: string;
  swatchSecondary: string;
}> = [
  {
    id: 'classic_sample',
    name: 'Mẫu chuẩn ảnh gốc',
    swatchPrimary: '#1b6ee0',
    swatchSecondary: '#16984d',
  },
  {
    id: 'navy_emerald',
    name: 'Xanh Navy học thuật',
    swatchPrimary: '#1e3a8a',
    swatchSecondary: '#059669',
  },
  {
    id: 'slate_teal',
    name: 'Xanh ngọc hiện đại',
    swatchPrimary: '#0f766e',
    swatchSecondary: '#0284c7',
  },
];

const FONT_OPTIONS: Array<{ id: CardFontId; name: string; desc: string }> = [
  { id: 'times_new_roman', name: 'Times New Roman', desc: 'Mặc định — Chuẩn đề thi Việt Nam' },
  { id: 'noto_serif', name: 'Noto Serif', desc: 'Có chân rõ nét' },
  { id: 'be_vietnam', name: 'Be Vietnam Pro', desc: 'Không chân hiện đại' },
  { id: 'lora', name: 'Lora', desc: 'Phong cách sách giáo khoa' },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  question,
  settings,
  isSolvingSingle,
  onUpdateQuestion,
  onUpdateSettings,
  onSolveQuestion,
  onOpenReferenceSample,
}) => {
  const [tab, setTab] = useState<'content' | 'style'>('content');

  const insertSnippetInto = (field: 'content' | 'solution', snippet: string) => {
    if (!question) return;
    const current = question[field] || '';
    const separator = current && !current.endsWith(' ') && !current.endsWith('\n') ? ' ' : '';
    onUpdateQuestion({
      ...question,
      [field]: `${current}${separator}${snippet}`,
    });
  };

  const handleOptionChange = (
    idx: number,
    patch: Partial<{ label: string; content: string; isCorrect: boolean }>
  ) => {
    if (!question) return;
    const nextOptions = question.options.map((opt, i) => {
      if (i === idx) {
        return { ...opt, ...patch };
      }
      if (patch.isCorrect === true && question.type === 'multiple_choice') {
        return { ...opt, isCorrect: false };
      }
      return opt;
    });
    onUpdateQuestion({
      ...question,
      options: nextOptions,
      correctAnswer:
        patch.isCorrect === true && question.type === 'multiple_choice'
          ? nextOptions[idx].label
          : question.correctAnswer,
    });
  };

  const handleAddOption = () => {
    if (!question) return;
    const labelsMC = ['A', 'B', 'C', 'D', 'E', 'F'];
    const labelsTF = ['a', 'b', 'c', 'd', 'e'];
    const pool = question.type === 'true_false' ? labelsTF : labelsMC;
    const nextLabel = pool[question.options.length] || String(question.options.length + 1);
    onUpdateQuestion({
      ...question,
      options: [...question.options, { label: nextLabel, content: '', isCorrect: false }],
    });
  };

  const handleRemoveOption = (idx: number) => {
    if (!question) return;
    onUpdateQuestion({
      ...question,
      options: question.options.filter((_, i) => i !== idx),
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Không đọc được ảnh.'));
      reader.readAsDataURL(file);
    });

  const handleAddFigureFiles = async (
    target: 'questionImages' | 'solutionImages',
    files: FileList | null
  ) => {
    if (!question || !files || files.length === 0) return;
    const existing = question[target] || [];
    const added = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.type.startsWith('image/')) continue;
      const dataUrl = await readFileAsDataUrl(f);
      added.push({
        id: `manual-fig-${Date.now()}-${i}`,
        dataUrl,
        caption: '',
        widthPercent: target === 'questionImages' ? 40 : 52,
      });
    }
    if (added.length > 0) {
      onUpdateQuestion({
        ...question,
        [target]: [...existing, ...added],
      });
    }
  };

  const handlePasteFigure = async (
    target: 'questionImages' | 'solutionImages',
    e: React.ClipboardEvent
  ) => {
    if (!question) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const existing = question[target] || [];
    const added = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const dataUrl = await readFileAsDataUrl(file);
          added.push({
            id: `paste-fig-${Date.now()}-${i}`,
            dataUrl,
            caption: '',
            widthPercent: target === 'questionImages' ? 40 : 52,
          });
        }
      }
    }
    if (added.length > 0) {
      e.preventDefault();
      onUpdateQuestion({
        ...question,
        [target]: [...existing, ...added],
      });
    }
  };

  const handleUpdateFigureWidth = (
    target: 'questionImages' | 'solutionImages',
    figId: string,
    widthPercent: number
  ) => {
    if (!question) return;
    const list = question[target] || [];
    onUpdateQuestion({
      ...question,
      [target]: list.map((f) => (f.id === figId ? { ...f, widthPercent } : f)),
    });
  };

  const handleRemoveFigure = (
    target: 'questionImages' | 'solutionImages',
    figId: string
  ) => {
    if (!question) return;
    const list = question[target] || [];
    onUpdateQuestion({
      ...question,
      [target]: list.filter((f) => f.id !== figId),
    });
  };

  return (
    <aside className="w-full lg:w-[360px] xl:w-[388px] shrink-0 bg-white border-l border-slate-200 flex flex-col h-full overflow-hidden">
      {/* Segmented Switch */}
      <div className="p-3.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setTab('content')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'content'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenSquare className="w-3.5 h-3.5" />
            <span>Biên tập câu hỏi</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('style')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'style'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Mẫu ảnh &amp; Thương hiệu</span>
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
        {tab === 'content' ? (
          question ? (
            <>
              {/* Row: Number + Question Type + Option Layout */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Số câu
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={question.questionNumber}
                    onChange={(e) =>
                      onUpdateQuestion({
                        ...question,
                        questionNumber: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dạng câu hỏi (GDPT 2018)
                  </label>
                  <select
                    value={question.type}
                    onChange={(e) => {
                      const nextType = e.target.value as QuestionType;
                      const defaultPart =
                        nextType === 'multiple_choice'
                          ? PART_PRESETS[0]
                          : nextType === 'true_false'
                            ? PART_PRESETS[1]
                            : nextType === 'short_answer'
                              ? PART_PRESETS[2]
                              : PART_PRESETS[3];
                      onUpdateQuestion({
                        ...question,
                        type: nextType,
                        partTitle: defaultPart,
                      });
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="multiple_choice">Trắc nghiệm A, B, C, D</option>
                    <option value="true_false">Trắc nghiệm Đúng / Sai</option>
                    <option value="short_answer">Trả lời ngắn</option>
                    <option value="essay">Tự luận</option>
                  </select>
                </div>
              </div>

              {/* Part Ribbon Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tiêu đề phần (thanh xanh trên cùng)
                </label>
                <input
                  type="text"
                  value={question.partTitle}
                  onChange={(e) =>
                    onUpdateQuestion({ ...question, partTitle: e.target.value })
                  }
                  placeholder="PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn."
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {/* Question Content */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Nội dung câu hỏi (hỗ trợ LaTeX $...$)
                  </label>
                </div>
                <textarea
                  rows={4}
                  value={question.content}
                  onChange={(e) =>
                    onUpdateQuestion({ ...question, content: e.target.value })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs leading-relaxed font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {LATEX_SNIPPETS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => insertSnippetInto('content', s.snippet)}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                    >
                      + {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question Figures Section */}
              <div
                onPaste={(e) => void handlePasteFigure('questionImages', e)}
                className="space-y-2 pt-2 border-t border-slate-200"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Hình vẽ phần đề bài ({(question.questionImages || []).length})
                  </span>
                  <div className="flex items-center gap-2">
                    {(question.questionImages || []).length === 1 && (
                      <select
                        aria-label="Vị trí hình vẽ đề bài"
                        value={question.questionImagePosition || 'right'}
                        onChange={(e) =>
                          onUpdateQuestion({
                            ...question,
                            questionImagePosition: e.target.value as 'right' | 'below',
                          })
                        }
                        className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                      >
                        <option value="right">Đặt bên phải đề</option>
                        <option value="below">Đặt dưới đề bài</option>
                      </select>
                    )}
                    <label className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer whitespace-nowrap">
                      <ImagePlus className="w-3.5 h-3.5" />
                      <span>Thêm ảnh</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          void handleAddFigureFiles('questionImages', e.target.files);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>

                {(question.questionImages || []).length > 0 ? (
                  <div className="space-y-2">
                    {(question.questionImages || []).map((fig) => (
                      <div
                        key={fig.id}
                        className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={fig.dataUrl}
                          alt="Hình vẽ đề bài"
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 object-contain rounded bg-white border border-slate-200 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span>Cỡ hình</span>
                            <span className="font-mono tabular-nums">
                              {fig.widthPercent ?? 40}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={22}
                            max={90}
                            step={2}
                            value={fig.widthPercent ?? 40}
                            onChange={(e) =>
                              handleUpdateFigureWidth(
                                'questionImages',
                                fig.id,
                                Number(e.target.value)
                              )
                            }
                            className="w-full accent-blue-700"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveFigure('questionImages', fig.id)
                          }
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors shrink-0"
                          aria-label="Xóa hình vẽ"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    tabIndex={0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 text-[11px] text-slate-500 focus:border-blue-600 focus:outline-none"
                  >
                    <Clipboard className="w-3.5 h-3.5 shrink-0" />
                    <span>Nhấn vào đây và bấm Ctrl+V để dán ảnh chụp hình vẽ</span>
                  </div>
                )}
              </div>

              {/* Options Section */}
              {(question.type === 'multiple_choice' || question.type === 'true_false') && (
                <div className="space-y-2.5 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      Các phương án lựa chọn
                    </span>
                    <div className="flex items-center gap-2">
                      {question.type === 'multiple_choice' && (
                        <select
                          aria-label="Số cột phương án"
                          value={String(question.optionColumns || 'auto')}
                          onChange={(e) => {
                            const val = e.target.value;
                            onUpdateQuestion({
                              ...question,
                              optionColumns:
                                val === 'auto'
                                  ? 'auto'
                                  : (Number(val) as 1 | 2 | 4),
                            });
                          }}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                        >
                          <option value="auto">Cột: Tự động</option>
                          <option value="4">4 cột ngang</option>
                          <option value="2">2 cột</option>
                          <option value="1">1 cột dọc</option>
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={handleAddOption}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Thêm</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {question.options.map((opt, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleOptionChange(idx, { isCorrect: !opt.isCorrect })
                          }
                          title={
                            opt.isCorrect
                              ? 'Đang đánh dấu là phương án đúng'
                              : 'Đánh dấu là phương án đúng'
                          }
                          className={`mt-1 w-7 h-7 rounded-md text-xs font-bold flex items-center justify-center shrink-0 border transition-colors ${
                            opt.isCorrect
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-slate-50 text-slate-700 border-slate-300 hover:border-blue-500'
                          }`}
                        >
                          {opt.label}
                        </button>
                        <input
                          type="text"
                          value={opt.content}
                          onChange={(e) =>
                            handleOptionChange(idx, { content: e.target.value })
                          }
                          placeholder={`Nội dung phương án ${opt.label}...`}
                          className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(idx)}
                          className="mt-1 p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors"
                          aria-label={`Xóa phương án ${opt.label}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Solution Section */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-slate-700">
                    Hướng dẫn giải chi tiết
                  </label>
                  <button
                    type="button"
                    onClick={() => onSolveQuestion(question)}
                    disabled={isSolvingSingle}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap disabled:opacity-60"
                  >
                    {isSolvingSingle ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Đang giải...</span>
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" />
                        <span>Tự giải (GDPT 2018)</span>
                      </>
                    )}
                  </button>
                </div>

                <textarea
                  rows={7}
                  value={question.solution}
                  onChange={(e) =>
                    onUpdateQuestion({ ...question, solution: e.target.value })
                  }
                  placeholder="Nhập lời giải chi tiết hoặc nhấn Tự giải (GDPT 2018)..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs leading-relaxed font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                <div className="flex flex-wrap gap-1">
                  {LATEX_SNIPPETS.slice(0, 4).map((s) => (
                    <button
                      key={`sol-${s.label}`}
                      type="button"
                      onClick={() => insertSnippetInto('solution', s.snippet)}
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap"
                    >
                      + {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Solution Figures Section */}
              <div
                onPaste={(e) => void handlePasteFigure('solutionImages', e)}
                className="space-y-2 pt-2 border-t border-slate-200"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    Hình vẽ phần lời giải ({(question.solutionImages || []).length})
                  </span>
                  <label className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap">
                    <ImagePlus className="w-3.5 h-3.5" />
                    <span>Thêm ảnh</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleAddFigureFiles('solutionImages', e.target.files);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {(question.solutionImages || []).length > 0 ? (
                  <div className="space-y-2">
                    {(question.solutionImages || []).map((fig) => (
                      <div
                        key={fig.id}
                        className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-200 bg-slate-50"
                      >
                        <img
                          src={fig.dataUrl}
                          alt="Hình vẽ lời giải"
                          referrerPolicy="no-referrer"
                          className="w-12 h-12 object-contain rounded bg-white border border-slate-200 shrink-0"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-600">
                            <span>Cỡ hình</span>
                            <span className="font-mono tabular-nums">
                              {fig.widthPercent ?? 52}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={24}
                            max={95}
                            step={2}
                            value={fig.widthPercent ?? 52}
                            onChange={(e) =>
                              handleUpdateFigureWidth(
                                'solutionImages',
                                fig.id,
                                Number(e.target.value)
                              )
                            }
                            className="w-full accent-emerald-700"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveFigure('solutionImages', fig.id)
                          }
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded transition-colors shrink-0"
                          aria-label="Xóa hình vẽ lời giải"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    tabIndex={0}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 text-[11px] text-slate-500 focus:border-emerald-600 focus:outline-none"
                  >
                    <Clipboard className="w-3.5 h-3.5 shrink-0" />
                    <span>Nhấn vào đây và bấm Ctrl+V để dán hình vẽ lời giải</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-sm text-slate-500">
              Chọn một câu hỏi ở danh sách bên trái để chỉnh sửa.
            </div>
          )
        ) : (
          /* STYLE & BRANDING SETTINGS TAB */
          <div className="space-y-5">
            {/* Teacher Branding Banner */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Nhãn tên lớp / Zalo (góc phải lời giải)
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showBrandBanner}
                    onChange={(e) =>
                      onUpdateSettings({ showBrandBanner: e.target.checked })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Hiện</span>
                </label>
              </div>
              <input
                type="text"
                value={settings.brandText}
                onChange={(e) => onUpdateSettings({ brandText: e.target.value })}
                disabled={!settings.showBrandBanner}
                placeholder="Lớp Toán thầy Thúc – Zalo: 0931.768.172"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>

            {/* Color Theme Presets */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Bảng màu khung đề thi
              </span>
              <div className="space-y-2">
                {THEME_OPTIONS.map((t) => {
                  const active = settings.themeId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onUpdateSettings({ themeId: t.id })}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/60 text-slate-900'
                          : 'border-slate-200 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center -space-x-1">
                          <span
                            className="w-4 h-4 rounded-full border border-white shadow-xs"
                            style={{ backgroundColor: t.swatchPrimary }}
                          />
                          <span
                            className="w-4 h-4 rounded-full border border-white shadow-xs"
                            style={{ backgroundColor: t.swatchSecondary }}
                          />
                        </div>
                        <span className="text-xs font-semibold">{t.name}</span>
                      </div>
                      {active && <Check className="w-4 h-4 text-blue-700" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Selection */}
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Font chữ trên hình ảnh
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                {FONT_OPTIONS.map((f) => {
                  const active = settings.fontId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => onUpdateSettings({ fontId: f.id })}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                        active
                          ? 'border-blue-600 bg-blue-50/60'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <span className="block text-xs font-semibold text-slate-900">
                          {f.name}
                        </span>
                        <span className="block text-[11px] text-slate-500">
                          {f.desc}
                        </span>
                      </div>
                      {active && <Check className="w-4 h-4 text-blue-700" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Scale Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="font-scale-range"
                  className="text-xs font-semibold text-slate-700"
                >
                  Cỡ chữ hiển thị
                </label>
                <span className="text-xs font-mono tabular-nums font-semibold text-blue-700">
                  {Math.round(settings.fontScale * 100)}%
                </span>
              </div>
              <input
                id="font-scale-range"
                type="range"
                min={0.85}
                max={1.25}
                step={0.05}
                value={settings.fontScale}
                onChange={(e) =>
                  onUpdateSettings({ fontScale: Number(e.target.value) })
                }
                className="w-full accent-blue-700"
              />
              <div className="flex justify-between text-[11px] text-slate-400 tabular-nums mt-0.5">
                <span>85% (Gọn)</span>
                <span>100%</span>
                <span>125% (To rõ)</span>
              </div>
            </div>

            {/* Line Height Slider */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="line-height-range"
                  className="text-xs font-semibold text-slate-700"
                >
                  Giãn dòng văn bản
                </label>
                <span className="text-xs font-mono tabular-nums font-semibold text-blue-700">
                  {(settings.lineHeight || 1.2).toFixed(2)}
                </span>
              </div>
              <input
                id="line-height-range"
                type="range"
                min={1.1}
                max={1.6}
                step={0.05}
                value={settings.lineHeight || 1.2}
                onChange={(e) =>
                  onUpdateSettings({ lineHeight: Number(e.target.value) })
                }
                className="w-full accent-blue-700"
              />
              <div className="flex justify-between text-[11px] text-slate-400 tabular-nums mt-0.5">
                <span>1.10 (Khít)</span>
                <span>1.20 (Chuẩn)</span>
                <span>1.60 (Thoáng)</span>
              </div>
            </div>

            {/* Visibility Toggles */}
            <div className="space-y-2.5 pt-2 border-t border-slate-200">
              <span className="block text-xs font-semibold text-slate-700">
                Bố cục hiển thị
              </span>

              <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                <span>In đậm nội dung đề bài</span>
                <input
                  type="checkbox"
                  checked={settings.boldQuestionStem !== false}
                  onChange={(e) =>
                    onUpdateSettings({ boldQuestionStem: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                <span>Hiển thị khung Hướng dẫn giải</span>
                <input
                  type="checkbox"
                  checked={settings.showSolutionBox}
                  onChange={(e) =>
                    onUpdateSettings({ showSolutionBox: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                <span>Hiển thị thanh tiêu đề Phần thi</span>
                <input
                  type="checkbox"
                  checked={settings.showPartHeader}
                  onChange={(e) =>
                    onUpdateSettings({ showPartHeader: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-slate-700 cursor-pointer">
                <span>Tô nổi bật đáp án đúng trên đề</span>
                <input
                  type="checkbox"
                  checked={settings.highlightCorrectOption}
                  onChange={(e) =>
                    onUpdateSettings({ highlightCorrectOption: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-blue-600"
                />
              </label>

              <div className="pt-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kích thước khung ảnh
                </label>
                <select
                  value={settings.aspectMode}
                  onChange={(e) =>
                    onUpdateSettings({
                      aspectMode: e.target.value as 'auto_16_9' | 'fixed_16_9',
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="auto_16_9">
                    Tự động vừa khít nội dung (Khuyên dùng)
                  </option>
                  <option value="fixed_16_9">
                    Cố định chuẩn slide 16:9 (1600×900)
                  </option>
                </select>
              </div>
            </div>

            {/* Export Defaults */}
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tiền tố tên tệp
                  </label>
                  <input
                    type="text"
                    value={settings.filePrefix}
                    onChange={(e) =>
                      onUpdateSettings({ filePrefix: e.target.value })
                    }
                    placeholder="Cau"
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Độ nét ảnh PNG
                  </label>
                  <select
                    value={settings.exportScale}
                    onChange={(e) =>
                      onUpdateSettings({
                        exportScale: Number(e.target.value) as 1 | 2,
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
                  >
                    <option value={2}>Siêu nét 2x (3200px)</option>
                    <option value={1}>Tiêu chuẩn 1x (1600px)</option>
                  </select>
                </div>
              </div>

              <button
                type="button"
                onClick={onOpenReferenceSample}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Xem ảnh mẫu đối chiếu</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
