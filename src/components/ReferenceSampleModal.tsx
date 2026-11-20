import React, { useState } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';

interface ReferenceSampleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReferenceSampleModal: React.FC<ReferenceSampleModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [imgError, setImgError] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ref-sample-title"
    >
      <div className="w-full max-w-4xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="ref-sample-title" className="text-base font-bold text-slate-900">
              Ảnh mẫu cấu trúc trình bày gốc
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khung câu hỏi và hướng dẫn giải được thiết kế bám sát bố cục này
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 bg-slate-100 flex items-center justify-center">
          {!imgError ? (
            <img
              src="/assets/aistudio/Gemini_Generated_Image_mal7b6mal7b6mal7_70653a49.png"
              alt="Ảnh mẫu cấu trúc trình bày đề thi và hướng dẫn giải"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full max-h-[70vh] object-contain rounded-xl border border-slate-300 shadow-md bg-white"
            />
          ) : (
            <div className="w-full py-16 rounded-xl border border-dashed border-slate-300 bg-white flex flex-col items-center justify-center gap-2 text-slate-500">
              <ImageIcon className="w-8 h-8" />
              <span className="text-sm font-medium">
                Không tải được ảnh mẫu tham chiếu
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
