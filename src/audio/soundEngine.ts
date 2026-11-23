import {
  AudioSettings,
  AudioSlotConfig,
  AudioSlotId,
  BuiltInSfxId,
  QuestionSlide,
  SlideAudioClip,
  TemplateSettings,
} from '../types/quiz';

export const BUILTIN_SFX_OPTIONS: { id: BuiltInSfxId; label: string }[] = [
  { id: 'none', label: 'بدون صوت' },
  { id: 'softPop', label: 'فقاعة القناة (Pop)' },
  { id: 'whoosh', label: 'سحب هوائي (Whoosh)' },
  { id: 'click', label: 'نقرة احترافية (Click)' },
  { id: 'channelTick', label: 'تكتكة العداد الكلاسيكي (القناة)' },
  { id: 'tick', label: 'تكتكة ساعة خفيفة (Tick)' },
  { id: 'suspenseRiser', label: 'تشويق قبل الجواب (نبض + تصاعد)' },
  { id: 'chime', label: 'رنة تنبيه لطيفة (Chime)' },
  { id: 'successFanfare', label: 'نغمة الإجابة الصحيحة (Success)' },
  { id: 'calmPulse', label: 'نبضة موسيقية هادئة' },
];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private ctxCaches = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
  private bgNodes = new WeakMap<AudioContext, { gain: GainNode; baseVolume: number }>();
  private decodedDurations = new Map<string, number>();
  private activeSfxSources = new Set<AudioBufferSourceNode>();
  private activeBgSource: AudioBufferSourceNode | null = null;
  private activeBgGain: GainNode | null = null;

  private getCacheForContext(ctx: AudioContext): Map<string, AudioBuffer> {
    let map = this.ctxCaches.get(ctx);
    if (!map) {
      map = new Map<string, AudioBuffer>();
      this.ctxCaches.set(ctx, map);
    }
    return map;
  }

  private trackSourceIfPreview(ctx: AudioContext, src: AudioBufferSourceNode): void {
    if (ctx === this.ctx) {
      this.activeSfxSources.add(src);
      src.onended = () => {
        this.activeSfxSources.delete(src);
      };
    }
  }

  public stopAllSfxAndVoice(): void {
    this.activeSfxSources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // already stopped
      }
    });
    this.activeSfxSources.clear();
  }

  public scheduleBgDuckIntervals(
    ctx: AudioContext,
    intervals: Array<{ start: number; end: number }>,
    audioStartTime: number,
    duckRatio = 0.22
  ): void {
    const bgEntry = this.bgNodes.get(ctx);
    if (!bgEntry || bgEntry.baseVolume <= 0.001 || intervals.length === 0) return;

    // Sort and merge overlapping/adjacent intervals within 0.18s so ramps never collide
    const sorted = [...intervals]
      .filter((iv) => iv.end > iv.start + 0.05)
      .sort((a, b) => a.start - b.start);
    if (sorted.length === 0) return;

    const merged: Array<{ start: number; end: number }> = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      const prev = merged[merged.length - 1];
      const curr = sorted[i];
      if (curr.start <= prev.end + 0.18) {
        prev.end = Math.max(prev.end, curr.end);
      } else {
        merged.push({ ...curr });
      }
    }

    const gainParam = bgEntry.gain.gain;
    const base = bgEntry.baseVolume;
    const target = Math.max(0.01, base * Math.max(0.05, Math.min(0.8, duckRatio)));

    try {
      gainParam.cancelScheduledValues(audioStartTime);
      gainParam.setValueAtTime(base, audioStartTime);
      for (const iv of merged) {
        const tStart = Math.max(ctx.currentTime, audioStartTime + iv.start);
        const tEnd = Math.max(tStart + 0.1, audioStartTime + iv.end);
        const fadeDownStart = Math.max(audioStartTime, tStart - 0.06);
        gainParam.setValueAtTime(base, fadeDownStart);
        gainParam.linearRampToValueAtTime(target, tStart + 0.04);
        gainParam.setValueAtTime(target, Math.max(tStart + 0.05, tEnd - 0.04));
        gainParam.linearRampToValueAtTime(base, tEnd + 0.22);
      }
    } catch {
      // ignore scheduling errors
    }
  }

  public duckBgMusic(
    ctxOverride: AudioContext | undefined,
    speechDurationSec: number,
    duckRatio = 0.22
  ): void {
    const ctx = ctxOverride ?? this.ctx;
    if (!ctx) return;
    const bgEntry = this.bgNodes.get(ctx);
    if (!bgEntry || bgEntry.baseVolume <= 0.001) return;

    const now = ctx.currentTime;
    const dur = Math.max(0.35, speechDurationSec);
    const targetGain = Math.max(0.01, bgEntry.baseVolume * Math.max(0.05, Math.min(0.8, duckRatio)));
    const gainParam = bgEntry.gain.gain;

    try {
      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(gainParam.value, now);
      gainParam.linearRampToValueAtTime(targetGain, now + 0.08);
      gainParam.setValueAtTime(targetGain, now + Math.max(0.1, dur - 0.05));
      gainParam.linearRampToValueAtTime(bgEntry.baseVolume, now + dur + 0.22);
    } catch {
      // ignore scheduling errors
    }
  }

  private getDataUrlKey(dataUrl: string): string {
    return `${dataUrl.slice(0, 64)}:${dataUrl.length}:${dataUrl.slice(-24)}`;
  }

  public getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public async getAudioDuration(dataUrl: string): Promise<number> {
    try {
      const buf = await this.decodeDataUrl(dataUrl);
      if (buf && Number.isFinite(buf.duration) && buf.duration > 0) {
        return buf.duration;
      }
    } catch {
      // fall through to metadata/header fallback
    }

    const metaDuration = await new Promise<number>((resolve) => {
      let settled = false;
      const done = (val: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };
      const timer = setTimeout(() => done(0), 2500);
      const el = document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        const dur = Number.isFinite(el.duration) ? el.duration : 0;
        done(dur);
      };
      el.onerror = () => done(0);
      el.src = dataUrl;
    });

    if (metaDuration > 0) return metaDuration;

    if (dataUrl.startsWith('data:audio/wav;base64,')) {
      const base64Len = dataUrl.length - 'data:audio/wav;base64,'.length;
      const byteLen = Math.max(0, Math.floor((base64Len * 3) / 4) - 44);
      if (byteLen > 0) {
        return Math.max(0.5, byteLen / 48000);
      }
    }
    return 0;
  }

  public async decodeDataUrl(dataUrl: string, targetCtx?: AudioContext): Promise<AudioBuffer | null> {
    const ctx = targetCtx ?? this.getContext();
    const cache = this.getCacheForContext(ctx);
    const cacheKey = this.getDataUrlKey(dataUrl);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey) ?? null;
    }
    try {
      const response = await fetch(dataUrl);
      const arrayBuffer = await response.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      cache.set(cacheKey, decoded);
      if (Number.isFinite(decoded.duration) && decoded.duration > 0) {
        this.decodedDurations.set(cacheKey, decoded.duration);
      }
      return decoded;
    } catch {
      return null;
    }
  }

  public getExactDuration(dataUrl: string | undefined, fallback: number): number {
    if (!dataUrl) return fallback;
    const d = this.decodedDurations.get(this.getDataUrlKey(dataUrl));
    return d && Number.isFinite(d) && d > 0 ? d : fallback;
  }

  public async preloadAllAudio(
    audio: AudioSettings,
    slides: QuestionSlide[] = [],
    targetCtx?: AudioContext,
    template?: TemplateSettings
  ): Promise<void> {
    const slots: AudioSlotId[] = [
      'questionEnter',
      'optionEnter',
      'countdownTick',
      'suspense',
      'correctReveal',
      'bgMusic',
    ];
    const tasks: Promise<unknown>[] = slots.map(async (slot) => {
      const cfg = audio[slot];
      if (cfg && cfg.sourceType === 'custom' && cfg.customDataUrl) {
        await this.decodeDataUrl(cfg.customDataUrl, targetCtx);
      }
    });

    if (template?.introHookAudio?.dataUrl) {
      tasks.push(this.decodeDataUrl(template.introHookAudio.dataUrl, targetCtx));
    }

    for (const slide of slides) {
      if (slide.voiceover?.question?.dataUrl) {
        tasks.push(this.decodeDataUrl(slide.voiceover.question.dataUrl, targetCtx));
      }
      if (slide.voiceover?.answer?.dataUrl) {
        tasks.push(this.decodeDataUrl(slide.voiceover.answer.dataUrl, targetCtx));
      }
      slide.voiceover?.options?.forEach((clip) => {
        if (clip?.dataUrl) {
          tasks.push(this.decodeDataUrl(clip.dataUrl, targetCtx));
        }
      });
    }

    await Promise.all(tasks);
  }

  public async syncProjectAudioDurations(
    slides: QuestionSlide[],
    audio: AudioSettings,
    template: TemplateSettings,
    targetCtx?: AudioContext
  ): Promise<{ slides: QuestionSlide[]; audio: AudioSettings; template: TemplateSettings }> {
    await this.preloadAllAudio(audio, slides, targetCtx, template);

    const syncClip = (clip?: SlideAudioClip): SlideAudioClip | undefined => {
      if (!clip?.dataUrl) return clip;
      const exact = this.getExactDuration(clip.dataUrl, clip.duration);
      return Math.abs(exact - clip.duration) > 0.01 ? { ...clip, duration: exact } : clip;
    };

    const syncedSlides: QuestionSlide[] = slides.map((s) => {
      if (!s.voiceover) return s;
      const q = syncClip(s.voiceover.question);
      const ans = syncClip(s.voiceover.answer);
      const opts = s.voiceover.options
        ? ([
            syncClip(s.voiceover.options[0]),
            syncClip(s.voiceover.options[1]),
            syncClip(s.voiceover.options[2]),
            syncClip(s.voiceover.options[3]),
          ] as [
            SlideAudioClip | undefined,
            SlideAudioClip | undefined,
            SlideAudioClip | undefined,
            SlideAudioClip | undefined
          ])
        : undefined;
      return {
        ...s,
        voiceover: {
          ...s.voiceover,
          question: q,
          answer: ans,
          options: opts,
        },
      };
    });

    const syncSlot = (cfg: AudioSlotConfig): AudioSlotConfig => {
      if (cfg.sourceType !== 'custom' || !cfg.customDataUrl) return cfg;
      const exact = this.getExactDuration(cfg.customDataUrl, cfg.duration ?? 0);
      return exact > 0 ? { ...cfg, duration: exact } : cfg;
    };

    const syncedAudio: AudioSettings = {
      questionEnter: syncSlot(audio.questionEnter),
      optionEnter: syncSlot(audio.optionEnter),
      countdownTick: syncSlot(audio.countdownTick),
      suspense: syncSlot(audio.suspense),
      correctReveal: syncSlot(audio.correctReveal),
      bgMusic: syncSlot(audio.bgMusic),
    };

    const syncedTemplate: TemplateSettings = template.introHookAudio?.dataUrl
      ? {
          ...template,
          introHookAudio: syncClip(template.introHookAudio),
        }
      : template;

    return {
      slides: syncedSlides,
      audio: syncedAudio,
      template: syncedTemplate,
    };
  }

  public async playClip(
    clip: SlideAudioClip,
    volume = 1,
    destination?: AudioNode,
    ctxOverride?: AudioContext,
    when?: number
  ): Promise<void> {
    if (volume <= 0.001 || !clip.dataUrl) return;
    const ctx = ctxOverride ?? this.getContext();
    const dest = destination ?? ctx.destination;
    const cache = this.getCacheForContext(ctx);
    const cached = cache.get(this.getDataUrlKey(clip.dataUrl));

    if (cached) {
      const startTime = Math.max(ctx.currentTime, when ?? ctx.currentTime);
      const src = ctx.createBufferSource();
      src.buffer = cached;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, startTime);
      src.connect(gain);
      gain.connect(dest);
      this.trackSourceIfPreview(ctx, src);
      src.start(startTime);
      return;
    }

    const buffer = await this.decodeDataUrl(clip.dataUrl, ctx);
    if (!buffer) return;
    const startTime = Math.max(ctx.currentTime, when ?? ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    src.connect(gain);
    gain.connect(dest);
    this.trackSourceIfPreview(ctx, src);
    src.start(startTime);
  }

  public async playSlot(
    config: AudioSlotConfig,
    destination?: AudioNode,
    ctxOverride?: AudioContext,
    when?: number,
    urgent = false
  ): Promise<void> {
    if (!config || config.volume <= 0.001) return;
    const ctx = ctxOverride ?? this.getContext();
    const dest = destination ?? ctx.destination;

    if (config.sourceType === 'custom' && config.customDataUrl) {
      const cache = this.getCacheForContext(ctx);
      const cached = cache.get(this.getDataUrlKey(config.customDataUrl));
      const buffer = cached ?? (await this.decodeDataUrl(config.customDataUrl, ctx));
      if (buffer) {
        const startTime = Math.max(ctx.currentTime, when ?? ctx.currentTime);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(config.volume, startTime);
        src.connect(gain);
        gain.connect(dest);
        this.trackSourceIfPreview(ctx, src);
        src.start(startTime);
        return;
      }
    }

    const startTime = Math.max(ctx.currentTime, when ?? ctx.currentTime);
    this.playBuiltInSfx(config.builtinId, config.volume, ctx, dest, startTime, urgent);
  }

  public async startBgMusic(
    config: AudioSlotConfig,
    destination?: AudioNode,
    ctxOverride?: AudioContext
  ): Promise<AudioBufferSourceNode | null> {
    this.stopBgMusic();
    if (!config || config.volume <= 0.001) return null;
    if (config.sourceType !== 'custom' || !config.customDataUrl) {
      return null;
    }

    const ctx = ctxOverride ?? this.getContext();
    const dest = destination ?? ctx.destination;
    const buffer = await this.decodeDataUrl(config.customDataUrl, ctx);
    if (!buffer) return null;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(config.volume, ctx.currentTime);
    src.connect(gain);
    gain.connect(dest);
    src.start(ctx.currentTime);

    this.bgNodes.set(ctx, { gain, baseVolume: config.volume });

    if (!ctxOverride) {
      this.activeBgSource = src;
      this.activeBgGain = gain;
    }
    return src;
  }

  public stopBgMusic(): void {
    if (this.ctx) {
      this.bgNodes.delete(this.ctx);
    }
    if (this.activeBgSource) {
      try {
        this.activeBgSource.stop();
        this.activeBgSource.disconnect();
      } catch {
        // already stopped
      }
      this.activeBgSource = null;
    }
    if (this.activeBgGain) {
      this.activeBgGain.disconnect();
      this.activeBgGain = null;
    }
  }

  public playBuiltInSfx(
    id: BuiltInSfxId,
    volume: number,
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    urgent = false
  ): void {
    if (id === 'none' || volume <= 0.001) return;

    switch (id) {
      case 'softPop': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(860, now + 0.12);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(volume * 0.36, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }

      case 'click': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(920, now);
        osc.frequency.exponentialRampToValueAtTime(340, now + 0.045);
        gain.gain.setValueAtTime(volume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.07);
        break;
      }

      case 'channelTick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(urgent ? 1500 : 1000, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume * 0.18, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.085);
        break;
      }

      case 'tick': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(urgent ? 1350 : 1150, now);
        osc.frequency.exponentialRampToValueAtTime(750, now + 0.03);
        gain.gain.setValueAtTime(volume * 0.32, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.055);
        break;
      }

      case 'suspenseRiser': {
        // Rising sawtooth tension + 6 low heartbeat pulses (matches channel HTML suspense())
        const riser = ctx.createOscillator();
        const riserGain = ctx.createGain();
        riser.type = 'sawtooth';
        riser.frequency.setValueAtTime(180, now);
        riser.frequency.exponentialRampToValueAtTime(900, now + 1.5);
        riserGain.gain.setValueAtTime(0.0001, now);
        riserGain.gain.exponentialRampToValueAtTime(volume * 0.16, now + 0.04);
        riserGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
        riser.connect(riserGain);
        riserGain.connect(dest);
        riser.start(now);
        riser.stop(now + 1.52);

        for (let k = 0; k < 6; k++) {
          const t = now + k * 0.25;
          const thump = ctx.createOscillator();
          const thumpGain = ctx.createGain();
          thump.type = 'sine';
          thump.frequency.setValueAtTime(90, t);
          thumpGain.gain.setValueAtTime(0.0001, t);
          thumpGain.gain.exponentialRampToValueAtTime(volume * 0.42, t + 0.015);
          thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
          thump.connect(thumpGain);
          thumpGain.connect(dest);
          thump.start(t);
          thump.stop(t + 0.17);
        }
        break;
      }

      case 'whoosh': {
        const bufferSize = Math.floor(ctx.sampleRate * 0.28);
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(2.2, now);
        filter.frequency.setValueAtTime(260, now);
        filter.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
        filter.frequency.exponentialRampToValueAtTime(480, now + 0.28);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(volume * 0.45, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        noise.start(now);
        noise.stop(now + 0.29);
        break;
      }

      case 'chime': {
        const freqs = [523.25, 659.25];
        freqs.forEach((f, idx) => {
          const t = now + idx * 0.09;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(volume * 0.35, t + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.4);
        });
        break;
      }

      case 'successFanfare': {
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
          const t = now + idx * 0.1;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(0.001, t);
          gain.gain.linearRampToValueAtTime(volume * 0.32, t + 0.018);
          gain.gain.exponentialRampToValueAtTime(0.001, t + (idx === 3 ? 0.55 : 0.38));
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.58);
        });
        break;
      }

      case 'calmPulse': {
        const freqs = [293.66, 440];
        freqs.forEach((f) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, now);
          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(volume * 0.2, now + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(now);
          osc.stop(now + 0.48);
        });
        break;
      }
    }
  }
}

export const soundEngine = new SoundEngine();
