import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Film, X } from 'lucide-react';
import { ExportProgress, ExportResult, exportQuizVideo } from '../canvas/videoExporter';
import { QuizProject, getCanvasDimensions } from '../types/quiz';
import { canShareNatively, saveOrDownloadBlob, shareBlobNatively } from '../utils/nativeDownload';

interface ExportVideoModalProps {
  isOpen: boolean;
  project: QuizProject;
  onClose: () => void;
}

export const ExportVideoModal: React.FC<ExportVideoModalProps> = ({
  isOpen,
  project,
  onClose,
}) => {
  const [status, setStatus] = useState<'idle' | 'rendering' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<ExportProgress>({
    progress: 0,
    currentTime: 0,
    totalDuration: 0,
    statusText: '',
  });
  const [result, setResult] = useState<ExportResult | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  useEffect(() => {
    if (!isOpen) {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      setVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setStatus('idle');
      setResult(null);
      setErrorMsg('');
      return;
    }

    const activeProject = projectRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('rendering');
    setErrorMsg('');

    void exportQuizVideo(
      activeProject.slides,
      activeProject.template,
      activeProject.timing,
      activeProject.audio,
      (p) => setProgress(p),
      controller.signal
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        const url = URL.createObjectURL(res.blob);
        setResult(res);
        setVideoUrl(url);
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMsg(err instanceof Error ? err.message : 'فشل تصدير الفيديو');
        setStatus('error');
      });

    return () => {
      controller.abort();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const fileName = `youtube-short-quiz-${Date.now()}.${result?.extension || 'webm'}`;

  const handleDownload = async () => {
    if (!result) return;
    const res = await saveOrDownloadBlob(result.blob, fileName, result.mimeType);
    if (!res.ok && res.error) {
      setErrorMsg(`تعذر حفظ الفيديو: ${res.error}`);
    }
  };

  const canNativeShare = !!result && canShareNatively(fileName, result.mimeType, result.blob);

  const handleShareVideo = async () => {
    if (!result) return;
    try {
      await shareBlobNatively(result.blob, fileName, result.mimeType, 'فيديو شورتس الأسئلة');
    } catch {
      // User cancelled share sheet
    }
  };

  const handleCancelAndClose = () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    onClose();
  };

  const dims = getCanvasDimensions(project.template);
  const ratioLabel = project.template.aspectRatio === '16:9' ? '16:9' : '9:16';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--panel)] border border-[var(--pline)] shadow-2xl overflow-hidden text-[var(--ptxt)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--pline)]">
          <div className="flex items-center gap-2.5">
            <Film className="w-5 h-5 text-[#00B050]" />
            <h3 className="text-base font-bold">
              تصدير الفيديو ({dims.width}×{dims.height})
            </h3>
          </div>
          <button
            type="button"
            onClick={handleCancelAndClose}
            className="p-1.5 rounded-lg text-[var(--pmuted)] hover:text-[var(--ptxt)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {status === 'rendering' && (
            <div className="flex flex-col gap-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span>{progress.statusText || 'جارٍ التحضير...'}</span>
                <span className="font-mono-nums text-[#00B050] font-bold">
                  {progress.currentTime.toFixed(1)} / {progress.totalDuration.toFixed(1)} ث
                </span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-[var(--surface)] overflow-hidden border border-[var(--pline)]">
                <div
                  className="h-full bg-[#00B050] transition-all duration-150"
                  style={{ width: `${Math.round(progress.progress * 100)}%` }}
                />
              </div>

              <p className="text-xs text-[var(--pmuted)] leading-relaxed">
                يتم الآن تسجيل الحركات والعداد ودمج جميع المؤثرات الصوتية بدقة عالية{' '}
                {ratioLabel}. يرجى إبقاء هذه النافذة مفتوحة حتى الاكتمال.
              </p>

              <button
                type="button"
                onClick={handleCancelAndClose}
                className="mt-2 w-full py-2.5 rounded-lg bg-[var(--surface)] hover:border-[var(--gold)] border border-[var(--pline)] text-xs font-semibold transition-colors cursor-pointer"
              >
                إلغاء التصدير
              </button>
            </div>
          )}

          {status === 'done' && videoUrl && result && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#00B050]">
                <CheckCircle2 className="w-5 h-5" />
                <span>تم تجهيز الفيديو بنجاح مع الأصوات</span>
              </div>

              <div className="w-full max-h-[360px] flex justify-center bg-black rounded-xl overflow-hidden border border-[var(--pline)]">
                <video
                  src={videoUrl}
                  controls
                  playsInline
                  className="h-[340px] w-auto object-contain"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-[var(--pmuted)]">
                <span>الصيغة: {result.extension.toUpperCase()}</span>
                <span className="font-mono-nums">
                  الحجم: {(result.blob.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleDownload()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[#00B050] hover:bg-[#00c85b] text-white text-sm font-bold transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>تنزيل الفيديو للجهاز</span>
                </button>
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={() => void handleShareVideo()}
                    className="px-4 py-3 rounded-xl bg-[var(--surface)] border border-[#00B050]/40 text-[#00B050] dark:text-[#6ee7b7] text-sm font-bold transition-colors cursor-pointer"
                  >
                    مشاركة / حفظ
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancelAndClose}
                  className="px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--pline)] text-sm font-medium transition-colors cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm text-rose-400">{errorMsg}</p>
              <button
                type="button"
                onClick={handleCancelAndClose}
                className="w-full py-2.5 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs font-semibold cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
