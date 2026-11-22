import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Monitor,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Scan,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { saveOrDownloadBlob } from '../utils/nativeDownload';
import {
  collectSoundEventsInInterval,
  exportThumbnailJpg,
  getSlideTimeInfo,
  preloadTemplateBackground,
  preloadTimerVideo,
  renderQuizFrame,
} from '../canvas/quizRenderer';
import {
  AudioSettings,
  QuestionSlide,
  TemplateSettings,
  TimingSettings,
  computeProjectTimeline,
  getCanvasDimensions,
  getSlidesContentDuration,
  getTotalDuration,
} from '../types/quiz';

interface ShortsPreviewStageProps {
  slides: QuestionSlide[];
  activeSlideIndex: number;
  template: TemplateSettings;
  timing: TimingSettings;
  audio: AudioSettings;
  isExporting?: boolean;
  onToggleSafeGuides: () => void;
  onToggleAspectRatio?: () => void;
  onCycleChannelTheme: () => void;
  onActiveSlideChange?: (idx: number) => void;
}

function formatTimecode(sec: number): string {
  const clamped = Math.max(0, sec);
  const mins = Math.floor(clamped / 60);
  const rem = clamped % 60;
  const whole = Math.floor(rem);
  const tenths = Math.floor((rem - whole) * 10);
  return `${String(mins).padStart(2, '0')}:${String(whole).padStart(2, '0')}.${tenths}`;
}

export const ShortsPreviewStage: React.FC<ShortsPreviewStageProps> = ({
  slides,
  activeSlideIndex,
  template,
  timing,
  audio,
  isExporting = false,
  onToggleSafeGuides,
  onToggleAspectRatio,
  onCycleChannelTheme,
  onActiveSlideChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rangeInputRef = useRef<HTMLInputElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hideControlsOverlay, setHideControlsOverlay] = useState(false);
  const [isCapturingThumb, setIsCapturingThumb] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const { width: canvasW, height: canvasH } = getCanvasDimensions(template);
  const isWide = template.aspectRatio === '16:9';
  const totalDuration = getTotalDuration(slides, timing, audio, template);

  const timeRef = useRef(0);
  const totalDurationRef = useRef(totalDuration);
  const hasUserScrubbedRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isMutedRef = useRef(false);
  const slidesRef = useRef(slides);
  const templateRef = useRef(template);
  const timingRef = useRef(timing);
  const audioRef = useRef(audio);

  slidesRef.current = slides;
  templateRef.current = template;
  timingRef.current = timing;
  audioRef.current = audio;
  totalDurationRef.current = totalDuration;
  isMutedRef.current = isMuted;

  const syncTimeUi = (sec: number, dur = totalDurationRef.current, syncReact = true) => {
    timeRef.current = sec;
    if (rangeInputRef.current) {
      rangeInputRef.current.value = String(sec);
    }
    if (timeLabelRef.current) {
      timeLabelRef.current.textContent = `${formatTimecode(sec)} / ${formatTimecode(dur)}`;
    }
    if (syncReact) {
      setCurrentTime(sec);
    }
  };

  useEffect(() => {
    if (isExporting) {
      setIsPlaying(false);
      soundEngine.stopBgMusic();
    }
  }, [isExporting]);

  useEffect(() => {
    void Promise.all([preloadTemplateBackground(template, slides), preloadTimerVideo()]).then(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { alpha: false });
      if (ctx) {
        renderQuizFrame(ctx, timeRef.current, slides, template, timing, audio, true);
      }
    });
  }, [template, slides, timing, audio, canvasW, canvasH]);

  useEffect(() => {
    if (!hasUserScrubbedRef.current && !isPlayingRef.current) {
      const schedules = computeProjectTimeline(slides, timing, audio);
      const sched = schedules[activeSlideIndex] ?? schedules[0];
      if (sched) {
        const showcaseTime = Math.min(
          totalDuration,
          sched.startTime + sched.tThinkingStart + Math.min(1.1, timing.thinkingDuration * 0.25)
        );
        syncTimeUi(showcaseTime, totalDuration, true);
      }
    }
  }, [slides, timing, audio, activeSlideIndex, totalDuration]);

  useEffect(() => {
    if (totalDuration > 0 && timeRef.current > totalDuration) {
      syncTimeUi(totalDuration, totalDuration, true);
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (ctx) {
      renderQuizFrame(ctx, timeRef.current, slides, template, timing, audio, true);
    }
  }, [slides, template, timing, audio, totalDuration, canvasW, canvasH]);

  const prevSlideIdxRef = useRef(activeSlideIndex);
  useEffect(() => {
    if (prevSlideIdxRef.current !== activeSlideIndex && !isPlayingRef.current) {
      const schedules = computeProjectTimeline(slides, timing, audio);
      const sched = schedules[activeSlideIndex];
      const target = sched
        ? sched.startTime + sched.tThinkingStart + Math.min(1.1, timing.thinkingDuration * 0.25)
        : 0;
      const clamped = Math.min(totalDuration, target);
      syncTimeUi(clamped, totalDuration, true);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { alpha: false });
      if (ctx) {
        renderQuizFrame(ctx, clamped, slides, template, timing, audio, true);
      }
    }
    prevSlideIdxRef.current = activeSlideIndex;
  }, [activeSlideIndex, timing, audio, totalDuration, slides, template]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (!isPlaying) {
      soundEngine.stopBgMusic();
      return;
    }

    let canceled = false;

    const startPlayback = async () => {
      if (!isMutedRef.current) {
        await soundEngine.preloadAllAudio(audioRef.current, slidesRef.current);
        if (canceled || !isPlayingRef.current) return;
        void soundEngine.startBgMusic(audioRef.current.bgMusic);
      }

      let rafId = 0;
      let lastPerf = performance.now();
      let lastUiSyncPerf = lastPerf;
      let isFirstTick = true;

      const tick = (now: number) => {
        if (canceled || !isPlayingRef.current) return;
        const dt = Math.min(0.1, (now - lastPerf) / 1000);
        lastPerf = now;

        const rawPrevT = timeRef.current;
        // Ensure events sitting right at play start time (including questionEnter at 0ms) fire synchronously with first visible frame
        const prevT = isFirstTick ? rawPrevT - 0.001 : rawPrevT;
        isFirstTick = false;
        let nextT = rawPrevT + dt;
        const maxDur = getTotalDuration(
          slidesRef.current,
          timingRef.current,
          audioRef.current,
          templateRef.current
        );

        if (nextT >= maxDur) {
          nextT = maxDur;
          syncTimeUi(nextT, maxDur, true);
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d', { alpha: false });
          if (ctx) {
            renderQuizFrame(
              ctx,
              nextT,
              slidesRef.current,
              templateRef.current,
              timingRef.current,
              audioRef.current,
              true
            );
          }
          setIsPlaying(false);
          soundEngine.stopBgMusic();
          return;
        }

        if (!isMutedRef.current) {
          const events = collectSoundEventsInInterval(
            prevT,
            nextT,
            slidesRef.current,
            timingRef.current,
            audioRef.current
          );
          const duckIfNeeded = (durSec: number) => {
            if (timingRef.current.autoDuckMusic !== false && durSec > 0.25) {
              soundEngine.duckBgMusic(undefined, durSec, timingRef.current.bgMusicDuckRatio ?? 0.22);
            }
          };

          for (const ev of events) {
            const s = slidesRef.current[ev.slideIndex];
            if (ev.type === 'questionEnter') {
              if (s?.voiceover?.question) {
                duckIfNeeded(s.voiceover.question.duration);
                void soundEngine.playClip(s.voiceover.question, 1);
              } else {
                void soundEngine.playSlot(audioRef.current.questionEnter);
              }
            } else if (ev.type === 'optionEnter') {
              const oIdx = ev.optionIndex ?? 0;
              const oClip = s?.voiceover?.options?.[oIdx];
              if (oClip) {
                duckIfNeeded(oClip.duration);
                void soundEngine.playClip(oClip, 1);
              } else {
                void soundEngine.playSlot(audioRef.current.optionEnter);
              }
            } else if (ev.type === 'countdownTick') {
              void soundEngine.playSlot(
                audioRef.current.countdownTick,
                undefined,
                undefined,
                undefined,
                !!ev.urgent
              );
            } else if (ev.type === 'suspense') {
              void soundEngine.playSlot(audioRef.current.suspense);
            } else if (ev.type === 'correctReveal') {
              if (s?.voiceover?.answer) {
                duckIfNeeded(s.voiceover.answer.duration);
                void soundEngine.playClip(s.voiceover.answer, 1);
              } else {
                void soundEngine.playSlot(audioRef.current.correctReveal);
              }
            }
          }
        }

        const shouldSyncReact = now - lastUiSyncPerf >= 250;
        if (shouldSyncReact) {
          lastUiSyncPerf = now;
        }
        syncTimeUi(nextT, maxDur, shouldSyncReact);

        const info = getSlideTimeInfo(
          nextT,
          slidesRef.current,
          timingRef.current,
          audioRef.current
        );
        if (info && onActiveSlideChange && info.slideIndex !== prevSlideIdxRef.current) {
          prevSlideIdxRef.current = info.slideIndex;
          onActiveSlideChange(info.slideIndex);
        }

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d', { alpha: false });
        if (ctx) {
          renderQuizFrame(
            ctx,
            nextT,
            slidesRef.current,
            templateRef.current,
            timingRef.current,
            audioRef.current,
            true
          );
        }

        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafId);
      };
    };

    let stopRaf: (() => void) | undefined;
    void startPlayback().then((cleanup) => {
      stopRaf = cleanup;
    });

    return () => {
      canceled = true;
      stopRaf?.();
      setCurrentTime(timeRef.current);
      soundEngine.stopBgMusic();
    };
  }, [isPlaying, onActiveSlideChange]);

  const handleTogglePlay = () => {
    soundEngine.getContext();
    if (!isPlaying && (!hasUserScrubbedRef.current || timeRef.current >= totalDuration - 0.05)) {
      hasUserScrubbedRef.current = true;
      const schedules = computeProjectTimeline(slides, timing, audio);
      const sched = schedules[activeSlideIndex];
      const startAt = timeRef.current >= totalDuration - 0.05 ? 0 : sched ? sched.startTime : 0;
      timeRef.current = startAt;
      setCurrentTime(startAt);
    }
    setIsPlaying((p) => !p);
  };

  const handleRestart = () => {
    soundEngine.getContext();
    hasUserScrubbedRef.current = true;
    timeRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const handleStepSlide = (delta: number) => {
    const nextIdx = Math.max(0, Math.min(slides.length - 1, activeSlideIndex + delta));
    const schedules = computeProjectTimeline(slides, timing, audio);
    const sched = schedules[nextIdx];
    if (sched && onActiveSlideChange) {
      hasUserScrubbedRef.current = true;
      onActiveSlideChange(nextIdx);
      timeRef.current = sched.startTime;
      setCurrentTime(sched.startTime);
      setIsPlaying(true);
      soundEngine.getContext();
    }
  };

  const handleScrub = (val: number) => {
    hasUserScrubbedRef.current = true;
    setIsPlaying(false);
    syncTimeUi(val, totalDuration, true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (ctx) {
      renderQuizFrame(ctx, val, slides, template, timing, audio, true);
    }
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next) {
        soundEngine.stopBgMusic();
      } else if (isPlayingRef.current) {
        void soundEngine.startBgMusic(audioRef.current.bgMusic);
      }
      return next;
    });
  };

  const jumpToPhase = (phase: 'question' | 'opt1' | 'opt4' | 'timer' | 'suspense' | 'reveal' | 'end') => {
    hasUserScrubbedRef.current = true;
    setIsPlaying(false);
    const schedules = computeProjectTimeline(slides, timing, audio);
    const sched = schedules[activeSlideIndex] ?? schedules[0];
    if (!sched) return;

    let target = sched.startTime + sched.tQuestionStart + 0.36;
    if (phase === 'opt1') {
      target = sched.startTime + sched.tOptionStarts[0] + 0.36;
    } else if (phase === 'opt4') {
      target = sched.startTime + sched.tOptionStarts[3] + 0.36;
    } else if (phase === 'timer') {
      target = sched.startTime + sched.tThinkingStart + Math.min(1.1, timing.thinkingDuration * 0.25);
    } else if (phase === 'suspense') {
      target = sched.startTime + sched.tSuspenseStart + Math.min(0.4, (timing.suspenseDuration ?? 1.6) * 0.3);
    } else if (phase === 'reveal') {
      target = sched.startTime + sched.tRevealStart + 0.5;
    } else if (phase === 'end') {
      const contentEnd = getSlidesContentDuration(slides, timing, audio);
      target = Math.min(totalDuration, contentEnd + 0.8);
    }

    const clamped = Math.min(totalDuration, target);
    syncTimeUi(clamped, totalDuration, true);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (ctx) {
      renderQuizFrame(ctx, clamped, slides, template, timing, audio, true);
    }
  };

  const handleCaptureThumbnail = async () => {
    if (isCapturingThumb) return;
    setIsCapturingThumb(true);
    try {
      const blob = await exportThumbnailJpg(
        slides,
        template,
        timing,
        audio,
        timeRef.current
      );
      if (!blob) return;
      const fileName = `quiz-thumbnail-${Date.now()}.jpg`;
      await saveOrDownloadBlob(blob, fileName, 'image/jpeg');
    } finally {
      setIsCapturingThumb(false);
    }
  };

  const phases: { id: 'question' | 'opt1' | 'opt4' | 'timer' | 'suspense' | 'reveal' | 'end'; label: string }[] = [
    { id: 'question', label: 'السؤال' },
    { id: 'opt1', label: 'خيار 1' },
    { id: 'opt4', label: 'كل الخيارات' },
    { id: 'timer', label: 'المؤقت' },
    ...(timing.suspenseDuration > 0 ? [{ id: 'suspense' as const, label: 'التشويق' }] : []),
    { id: 'reveal', label: 'الناتج' },
    ...(template.showEndCard ? [{ id: 'end' as const, label: 'النهاية' }] : []),
  ];

  return (
    <div className="flex flex-col items-center justify-between h-full w-full gap-3 py-3 px-4">
      {/* Stage Quick Jump Bar */}
      {!hideControlsOverlay && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 w-full max-w-2xl">
          <span className="text-xs text-[var(--pmuted)] ml-1 whitespace-nowrap">معاينة:</span>
          {phases.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => jumpToPhase(p.id)}
              className="px-2.5 py-1 text-xs font-semibold rounded-md bg-[var(--panel)] hover:border-[var(--gold)] text-[var(--ptxt)] border border-[var(--pline)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Stage Frame: Adaptive 9:16 Vertical Shorts OR 16:9 Landscape Long Video */}
      <div className="relative flex-1 flex items-center justify-center min-h-0 w-full">
        <div
          className={`relative rounded-2xl overflow-hidden bg-black border-2 border-[var(--pline)] shadow-2xl shadow-black/70 transition-all duration-200 ${
            isWide
              ? 'w-full max-w-[780px] aspect-video'
              : 'h-full max-h-[650px] aspect-[9/16]'
          }`}
        >
          <canvas
            ref={canvasRef}
            width={canvasW}
            height={canvasH}
            onClick={handleTogglePlay}
            className="w-full h-full object-contain cursor-pointer block"
          />

          {/* Floating Channel-Style Top Quick Action Strip */}
          <div
            className={`absolute top-2.5 inset-x-2 flex items-center justify-center gap-1.5 transition-opacity duration-200 ${
              hideControlsOverlay ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            <button
              type="button"
              onClick={() => handleStepSlide(-1)}
              disabled={activeSlideIndex <= 0}
              title="السؤال السابق"
              className="w-8 h-8 rounded-full bg-black/65 hover:bg-black/85 disabled:opacity-35 text-white flex items-center justify-center border border-white/15 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleTogglePlay}
              title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل'}
              className="w-8 h-8 rounded-full bg-[#00B050] hover:bg-[#00c85b] text-white flex items-center justify-center border border-white/25 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => handleStepSlide(1)}
              disabled={activeSlideIndex >= slides.length - 1}
              title="السؤال التالي"
              className="w-8 h-8 rounded-full bg-black/65 hover:bg-black/85 disabled:opacity-35 text-white flex items-center justify-center border border-white/15 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCycleChannelTheme}
              title="تبديل ألوان القالب (رملي / كحلي / زمردي / سبورة رياضيات)"
              className="w-8 h-8 rounded-full bg-black/65 hover:bg-black/85 text-[#EDD6A2] flex items-center justify-center border border-white/15 cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleMute}
              title={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
              className={`w-8 h-8 rounded-full flex items-center justify-center border cursor-pointer ${
                isMuted
                  ? 'bg-rose-600/80 text-white border-rose-400'
                  : 'bg-black/65 hover:bg-black/85 text-white border-white/15'
              }`}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setHideControlsOverlay((v) => !v)}
            title={hideControlsOverlay ? 'إظهار أزرار المعاينة' : 'إخفاء أزرار المعاينة'}
            className="absolute top-2.5 left-2.5 w-7 h-7 rounded-full bg-black/40 hover:bg-black/75 text-white/75 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            {hideControlsOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Bottom Scrubber & Controls */}
      <div className="w-full max-w-lg bg-[var(--panel)] border border-[var(--pline)] rounded-xl p-3 flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <input
            ref={rangeInputRef}
            type="range"
            min={0}
            max={Math.max(0.1, totalDuration)}
            step={0.05}
            defaultValue={currentTime}
            onChange={(e) => handleScrub(parseFloat(e.target.value))}
            aria-label="الجدول الزمني للفيديو"
            className="w-full h-1.5 rounded-lg bg-[var(--surface)] cursor-pointer"
          />
          <span
            ref={timeLabelRef}
            className="font-mono-nums text-xs text-[var(--ptxt)] whitespace-nowrap shrink-0"
            dir="ltr"
          >
            {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B050] hover:bg-[#00c85b] text-white text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{isPlaying ? 'إيقاف' : 'تشغيل المعاينة'}</span>
            </button>

            <button
              type="button"
              onClick={handleRestart}
              title="تشغيل الفيديو كامل من الأول"
              className="p-2.5 rounded-lg bg-[var(--surface)] hover:border-[var(--gold)] text-[var(--ptxt)] border border-[var(--pline)] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {onToggleAspectRatio && (
              <button
                type="button"
                onClick={onToggleAspectRatio}
                title="تبديل أبعاد الفيديو بين شورتس 9:16 وفيديو طويل 16:9"
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isWide
                    ? 'bg-[#00B050]/18 border-[#00B050] text-[#00B050] dark:text-[#6ee7b7]'
                    : 'bg-[var(--surface)] border-[var(--pline)] text-[var(--ptxt)] hover:border-[var(--gold)]'
                }`}
              >
                {isWide ? <Monitor className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                <span>{isWide ? '16:9 طويل' : '9:16 شورتس'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onCycleChannelTheme}
              title="تبديل سريع لثيم القناة"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-[var(--surface)] border border-[var(--pline)] text-[var(--sand)] hover:border-[var(--gold)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>الثيم</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCaptureThumbnail()}
              disabled={isCapturingThumb}
              title="حفظ اللقطة الحالية كصورة غلاف JPG بدقة عالية"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-[var(--surface)] border border-[var(--pline)] text-[var(--ptxt)] hover:border-[#00B050] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-[#00B050]" />
              <span>{isCapturingThumb ? 'جارٍ الحفظ...' : 'غلاف JPG'}</span>
            </button>

            <button
              type="button"
              onClick={onToggleSafeGuides}
              title="إظهار حدود أزرار يوتيوب"
              className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                template.showSafeGuides
                  ? 'bg-[#d4a73a]/20 border-[#d4a73a] text-[#EDD6A2]'
                  : 'bg-[var(--surface)] border-[var(--pline)] text-[var(--pmuted)] hover:text-[var(--ptxt)]'
              }`}
            >
              <Scan className="w-3.5 h-3.5" />
              <span>حدود الأمان</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
