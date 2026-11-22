import {
  AnimationStyle,
  AudioSettings,
  PRESET_BACKDROPS,
  QuestionSlide,
  SlideSchedule,
  TemplateSettings,
  TimingSettings,
  computeProjectTimeline,
  getCanvasDimensions,
  getSlidesContentDuration,
} from '../types/quiz';
import { drawSmartQuizText, hasMathSyntax } from './mathCanvasRenderer';

export const CANVAS_WIDTH = 1080;
export const CANVAS_HEIGHT = 1920;

export interface TimelineSoundEvent {
  type: 'questionEnter' | 'optionEnter' | 'countdownTick' | 'suspense' | 'correctReveal';
  slideIndex: number;
  optionIndex?: number;
  tickSecond?: number;
  urgent?: boolean;
}

export interface SlideTimeInfo {
  slideIndex: number;
  slide: QuestionSlide;
  localTime: number;
  schedule: SlideSchedule;
}

export function getSlideTimeInfo(
  globalTime: number,
  slides: QuestionSlide[],
  timing: TimingSettings,
  audio: AudioSettings
): SlideTimeInfo | null {
  if (slides.length === 0) return null;
  const schedules = computeProjectTimeline(slides, timing, audio);

  let chosen = schedules[schedules.length - 1];
  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    const nextStart = i < schedules.length - 1 ? schedules[i + 1].startTime : Infinity;
    if (globalTime < nextStart) {
      chosen = s;
      break;
    }
  }

  const localTime = Math.max(0, Math.min(chosen.duration, globalTime - chosen.startTime));
  return {
    slideIndex: chosen.slideIndex,
    slide: slides[chosen.slideIndex],
    localTime,
    schedule: chosen,
  };
}

export function collectSoundEventsInInterval(
  prevTime: number,
  currTime: number,
  slides: QuestionSlide[],
  timing: TimingSettings,
  audio: AudioSettings
): TimelineSoundEvent[] {
  const events: TimelineSoundEvent[] = [];
  if (currTime <= prevTime || slides.length === 0) return events;

  const schedules = computeProjectTimeline(slides, timing, audio);

  for (const sched of schedules) {
    const sIdx = sched.slideIndex;
    const base = sched.startTime;
    const tQ = base + sched.tQuestionStart;
    const tOpts = sched.tOptionStarts.map((t) => base + t);
    const tThink = base + sched.tThinkingStart;
    const tSus = base + sched.tSuspenseStart;
    const tReveal = base + sched.tRevealStart;

    if (prevTime < tQ && currTime >= tQ) {
      events.push({ type: 'questionEnter', slideIndex: sIdx });
    }

    tOpts.forEach((tOpt, oIdx) => {
      if (prevTime < tOpt && currTime >= tOpt) {
        events.push({ type: 'optionEnter', slideIndex: sIdx, optionIndex: oIdx });
      }
    });

    const totalTicks = Math.floor(timing.thinkingDuration);
    for (let sec = 0; sec < totalTicks; sec++) {
      const tTick = tThink + sec;
      const tickSecond = totalTicks - sec;
      if (prevTime < tTick && currTime >= tTick) {
        events.push({
          type: 'countdownTick',
          slideIndex: sIdx,
          tickSecond,
          urgent: tickSecond <= 3,
        });
      }
    }

    if ((timing.suspenseDuration ?? 0) > 0 && prevTime < tSus && currTime >= tSus) {
      events.push({ type: 'suspense', slideIndex: sIdx });
    }

    if (prevTime < tReveal && currTime >= tReveal) {
      events.push({ type: 'correctReveal', slideIndex: sIdx });
    }
  }

  return events;
}

// Easing helpers
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function easeOutCubic(t: number): number {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

function easeOutBack(t: number): number {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

interface AnimTransform {
  opacity: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

function computeAnimTransform(progress: number, style: AnimationStyle): AnimTransform {
  if (progress <= 0) {
    return { opacity: 0, scale: 0.8, offsetX: 0, offsetY: 0 };
  }
  if (progress >= 1) {
    return { opacity: 1, scale: 1, offsetX: 0, offsetY: 0 };
  }

  const eased = easeOutCubic(progress);
  const back = easeOutBack(progress);

  switch (style) {
    case 'scale':
      return {
        opacity: eased,
        scale: 0.78 + 0.22 * eased,
        offsetX: 0,
        offsetY: 0,
      };
    case 'pop':
      return {
        opacity: clamp01(progress * 2.2),
        scale: 0.65 + 0.35 * back,
        offsetX: 0,
        offsetY: 0,
      };
    case 'slideUp':
      return {
        opacity: eased,
        scale: 1,
        offsetX: 0,
        offsetY: (1 - eased) * 85,
      };
    case 'slideRight':
      return {
        opacity: eased,
        scale: 1,
        offsetX: -(1 - eased) * 180,
        offsetY: 0,
      };
    case 'slideLeft':
      return {
        opacity: eased,
        scale: 1,
        offsetX: (1 - eased) * 180,
        offsetY: 0,
      };
    case 'fade':
    default:
      return {
        opacity: eased,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      };
  }
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(15, 23, 42, ${alpha})`;
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0,
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  }
  return [0, 0, 0];
}

function isColorDark(hex: string, dimOpacity = 0): boolean {
  const [r, g, b] = hexToRgbTuple(hex);
  const factor = 1 - clamp01(dimOpacity);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) * factor;
  return luma < 145;
}

function isBackgroundDark(template: TemplateSettings): boolean {
  if (template.backgroundType === 'color') {
    return isColorDark(template.solidBgColor || '#0c0c0c', template.bgDimOpacity);
  }
  if (template.backgroundType === 'preset') {
    if (template.presetId === 'channelSand') {
      return template.bgDimOpacity >= 0.35;
    }
    return true;
  }
  return template.bgDimOpacity >= 0.35;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function applyBoxGloss(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  enhanced = false
): void {
  drawRoundedRect(ctx, x, y, w, h, r);
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, enhanced ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(0.48, enhanced ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.04)');
  grad.addColorStop(1, enhanced ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fill();

  if (enhanced && w > 24 && h > 24) {
    drawRoundedRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(0, r - 3));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

const wrapCache = new Map<string, string[]>();

function wrapArabicText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const key = `${ctx.font}|${Math.round(maxWidth)}|${text}`;
  const cached = wrapCache.get(key);
  if (cached) return cached;

  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let currentLine = words[0];
    for (let i = 1; i < words.length; i++) {
      const testLine = `${currentLine} ${words[i]}`;
      if (ctx.measureText(testLine).width <= maxWidth) {
        currentLine = testLine;
      } else {
        lines.push(currentLine);
        currentLine = words[i];
      }
    }
    lines.push(currentLine);
  }

  if (wrapCache.size >= 500) {
    wrapCache.clear();
  }
  wrapCache.set(key, lines);
  return lines;
}

function getOptionBadgeLabel(index: number, style: TemplateSettings['optionLabelStyle']): string {
  if (style === 'arabic') return ['أ', 'ب', 'ج', 'د'][index] ?? '';
  if (style === 'numbers') return String(index + 1);
  if (style === 'english') return ['A', 'B', 'C', 'D'][index] ?? '';
  return '';
}

const imageCache = new Map<string, HTMLImageElement>();

function loadImageCached(src: string): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function getCachedImage(src?: string): HTMLImageElement | null {
  if (!src) return null;
  const cached = imageCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }
  void loadImageCached(src);
  return null;
}

function getTemplateBgSrc(template: TemplateSettings): string {
  if (template.backgroundType === 'custom' && template.customBgDataUrl) {
    return template.customBgDataUrl;
  }
  if (template.backgroundType === 'preset') {
    const preset = PRESET_BACKDROPS.find((p) => p.id === template.presetId) ?? PRESET_BACKDROPS[0];
    if (template.aspectRatio === '16:9' && preset.wideSrc) {
      return preset.wideSrc;
    }
    return preset.src ?? '';
  }
  return '';
}

export async function preloadTemplateBackground(
  template: TemplateSettings,
  slides?: QuestionSlide[]
): Promise<HTMLImageElement | null> {
  const tasks: Promise<HTMLImageElement | null>[] = [];
  const bgSrc = getTemplateBgSrc(template);
  const bgPromise = bgSrc ? loadImageCached(bgSrc) : Promise.resolve(null);
  tasks.push(bgPromise);

  if (template.brandLogoDataUrl) {
    tasks.push(loadImageCached(template.brandLogoDataUrl));
  }

  if (slides && slides.length > 0) {
    for (const s of slides) {
      if (s.imageDataUrl) {
        tasks.push(loadImageCached(s.imageDataUrl));
      }
    }
  }

  await Promise.all(tasks);
  return bgPromise;
}

function getLoadedBackgroundImage(template: TemplateSettings): HTMLImageElement | null {
  return getCachedImage(getTemplateBgSrc(template));
}

// Fast resolved loader (countdown renders deterministically via vector typography for 1:1 preview/export)
export function preloadTimerVideo(): Promise<HTMLVideoElement | null> {
  return Promise.resolve(null);
}

let bgCacheCanvas: HTMLCanvasElement | null = null;
let bgCacheKey = '';

function drawCachedBackdrop(
  ctx: CanvasRenderingContext2D,
  template: TemplateSettings,
  W: number,
  H: number
): void {
  const bgImg = template.backgroundType !== 'color' ? getLoadedBackgroundImage(template) : null;
  const imgSrc = bgImg ? getTemplateBgSrc(template) : '';
  const nextKey = [
    W,
    H,
    template.backgroundType,
    template.presetId,
    template.solidBgColor,
    template.bgDimOpacity.toFixed(3),
    imgSrc,
    bgImg ? '1' : '0',
  ].join('|');

  if (typeof document !== 'undefined') {
    if (!bgCacheCanvas) {
      bgCacheCanvas = document.createElement('canvas');
    }
    if (bgCacheCanvas.width !== W || bgCacheCanvas.height !== H) {
      bgCacheCanvas.width = W;
      bgCacheCanvas.height = H;
      bgCacheKey = '';
    }

    if (bgCacheKey !== nextKey) {
      const bctx = bgCacheCanvas.getContext('2d', { alpha: false });
      if (bctx) {
        bctx.imageSmoothingEnabled = true;
        bctx.imageSmoothingQuality = 'high';
        bctx.fillStyle = template.solidBgColor || '#0c0c0c';
        bctx.fillRect(0, 0, W, H);

        if (template.backgroundType === 'preset') {
          const preset = PRESET_BACKDROPS.find((p) => p.id === template.presetId);
          if (preset?.gradientInner && preset?.gradientOuter) {
            const cx = W * 0.5;
            const cy = H * 0.35;
            const radius = Math.max(W, H) * (preset.gradientStop ?? 0.7);
            const grad = bctx.createRadialGradient(cx, cy, 40, cx, cy, radius);
            grad.addColorStop(0, preset.gradientInner);
            grad.addColorStop(1, preset.gradientOuter);
            bctx.fillStyle = grad;
            bctx.fillRect(0, 0, W, H);
          }
        }

        if (bgImg) {
          const imgAspect = bgImg.naturalWidth / bgImg.naturalHeight;
          const canvasAspect = W / H;
          let drawW = W;
          let drawH = H;
          let offsetX = 0;
          let offsetY = 0;

          if (imgAspect > canvasAspect) {
            drawH = H;
            drawW = drawH * imgAspect;
            offsetX = (W - drawW) / 2;
          } else {
            drawW = W;
            drawH = drawW / imgAspect;
            offsetY = (H - drawH) / 2;
          }
          bctx.drawImage(bgImg, offsetX, offsetY, drawW, drawH);
        }

        if (template.bgDimOpacity > 0) {
          bctx.fillStyle = `rgba(0, 0, 0, ${clamp01(template.bgDimOpacity)})`;
          bctx.fillRect(0, 0, W, H);
        }

        bgCacheKey = nextKey;
      }
    }

    ctx.drawImage(bgCacheCanvas, 0, 0);
    return;
  }

  ctx.fillStyle = template.solidBgColor || '#0c0c0c';
  ctx.fillRect(0, 0, W, H);
}

function drawBrandWatermark(
  ctx: CanvasRenderingContext2D,
  template: TemplateSettings,
  globalTime: number,
  W: number,
  H: number,
  fontStack: string
): void {
  const logoSrc = template.brandLogoDataUrl;
  const handle = (template.brandHandleText || '').trim();
  if (!logoSrc && !handle) return;

  const logoImg = logoSrc ? getCachedImage(logoSrc) : null;
  if (logoSrc && !logoImg && !handle) return;

  const isWide = template.aspectRatio === '16:9';
  const baseSize = Math.max(48, Math.min(240, template.brandLogoSize || 108));
  const size = isWide ? Math.round(baseSize * 0.92) : baseSize;
  const opacity = clamp01(template.brandOpacity ?? 0.92);
  const anim = template.brandLogoAnim || 'pulse';
  const pos = template.brandLogoPosition || 'topRight';

  const padX = isWide ? 48 : 36;
  const padY = isWide ? 38 : 66;
  const handleHeight = handle ? 32 : 0;

  let anchorX = W - padX - size / 2;
  let anchorY = padY + size / 2;

  if (pos === 'topLeft') {
    anchorX = padX + size / 2;
    anchorY = padY + size / 2;
  } else if (pos === 'bottomRight') {
    anchorX = W - padX - size / 2;
    anchorY = H - padY - handleHeight - size / 2 - (isWide ? 0 : 120);
  } else if (pos === 'bottomLeft') {
    anchorX = padX + size / 2;
    anchorY = H - padY - handleHeight - size / 2 - (isWide ? 0 : 120);
  }

  let scale = 1;
  let offsetY = 0;
  let rotation = 0;
  let glowAlpha = 0;

  if (anim === 'pulse') {
    scale = 1 + 0.065 * Math.sin(globalTime * 3.5);
  } else if (anim === 'float') {
    offsetY = Math.sin(globalTime * 2.5) * 9;
  } else if (anim === 'glow') {
    glowAlpha = 0.25 + 0.28 * (0.5 + 0.5 * Math.sin(globalTime * 3.2));
    scale = 1 + 0.03 * Math.sin(globalTime * 3.2);
  } else if (anim === 'spin') {
    rotation = (globalTime * 0.9) % (Math.PI * 2);
  }

  ctx.save();
  ctx.globalAlpha = opacity;

  if (logoImg) {
    ctx.save();
    ctx.translate(anchorX, anchorY + offsetY);

    if (glowAlpha > 0) {
      const rg = ctx.createRadialGradient(0, 0, size * 0.2, 0, 0, size * 0.78);
      rg.addColorStop(0, `rgba(237, 214, 162, ${glowAlpha.toFixed(3)})`);
      rg.addColorStop(1, 'rgba(237, 214, 162, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.78, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.scale(scale, scale);
    if (rotation !== 0) {
      ctx.rotate(rotation);
    }

    // Clip into smooth rounded medallion so square or transparent logos both look clean
    const imgRatio = logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight);
    let drawW = size;
    let drawH = size;
    if (imgRatio > 1) {
      drawH = size / imgRatio;
    } else if (imgRatio < 1) {
      drawW = size * imgRatio;
    }

    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.drawImage(logoImg, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  if (handle) {
    const labelY = logoImg ? anchorY + size / 2 + 20 + offsetY : anchorY + offsetY;
    ctx.font = `700 ${isWide ? 24 : 26}px ${fontStack}`;
    ctx.direction = 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textW = ctx.measureText(handle).width;
    const pillW = Math.min(260, textW + 24);
    const pillH = 34;

    drawRoundedRect(ctx, anchorX - pillW / 2, labelY - pillH / 2, pillW, pillH, 10);
    ctx.fillStyle = 'rgba(11, 15, 23, 0.68)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(237, 214, 162, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#EDD6A2';
    ctx.fillText(handle, anchorX, labelY + 1);
  }

  ctx.restore();
}

export function renderQuizFrame(
  ctx: CanvasRenderingContext2D,
  globalTime: number,
  slides: QuestionSlide[],
  template: TemplateSettings,
  timing: TimingSettings,
  audio: AudioSettings,
  isPreview = false
): void {
  const { width: W, height: H } = getCanvasDimensions(template);
  const isWide = template.aspectRatio === '16:9';
  const fontStack = `'${template.fontFamily}', 'Cairo', 'Tajawal', sans-serif`;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // 1. Cached Background Layer
  drawCachedBackdrop(ctx, template, W, H);

  const contentEnd = getSlidesContentDuration(slides, timing, audio);

  // Check if currently in End Card window
  if (template.showEndCard && slides.length > 0 && globalTime >= contentEnd) {
    const endElapsed = globalTime - contentEnd;
    const alpha = clamp01(endElapsed / 0.35);

    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.84 * alpha})`;
    ctx.fillRect(0, 0, W, H);

    const endText = (template.endCardText || 'شكراً لمشاهدتكم').trim();
    ctx.globalAlpha = alpha;
    ctx.font = `800 ${isWide ? 92 : 84}px ${fontStack}`;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lines = wrapArabicText(ctx, endText, W - 200);
    const lineH = 112;
    const startY = H / 2 - ((lines.length - 1) * lineH) / 2;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    lines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, startY + idx * lineH + 5);
    });
    ctx.fillStyle = '#FFFFFF';
    lines.forEach((line, idx) => {
      ctx.fillText(line, W / 2, startY + idx * lineH);
    });
    ctx.restore();

    drawBrandWatermark(ctx, template, globalTime, W, H, fontStack);
    ctx.restore();
    return;
  }

  // 2. Active Slide & Audio-Synced Schedule
  const info = getSlideTimeInfo(globalTime, slides, timing, audio);
  if (!info) {
    ctx.restore();
    return;
  }

  const { slide, localTime, schedule, slideIndex } = info;
  const {
    tQuestionStart,
    tOptionStarts,
    tThinkingStart,
    tTimerExitStart,
    tSuspenseStart,
    tRevealStart,
  } = schedule;

  const animDuration = 0.35;
  const isChannelLayout = template.optionsLayout === 'channel2x2';
  const enhanced = template.enhanceAppearance ?? true;
  const slideImg = getCachedImage(slide.imageDataUrl);
  const darkBg = isBackgroundDark(template);

  // 2.5 Optional Slide Progress Counter & Bar
  if (template.showProgressCounter && slides.length > 1) {
    ctx.save();
    const progW = isWide ? 320 : 280;
    const progY = isWide ? 42 : 76;
    const ratio = clamp01((slideIndex + 1) / slides.length);

    drawRoundedRect(ctx, W / 2 - progW / 2, progY - 18, progW, 38, 12);
    ctx.fillStyle = darkBg ? 'rgba(11, 15, 23, 0.65)' : 'rgba(255, 255, 255, 0.85)';
    ctx.fill();
    ctx.strokeStyle = darkBg ? 'rgba(237, 214, 162, 0.35)' : 'rgba(18, 24, 38, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = `800 ${isWide ? 22 : 24}px ${fontStack}`;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = darkBg ? '#EDD6A2' : '#121826';
    ctx.fillText(`سؤال ${slideIndex + 1} من ${slides.length}`, W / 2, progY - 2);

    const trackW = progW - 32;
    const trackX = W / 2 - trackW / 2;
    const trackY = progY + 13;
    drawRoundedRect(ctx, trackX, trackY, trackW, 5, 2.5);
    ctx.fillStyle = darkBg ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)';
    ctx.fill();

    const fillW = Math.max(12, trackW * ratio);
    drawRoundedRect(ctx, trackX + (trackW - fillW), trackY, fillW, 5, 2.5);
    ctx.fillStyle = '#00B050';
    ctx.fill();
    ctx.restore();
  }

  // 3. Optional Top Badge
  const safeBadge = (slide.badgeText ?? '').trim();
  if (template.showBadge && safeBadge) {
    const badgeProgress = clamp01((localTime - tQuestionStart) / animDuration);
    if (badgeProgress > 0) {
      const tr = computeAnimTransform(badgeProgress, 'fade');
      ctx.save();
      ctx.globalAlpha = tr.opacity;
      const badgeCenterY = isWide
        ? Math.min(H * 0.14, (template.badgeY / 100) * H)
        : (template.badgeY / 100) * H;
      ctx.font = `700 ${isWide ? 34 : 32}px ${fontStack}`;
      ctx.direction = 'rtl';
      const textW = ctx.measureText(safeBadge).width;
      const padX = 46;
      const boxW = Math.min(W - 160, textW + padX * 2);
      const boxH = 66;
      const boxX = (W - boxW) / 2 + tr.offsetX;
      const boxY = badgeCenterY - boxH / 2 + tr.offsetY;

      drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 33);
      ctx.fillStyle = template.badgeBgColor;
      ctx.fill();

      ctx.fillStyle = template.badgeTextColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(safeBadge, W / 2 + tr.offsetX, badgeCenterY + 2 + tr.offsetY);
      ctx.restore();
    }
  }

  // 4. Question Box (#q) + Optional Question Illustration Image
  const qProgress = clamp01((localTime - tQuestionStart) / animDuration);
  if (qProgress > 0) {
    const tr = computeAnimTransform(qProgress, template.questionAnim);

    const qW = isWide
      ? slideImg
        ? Math.min(W * 0.62, 1180)
        : Math.min(W - 140, Math.max(1280, (template.questionWidth / 100) * W * 1.12))
      : (template.questionWidth / 100) * W;

    const qCenterY = isWide
      ? Math.max(210, Math.min(H * 0.34, (template.questionY / 100) * H * 0.72))
      : (template.questionY / 100) * H;

    const padX = isWide ? 48 : 28;
    const padY = isWide ? 28 : 24;
    const qRawText = slide.question || 'اكتب نص السؤال هنا';
    const qHasMath = hasMathSyntax(qRawText);

    let qFontSize = isWide
      ? Math.min(72, Math.max(46, Math.round(template.questionFontSize * 0.92)))
      : template.questionFontSize;

    if (isChannelLayout && !isWide) {
      if (qRawText.length > 60) qFontSize = Math.round(qFontSize * 0.62);
      else if (qRawText.length > 35) qFontSize = Math.round(qFontSize * 0.78);
    } else if (isWide && qRawText.length > 75) {
      qFontSize = Math.round(qFontSize * 0.8);
    }

    ctx.font = `800 ${qFontSize}px ${fontStack}`;
    ctx.direction = 'rtl';
    let lines = qHasMath ? [qRawText] : wrapArabicText(ctx, qRawText, qW - padX * 2);
    if (!qHasMath && lines.length > 3 && qFontSize > 34) {
      qFontSize = Math.max(34, Math.round(qFontSize * 0.82));
      ctx.font = `800 ${qFontSize}px ${fontStack}`;
      lines = wrapArabicText(ctx, qRawText, qW - padX * 2);
    }

    const lineHeight = qFontSize * (qHasMath ? 1.55 : 1.3);
    const estLines = qHasMath
      ? Math.min(3, Math.max(1, Math.ceil(qRawText.length / (isWide ? 42 : 24))))
      : lines.length;
    const textBlockH = Math.max(lineHeight, estLines * lineHeight);
    const minChannelQH =
      (template.questionHeightPct ?? 0) > 0
        ? isWide
          ? Math.round(H * 0.22)
          : (template.questionHeightPct / 100) * H
        : 0;
    const qH = Math.max(minChannelQH, textBlockH + padY * 2);

    const centerX =
      (isWide && slideImg ? W * 0.61 : isChannelLayout && !isWide ? W * 0.502 : W / 2) + tr.offsetX;
    const centerY = qCenterY + tr.offsetY;

    // Optional Question Illustration Image
    if (slideImg) {
      ctx.save();
      ctx.globalAlpha = tr.opacity;
      const imgAspect = slideImg.naturalWidth / Math.max(1, slideImg.naturalHeight);
      let frameW = 360;
      let frameH = 250;
      let frameX = W / 2;
      let frameY = qCenterY - qH / 2 - 155;

      if (isWide) {
        const maxBoxW = 380;
        const maxBoxH = Math.max(210, qH + 16);
        frameW = imgAspect >= 1 ? maxBoxW : Math.min(maxBoxW, maxBoxH * imgAspect);
        frameH = frameW / imgAspect;
        if (frameH > maxBoxH) {
          frameH = maxBoxH;
          frameW = frameH * imgAspect;
        }
        frameX = W * 0.165 + tr.offsetX;
        frameY = qCenterY + tr.offsetY;
      } else {
        const maxTopY = template.showBadge && safeBadge ? 255 : 145;
        const availH = Math.max(150, qCenterY - qH / 2 - maxTopY - 24);
        const maxBoxW = 540;
        const maxBoxH = Math.min(285, availH);
        frameH = maxBoxH;
        frameW = Math.min(maxBoxW, frameH * imgAspect);
        if (frameW / imgAspect > maxBoxH) {
          frameH = frameW / imgAspect;
        }
        frameX = W / 2 + tr.offsetX;
        frameY = qCenterY - qH / 2 - 22 - frameH / 2 + tr.offsetY;
      }

      ctx.translate(frameX, frameY);
      ctx.scale(tr.scale, tr.scale);
      drawRoundedRect(ctx, -frameW / 2 - 8, -frameH / 2 - 8, frameW + 16, frameH + 16, 28);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fill();

      ctx.save();
      drawRoundedRect(ctx, -frameW / 2, -frameH / 2, frameW, frameH, 24);
      ctx.clip();
      ctx.drawImage(slideImg, -frameW / 2, -frameH / 2, frameW, frameH);
      ctx.restore();

      drawRoundedRect(ctx, -frameW / 2, -frameH / 2, frameW, frameH, 24);
      ctx.strokeStyle = template.questionBorderColor || '#FFFFFF';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = tr.opacity;
    ctx.translate(centerX, centerY);
    ctx.scale(tr.scale, tr.scale);

    if (template.questionBoxOpacity > 0.01) {
      if (enhanced) {
        drawRoundedRect(
          ctx,
          -qW / 2 - 5,
          -qH / 2 - 5,
          qW + 10,
          qH + 10,
          template.questionBorderRadius + 4
        );
        ctx.fillStyle = hexToRgba(template.questionBorderColor || '#FFFFFF', 0.14);
        ctx.fill();
      }

      drawRoundedRect(ctx, -qW / 2, -qH / 2 + 10, qW, qH, template.questionBorderRadius);
      ctx.fillStyle = enhanced ? 'rgba(0, 0, 0, 0.34)' : 'rgba(0, 0, 0, 0.22)';
      ctx.fill();

      drawRoundedRect(ctx, -qW / 2, -qH / 2, qW, qH, template.questionBorderRadius);
      ctx.fillStyle = hexToRgba(template.questionBoxColor, template.questionBoxOpacity);
      ctx.fill();

      if (template.boxGloss || enhanced) {
        applyBoxGloss(ctx, -qW / 2, -qH / 2, qW, qH, template.questionBorderRadius, enhanced);
      }
    }

    if (template.questionBorderWidth > 0 && template.questionBoxOpacity > 0.01) {
      drawRoundedRect(ctx, -qW / 2, -qH / 2, qW, qH, template.questionBorderRadius);
      ctx.strokeStyle = template.questionBorderColor;
      ctx.lineWidth = template.questionBorderWidth;
      ctx.stroke();
    }

    if (qHasMath) {
      if (enhanced) {
        drawSmartQuizText(
          ctx,
          qRawText,
          0,
          2,
          qW - padX * 2,
          qFontSize,
          fontStack,
          800,
          'rgba(0,0,0,0.22)',
          3
        );
      }
      drawSmartQuizText(
        ctx,
        qRawText,
        0,
        0,
        qW - padX * 2,
        qFontSize,
        fontStack,
        800,
        template.questionTextColor,
        3
      );
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const startLineY = -((lines.length - 1) * lineHeight) / 2;
      if (enhanced) {
        ctx.fillStyle = isColorDark(template.questionBoxColor)
          ? 'rgba(0,0,0,0.35)'
          : 'rgba(255,255,255,0.3)';
        lines.forEach((line, idx) => {
          ctx.fillText(line, 0, startLineY + idx * lineHeight + 2);
        });
      }
      ctx.fillStyle = template.questionTextColor;
      lines.forEach((line, idx) => {
        ctx.fillText(line, 0, startLineY + idx * lineHeight);
      });
    }

    ctx.restore();
  }

  // 5. Four Options
  const isSuspending =
    localTime >= tSuspenseStart && localTime < tRevealStart && timing.suspenseDuration > 0;
  const isRevealed = localTime >= tRevealStart;
  const revealElapsed = Math.max(0, localTime - tRevealStart);
  const revealAnim = isRevealed ? easeOutBack(clamp01(revealElapsed / 0.35)) : 0;
  const revealFade = isRevealed ? clamp01(revealElapsed / 0.25) : 0;

  const totalOptionsW = isWide
    ? Math.min(W - 140, Math.max(1340, (template.optionsWidth / 100) * W))
    : (template.optionsWidth / 100) * W;

  const optionsStartPx = isWide
    ? Math.max(H * 0.45, Math.min(H * 0.56, (template.optionsStartY / 100) * H * 0.92))
    : (template.optionsStartY / 100) * H;

  const rowsCount = template.optionsLayout === 'vertical' ? 4 : 2;
  const effectiveOptH = isWide
    ? template.optionsLayout === 'vertical'
      ? 104
      : Math.min(156, Math.max(122, template.optionHeight))
    : template.optionHeight;

  const effectiveRowGap = isChannelLayout
    ? isWide
      ? 48
      : Math.max(12, Math.round(0.112 * H - effectiveOptH))
    : isWide
      ? Math.min(28, template.optionsGap)
      : template.optionsGap;

  const optionsBottomPx =
    optionsStartPx + rowsCount * effectiveOptH + (rowsCount - 1) * effectiveRowGap;

  const wrongColor = template.wrongColor || '#DC2626';
  const isRedWrongMode = template.revealStyle === 'redWrongGreenCorrect';

  for (let i = 0; i < 4; i++) {
    const optProgress = clamp01((localTime - tOptionStarts[i]) / animDuration);
    if (optProgress <= 0) continue;

    const tr = computeAnimTransform(optProgress, template.optionAnim);
    const isCorrect = i === slide.correctIndex;
    const isWrongRed = isRevealed && !isCorrect && isRedWrongMode;

    let boxW = totalOptionsW;
    const boxH = effectiveOptH;
    let centerX = W / 2;
    let centerY = optionsStartPx + i * (boxH + effectiveRowGap) + boxH / 2;

    if (template.optionsLayout === 'channel2x2') {
      if (isWide) {
        // Widescreen 16:9 2x2 around central timer gap
        boxW = 0.405 * W;
        const row = Math.floor(i / 2);
        const isRightCol = i % 2 === 0; // 0,2 on right in RTL; 1,3 on left
        centerX = isRightCol ? W * 0.755 : W * 0.245;
        centerY = optionsStartPx + row * (boxH + effectiveRowGap) + boxH / 2;
      } else {
        // Vertical 9:16 channel s0..s3 coordinates
        boxW = 0.488 * W;
        const colLeft = i % 2 === 0 ? 0.515 * W : 0;
        const rowOffsetPct = i >= 2 ? 0.112 : 0;
        const rowTop = (template.optionsStartY / 100 + rowOffsetPct) * H;
        centerX = colLeft + boxW / 2;
        centerY = rowTop + boxH / 2;
      }
    } else if (template.optionsLayout === 'grid2x2') {
      const colGap = isWide ? Math.max(36, template.optionsGap) : template.optionsGap;
      boxW = (totalOptionsW - colGap) / 2;
      const row = Math.floor(i / 2);
      const col = i % 2;
      const rightStart = (W + totalOptionsW) / 2;
      centerX = rightStart - col * (boxW + colGap) - boxW / 2;
      centerY = optionsStartPx + row * (boxH + effectiveRowGap) + boxH / 2;
    }

    let finalScale = tr.scale;
    let finalAlpha = tr.opacity;

    if (isSuspending) {
      const pulsePhase = Math.sin(((localTime - tSuspenseStart) / 0.5) * Math.PI);
      finalScale *= 1 + 0.03 * Math.abs(pulsePhase);
    }

    if (isRevealed) {
      if (isCorrect) {
        finalScale *= 1 + (isChannelLayout ? 0.07 : 0.05) * clamp01(revealAnim);
      } else if (template.revealStyle === 'dimOthers') {
        finalAlpha *= 1 - 0.7 * clamp01(revealElapsed / 0.28);
      } else if (isRedWrongMode) {
        finalScale *= 1 - 0.025 * revealFade;
      }
    }

    ctx.save();
    ctx.globalAlpha = finalAlpha;
    ctx.translate(centerX + tr.offsetX, centerY + tr.offsetY);
    ctx.scale(finalScale, finalScale);

    const boxFill =
      isRevealed && isCorrect
        ? hexToRgba(template.correctColor, 1)
        : isWrongRed
          ? hexToRgba(wrongColor, 0.94)
          : hexToRgba(template.optionBoxColor, template.optionBoxOpacity);

    const borderCol =
      isRevealed && isCorrect
        ? '#FFFFFF'
        : isWrongRed
          ? '#FECACA'
          : template.optionBorderColor;

    if (template.optionBoxOpacity > 0.01 || (isRevealed && (isCorrect || isWrongRed))) {
      if (isRevealed && isCorrect) {
        drawRoundedRect(
          ctx,
          -boxW / 2 - 6,
          -boxH / 2 - 6,
          boxW + 12,
          boxH + 12,
          template.optionBorderRadius + 4
        );
        ctx.fillStyle = hexToRgba(template.correctColor, 0.34);
        ctx.fill();
      } else if (isWrongRed) {
        drawRoundedRect(
          ctx,
          -boxW / 2 - 3,
          -boxH / 2 - 3,
          boxW + 6,
          boxH + 6,
          template.optionBorderRadius + 2
        );
        ctx.fillStyle = hexToRgba(wrongColor, 0.22);
        ctx.fill();
      } else {
        drawRoundedRect(ctx, -boxW / 2, -boxH / 2 + 8, boxW, boxH, template.optionBorderRadius);
        ctx.fillStyle = enhanced ? 'rgba(0, 0, 0, 0.32)' : 'rgba(0, 0, 0, 0.2)';
        ctx.fill();
      }

      drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, template.optionBorderRadius);
      ctx.fillStyle = boxFill;
      ctx.fill();

      if ((template.boxGloss || enhanced) && !(isRevealed && (isCorrect || isWrongRed))) {
        applyBoxGloss(ctx, -boxW / 2, -boxH / 2, boxW, boxH, template.optionBorderRadius, enhanced);
      }
    }

    if (
      template.optionBorderWidth > 0 &&
      (template.optionBoxOpacity > 0.01 || (isRevealed && (isCorrect || isWrongRed)))
    ) {
      drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, template.optionBorderRadius);
      ctx.strokeStyle = borderCol;
      ctx.lineWidth =
        isRevealed && (isCorrect || isWrongRed)
          ? Math.max(4, template.optionBorderWidth)
          : template.optionBorderWidth;
      ctx.stroke();
    }

    const labelStr = getOptionBadgeLabel(i, template.optionLabelStyle);
    const hasBadge = labelStr.length > 0;
    const badgeSize = Math.min(boxH - 26, 66);
    const badgeMarginRight = 24;

    if (hasBadge) {
      const badgeCenterX = boxW / 2 - badgeMarginRight - badgeSize / 2;
      drawRoundedRect(
        ctx,
        badgeCenterX - badgeSize / 2,
        -badgeSize / 2,
        badgeSize,
        badgeSize,
        Math.min(18, template.optionBorderRadius)
      );
      ctx.fillStyle =
        isRevealed && isCorrect
          ? '#FFFFFF'
          : isWrongRed
            ? '#FEE2E2'
            : template.optionLabelBgColor;
      ctx.fill();

      ctx.font = `800 ${Math.round(badgeSize * 0.52)}px ${fontStack}`;
      ctx.fillStyle =
        isRevealed && isCorrect
          ? template.correctColor
          : isWrongRed
            ? wrongColor
            : template.optionLabelTextColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelStr, badgeCenterX, 2);
    }

    const showCheck =
      isRevealed &&
      isCorrect &&
      (template.revealStyle === 'scaleCheck' || isRedWrongMode) &&
      (!isChannelLayout || isWide || isRedWrongMode);

    const showCross = isWrongRed && !isChannelLayout;

    const iconReserve = showCheck || showCross ? 76 : 22;
    const rightReserve = hasBadge ? badgeMarginRight + badgeSize + 24 : 22;

    if (showCheck) {
      const checkX = -boxW / 2 + 44;
      ctx.beginPath();
      ctx.arc(checkX, 0, 22, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(checkX - 9, 1);
      ctx.lineTo(checkX - 2, 8);
      ctx.lineTo(checkX + 10, -7);
      ctx.strokeStyle = template.correctColor;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else if (showCross) {
      const crossX = -boxW / 2 + 44;
      ctx.beginPath();
      ctx.arc(crossX, 0, 20, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(crossX - 7, -7);
      ctx.lineTo(crossX + 7, 7);
      ctx.moveTo(crossX + 7, -7);
      ctx.lineTo(crossX - 7, 7);
      ctx.strokeStyle = wrongColor;
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    const optText = slide.options[i] || `الخيار ${i + 1}`;
    const optHasMath = hasMathSyntax(optText);

    let optFontSize = isWide
      ? Math.min(54, Math.max(38, template.optionFontSize))
      : template.optionFontSize;

    if (isChannelLayout) {
      if (optText.length > 60) optFontSize = Math.round(optFontSize * 0.62);
      else if (optText.length > 35) optFontSize = Math.round(optFontSize * 0.78);
    }

    const textMaxW = boxW - (hasBadge ? rightReserve + iconReserve : showCheck ? 110 : 40);
    const optColor =
      isRevealed && (isCorrect || isWrongRed) ? '#FFFFFF' : template.optionTextColor;

    if (optHasMath) {
      drawSmartQuizText(
        ctx,
        optText,
        hasBadge ? -(rightReserve - iconReserve) * 0.35 : 0,
        0,
        Math.max(120, textMaxW),
        optFontSize,
        fontStack,
        700,
        optColor,
        2
      );
    } else {
      ctx.font = `700 ${optFontSize}px ${fontStack}`;
      ctx.direction = 'rtl';
      ctx.fillStyle = optColor;

      const optLines = wrapArabicText(ctx, optText, Math.max(120, textMaxW));
      const optLineH = optFontSize * 1.25;
      const optStartY = -((optLines.length - 1) * optLineH) / 2;

      if ((isChannelLayout || template.optionsLayout === 'grid2x2') && !hasBadge) {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (enhanced) {
          ctx.fillStyle =
            isRevealed || isColorDark(template.optionBoxColor)
              ? 'rgba(0,0,0,0.32)'
              : 'rgba(255,255,255,0.28)';
          optLines.slice(0, 2).forEach((line, lIdx) => {
            ctx.fillText(line, 0, optStartY + lIdx * optLineH + 2);
          });
        }
        ctx.fillStyle = optColor;
        optLines.slice(0, 2).forEach((line, lIdx) => {
          ctx.fillText(line, 0, optStartY + lIdx * optLineH);
        });
      } else {
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const textRightX = boxW / 2 - rightReserve;
        optLines.slice(0, 2).forEach((line, lIdx) => {
          ctx.fillText(line, textRightX, optStartY + lIdx * optLineH);
        });
      }
    }

    ctx.restore();
  }

  // 6. Countdown Timer (#tm)
  const showTimer =
    template.timerStyle !== 'none' &&
    timing.thinkingDuration > 0 &&
    localTime >= (template.timerStyle === 'channelBox' ? tQuestionStart + 0.55 : tThinkingStart) &&
    localTime < tRevealStart;

  if (showTimer) {
    const isThinking = localTime >= tThinkingStart && localTime < tTimerExitStart;
    const enterStart = template.timerStyle === 'channelBox' ? tQuestionStart + 0.55 : tThinkingStart;
    const enterProg = clamp01((localTime - enterStart) / 0.22);

    const elapsedThink = isThinking
      ? Math.min(timing.thinkingDuration, localTime - tThinkingStart)
      : localTime < tThinkingStart
        ? 0
        : timing.thinkingDuration;
    const remaining = Math.max(0, timing.thinkingDuration - elapsedThink);
    const ratio = clamp01(remaining / Math.max(0.01, timing.thinkingDuration));

    let timerCenterX = W / 2;
    let timerCenterY = (template.timerY / 100) * H;

    if (template.timerStyle === 'channelBox') {
      if (isWide) {
        timerCenterX = W * 0.5;
        timerCenterY = optionsStartPx + effectiveOptH + effectiveRowGap * 0.5;
      } else {
        timerCenterX = 0.5025 * W;
        timerCenterY = (template.timerY / 100) * H + 0.0015 * H;
      }
    } else if (isWide) {
      timerCenterY = Math.min(H - 84, Math.max(H * 0.88, optionsBottomPx + 56));
    } else if (!isChannelLayout && template.timerY >= 55) {
      timerCenterY = Math.min(H - 360, Math.max(timerCenterY, optionsBottomPx + 96));
    }

    ctx.save();
    ctx.globalAlpha = easeOutCubic(enterProg);
    ctx.translate(timerCenterX, timerCenterY);
    const s = 0.85 + 0.15 * easeOutCubic(enterProg);
    ctx.scale(s, s);

    const matchBg = template.timerMatchBackground !== false;
    const darkBg = isBackgroundDark(template);
    const rawTimerColor = (template.timerColor || '#000000').trim();
    const effectiveTimerColor =
      matchBg && darkBg && (rawTimerColor.toLowerCase() === '#000000' || rawTimerColor === '#000')
        ? '#FFFFFF'
        : !matchBg &&
            isColorDark(template.timerBgColor || '#F2E3BA') &&
            (rawTimerColor.toLowerCase() === '#000000' || rawTimerColor === '#000')
          ? '#FFFFFF'
          : rawTimerColor;

    if (template.timerStyle === 'channelBox') {
      const boxW = isWide ? 140 : 0.153 * W;
      const boxH = isWide ? 140 : 0.093 * H;

      if (!matchBg) {
        drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 24);
        ctx.fillStyle = template.timerBgColor || '#F2E3BA';
        ctx.fill();
      }

      if (isThinking) {
        const secDisplay = Math.max(1, Math.ceil(remaining));
        const secFrac = elapsedThink - Math.floor(elapsedThink);
        const popScale = 1 + 0.14 * (1 - easeOutCubic(Math.min(1, secFrac / 0.24)));

        ctx.save();
        ctx.scale(popScale, popScale);
        ctx.font = `900 ${isWide ? 92 : 108}px ${fontStack}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = darkBg ? 'rgba(0, 0, 0, 0.26)' : 'rgba(0, 0, 0, 0.12)';
        ctx.fillText(String(secDisplay), 0, 8);
        ctx.fillStyle = effectiveTimerColor;
        ctx.fillText(String(secDisplay), 0, 4);
        ctx.restore();
      }
    } else if (template.timerStyle === 'bar') {
      const barW = totalOptionsW * 0.72;
      const barH = 22;
      const barX = -barW / 2;
      const barY = -barH / 2 + 12;

      drawRoundedRect(ctx, barX, barY, barW, barH, 11);
      ctx.fillStyle = darkBg ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.12)';
      ctx.fill();

      const fillW = Math.max(20, barW * ratio);
      drawRoundedRect(ctx, barX + (barW - fillW), barY, fillW, barH, 11);
      ctx.fillStyle = effectiveTimerColor;
      ctx.fill();

      const secDisplay = Math.ceil(remaining);
      ctx.font = `800 36px ${fontStack}`;
      ctx.fillStyle = effectiveTimerColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(secDisplay), 0, barY - 8);
    } else if (template.timerStyle === 'circle') {
      const radius = isWide ? 46 : 54;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      if (!matchBg) {
        ctx.fillStyle = hexToRgba(template.timerBgColor || '#0f172a', 0.88);
        ctx.fill();
      }
      ctx.strokeStyle = darkBg ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.16)';
      ctx.lineWidth = 9;
      ctx.stroke();

      if (ratio > 0.01) {
        ctx.beginPath();
        ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
        ctx.strokeStyle = effectiveTimerColor;
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      const secDisplay = Math.ceil(remaining);
      ctx.font = `800 ${isWide ? 38 : 44}px 'JetBrains Mono', monospace`;
      ctx.fillStyle = effectiveTimerColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(secDisplay), 0, 2);
    } else if (template.timerStyle === 'digits') {
      const secDisplay = Math.ceil(remaining);
      ctx.font = `900 ${isWide ? 74 : 84}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = darkBg ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.14)';
      ctx.fillText(String(secDisplay), 0, 4);
      ctx.fillStyle = effectiveTimerColor;
      ctx.fillText(String(secDisplay), 0, 0);
    }

    ctx.restore();
  }

  // 7. Optional Explanation Note on Reveal
  if (
    isRevealed &&
    template.showExplanationOnReveal &&
    slide.explanationText &&
    slide.explanationText.trim()
  ) {
    const expAlpha = clamp01(revealElapsed / 0.35);
    const expY = isWide
      ? Math.min(H - 80, optionsBottomPx + 74)
      : Math.min(H - 290, optionsBottomPx + 95);
    const expText = slide.explanationText.trim();
    const expHasMath = hasMathSyntax(expText);

    ctx.save();
    ctx.globalAlpha = expAlpha;
    ctx.font = `700 30px ${fontStack}`;
    ctx.direction = 'rtl';
    const boxW = Math.min(W - 140, Math.max(760, (template.optionsWidth / 100) * W));
    const maxW = boxW - 48;
    const lines = expHasMath ? [expText] : wrapArabicText(ctx, expText, maxW).slice(0, 2);
    const lineH = 42;
    const boxH = lines.length * lineH + 34;
    const boxX = (W - boxW) / 2;
    const boxY = expY - boxH / 2;

    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, 24);
    ctx.fillStyle = hexToRgba(template.correctColor, 0.94);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();

    if (expHasMath) {
      drawSmartQuizText(ctx, expText, W / 2, expY, maxW, 30, fontStack, 700, '#FFFFFF', 2);
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const startLineY = expY - ((lines.length - 1) * lineH) / 2;
      lines.forEach((line, idx) => {
        ctx.fillText(line, W / 2, startLineY + idx * lineH);
      });
    }
    ctx.restore();
  }

  // 7.5 Channel Brand Logo / Animated Watermark & Handle
  drawBrandWatermark(ctx, template, globalTime, W, H, fontStack);

  // 8. YouTube Safe Zone Guide (Preview ONLY, never exported)
  if (isPreview && template.showSafeGuides) {
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);

    if (isWide) {
      ctx.fillRect(0, H - 110, W, 110);
      ctx.strokeRect(64, 48, W - 128, H - 158);
      ctx.setLineDash([]);
      ctx.font = `700 26px 'Cairo', sans-serif`;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('منطقة الأمان لفيديو يوتيوب 16:9 (لا تظهر في التصدير)', W / 2, H - 45);
    } else {
      ctx.fillRect(0, 0, W, 160);
      ctx.fillRect(0, H - 300, W, 300);
      ctx.fillRect(W - 150, H - 860, 150, 560);
      ctx.strokeRect(48, 160, W - 198, H - 460);
      ctx.setLineDash([]);
      ctx.font = `700 24px 'Cairo', sans-serif`;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.textAlign = 'center';
      ctx.fillText('منطقة الأمان ليوتيوب شورتس (لا تظهر في التصدير)', W / 2, 85);
    }
    ctx.restore();
  }

  ctx.restore();
}

export async function exportThumbnailJpg(
  slides: QuestionSlide[],
  template: TemplateSettings,
  timing: TimingSettings,
  audio: AudioSettings,
  globalTime: number
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;
  const { width, height } = getCanvasDimensions(template);

  try {
    await document.fonts.ready;
  } catch {
    // ignore
  }
  await preloadTemplateBackground(template, slides);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;

  renderQuizFrame(ctx, globalTime, slides, template, timing, audio, false);

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.94);
  });
}
