export type AnimationStyle = 'scale' | 'pop' | 'slideUp' | 'slideRight' | 'slideLeft' | 'fade';

export type VideoAspectRatio = '9:16' | '16:9';

export type RevealStyle =
  | 'highlightGlow'
  | 'scaleCheck'
  | 'dimOthers'
  | 'redWrongGreenCorrect';

export type OptionLayoutMode = 'channel2x2' | 'grid2x2' | 'vertical';

export type OptionLabelStyle = 'arabic' | 'numbers' | 'english' | 'none';

export type TimerStyle = 'channelBox' | 'bar' | 'circle' | 'digits' | 'none';

export type PresetId =
  | 'channelSand'
  | 'channelNavy'
  | 'channelEmerald'
  | 'channelMath'
  | 'emerald'
  | 'navy'
  | 'obsidian';

export type AudioSlotId =
  | 'questionEnter'
  | 'optionEnter'
  | 'countdownTick'
  | 'suspense'
  | 'correctReveal'
  | 'bgMusic';

export type BuiltInSfxId =
  | 'none'
  | 'softPop'
  | 'whoosh'
  | 'click'
  | 'tick'
  | 'channelTick'
  | 'suspenseRiser'
  | 'chime'
  | 'successFanfare'
  | 'calmPulse';

export interface SlideAudioClip {
  fileName: string;
  dataUrl: string;
  duration: number; // exact duration in seconds
}

export interface SlideVoiceover {
  question?: SlideAudioClip;
  options?: [
    SlideAudioClip | undefined,
    SlideAudioClip | undefined,
    SlideAudioClip | undefined,
    SlideAudioClip | undefined
  ];
  answer?: SlideAudioClip;
}

export type BrandLogoAnimation = 'none' | 'pulse' | 'float' | 'glow' | 'spin';

export type BrandCornerPosition = 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft';

export interface QuestionSlide {
  id: string;
  badgeText: string;
  question: string;
  imageDataUrl?: string;
  imageName?: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanationText?: string;
  voiceover?: SlideVoiceover;
}

export interface AudioSlotConfig {
  sourceType: 'builtin' | 'custom';
  builtinId: BuiltInSfxId;
  customFileName?: string;
  customDataUrl?: string;
  duration?: number;
  volume: number; // 0 to 1
}

export type AudioSettings = Record<AudioSlotId, AudioSlotConfig>;

export interface TemplateSettings {
  aspectRatio: VideoAspectRatio;

  backgroundType: 'preset' | 'custom' | 'color';
  presetId: PresetId;
  customBgDataUrl?: string;
  customBgName?: string;
  solidBgColor: string;
  bgDimOpacity: number; // 0 to 0.75

  fontFamily: 'Cairo' | 'Tajawal' | 'Amiri';

  showBadge: boolean;
  badgeY: number; // percentage 0..100
  badgeBgColor: string;
  badgeTextColor: string;

  questionY: number; // percentage 0..100
  questionWidth: number; // percentage 40..96
  questionHeightPct: number; // 0 = auto height, >0 = fixed channel height pct (e.g. 18.3)
  questionFontSize: number; // px on 1080x1920
  questionTextColor: string;
  questionBoxColor: string;
  questionBoxOpacity: number; // 0..1
  questionBorderColor: string;
  questionBorderWidth: number;
  questionBorderRadius: number;
  questionAnim: AnimationStyle;

  optionsLayout: OptionLayoutMode;
  optionsStartY: number; // percentage 0..100
  optionsWidth: number; // percentage 40..100
  optionsGap: number; // px on 1080x1920
  optionHeight: number; // px on 1080x1920
  optionFontSize: number; // px on 1080x1920
  optionLabelStyle: OptionLabelStyle;
  optionTextColor: string;
  optionBoxColor: string;
  optionBoxOpacity: number; // 0..1
  optionBorderColor: string;
  optionBorderWidth: number;
  optionBorderRadius: number;
  optionLabelBgColor: string;
  optionLabelTextColor: string;
  optionAnim: AnimationStyle;

  boxGloss: boolean;
  enhanceAppearance: boolean;

  timerStyle: TimerStyle;
  timerY: number; // percentage 0..100
  timerColor: string;
  timerBgColor: string;
  timerMatchBackground: boolean;
  useTimerVideo: boolean;

  correctColor: string;
  wrongColor: string;
  revealStyle: RevealStyle;
  showExplanationOnReveal: boolean;
  showSafeGuides: boolean;

  showEndCard: boolean;
  endCardText: string;

  brandLogoDataUrl?: string;
  brandLogoName?: string;
  brandLogoAnim: BrandLogoAnimation;
  brandLogoSize: number; // px on canvas
  brandLogoPosition: BrandCornerPosition;
  brandHandleText: string;
  brandOpacity: number; // 0.2..1
  showProgressCounter: boolean;
}

export interface TimingSettings {
  autoSyncWithAudio: boolean; // Auto-advance to next element when uploaded audio finishes
  audioEndGap: number; // small pause after audio finishes (seconds)
  autoDuckMusic: boolean; // Automatically lower background music while presenter speaks
  bgMusicDuckRatio: number; // 0.1..0.6 target music level during speech
  introHold: number; // seconds before question enters (0 = instant with voice)
  questionReadDelay: number; // fallback seconds after question enters if no custom audio
  optionStaggerDelay: number; // fallback seconds between each option if no custom audio
  thinkingDuration: number; // countdown seconds after Option 4
  suspenseDuration: number; // suspense pulse seconds after timer before answer reveal
  revealHoldDuration: number; // seconds correct answer stays highlighted
  transitionGap: number; // seconds between slides
}

export interface QuizProject {
  id: string;
  name: string;
  schemaVersion?: number;
  preferredAiVoice?: 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
  slides: QuestionSlide[];
  template: TemplateSettings;
  timing: TimingSettings;
  audio: AudioSettings;
  updatedAt: number;
}

export interface PresetBackdropInfo {
  id: PresetId;
  label: string;
  src?: string;
  wideSrc?: string;
  gradientInner?: string;
  gradientOuter?: string;
  gradientStop?: number;
  swatchColor: string;
}

export const PRESET_BACKDROPS: PresetBackdropInfo[] = [
  {
    id: 'channelSand',
    label: 'قالب القناة الرملي',
    src: '/src/assets/images/template_channel_sand.jpg',
    swatchColor: '#EDD6A2',
  },
  {
    id: 'channelNavy',
    label: 'الكحلي الملكي (القناة)',
    gradientInner: '#2b3a6b',
    gradientOuter: '#0b1230',
    gradientStop: 0.7,
    swatchColor: '#1f2a4d',
  },
  {
    id: 'channelEmerald',
    label: 'الزمردي الكلاسيكي (القناة)',
    gradientInner: '#1e6b55',
    gradientOuter: '#0a2a22',
    gradientStop: 0.75,
    swatchColor: '#1e6b55',
  },
  {
    id: 'channelMath',
    label: 'سبورة الرياضيات 🧮',
    src: '/src/assets/images/math_board_vertical_1795360665242.jpg',
    wideSrc: '/src/assets/images/math_board_wide_1795360665477.jpg',
    swatchColor: '#113328',
  },
  {
    id: 'emerald',
    label: 'الزمرد الذهبي',
    src: '/src/assets/images/template_emerald_studio_1795289851480.jpg',
    swatchColor: '#10b981',
  },
  {
    id: 'navy',
    label: 'الأزرق الليلي',
    src: '/src/assets/images/template_navy_classic_1795289852308.jpg',
    swatchColor: '#1e3a8a',
  },
  {
    id: 'obsidian',
    label: 'البرونز الداكن',
    src: '/src/assets/images/template_warm_obsidian_1795289851537.jpg',
    swatchColor: '#78350f',
  },
];

export const CHANNEL_THEME_ORDER: ('channelSand' | 'channelNavy' | 'channelEmerald' | 'channelMath')[] = [
  'channelSand',
  'channelNavy',
  'channelEmerald',
  'channelMath',
];

export function getCanvasDimensions(template?: Pick<TemplateSettings, 'aspectRatio'>): {
  width: number;
  height: number;
} {
  if (template?.aspectRatio === '16:9') {
    return { width: 1920, height: 1080 };
  }
  return { width: 1080, height: 1920 };
}

export function applyChannelThemePreset(
  current: TemplateSettings,
  themeId: 'channelSand' | 'channelNavy' | 'channelEmerald' | 'channelMath'
): TemplateSettings {
  if (themeId === 'channelMath') {
    return {
      ...current,
      backgroundType: 'preset',
      presetId: 'channelMath',
      bgDimOpacity: 0.12,
      boxGloss: true,
      enhanceAppearance: true,
      questionTextColor: '#FFFFFF',
      questionBoxColor: '#102a22',
      questionBoxOpacity: 0.92,
      questionBorderColor: '#edd6a2',
      questionBorderWidth: 4,
      optionTextColor: '#FFFFFF',
      optionBoxColor: '#13352b',
      optionBoxOpacity: 0.94,
      optionBorderColor: '#edd6a2',
      optionBorderWidth: 4,
      optionLabelBgColor: '#edd6a2',
      optionLabelTextColor: '#0e241d',
      correctColor: '#00B050',
      wrongColor: '#DC2626',
      revealStyle: 'redWrongGreenCorrect',
      timerMatchBackground: true,
      timerBgColor: '#0f2820',
      timerColor: '#EDD6A2',
    };
  }
  if (themeId === 'channelNavy') {
    return {
      ...current,
      backgroundType: 'preset',
      presetId: 'channelNavy',
      bgDimOpacity: 0,
      boxGloss: true,
      questionTextColor: '#FFFFFF',
      questionBoxColor: '#1f2a4d',
      questionBoxOpacity: 1,
      questionBorderColor: '#d4a73a',
      questionBorderWidth: 5,
      optionTextColor: '#FFFFFF',
      optionBoxColor: '#1f2a4d',
      optionBoxOpacity: 1,
      optionBorderColor: '#d4a73a',
      optionBorderWidth: 5,
      optionLabelBgColor: '#d4a73a',
      optionLabelTextColor: '#0b1230',
      correctColor: '#00B050',
      timerMatchBackground: true,
      timerBgColor: '#131d42',
      timerColor: '#FFFFFF',
    };
  }
  if (themeId === 'channelEmerald') {
    return {
      ...current,
      backgroundType: 'preset',
      presetId: 'channelEmerald',
      bgDimOpacity: 0,
      boxGloss: true,
      questionTextColor: '#12342b',
      questionBoxColor: '#f3efd9',
      questionBoxOpacity: 1,
      questionBorderColor: '#c9a24a',
      questionBorderWidth: 5,
      optionTextColor: '#12342b',
      optionBoxColor: '#f3efd9',
      optionBoxOpacity: 1,
      optionBorderColor: '#c9a24a',
      optionBorderWidth: 5,
      optionLabelBgColor: '#c9a24a',
      optionLabelTextColor: '#12342b',
      correctColor: '#00B050',
      timerMatchBackground: true,
      timerBgColor: '#0e3b2f',
      timerColor: '#FFFFFF',
    };
  }
  return {
    ...current,
    backgroundType: 'preset',
    presetId: 'channelSand',
    bgDimOpacity: 0,
    boxGloss: true,
    questionTextColor: '#000000',
    questionBoxColor: '#EDD6A2',
    questionBoxOpacity: 1,
    questionBorderColor: '#FFFFFF',
    questionBorderWidth: 5,
    optionTextColor: '#000000',
    optionBoxColor: '#EDD6A2',
    optionBoxOpacity: 1,
    optionBorderColor: '#FFFFFF',
    optionBorderWidth: 5,
    optionLabelBgColor: '#d4a73a',
    optionLabelTextColor: '#000000',
    correctColor: '#00B050',
    timerMatchBackground: true,
    timerBgColor: '#F2E3BA',
    timerColor: '#000000',
  };
}

export const DEFAULT_TEMPLATE: TemplateSettings = {
  aspectRatio: '9:16',

  backgroundType: 'preset',
  presetId: 'channelSand',
  solidBgColor: '#0c0c0c',
  bgDimOpacity: 0,

  fontFamily: 'Cairo',

  showBadge: false,
  badgeY: 11,
  badgeBgColor: '#d4a73a',
  badgeTextColor: '#000000',

  questionY: 36,
  questionWidth: 68.6,
  questionHeightPct: 18.3,
  questionFontSize: 72,
  questionTextColor: '#000000',
  questionBoxColor: '#EDD6A2',
  questionBoxOpacity: 1,
  questionBorderColor: '#FFFFFF',
  questionBorderWidth: 5,
  questionBorderRadius: 54,
  questionAnim: 'pop',

  optionsLayout: 'channel2x2',
  optionsStartY: 51.7,
  optionsWidth: 100,
  optionsGap: 28,
  optionHeight: 148,
  optionFontSize: 52,
  optionLabelStyle: 'none',
  optionTextColor: '#000000',
  optionBoxColor: '#EDD6A2',
  optionBoxOpacity: 1,
  optionBorderColor: '#FFFFFF',
  optionBorderWidth: 5,
  optionBorderRadius: 32,
  optionLabelBgColor: '#d4a73a',
  optionLabelTextColor: '#000000',
  optionAnim: 'pop',

  boxGloss: true,
  enhanceAppearance: true,

  timerStyle: 'channelBox',
  timerY: 61,
  timerColor: '#000000',
  timerBgColor: '#F2E3BA',
  timerMatchBackground: true,
  useTimerVideo: true,

  correctColor: '#00B050',
  wrongColor: '#DC2626',
  revealStyle: 'dimOthers',
  showExplanationOnReveal: false,
  showSafeGuides: false,

  showEndCard: true,
  endCardText: 'شكراً لمشاهدتكم',

  brandLogoAnim: 'pulse',
  brandLogoSize: 108,
  brandLogoPosition: 'topRight',
  brandHandleText: '',
  brandOpacity: 0.92,
  showProgressCounter: false,
};

export const DEFAULT_TIMING: TimingSettings = {
  autoSyncWithAudio: true,
  audioEndGap: 0.15,
  autoDuckMusic: true,
  bgMusicDuckRatio: 0.22,
  introHold: 0,
  questionReadDelay: 0.75,
  optionStaggerDelay: 0.45,
  thinkingDuration: 5,
  suspenseDuration: 1.6,
  revealHoldDuration: 3.0,
  transitionGap: 0.35,
};

export const DEFAULT_AUDIO: AudioSettings = {
  questionEnter: {
    sourceType: 'builtin',
    builtinId: 'softPop',
    volume: 0.75,
  },
  optionEnter: {
    sourceType: 'builtin',
    builtinId: 'softPop',
    volume: 0.8,
  },
  countdownTick: {
    sourceType: 'builtin',
    builtinId: 'channelTick',
    volume: 0.65,
  },
  suspense: {
    sourceType: 'builtin',
    builtinId: 'suspenseRiser',
    volume: 0.75,
  },
  correctReveal: {
    sourceType: 'builtin',
    builtinId: 'successFanfare',
    volume: 0.85,
  },
  bgMusic: {
    sourceType: 'builtin',
    builtinId: 'none',
    volume: 0.25,
  },
};

export const CHANNEL_SAMPLE_SLIDES: QuestionSlide[] = [
  {
    id: 'channel-slide-1',
    badgeText: 'السؤال 1',
    question: 'كم عدد أركان الإسلام؟',
    options: ['خمسة', 'ثلاثة', 'أربعة', 'ستة'],
    correctIndex: 0,
    explanationText: 'أركان الإسلام خمسة تبدأ بالشهادتين',
  },
  {
    id: 'channel-slide-2',
    badgeText: 'السؤال 2',
    question: 'ما هي أطول سورة في القرآن الكريم؟',
    options: ['آل عمران', 'البقرة', 'النساء', 'المائدة'],
    correctIndex: 1,
    explanationText: 'سورة البقرة أطول سور القرآن بـ 286 آية',
  },
  {
    id: 'channel-slide-3',
    badgeText: 'السؤال 3',
    question: 'في أي شهر يصوم المسلمون؟',
    options: ['شعبان', 'محرم', 'رمضان', 'رجب'],
    correctIndex: 2,
    explanationText: 'شهر رمضان المبارك هو الشهر التاسع في التقويم الهجري',
  },
  {
    id: 'channel-slide-4',
    badgeText: 'السؤال 4',
    question: 'كم عدد سور القرآن الكريم؟',
    options: ['100', '120', '99', '114'],
    correctIndex: 3,
    explanationText: 'عدد سور القرآن الكريم 114 سورة',
  },
];

export const DEFAULT_SLIDES: QuestionSlide[] = CHANNEL_SAMPLE_SLIDES.map((s) => ({
  ...s,
  options: [...s.options] as [string, string, string, string],
}));

function cloneDefaultAudio(): AudioSettings {
  return {
    questionEnter: { ...DEFAULT_AUDIO.questionEnter },
    optionEnter: { ...DEFAULT_AUDIO.optionEnter },
    countdownTick: { ...DEFAULT_AUDIO.countdownTick },
    suspense: { ...DEFAULT_AUDIO.suspense },
    correctReveal: { ...DEFAULT_AUDIO.correctReveal },
    bgMusic: { ...DEFAULT_AUDIO.bgMusic },
  };
}

export function createDefaultProject(): QuizProject {
  return {
    id: 'default-shorts-project',
    name: 'مشروع شورتس القناة',
    schemaVersion: 6,
    preferredAiVoice: 'Kore',
    slides: DEFAULT_SLIDES.map((s) => ({
      ...s,
      options: [...s.options] as [string, string, string, string],
    })),
    template: { ...DEFAULT_TEMPLATE },
    timing: { ...DEFAULT_TIMING },
    audio: cloneDefaultAudio(),
    updatedAt: Date.now(),
  };
}

export interface SlideSchedule {
  slideIndex: number;
  startTime: number;
  endTime: number;
  duration: number;
  tQuestionStart: number;
  tOptionStarts: [number, number, number, number];
  tThinkingStart: number;
  tTimerExitStart: number;
  tSuspenseStart: number;
  tRevealStart: number;
}

export const END_CARD_DURATION = 2.0;

export function computeSlideSchedule(
  slide: QuestionSlide,
  slideIndex: number,
  startTime: number,
  timing: TimingSettings,
  audio: AudioSettings
): SlideSchedule {
  const auto = timing?.autoSyncWithAudio ?? true;
  const gap = Math.max(0, timing?.audioEndGap ?? 0.15);

  const tQuestionStart = Math.max(0, timing?.introHold ?? 0);

  const qSlot = audio?.questionEnter;
  const globalQDur =
    qSlot?.sourceType === 'custom' && qSlot.customDataUrl ? qSlot.duration ?? 0 : 0;
  const slideQDur = slide?.voiceover?.question?.duration ?? 0;
  const qDur = slideQDur > 0 ? slideQDur : globalQDur;
  const qDelay = auto && qDur > 0 ? qDur + gap : timing?.questionReadDelay ?? 0.75;

  const tOpt0 = tQuestionStart + qDelay;

  const optSlot = audio?.optionEnter;
  const globalOptDur =
    optSlot?.sourceType === 'custom' && optSlot.customDataUrl ? optSlot.duration ?? 0 : 0;

  const tOptions: number[] = [tOpt0];
  let opt3Duration = 0;

  for (let i = 0; i < 4; i++) {
    const slideOptDur = slide?.voiceover?.options?.[i]?.duration ?? 0;
    const optDur = slideOptDur > 0 ? slideOptDur : globalOptDur;
    const step = auto && optDur > 0 ? optDur + gap : timing?.optionStaggerDelay ?? 0.45;

    if (i < 3) {
      tOptions.push(tOptions[i] + step);
    } else {
      opt3Duration = auto && optDur > 0 ? optDur + gap : 0.45;
    }
  }

  const thinkingDur = Math.max(0, timing?.thinkingDuration ?? 5);
  const tThinkingStart = tOptions[3] + opt3Duration;
  const tTimerExitStart = tThinkingStart + thinkingDur;
  const tSuspenseStart = tTimerExitStart;

  const susSlot = audio?.suspense;
  const customSusDur =
    susSlot?.sourceType === 'custom' && susSlot.customDataUrl ? susSlot.duration ?? 0 : 0;
  const configuredSus = Math.max(0, timing?.suspenseDuration ?? 1.6);
  const suspenseDur =
    auto && customSusDur > 0 && configuredSus > 0
      ? Math.max(configuredSus, customSusDur + 0.05)
      : configuredSus;

  const tRevealStart = tSuspenseStart + suspenseDur;

  const revealSlot = audio?.correctReveal;
  const globalAnsDur =
    revealSlot?.sourceType === 'custom' && revealSlot.customDataUrl ? revealSlot.duration ?? 0 : 0;
  const slideAnsDur = slide?.voiceover?.answer?.duration ?? 0;
  const ansDur = slideAnsDur > 0 ? slideAnsDur : globalAnsDur;

  const baseRevealHold = timing?.revealHoldDuration ?? 3.0;
  const revealHold =
    auto && ansDur > 0 ? Math.max(baseRevealHold, ansDur + gap) : baseRevealHold;

  const duration = tRevealStart + revealHold;

  return {
    slideIndex,
    startTime,
    endTime: startTime + duration,
    duration,
    tQuestionStart,
    tOptionStarts: [tOptions[0], tOptions[1], tOptions[2], tOptions[3]],
    tThinkingStart,
    tTimerExitStart,
    tSuspenseStart,
    tRevealStart,
  };
}

export function computeProjectTimeline(
  slides: QuestionSlide[],
  timing: TimingSettings,
  audio: AudioSettings
): SlideSchedule[] {
  const schedules: SlideSchedule[] = [];
  let cursor = 0;
  for (let i = 0; i < slides.length; i++) {
    const sched = computeSlideSchedule(slides[i], i, cursor, timing, audio);
    schedules.push(sched);
    cursor = sched.endTime + (i < slides.length - 1 ? timing.transitionGap : 0);
  }
  return schedules;
}

export function getSlidesContentDuration(
  slides: QuestionSlide[],
  timing: TimingSettings,
  audio: AudioSettings
): number {
  const schedules = computeProjectTimeline(slides, timing, audio);
  if (schedules.length === 0) return 0;
  return schedules[schedules.length - 1].endTime;
}

export function getTotalDuration(
  slides: QuestionSlide[],
  timing: TimingSettings,
  audio: AudioSettings,
  template?: TemplateSettings
): number {
  const contentDur = getSlidesContentDuration(slides, timing, audio);
  if (contentDur <= 0) return 0;
  return contentDur + (template?.showEndCard ? END_CARD_DURATION : 0);
}
