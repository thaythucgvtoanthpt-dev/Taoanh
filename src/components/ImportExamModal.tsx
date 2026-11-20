import React, { useRef, useState } from 'react';
import {
  FileText,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ClipboardPaste,
  BookOpen,
} from 'lucide-react';
import { ParseExamResponse } from '../types/exam';
import { ApiConnectionError, safeFetchJson } from '../utils/api';
import { hydrateFiguresFromUploadedFile } from '../utils/extractFigures';

interface ImportExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (result: ParseExamResponse, shouldAutoSolve: boolean) => void;
}

const SUBJECT_PRESETS = [
  'Tự động nhận diện (GDPT 2018)',
  'Toán học — Lớp 12 (GDPT 2018)',
  'Toán học — Lớp 11 (GDPT 2018)',
  'Toán học — Lớp 10 (GDPT 2018)',
  'Toán học — THCS (Lớp 6–9)',
  'Vật lí — THPT (GDPT 2018)',
  'Hóa học — THPT (GDPT 2018)',
  'Sinh học — THPT (GDPT 2018)',
  'Khoa học tự nhiên — THCS',
];

const ACCEPTED_EXTENSIONS = '.docx,.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.tex';

export const ImportExamModal: React.FC<ImportExamModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [autoSolve, setAutoSolve] = useState(true);
  const [subjectHint, setSubjectHint] = useState(SUBJECT_PRESETS[1]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setErrorMsg('Tệp vượt quá dung lượng tối đa 20MB.');
      setNeedsReload(false);
      return;
    }
    setSelectedFile(file);
    setErrorMsg('');
    setNeedsReload(false);
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      };
      reader.onerror = () => reject(new Error('Không đọc được nội dung tệp trên trình duyệt.'));
      reader.readAsDataURL(file);
    });

  const handleSubmit = async () => {
    setErrorMsg('');
    setNeedsReload(false);
    if (activeTab === 'file' && !selectedFile) {
      setErrorMsg('Vui lòng chọn một tệp đề thi (.docx, .pdf, ảnh hoặc .txt/.tex).');
      return;
    }
    if (activeTab === 'paste' && !pastedText.trim()) {
      setErrorMsg('Vui lòng dán nội dung đề thi vào ô văn bản.');
      return;
    }

    setIsProcessing(true);
    setStatusMessage(
      'Đang đọc tệp đề thi, tách từng câu hỏi và chuẩn hóa công thức toán học...'
    );

    const hintValue = subjectHint !== SUBJECT_PRESETS[0] ? subjectHint : '';

    try {
      let data: ParseExamResponse;

      if (activeTab === 'paste') {
        data = await safeFetchJson<ParseExamResponse>('/api/parse-exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            textContent: pastedText.trim(),
            subjectHint: hintValue,
          }),
        });
      } else if (selectedFile) {
        try {
          const formData = new FormData();
          if (hintValue) formData.append('subjectHint', hintValue);
          formData.append('file', selectedFile);
          data = await safeFetchJson<ParseExamResponse>('/api/parse-exam', {
            method: 'POST',
            body: formData,
          });
        } catch (uploadErr) {
          // If server is alive but multipart upload was blocked/dropped, retry via JSON base64
          if (
            uploadErr instanceof ApiConnectionError &&
            !uploadErr.needsReload &&
            selectedFile.size <= 12 * 1024 * 1024
          ) {
            const fileBase64 = await fileToBase64(selectedFile);
            data = await safeFetchJson<ParseExamResponse>('/api/parse-exam', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileBase64,
                fileName: selectedFile.name,
                mimeType: selectedFile.type || 'application/octet-stream',
                subjectHint: hintValue,
              }),
            });
          } else {
            throw uploadErr;
          }
        }
      } else {
        throw new Error('Không tìm thấy dữ liệu đề thi.');
      }

      if (activeTab === 'file' && selectedFile) {
        const hasFigureBoxes = data.questions.some(
          (q) =>
            (q.questionFigureBoxes && q.questionFigureBoxes.length > 0) ||
            (q.solutionFigureBoxes && q.solutionFigureBoxes.length > 0)
        );
        if (hasFigureBoxes) {
          setStatusMessage('Đang cắt và giữ nguyên hình vẽ gốc từ tệp đề thi...');
          data = await hydrateFiguresFromUploadedFile(selectedFile, data);
        }
      }

      onImportSuccess(data, autoSolve);
      setSelectedFile(null);
      setPastedText('');
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiConnectionError && err.needsReload) {
        setNeedsReload(true);
      }
      setErrorMsg(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi phân tích đề thi.');
    } finally {
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2
              id="import-modal-title"
              className="text-lg font-bold text-slate-900 tracking-tight"
            >
              Nhập tệp đề thi mới
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hỗ trợ Word (.docx), PDF, Ảnh chụp đề, LaTeX (.tex) hoặc văn bản thuần
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40"
            aria-label="Đóng cửa sổ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Segmented Tabs */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveTab('file');
                setErrorMsg('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'file'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Tải tệp đề thi</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('paste');
                setErrorMsg('');
              }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'paste'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>Dán nội dung văn bản</span>
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'file' ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFileSelect(e.dataTransfer.files?.[0]);
              }}
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/70'
                  : selectedFile
                    ? 'border-emerald-400 bg-emerald-50/40'
                    : 'border-slate-300 bg-slate-50/70 hover:border-blue-400 hover:bg-blue-50/30'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <FileText className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 break-all">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {(selectedFile.size / 1024).toFixed(1)} KB · Nhấn để đổi tệp khác
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    Kéo thả tệp đề thi vào đây hoặc nhấn để chọn tệp
                  </p>
                  <p className="text-xs text-slate-500">
                    Định dạng: .docx, .pdf, .png, .jpg, .tex, .txt (tối đa 25MB)
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label
                htmlFor="paste-exam-textarea"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Nội dung đề thi (hỗ trợ văn bản thường hoặc LaTeX)
              </label>
              <textarea
                id="paste-exam-textarea"
                rows={7}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                disabled={isProcessing}
                placeholder={`Ví dụ:\nPHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.\nCâu 1. Cho hàm số y = x^3 - 3x + 1. Số điểm cực trị của hàm số là:\nA. 0   B. 1   C. 2   D. 3\n\nCâu 2. Tính tích phân I = \\int_0^1 (2x + 1) dx...`}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 font-mono"
              />
            </div>
          )}

          {/* GDPT 2018 Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label
                htmlFor="subject-preset-select"
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1.5"
              >
                <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                <span>Chương trình &amp; Môn học</span>
              </label>
              <select
                id="subject-preset-select"
                value={subjectHint}
                onChange={(e) => setSubjectHint(e.target.value)}
                disabled={isProcessing}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                {SUBJECT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 cursor-pointer hover:bg-slate-100/70 transition-colors">
                <input
                  type="checkbox"
                  checked={autoSolve}
                  onChange={(e) => setAutoSolve(e.target.checked)}
                  disabled={isProcessing}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <div className="text-xs leading-relaxed">
                  <span className="font-semibold text-slate-900 block">
                    Tự động giải theo GDPT 2018
                  </span>
                  <span className="text-slate-500">
                    Tự giải chi tiết các câu chưa có đáp án trong tệp
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Processing Status or Error */}
          {isProcessing && (
            <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
              {needsReload && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="shrink-0 px-3 py-1 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-md transition-colors whitespace-nowrap"
                >
                  Tải lại trang
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap disabled:opacity-60"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý đề...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Tách đề &amp; Tạo ảnh</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
