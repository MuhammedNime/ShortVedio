import { soundEngine } from '../audio/soundEngine';
import {
  AudioSettings,
  QuestionSlide,
  TemplateSettings,
  TimingSettings,
  computeProjectTimeline,
  getCanvasDimensions,
  getIntroHookDuration,
  getTotalDuration,
} from '../types/quiz';
import {
  TimelineSoundEvent,
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

interface ScheduledTimelineAudio {
  time: number;
  event: TimelineSoundEvent;
}

function getPreferredMimeTypes(): { mimeType: string; extension: 'mp4' | 'webm' }[] {
  const candidates: { mimeType: string; extension: 'mp4' | 'webm' }[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];

  const supported =
    typeof MediaRecorder !== 'undefined'
      ? candidates.filter((c) => MediaRecorder.isTypeSupported(c.mimeType))
      : [];

  return supported.length > 0 ? supported : [{ mimeType: '', extension: 'webm' }];
}

function buildScheduledAudioPlan(
  slides: QuestionSlide[],
  timing: TimingSettings,
  audio: AudioSettings,
  template: TemplateSettings
): {
  events: ScheduledTimelineAudio[];
  speechIntervals: Array<{ start: number; end: number }>;
} {
  const events: ScheduledTimelineAudio[] = [];
  const speechIntervals: Array<{ start: number; end: number }> = [];

  const introDur = getIntroHookDuration(template, timing);
  if (introDur > 0 && slides.length > 0) {
    events.push({
      time: 0,
      event: { type: 'introHook', slideIndex: 0 },
    });
    if (template.introHookAudio?.dataUrl && (template.introHookAudio.duration ?? 0) > 0.2) {
      speechIntervals.push({
        start: 0,
        end: template.introHookAudio.duration,
      });
    }
  }

  const schedules = computeProjectTimeline(slides, timing, audio, template);
  for (const sched of schedules) {
    const sIdx = sched.slideIndex;
    const slide = slides[sIdx];
    const base = sched.startTime;

    const tQ = base + sched.tQuestionStart;
    events.push({
      time: tQ,
      event: { type: 'questionEnter', slideIndex: sIdx },
    });
    if (slide?.voiceover?.question?.dataUrl && slide.voiceover.question.duration > 0.2) {
      speechIntervals.push({
        start: tQ,
        end: tQ + slide.voiceover.question.duration,
      });
    }

    const optCount = slide?.slideType === 'trueFalse' ? 2 : 4;
    for (let oIdx = 0; oIdx < optCount; oIdx++) {
      const tOpt = base + sched.tOptionStarts[oIdx];
      const sameAsPrev =
        oIdx > 0 && Math.abs(sched.tOptionStarts[oIdx] - sched.tOptionStarts[oIdx - 1]) < 0.01;
      const oClip = slide?.voiceover?.options?.[oIdx];
      if (!sameAsPrev || oClip?.dataUrl) {
        events.push({
          time: tOpt,
          event: { type: 'optionEnter', slideIndex: sIdx, optionIndex: oIdx },
        });
      }
      if (oClip?.dataUrl && oClip.duration > 0.2) {
        speechIntervals.push({
          start: tOpt,
          end: tOpt + oClip.duration,
        });
      }
    }

    const totalTicks = Math.floor(timing.thinkingDuration);
    const tThink = base + sched.tThinkingStart;
    for (let sec = 0; sec < totalTicks; sec++) {
      const tickSecond = totalTicks - sec;
      events.push({
        time: tThink + sec,
        event: {
          type: 'countdownTick',
          slideIndex: sIdx,
          tickSecond,
          urgent: tickSecond <= 3,
        },
      });
    }

    if ((timing.suspenseDuration ?? 0) > 0) {
      events.push({
        time: base + sched.tSuspenseStart,
        event: { type: 'suspense', slideIndex: sIdx },
      });
    }

    const tReveal = base + sched.tRevealStart;
    events.push({
      time: tReveal,
      event: { type: 'correctReveal', slideIndex: sIdx },
    });
    if (slide?.voiceover?.answer?.dataUrl && slide.voiceover.answer.duration > 0.2) {
      speechIntervals.push({
        start: tReveal,
        end: tReveal + slide.voiceover.answer.duration,
      });
    }
  }

  events.sort((a, b) => a.time - b.time);
  return { events, speechIntervals };
}

export async function exportQuizVideo(
  slides: QuestionSlide[],
  template: TemplateSettings,
  timing: TimingSettings,
  audio: AudioSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal
): Promise<ExportResult> {
  if (slides.length === 0) {
    throw new Error('لا توجد أسئلة صالحة للتصدير.');
  }

  const { width, height } = getCanvasDimensions(template);

  onProgress({
    progress: 0,
    currentTime: 0,
    totalDuration: getTotalDuration(slides, timing, audio, template) || 1,
    statusText: 'جارٍ تجهيز الخطوط والقالب وفحص أطوال الأصوات...',
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

  const synced = await soundEngine.syncProjectAudioDurations(
    slides,
    audio,
    template,
    exportAudioCtx
  );
  const sSlides = synced.slides;
  const sAudio = synced.audio;
  const sTemplate = synced.template;

  const totalDuration = getTotalDuration(sSlides, timing, sAudio, sTemplate);
  if (totalDuration <= 0) {
    canvas.remove();
    if (exportAudioCtx.state !== 'closed') {
      void exportAudioCtx.close();
    }
    throw new Error('لا توجد أسئلة صالحة للتصدير.');
  }

  const audioDest = exportAudioCtx.createMediaStreamDestination();

  // Subtle silent oscillator keeps MediaStream audio track active across silent gaps
  const keepAliveOsc = exportAudioCtx.createOscillator();
  const keepAliveGain = exportAudioCtx.createGain();
  keepAliveGain.gain.setValueAtTime(0.00001, exportAudioCtx.currentTime);
  keepAliveOsc.connect(keepAliveGain);
  keepAliveGain.connect(audioDest);
  keepAliveOsc.start();

  // Prefer manual requestFrame() captureStream(0) when supported so dropped frames never desync A/V
  let canvasStream = canvas.captureStream(0);
  let videoTrack = canvasStream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;
  if (!videoTrack || typeof videoTrack.requestFrame !== 'function') {
    canvasStream.getTracks().forEach((t) => t.stop());
    canvasStream = canvas.captureStream(30);
    videoTrack = canvasStream.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined;
  }

  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const mimeCandidates = getPreferredMimeTypes();
  let chosenMime = mimeCandidates[0];
  let recorder: MediaRecorder | null = null;
  for (const candidate of mimeCandidates) {
    try {
      const opts: MediaRecorderOptions = {
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 192_000,
      };
      if (candidate.mimeType) opts.mimeType = candidate.mimeType;
      recorder = new MediaRecorder(combinedStream, opts);
      chosenMime = candidate;
      break;
    } catch {
      recorder = null;
    }
  }
  if (!recorder) {
    recorder = new MediaRecorder(combinedStream);
  }
  const activeRecorder = recorder;
  const chunks: BlobPart[] = [];

  activeRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  let bgSource: AudioBufferSourceNode | null = null;

  // Keep screen awake during export on mobile/Android
  let wakeLock: { release: () => Promise<void> } | null = null;
  try {
    const wl = (navigator as unknown as {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> };
    }).wakeLock;
    if (wl) wakeLock = await wl.request('screen');
  } catch {
    // ignore
  }

  const { events: plannedAudio, speechIntervals } = buildScheduledAudioPlan(
    sSlides,
    timing,
    sAudio,
    sTemplate
  );

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
        if (activeRecorder.state !== 'inactive') {
          activeRecorder.stop();
        }
      } catch {
        // ignore
      }
      cleanup();
      reject(new Error('تم إلغاء التصدير.'));
    };

    signal.addEventListener('abort', onAbort, { once: true });

    activeRecorder.onerror = () => {
      cleanup();
      reject(new Error('حدث خطأ أثناء تسجيل الفيديو.'));
    };

    activeRecorder.onstop = () => {
      signal.removeEventListener('abort', onAbort);
      cleanup();
      if (signal.aborted) return;
      const finalType = activeRecorder.mimeType || chosenMime.mimeType || 'video/webm';
      const blob = new Blob(chunks, { type: finalType });
      resolve({
        blob,
        mimeType: finalType,
        extension: finalType.includes('mp4') ? 'mp4' : chosenMime.extension,
      });
    };

    // Draw frame 0 synchronously before starting recorder
    renderQuizFrame(ctx, 0, sSlides, sTemplate, timing, sAudio, false);
    videoTrack?.requestFrame?.();

    activeRecorder.start(250);

    // Small 40ms pipeline settle window so audioStartTime aligns identically with frame 0
    const audioStartTime = exportAudioCtx.currentTime + 0.04;
    let nextAudioIdx = 0;

    void soundEngine.startBgMusic(sAudio.bgMusic, audioDest, exportAudioCtx).then((src) => {
      if (cleanedUp && src) {
        try {
          src.stop();
        } catch {
          // ignore
        }
        return;
      }
      bgSource = src;
      if (timing.autoDuckMusic !== false && speechIntervals.length > 0) {
        soundEngine.scheduleBgDuckIntervals(
          exportAudioCtx,
          speechIntervals,
          audioStartTime,
          timing.bgMusicDuckRatio ?? 0.22
        );
      }
    });

    const scheduleAudioLookahead = (horizonTime: number) => {
      while (nextAudioIdx < plannedAudio.length && plannedAudio[nextAudioIdx].time <= horizonTime) {
        const item = plannedAudio[nextAudioIdx];
        nextAudioIdx += 1;
        const when = Math.max(exportAudioCtx.currentTime, audioStartTime + item.time);
        const ev = item.event;
        const slide = sSlides[ev.slideIndex];

        if (ev.type === 'introHook') {
          const hookSfx = sTemplate.introHookSfx ?? 'whoosh';
          if (hookSfx && hookSfx !== 'none') {
            soundEngine.playBuiltInSfx(hookSfx, 0.72, exportAudioCtx, audioDest, when);
          }
          if (sTemplate.introHookAudio?.dataUrl) {
            void soundEngine.playClip(
              sTemplate.introHookAudio,
              1,
              audioDest,
              exportAudioCtx,
              when
            );
          }
        } else if (ev.type === 'questionEnter') {
          if (slide?.voiceover?.question?.dataUrl) {
            void soundEngine.playClip(
              slide.voiceover.question,
              1,
              audioDest,
              exportAudioCtx,
              when
            );
          } else {
            void soundEngine.playSlot(sAudio.questionEnter, audioDest, exportAudioCtx, when);
          }
        } else if (ev.type === 'optionEnter') {
          const optIdx = ev.optionIndex ?? 0;
          const optClip = slide?.voiceover?.options?.[optIdx];
          if (optClip?.dataUrl) {
            void soundEngine.playClip(optClip, 1, audioDest, exportAudioCtx, when);
          } else {
            void soundEngine.playSlot(sAudio.optionEnter, audioDest, exportAudioCtx, when);
          }
        } else if (ev.type === 'countdownTick') {
          void soundEngine.playSlot(
            sAudio.countdownTick,
            audioDest,
            exportAudioCtx,
            when,
            !!ev.urgent
          );
        } else if (ev.type === 'suspense') {
          void soundEngine.playSlot(sAudio.suspense, audioDest, exportAudioCtx, when);
        } else if (ev.type === 'correctReveal') {
          if (slide?.voiceover?.answer?.dataUrl) {
            void soundEngine.playClip(
              slide.voiceover.answer,
              1,
              audioDest,
              exportAudioCtx,
              when
            );
          } else {
            void soundEngine.playSlot(sAudio.correctReveal, audioDest, exportAudioCtx, when);
          }
        }
      }
    };

    const tick = () => {
      if (signal.aborted || cleanedUp) return;

      const audioElapsed = exportAudioCtx.currentTime - audioStartTime;
      const elapsed = Math.min(totalDuration, Math.max(0, audioElapsed));

      // Schedule upcoming sounds 0.8s ahead using exact AudioContext sample clock
      scheduleAudioLookahead(elapsed + 0.8);

      renderQuizFrame(ctx, elapsed, sSlides, sTemplate, timing, sAudio, false);
      videoTrack?.requestFrame?.();

      onProgress({
        progress: elapsed / totalDuration,
        currentTime: elapsed,
        totalDuration,
        statusText: `جارٍ تسجيل الفيديو (${Math.round((elapsed / totalDuration) * 100)}%)`,
      });

      if (elapsed >= totalDuration) {
        scheduleAudioLookahead(totalDuration + 0.1);
        timerId = window.setTimeout(() => {
          if (activeRecorder.state !== 'inactive') {
            activeRecorder.stop();
          }
        }, 420);
        return;
      }

      // Pace smoothly to 30fps slots without spin-looping on heavy slides
      const nextSlotTime = (Math.floor(elapsed * 30) + 1) / 30;
      const delay = Math.max(8, Math.min(45, (nextSlotTime - elapsed) * 1000));
      timerId = window.setTimeout(tick, delay);
    };

    timerId = window.setTimeout(tick, 40);
  });
}
