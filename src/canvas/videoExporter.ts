import { soundEngine } from '../audio/soundEngine';
import {
  AudioSettings,
  QuestionSlide,
  TemplateSettings,
  TimingSettings,
  getCanvasDimensions,
  getTotalDuration,
} from '../types/quiz';
import {
  collectSoundEventsInInterval,
  preloadTemplateBackground,
  preloadTimerVideo,
  renderQuizFrame,
} from './quizRenderer';

export interface ExportProgress {
  progress: number;
  currentTime: number;
  totalDuration: number;
  statusText: string;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  extension: 'mp4' | 'webm';
}

function getPreferredMimeType(): { mimeType: string; extension: 'mp4' | 'webm' } {
  // MP4 أولاً (أوسع توافقاً مع برامج المونتاج والموبايلات)، ثم WebM كاحتياط
  const candidates: { mimeType: string; extension: 'mp4' | 'webm' }[] = [
    { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];

  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }
  return { mimeType: '', extension: 'webm' };
}

export async function exportQuizVideo(
  slides: QuestionSlide[],
  template: TemplateSettings,
  timing: TimingSettings,
  audio: AudioSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal
): Promise<ExportResult> {
  const totalDuration = getTotalDuration(slides, timing, audio, template);
  if (totalDuration <= 0) {
    throw new Error('لا توجد أسئلة صالحة للتصدير.');
  }

  const { width, height } = getCanvasDimensions(template);

  onProgress({
    progress: 0,
    currentTime: 0,
    totalDuration,
    statusText: 'جارٍ تجهيز الخطوط والقالب والأصوات...',
  });

  try {
    await Promise.all([
      document.fonts.ready,
      document.fonts.load(`700 40px '${template.fontFamily}'`),
      document.fonts.load(`800 52px '${template.fontFamily}'`),
      document.fonts.load(`900 84px '${template.fontFamily}'`),
      document.fonts.load(`800 48px 'JetBrains Mono'`),
    ]);
  } catch {
    await document.fonts.ready;
  }

  await Promise.all([preloadTemplateBackground(template, slides), preloadTimerVideo()]);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.width = '1px';
  canvas.style.height = '1px';
  canvas.style.opacity = '0.001';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '-1';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    canvas.remove();
    throw new Error('تعذر تهيئة محرك الرسم على هذا المتصفح.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const exportAudioCtx = new AudioCtx();
  if (exportAudioCtx.state === 'suspended') {
    await exportAudioCtx.resume();
  }

  await soundEngine.preloadAllAudio(audio, slides, exportAudioCtx);

  const audioDest = exportAudioCtx.createMediaStreamDestination();

  const keepAliveOsc = exportAudioCtx.createOscillator();
  const keepAliveGain = exportAudioCtx.createGain();
  keepAliveGain.gain.setValueAtTime(0.00001, exportAudioCtx.currentTime);
  keepAliveOsc.connect(keepAliveGain);
  keepAliveGain.connect(audioDest);
  keepAliveOsc.start();

  const canvasStream = canvas.captureStream(30);
  const videoTrack = canvasStream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;

  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const { mimeType, extension } = getPreferredMimeType();
  const recorderOptions: MediaRecorderOptions = {
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 192_000,
  };
  if (mimeType) {
    recorderOptions.mimeType = mimeType;
  }

  const recorder = new MediaRecorder(combinedStream, recorderOptions);
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  let bgSource: AudioBufferSourceNode | null = null;

  // منع انطفاء الشاشة أثناء التصدير (حتى ما ينقطع التسجيل)
  let wakeLock: { release: () => Promise<void> } | null = null;
  try {
    const wl = (navigator as unknown as {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (wl) wakeLock = await wl.request('screen');
  } catch {
    // ignore
  }

  return await new Promise<ExportResult>((resolve, reject) => {
    let timerId = 0;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      window.clearTimeout(timerId);
      try {
        keepAliveOsc.stop();
        keepAliveOsc.disconnect();
        keepAliveGain.disconnect();
      } catch {
        // ignore
      }
      if (bgSource) {
        try {
          bgSource.stop();
          bgSource.disconnect();
        } catch {
          // ignore
        }
      }
      combinedStream.getTracks().forEach((t) => t.stop());
      if (wakeLock) {
        void wakeLock.release().catch(() => undefined);
        wakeLock = null;
      }
      if (exportAudioCtx.state !== 'closed') {
        void exportAudioCtx.close();
      }
      canvas.remove();
    };

    const onAbort = () => {
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {
        // ignore
      }
      cleanup();
      reject(new Error('تم إلغاء التصدير.'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    recorder.onerror = () => {
      cleanup();
      reject(new Error('حدث خطأ أثناء تسجيل الفيديو.'));
    };

    recorder.onstop = () => {
      signal.removeEventListener('abort', onAbort);
      cleanup();
      if (signal.aborted) return;
      const finalType = recorder.mimeType || mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: finalType });
      resolve({
        blob,
        mimeType: finalType,
        extension: finalType.includes('mp4') ? 'mp4' : extension,
      });
    };

    renderQuizFrame(ctx, 0, slides, template, timing, audio, false);
    videoTrack?.requestFrame?.();

    recorder.start(250);

    // Warm up MediaRecorder + CaptureStream pipeline briefly so frame 0 & initial audio align 1:1
    timerId = window.setTimeout(() => {
      if (signal.aborted) return;
      void soundEngine.startBgMusic(audio.bgMusic, audioDest, exportAudioCtx).then((src) => {
        if (cleanedUp && src) {
          try {
            src.stop();
          } catch {
            // ignore
          }
          return;
        }
        bgSource = src;
      });

      const audioStartTime = exportAudioCtx.currentTime;
      const startPerf = performance.now();
      const frameIntervalMs = 1000 / 30;
      let frameIdx = 0;
      let prevElapsed = -0.001;

      const tick = () => {
        if (signal.aborted || cleanedUp) return;

        // Drive visuals directly from AudioContext sample clock so A/V never drifts
        const audioElapsed = exportAudioCtx.currentTime - audioStartTime;
        const elapsed = Math.min(totalDuration, Math.max(0, audioElapsed));

        const events = collectSoundEventsInInterval(prevElapsed, elapsed, slides, timing, audio);
        const duckIfNeeded = (durSec: number) => {
          if (timing.autoDuckMusic !== false && durSec > 0.25) {
            soundEngine.duckBgMusic(exportAudioCtx, durSec, timing.bgMusicDuckRatio ?? 0.22);
          }
        };

        for (const ev of events) {
          const slide = slides[ev.slideIndex];
          if (ev.type === 'questionEnter') {
            if (slide?.voiceover?.question) {
              duckIfNeeded(slide.voiceover.question.duration);
              void soundEngine.playClip(
                slide.voiceover.question,
                1,
                audioDest,
                exportAudioCtx
              );
            } else {
              void soundEngine.playSlot(audio.questionEnter, audioDest, exportAudioCtx);
            }
          } else if (ev.type === 'optionEnter') {
            const optIdx = ev.optionIndex ?? 0;
            const optClip = slide?.voiceover?.options?.[optIdx];
            if (optClip) {
              duckIfNeeded(optClip.duration);
              void soundEngine.playClip(optClip, 1, audioDest, exportAudioCtx);
            } else {
              void soundEngine.playSlot(audio.optionEnter, audioDest, exportAudioCtx);
            }
          } else if (ev.type === 'countdownTick') {
            void soundEngine.playSlot(
              audio.countdownTick,
              audioDest,
              exportAudioCtx,
              undefined,
              !!ev.urgent
            );
          } else if (ev.type === 'suspense') {
            void soundEngine.playSlot(audio.suspense, audioDest, exportAudioCtx);
          } else if (ev.type === 'correctReveal') {
            if (slide?.voiceover?.answer) {
              duckIfNeeded(slide.voiceover.answer.duration);
              void soundEngine.playClip(
                slide.voiceover.answer,
                1,
                audioDest,
                exportAudioCtx
              );
            } else {
              void soundEngine.playSlot(audio.correctReveal, audioDest, exportAudioCtx);
            }
          }
        }
        prevElapsed = elapsed;

        renderQuizFrame(ctx, elapsed, slides, template, timing, audio, false);
        videoTrack?.requestFrame?.();

        onProgress({
          progress: elapsed / totalDuration,
          currentTime: elapsed,
          totalDuration,
          statusText: `جارٍ تسجيل الفيديو (${Math.round((elapsed / totalDuration) * 100)}%)`,
        });

        if (elapsed >= totalDuration) {
          timerId = window.setTimeout(() => {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
          }, 250);
          return;
        }

        frameIdx += 1;
        const nextTargetPerf = startPerf + frameIdx * frameIntervalMs;
        const delay = Math.max(4, nextTargetPerf - performance.now());
        timerId = window.setTimeout(tick, delay);
      };

      tick();
    }, 140);
  });
}
