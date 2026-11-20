import React, { useState } from 'react';
import {
  CardTemplateSettings,
  ExamQuestion,
  ExportContentMode,
} from '../types/exam';
import { buildImageFilename, buildQuestionFilenameMap } from '../utils/exportImages';
import {
  Archive,
  Download,
  Images,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface BatchExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: ExamQuestion[];
  settings: CardTemplateSettings;
  onUpdateSettings: (patch: Partial<CardTemplateSettings>) => void;
  onSelectAll: (selected: boolean) => void;
  onRunBatchExport: (options: {
    contentMode: ExportContentMode;
    format: 'zip' | 'individual';
  }) => Promise<void>;
  exportProgress: {
    active: boolean;
    current: number;
    total: number;
    label: string;
  };
  exportError: string;
}

export const BatchExportModal: React.FC<BatchExportModalProps> = ({
  isOpen,
  onClose,
  questions,
  settings,
  onUpdateSettings,
  onSelectAll,
  onRunBatchExport,
  exportProgress,
  exportError,
}) => {
  const [contentMode, setContentMode] = useState<ExportContentMode>('both');
  const [format, setFormat] = useState<'zip' | 'individual'>('zip');

  if (!isOpen) return null;

  const selectedQuestions = questions.filter((q) => q.selectedForExport);
  const previewNames = buildQuestionFilenameMap(selectedQuestions, settings.filePrefix);
  const sampleFilename = selectedQuestions[0]
    ? previewNames.get(selectedQuestions[0].id) ||
      buildImageFilename(settings.filePrefix, selectedQuestions[0].questionNumber)
    : buildImageFilename(settings.filePrefix, 1);
  const pct =
    exportProgress.total > 0
      ? Math.round((exportProgress.current / exportProgress.total) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-export-title"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              id="batch-export-title"
              className="text-lg font-bold text-slate-900 tracking-tight"
            >
              Xuất hình ảnh hàng loạt
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Đã chọn {selectedQuestions.length} / {questions.length} câu hỏi · Độ phân giải{' '}
              {settings.exportScale === 2 ? 'Siêu nét 3200px' : 'Tiêu chuẩn 1600px'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exportProgress.active}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Quick selection status */}
          <div className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <span className="text-slate-700 font-medium tabular-nums">
              Số câu sẽ xuất: <strong>{selectedQuestions.length} câu</strong>
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onSelectAll(true)}
                className="text-blue-700 font-semibold hover:underline"
              >
                Chọn tất cả
              </button>
              <span className="text-slate-300">/</span>
              <button
                type="button"
                onClick={() => onSelectAll(false)}
                className="text-slate-600 font-medium hover:underline"
              >
                Bỏ chọn
              </button>
            </div>
          </div>

          {/* Content mode */}
          <div>
            <span className="block text-xs font-semibold text-slate-700 mb-2">
              Nội dung trên mỗi hình ảnh
            </span>
            <div className="grid grid-cols-1 gap-2">
              {[
                {
                  id: 'both' as ExportContentMode,
                  title: 'Đề bài + Hướng dẫn giải chi tiết',
                  desc: 'Đầy đủ 2 khung giống ảnh mẫu (1 ảnh cho mỗi câu)',
                },
                {
                  id: 'question_only' as ExportContentMode,
                  title: 'Chỉ phần Đề bài (ẩn lời giải)',
                  desc: 'Dùng để trình chiếu câu hỏi trước khi hiện đáp án',
                },
                {
                  id: 'split_zip' as ExportContentMode,
                  title: 'Xuất cả 2 phiên bản (2 thư mục riêng trong ZIP)',
                  desc: 'Tự động tạo thư mục 01_De_bai và 02_De_va_Loi_giai',
                },
              ].map((opt) => {
                const active = contentMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={exportProgress.active}
                    onClick={() => {
                      setContentMode(opt.id);
                      if (opt.id === 'split_zip') setFormat('zip');
                    }}
                    className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                      active
                        ? 'border-blue-600 bg-blue-50/60'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <span className="block text-sm font-semibold text-slate-900">
                        {opt.title}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {opt.desc}
                      </span>
                    </div>
                    {active && (
                      <CheckCircle2 className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Format & Filename */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                Cách lưu tệp
              </span>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  disabled={exportProgress.active}
                  onClick={() => setFormat('zip')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    format === 'zip'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Gói .ZIP</span>
                </button>
                <button
                  type="button"
                  disabled={exportProgress.active || contentMode === 'split_zip'}
                  onClick={() => setFormat('individual')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap disabled:opacity-40 ${
                    format === 'individual'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Images className="w-3.5 h-3.5" />
                  <span>Từng ảnh PNG</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Tiền tố tên ảnh
              </label>
              <input
                type="text"
                value={settings.filePrefix}
                disabled={exportProgress.active}
                onChange={(e) => onUpdateSettings({ filePrefix: e.target.value })}
                placeholder="Cau"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <p className="text-[11px] text-slate-500 mt-1 font-mono">
                Ví dụ: {sampleFilename}
              </p>
            </div>
          </div>

          {format === 'individual' && selectedQuestions.length > 8 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              Trình duyệt có thể chặn tự động nếu tải cùng lúc hơn 8 tệp lẻ. Khuyên chọn <strong>Gói .ZIP</strong> để luôn nhận đủ 100% ảnh trong 1 lần tải.
            </div>
          )}

          {/* Live Progress Bar */}
          {exportProgress.active && (
            <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />
                  {exportProgress.label}
                </span>
                <span className="font-mono tabular-nums">{pct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-blue-200 overflow-hidden">
                <div
                  className="h-full bg-blue-700 transition-transform duration-200 origin-left"
                  style={{ transform: `scaleX(${Math.max(0.05, pct / 100)})` }}
                />
              </div>
            </div>
          )}

          {exportError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{exportError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={exportProgress.active}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            Đóng
          </button>
          <button
            type="button"
            disabled={exportProgress.active || selectedQuestions.length === 0}
            onClick={() => onRunBatchExport({ contentMode, format })}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {exportProgress.active ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang tạo ảnh...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>
                  {format === 'zip'
                    ? `Tải ZIP (${selectedQuestions.length} câu)`
                    : `Tải ${selectedQuestions.length} ảnh PNG`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
