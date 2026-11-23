import React, { useRef, useState } from 'react';
import {
  BookmarkPlus,
  Crown,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Monitor,
  Play,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { BUILTIN_SFX_OPTIONS, soundEngine } from '../audio/soundEngine';
import { AiVoiceName, generateSingleTtsClip } from '../services/aiClient';
import {
  CustomTemplatePreset,
  deleteCustomPreset,
  loadCustomPresets,
  saveCustomPreset,
} from '../storage/customPresets';
import { readFileAsDataUrl } from '../storage/projectStore';
import {
  AnimationStyle,
  BackgroundMotion,
  BoxBorderStyle,
  BoxShapeStyle,
  BrandCornerPosition,
  BrandLogoAnimation,
  BuiltInSfxId,
  DEFAULT_PRIZE_LADDER,
  DEFAULT_TEMPLATE,
  OptionLabelStyle,
  OptionLayoutMode,
  OptionTextAlign,
  OptionsAppearMode,
  PRESET_BACKDROPS,
  PrizeLadderStyle,
  RevealStyle,
  SlideTransitionStyle,
  TemplateSettings,
  TimerStyle,
  applyStudioThemePreset,
  applyThemeBackgroundOnly,
} from '../types/quiz';
import { MicRecordButton } from './MicRecordButton';

interface TemplateDesignPanelProps {
  template: TemplateSettings;
  aiVoiceName?: AiVoiceName;
  onChange: (next: TemplateSettings) => void;
}

const ANIM_OPTIONS: { id: AnimationStyle; label: string }[] = [
  { id: 'pop', label: 'نبض ارتدادي (Pop)' },
  { id: 'scale', label: 'تكبير ناعم' },
  { id: 'slideRight', label: 'انزلاق من اليمين' },
  { id: 'slideLeft', label: 'انزلاق من اليسار' },
  { id: 'slideUp', label: 'انزلاق للأعلى' },
  { id: 'fade', label: 'تلاشي ناعم' },
];

export const TemplateDesignPanel: React.FC<TemplateDesignPanelProps> = ({
  template,
  aiVoiceName = 'Kore',
  onChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const hookAudioInputRef = useRef<HTMLInputElement | null>(null);
  const [customPresets, setCustomPresets] = useState<CustomTemplatePreset[]>(() =>
    loadCustomPresets()
  );
  const [presetNameInput, setPresetNameInput] = useState('');
  const [themeApplyMode, setThemeApplyMode] = useState<'bgOnly' | 'full'>('bgOnly');
  const [isHookVoicing, setIsHookVoicing] = useState(false);
  const [hookAudioError, setHookAudioError] = useState('');

  const patch = (partial: Partial<TemplateSettings>) => {
    onChange({ ...template, ...partial });
  };

  const applyChannelPreset = () => {
    onChange({
      ...DEFAULT_TEMPLATE,
      aspectRatio: template.aspectRatio,
      customBgDataUrl: template.customBgDataUrl,
      customBgName: template.customBgName,
      showSafeGuides: template.showSafeGuides,
      endCardText: template.endCardText || 'شكراً لمشاهدتكم',
      brandLogoDataUrl: template.brandLogoDataUrl,
      brandLogoName: template.brandLogoName,
      brandLogoAnim: template.brandLogoAnim,
      brandLogoSize: template.brandLogoSize,
      brandLogoPosition: template.brandLogoPosition,
      brandHandleText: template.brandHandleText,
      brandOpacity: template.brandOpacity,
      showProgressCounter: template.showProgressCounter,
    });
  };

  const handleUploadBrandLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    patch({
      brandLogoDataUrl: dataUrl,
      brandLogoName: file.name,
    });
    e.target.value = '';
  };

  const applyQuickLayoutPreset = (mode: 'channel' | 'classicMiddle' | 'transparentOverlay') => {
    if (mode === 'channel') {
      onChange({
        ...template,
        showBadge: false,
        questionY: 36,
        questionWidth: 68.6,
        questionHeightPct: 18.3,
        questionFontSize: 72,
        questionBorderRadius: 54,
        optionsLayout: 'channel2x2',
        optionsStartY: 51.7,
        optionsWidth: 100,
        optionHeight: 148,
        optionFontSize: 52,
        optionBorderRadius: 32,
        optionLabelStyle: 'none',
        timerStyle: 'channelBox',
        timerY: 61,
        revealStyle: 'dimOthers',
        boxGloss: true,
      });
    } else if (mode === 'classicMiddle') {
      patch({
        showBadge: true,
        badgeY: 10,
        questionY: 22,
        questionWidth: 86,
        questionHeightPct: 0,
        questionFontSize: 48,
        questionBorderRadius: 26,
        timerStyle: 'circle',
        timerY: 71,
        optionsLayout: 'vertical',
        optionsStartY: 36,
        optionsWidth: 84,
        optionHeight: 108,
        optionsGap: 20,
        optionFontSize: 36,
        optionBorderRadius: 20,
        optionLabelStyle: 'arabic',
        questionBoxOpacity: 0.82,
        optionBoxOpacity: 0.9,
        questionBorderWidth: 2,
        optionBorderWidth: 2,
      });
    } else if (mode === 'transparentOverlay') {
      patch({
        questionY: 36,
        questionHeightPct: 0,
        timerStyle: 'channelBox',
        timerY: 61,
        optionsLayout: 'channel2x2',
        optionsStartY: 51.7,
        optionHeight: 148,
        questionBoxOpacity: 0,
        optionBoxOpacity: 0,
        questionBorderWidth: 0,
        optionBorderWidth: 0,
      });
    }
  };

  const handleSelectPreset = (presetId: TemplateSettings['presetId']) => {
    if (themeApplyMode === 'bgOnly') {
      onChange(applyThemeBackgroundOnly(template, presetId));
    } else {
      onChange(applyStudioThemePreset(template, presetId));
    }
  };

  const handleSaveCustomPreset = () => {
    const updated = saveCustomPreset(presetNameInput, template);
    setCustomPresets(updated);
    setPresetNameInput('');
  };

  const handleApplyCustomPreset = (preset: CustomTemplatePreset) => {
    onChange({
      ...DEFAULT_TEMPLATE,
      ...preset.template,
      brandLogoDataUrl: template.brandLogoDataUrl,
      brandLogoName: template.brandLogoName,
      brandHandleText: template.brandHandleText,
    });
  };

  const handleDeleteCustomPreset = (id: string) => {
    setCustomPresets(deleteCustomPreset(id));
  };

  const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    patch({
      backgroundType: 'custom',
      customBgDataUrl: dataUrl,
      customBgName: file.name,
    });
    e.target.value = '';
  };

  const handleUploadHookAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setHookAudioError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const duration = await soundEngine.getAudioDuration(dataUrl);
      patch({
        introHookAudio: {
          fileName: file.name,
          dataUrl,
          duration: duration > 0 ? duration : 1.5,
        },
      });
    } catch {
      setHookAudioError('تعذر قراءة ملف الصوت.');
    }
  };

  const handleGenerateHookAiVoice = async () => {
    const text = (template.introHookText ?? 'اختبر معلوماتك الآن!').trim();
    if (!text) {
      setHookAudioError('اكتب نص شريحة المقدمة أولاً.');
      return;
    }
    try {
      soundEngine.getContext();
    } catch {
      // ignore
    }
    setHookAudioError('');
    setIsHookVoicing(true);
    try {
      const clip = await generateSingleTtsClip(text, aiVoiceName, 'hook-voice.wav');
      patch({ introHookAudio: clip });
    } catch (err) {
      setHookAudioError(err instanceof Error ? err.message : 'تعذر توليد صوت المقدمة.');
    } finally {
      setIsHookVoicing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 0. Video Format / Aspect Ratio */}
      <section className="flex flex-col gap-2">
        <span className="text-sm font-bold text-[var(--ptxt)]">نوع الفيديو والأبعاد</span>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => patch({ aspectRatio: '9:16' })}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              template.aspectRatio !== '16:9'
                ? 'bg-[#00B050]/18 border-[#00B050] text-[#00B050] dark:text-[#6ee7b7]'
                : 'bg-[var(--surface)] border-[var(--pline)] text-[var(--ptxt)] hover:border-[var(--gold)]'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>شورتس 9:16 عمودي</span>
          </button>
          <button
            type="button"
            onClick={() => patch({ aspectRatio: '16:9' })}
            className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
              template.aspectRatio === '16:9'
                ? 'bg-[#00B050]/18 border-[#00B050] text-[#00B050] dark:text-[#6ee7b7]'
                : 'bg-[var(--surface)] border-[var(--pline)] text-[var(--ptxt)] hover:border-[var(--gold)]'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>فيديو طويل 16:9 أفقي</span>
          </button>
        </div>
      </section>

      {/* Quick Channel Layout & Style Bar */}
      <section className="flex flex-col gap-2.5 border-t border-[var(--pline)] pt-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--ptxt)]">
            <LayoutTemplate className="w-4 h-4 text-[var(--gold)]" />
            <span>تخطيطات الشاشة الجاهزة</span>
          </div>
          <button
            type="button"
            onClick={applyChannelPreset}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#00B050] hover:bg-[#00c85b] text-white text-[11px] font-bold transition-colors cursor-pointer"
          >
            <Sparkles className="w-3 h-3" />
            <span>استعادة قالب القناة</span>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => applyQuickLayoutPreset('channel')}
            className={`px-2 py-2 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
              template.optionsLayout === 'channel2x2' && template.questionBoxOpacity > 0
                ? 'bg-[#00B050]/18 border-[#00B050] text-[#00B050] dark:text-[#6ee7b7]'
                : 'bg-[var(--surface)] border-[var(--pline)] text-[var(--ptxt)] hover:border-[var(--gold)]'
            }`}
          >
            شبكة القناة 2×2
          </button>
          <button
            type="button"
            onClick={() => applyQuickLayoutPreset('classicMiddle')}
            className={`px-2 py-2 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
              template.optionsLayout === 'vertical'
                ? 'bg-[#00B050]/18 border-[#00B050] text-[#00B050] dark:text-[#6ee7b7]'
                : 'bg-[var(--surface)] border-[var(--pline)] text-[var(--ptxt)] hover:border-[var(--gold)]'
            }`}
          >
            قائمة عمودية
          </button>
          <button
            type="button"
            onClick={() => applyQuickLayoutPreset('transparentOverlay')}
            className="px-2 py-2 rounded-lg bg-[var(--surface)] hover:border-[var(--gold)] border border-[var(--pline)] text-[11px] font-semibold text-[var(--sand)] transition-colors cursor-pointer"
          >
            شفاف فوق صورتك
          </button>
        </div>

        {/* Custom Saved User Presets */}
        <div className="mt-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--pline)] flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[var(--ptxt)]">قوالبي الخاصة (حفظ واسترجاع)</span>
            <span className="text-[10px] text-[var(--pmuted)]">{customPresets.length} محفوظ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              placeholder="اسم القالب لحفظه (مثال: قالب قناتي الذهبي)"
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)] text-xs text-[var(--ptxt)] placeholder:text-[var(--pmuted)] focus:border-[#00B050] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleSaveCustomPreset}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00B050] hover:bg-[#00c85b] text-white text-[11px] font-bold whitespace-nowrap cursor-pointer"
            >
              <BookmarkPlus className="w-3.5 h-3.5" />
              <span>حفظ الحالي</span>
            </button>
          </div>
          {customPresets.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {customPresets.map((cp) => (
                <div
                  key={cp.id}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--panel)] border border-[var(--pline)] hover:border-[var(--gold)] overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => handleApplyCustomPreset(cp)}
                    className="px-2.5 py-1 text-[11px] font-bold text-[var(--ptxt)] cursor-pointer"
                  >
                    {cp.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomPreset(cp.id)}
                    title="حذف القالب"
                    className="px-1.5 py-1 text-[var(--pmuted)] hover:text-rose-400 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 1. Channel Themes & Background */}
      <section className="flex flex-col gap-3 border-t border-[var(--pline)] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--ptxt)]">
            1. ثيمات القناة والخلفية ({template.aspectRatio === '16:9' ? '16:9' : '9:16'})
          </h2>
        </div>

        {/* Freedom Mode Switch: Apply Backdrop Only vs Full Theme Override */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[var(--surface)] border border-[var(--pline)]">
          <button
            type="button"
            onClick={() => setThemeApplyMode('bgOnly')}
            className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              themeApplyMode === 'bgOnly'
                ? 'bg-[#00B050] text-white'
                : 'text-[var(--pmuted)] hover:text-[var(--ptxt)]'
            }`}
          >
            خلفية فقط (حفظ تعديلاتي)
          </button>
          <button
            type="button"
            onClick={() => setThemeApplyMode('full')}
            className={`px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
              themeApplyMode === 'full'
                ? 'bg-[var(--gold)] text-[#0c0c0c]'
                : 'text-[var(--pmuted)] hover:text-[var(--ptxt)]'
            }`}
          >
            تطبيق الثيم كامل (ألوان + شكل)
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {PRESET_BACKDROPS.map((preset) => {
            const active =
              template.backgroundType === 'preset' && template.presetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                className={`group relative rounded-lg overflow-hidden border text-right transition-all cursor-pointer ${
                  active
                    ? 'border-[#00B050] ring-2 ring-[#00B050]/35'
                    : 'border-[var(--pline)] hover:border-[var(--gold)]'
                }`}
              >
                {preset.src ? (
                  <img
                    src={preset.src}
                    alt={preset.label}
                    referrerPolicy="no-referrer"
                    className="w-full h-20 object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-20 flex items-center justify-center"
                    style={{
                      background: `radial-gradient(circle at 50% 30%, ${preset.gradientInner}, ${preset.gradientOuter} 75%)`,
                    }}
                  >
                    <span
                      className="w-8 h-5 rounded border-2"
                      style={{
                        backgroundColor: preset.swatchColor,
                        borderColor: '#d4a73a',
                      }}
                    />
                  </div>
                )}
                <div className="px-2 py-1.5 bg-[var(--surface)] text-[10px] font-bold text-[var(--ptxt)] truncate">
                  {preset.label}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadBg}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#00B050] hover:bg-[#00c85b] text-white text-xs font-bold transition-colors whitespace-nowrap cursor-pointer"
          >
            <ImagePlus className="w-4 h-4" />
            <span>رفع صورة خلفية مخصصة</span>
          </button>

          {template.backgroundType === 'custom' && template.customBgDataUrl && (
            <button
              type="button"
              onClick={() =>
                patch({
                  backgroundType: 'preset',
                  customBgDataUrl: undefined,
                  customBgName: undefined,
                })
              }
              title="حذف الصورة المخصصة"
              className="p-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {template.backgroundType === 'custom' && template.customBgName && (
          <p className="text-xs text-[#00B050] dark:text-[#6ee7b7] truncate">
            القالب المرفوع: {template.customBgName}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)]">
            <button
              type="button"
              onClick={() => patch({ backgroundType: 'color' })}
              className={`text-xs font-semibold cursor-pointer ${
                template.backgroundType === 'color' ? 'text-[#00B050]' : 'text-[var(--ptxt)]'
              }`}
            >
              لون ثابت
            </button>
            <input
              type="color"
              value={template.solidBgColor}
              onChange={(e) =>
                patch({
                  backgroundType: 'color',
                  solidBgColor: e.target.value,
                  timerBgColor: e.target.value,
                })
              }
              className="w-7 h-7 rounded bg-transparent border-0 cursor-pointer"
            />
          </div>

          <label className="flex flex-col justify-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--pline)]">
            <div className="flex items-center justify-between text-[11px] text-[var(--ptxt)]">
              <span>تعتيم الخلفية</span>
              <span className="font-mono-nums">{Math.round(template.bgDimOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.75}
              step={0.05}
              value={template.bgDimOpacity}
              onChange={(e) => patch({ bgDimOpacity: parseFloat(e.target.value) })}
              className="w-full h-1"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--pmuted)]">حركة الخلفية وإضاءة الجو</span>
          <select
            value={template.bgMotion || 'none'}
            onChange={(e) => patch({ bgMotion: e.target.value as BackgroundMotion })}
            className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
          >
            <option value="none">ثابت بدون حركة</option>
            <option value="slowZoom">زوم سينمائي بطيء (Ken Burns)</option>
            <option value="particles">جزيئات ضوئية متحركة (Bokeh / Sparkles)</option>
            <option value="zoomAndParticles">زوم سينمائي + جزيئات ضوئية معاً</option>
          </select>
        </label>
      </section>

      {/* 2. Font & Question Box */}
      <section className="flex flex-col gap-3 border-t border-[var(--pline)] pt-5">
        <h2 className="text-sm font-bold text-[var(--ptxt)]">2. الخط ومربع السؤال</h2>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">نوع الخط العربي</span>
            <select
              value={template.fontFamily}
              onChange={(e) =>
                patch({ fontFamily: e.target.value as TemplateSettings['fontFamily'] })
              }
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="Cairo">خط القاهرة (Cairo)</option>
              <option value="Tajawal">خط تجوال (Tajawal)</option>
              <option value="Amiri">خط أميري الكلاسيكي (Amiri)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">حركة دخول السؤال</span>
            <select
              value={template.questionAnim}
              onChange={(e) => patch({ questionAnim: e.target.value as AnimationStyle })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              {ANIM_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>موضع السؤال (عمودياً)</span>
              <span className="font-mono-nums">{template.questionY}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={55}
              step={1}
              value={template.questionY}
              onChange={(e) => patch({ questionY: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>حجم خط السؤال</span>
              <span className="font-mono-nums">{template.questionFontSize}px</span>
            </div>
            <input
              type="range"
              min={36}
              max={84}
              step={2}
              value={template.questionFontSize}
              onChange={(e) => patch({ questionFontSize: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>عرض مربع السؤال</span>
              <span className="font-mono-nums">{Math.round(template.questionWidth)}%</span>
            </div>
            <input
              type="range"
              min={45}
              max={96}
              step={1}
              value={template.questionWidth}
              onChange={(e) => patch({ questionWidth: parseFloat(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>استدارة زوايا السؤال</span>
              <span className="font-mono-nums">{template.questionBorderRadius}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={70}
              step={2}
              value={template.questionBorderRadius}
              onChange={(e) => patch({ questionBorderRadius: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>شفافية صندوق السؤال</span>
              <span className="font-mono-nums">{Math.round(template.questionBoxOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={template.questionBoxOpacity}
              onChange={(e) => patch({ questionBoxOpacity: parseFloat(e.target.value) })}
            />
          </label>

          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--pline)]">
            <span className="text-xs text-[var(--ptxt)]">النص / الصندوق / الحد</span>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={template.questionTextColor}
                onChange={(e) => patch({ questionTextColor: e.target.value })}
                title="لون نص السؤال"
                className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
              />
              <input
                type="color"
                value={template.questionBoxColor}
                onChange={(e) => patch({ questionBoxColor: e.target.value })}
                title="لون صندوق السؤال"
                className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
              />
              <input
                type="color"
                value={template.questionBorderColor}
                onChange={(e) => patch({ questionBorderColor: e.target.value })}
                title="لون حد السؤال"
                className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={template.enhanceAppearance !== false}
              onChange={(e) => patch({ enhanceAppearance: e.target.checked })}
              className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
            />
            <span className="text-xs font-bold text-[#00B050] dark:text-[#6ee7b7]">
              تحسين ظهور السؤال والخيارات (تباين + إطار مضيء + تدرج احترافي)
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={template.boxGloss}
                onChange={(e) => patch({ boxGloss: e.target.checked })}
                className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
              />
              <span className="text-xs text-[var(--ptxt)]">لمعان خفيف أعلى الصناديق</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={template.showBadge}
                onChange={(e) => patch({ showBadge: e.target.checked })}
                className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
              />
              <span className="text-xs text-[var(--ptxt)]">إظهار الشارة العلوية</span>
            </label>
          </div>
        </div>
      </section>

      {/* 2B. Box Shapes, Depth, Borders & Zoom/Scale */}
      <section className="flex flex-col gap-3 border-t border-[var(--pline)] pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-[var(--ptxt)]">
            2ب. شكل الصناديق، التجويف، الحواف، والتكبير
          </h2>
          {Math.abs((template.globalScale ?? 1) - 1) > 0.01 && (
            <button
              type="button"
              onClick={() => patch({ globalScale: 1, timerScale: 1, badgeScale: 1 })}
              className="text-[11px] font-bold text-[#00B050] hover:underline cursor-pointer"
            >
              إعادة الحجم 100%
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">شكل وعمق الصندوق</span>
            <select
              value={template.boxStyle || 'flat'}
              onChange={(e) => patch({ boxStyle: e.target.value as BoxShapeStyle })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="flat">مسطح كلاسيكي (الأصلي)</option>
              <option value="bevel3d">بارز ثلاثي الأبعاد (3D)</option>
              <option value="inset">مجوف للداخل (Inset)</option>
              <option value="glass">زجاجي شفاف (Glass)</option>
              <option value="neon">نيون متوهج (Neon)</option>
              <option value="millionaireHex">سداسي من سيربح المليون 💎</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">تحديد الحواف والإطار</span>
            <select
              value={template.borderStyle || 'solid'}
              onChange={(e) => patch({ borderStyle: e.target.value as BoxBorderStyle })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="solid">حد عادي نظيف</option>
              <option value="double">إطار مزدوج (Double)</option>
              <option value="gradientGold">إطار ذهبي متدرج ✨</option>
              <option value="gradientNeon">إطار نيون متدرج ⚡</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>تكبير/تصغير المحتوى (Zoom)</span>
              <span className="font-mono-nums">{Math.round((template.globalScale ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.75}
              max={1.25}
              step={0.02}
              value={template.globalScale ?? 1}
              onChange={(e) => patch({ globalScale: parseFloat(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>حجم المؤقت</span>
              <span className="font-mono-nums">{Math.round((template.timerScale ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.7}
              max={1.4}
              step={0.05}
              value={template.timerScale ?? 1}
              onChange={(e) => patch({ timerScale: parseFloat(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>قوة الظل</span>
              <span className="font-mono-nums">
                {Math.round((template.shadowIntensity ?? 1) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={template.shadowIntensity ?? 1}
              onChange={(e) => patch({ shadowIntensity: parseFloat(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>توهج الحواف</span>
              <span className="font-mono-nums">
                {Math.round((template.glowIntensity ?? 0) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={template.glowIntensity ?? 0}
              onChange={(e) => patch({ glowIntensity: parseFloat(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>سماكة حواف الصناديق</span>
              <span className="font-mono-nums">{template.questionBorderWidth}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={template.questionBorderWidth}
              onChange={(e) => {
                const w = parseInt(e.target.value, 10);
                patch({ questionBorderWidth: w, optionBorderWidth: w });
              }}
            />
          </label>

          {template.showBadge && (
            <label className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-[var(--ptxt)]">
                <span>حجم الشارة العلوية</span>
                <span className="font-mono-nums">
                  {Math.round((template.badgeScale ?? 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0.7}
                max={1.4}
                step={0.05}
                value={template.badgeScale ?? 1}
                onChange={(e) => patch({ badgeScale: parseFloat(e.target.value) })}
              />
            </label>
          )}
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--pmuted)]">حركة الانتقال بين الشرائح (Slide Transition)</span>
          <select
            value={template.slideTransition || 'fade'}
            onChange={(e) =>
              patch({ slideTransition: e.target.value as SlideTransitionStyle })
            }
            className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
          >
            <option value="none">قطع مباشر (بدون انتقال)</option>
            <option value="fade">تلاشي ناعم (Fade)</option>
            <option value="slideLeft">انزلاق سريع لليسار</option>
            <option value="slideRight">انزلاق سريع لليمين</option>
            <option value="zoomFade">زوم وتلاشي سينمائي (Zoom)</option>
            <option value="wipeGold">مسحة ضوئية ذهبية (TV Wipe) ✨</option>
          </select>
        </label>

        {/* Millionaire Prize Ladder Config */}
        <div className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--pline)] flex flex-col gap-2.5">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#EDD6A2]">
              <Crown className="w-4 h-4 text-[#d4a73a]" />
              <span>سلم الجوائز وتقدم الأموال (من سيربح المليون)</span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(template.showPrizeLadder)}
              onChange={(e) => patch({ showPrizeLadder: e.target.checked })}
              className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
            />
          </label>

          {template.showPrizeLadder && (
            <div className="flex flex-col gap-2 pt-1 border-t border-[var(--pline)]">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--pmuted)]">نمط عرض السلم</span>
                  <select
                    value={template.prizeLadderStyle || 'topStrip'}
                    onChange={(e) =>
                      patch({ prizeLadderStyle: e.target.value as PrizeLadderStyle })
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
                  >
                    <option value="topStrip">شريط علوي (مناسب للشورتس)</option>
                    <option value="sideColumn">عمود جانبي (مثالي لـ 16:9)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--pmuted)]">عنوان السلم</span>
                  <input
                    type="text"
                    value={template.prizeLadderTitle ?? 'الجائزة'}
                    onChange={(e) => patch({ prizeLadderTitle: e.target.value })}
                    placeholder="الجائزة"
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--pmuted)]">
                    مبالغ الجوائز (مفصولة بفاصلة ،)
                  </span>
                  <button
                    type="button"
                    onClick={() => patch({ prizeLadderAmounts: [...DEFAULT_PRIZE_LADDER] })}
                    className="text-[10px] font-bold text-[#00B050] hover:underline cursor-pointer"
                  >
                    استعادة سلم المليون
                  </button>
                </div>
                <input
                  type="text"
                  dir="ltr"
                  value={(template.prizeLadderAmounts || DEFAULT_PRIZE_LADDER).join(', ')}
                  onChange={(e) =>
                    patch({
                      prizeLadderAmounts: e.target.value
                        .split(/[،,]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="100$, 500$, 1000$, 1,000,000$"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)] text-xs font-mono-nums text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
                />
              </label>
            </div>
          )}
        </div>
      </section>

      {/* 3. Four Options Layout & Styling */}
      <section className="flex flex-col gap-3 border-t border-[var(--pline)] pt-5">
        <h2 className="text-sm font-bold text-[var(--ptxt)]">3. تخطيط الخيارات وحرية العرض</h2>

        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">شكل الترتيب</span>
            <select
              value={template.optionsLayout}
              onChange={(e) => patch({ optionsLayout: e.target.value as OptionLayoutMode })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="channel2x2">شبكة القناة (حول المؤقت)</option>
              <option value="grid2x2">شبكة 2×2 قياسية</option>
              <option value="vertical">قائمة عمودية</option>
            </select>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">ترقيم الخيارات</span>
            <select
              value={template.optionLabelStyle}
              onChange={(e) =>
                patch({ optionLabelStyle: e.target.value as OptionLabelStyle })
              }
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="none">بدون ترقيم (ستايل القناة)</option>
              <option value="arabic">أ · ب · ج · د</option>
              <option value="numbers">1 · 2 · 3 · 4</option>
              <option value="english">A · B · C · D</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">طريقة ظهور الخيارات</span>
            <select
              value={template.optionsAppearMode || 'stagger'}
              onChange={(e) =>
                patch({ optionsAppearMode: e.target.value as OptionsAppearMode })
              }
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="stagger">تتابعي (خياراً بعد خيار)</option>
              <option value="allAtOnce">دفعة واحدة (كلها معاً)</option>
              <option value="rowByRow">صفاً بصف (اثنان معاً)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">محاذاة نص الخيار</span>
            <select
              value={template.optionTextAlign || 'auto'}
              onChange={(e) =>
                patch({ optionTextAlign: e.target.value as OptionTextAlign })
              }
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="auto">تلقائي حسب القالب</option>
              <option value="center">توسيط داخل الصندوق</option>
              <option value="right">محاذاة لليمين</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">حركة دخول الخيارات</span>
            <select
              value={template.optionAnim}
              onChange={(e) => patch({ optionAnim: e.target.value as AnimationStyle })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              {ANIM_OPTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">اتجاه الأعمدة (في 2×2)</span>
            <select
              value={template.optionsRtlColumns !== false ? 'rtl' : 'ltr'}
              onChange={(e) => patch({ optionsRtlColumns: e.target.value === 'rtl' })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="rtl">من اليمين لليسار (أ يمين · ب يسار)</option>
              <option value="ltr">من اليسار لليمين (أ يسار · ب يمين)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>بداية الخيارات</span>
              <span className="font-mono-nums">{template.optionsStartY}%</span>
            </div>
            <input
              type="range"
              min={25}
              max={75}
              step={0.5}
              value={template.optionsStartY}
              onChange={(e) => patch({ optionsStartY: parseFloat(e.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>عرض منطقة الخيارات</span>
              <span className="font-mono-nums">{Math.round(template.optionsWidth)}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={2}
              value={template.optionsWidth}
              onChange={(e) => patch({ optionsWidth: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>المسافة بين الخيارات</span>
              <span className="font-mono-nums">{template.optionsGap}px</span>
            </div>
            <input
              type="range"
              min={6}
              max={64}
              step={2}
              value={template.optionsGap}
              onChange={(e) => patch({ optionsGap: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>استدارة حواف الخيار</span>
              <span className="font-mono-nums">{template.optionBorderRadius}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={64}
              step={2}
              value={template.optionBorderRadius}
              onChange={(e) => patch({ optionBorderRadius: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>حجم خط الخيار</span>
              <span className="font-mono-nums">{template.optionFontSize}px</span>
            </div>
            <input
              type="range"
              min={26}
              max={60}
              step={2}
              value={template.optionFontSize}
              onChange={(e) => patch({ optionFontSize: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>ارتفاع الخيار</span>
              <span className="font-mono-nums">{template.optionHeight}px</span>
            </div>
            <input
              type="range"
              min={80}
              max={170}
              step={4}
              value={template.optionHeight}
              onChange={(e) => patch({ optionHeight: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>شفافية الخيار</span>
              <span className="font-mono-nums">{Math.round(template.optionBoxOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={template.optionBoxOpacity}
              onChange={(e) => patch({ optionBoxOpacity: parseFloat(e.target.value) })}
            />
          </label>

          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--pline)]">
            <span className="text-xs text-[var(--ptxt)]">النص / الصندوق / الحد</span>
            <div className="flex items-center gap-1">
              <input
                type="color"
                value={template.optionTextColor}
                onChange={(e) => patch({ optionTextColor: e.target.value })}
                title="لون نص الخيار"
                className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
              />
              <input
                type="color"
                value={template.optionBoxColor}
                onChange={(e) => patch({ optionBoxColor: e.target.value })}
                title="لون صندوق الخيار"
                className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
              />
              <input
                type="color"
                value={template.optionBorderColor}
                onChange={(e) => patch({ optionBorderColor: e.target.value })}
                title="لون حدود الخيار"
                className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 4. Timer, Answer Reveal & End Card */}
      <section className="flex flex-col gap-3 border-t border-[var(--pline)] pt-5">
        <h2 className="text-sm font-bold text-[var(--ptxt)]">4. المؤقت، كشف الجواب، والنهاية</h2>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">شكل العد التنازلي</span>
            <select
              value={template.timerStyle}
              onChange={(e) => patch({ timerStyle: e.target.value as TimerStyle })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="channelBox">مربع القناة الأوسط (5ث فيديو/رقم)</option>
              <option value="circle">دائرة عد تنازلي</option>
              <option value="bar">شريط تقدم + ثواني</option>
              <option value="digits">أرقام كبيرة</option>
              <option value="none">بدون مؤقت</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">أسلوب كشف الحل</span>
            <select
              value={template.revealStyle}
              onChange={(e) => patch({ revealStyle: e.target.value as RevealStyle })}
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="redWrongGreenCorrect">3 حمر للخاطئة + الصحيح أخضر</option>
              <option value="dimOthers">تعتيم الخاطئة + تكبير الصحيح</option>
              <option value="scaleCheck">تكبير + علامة صح</option>
              <option value="highlightGlow">تلوين وتوهج فقط</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>موقع المؤقت عمودياً</span>
              <span className="font-mono-nums">{template.timerY}%</span>
            </div>
            <input
              type="range"
              min={15}
              max={92}
              step={0.5}
              value={template.timerY}
              onChange={(e) => patch({ timerY: parseFloat(e.target.value) })}
            />
          </label>

          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--pline)]">
            <span className="text-xs text-[var(--ptxt)]">الصحيح / الخطأ / العداد</span>
            <div className="flex items-center gap-1.5">
              <input
                type="color"
                value={template.correctColor}
                onChange={(e) => patch({ correctColor: e.target.value })}
                title="لون الإجابة الصحيحة"
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
              {template.revealStyle === 'redWrongGreenCorrect' && (
                <input
                  type="color"
                  value={template.wrongColor || '#DC2626'}
                  onChange={(e) => patch({ wrongColor: e.target.value })}
                  title="لون الخيارات الخاطئة (أحمر)"
                  className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                />
              )}
              {!template.timerMatchBackground && (
                <input
                  type="color"
                  value={template.timerBgColor || '#F2E3BA'}
                  onChange={(e) => patch({ timerBgColor: e.target.value })}
                  title="لون خلفية العداد"
                  className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                />
              )}
              <input
                type="color"
                value={template.timerColor}
                onChange={(e) => patch({ timerColor: e.target.value })}
                title="لون أرقام العداد"
                className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={template.timerMatchBackground !== false}
            onChange={(e) => patch({ timerMatchBackground: e.target.checked })}
            className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
          />
          <span className="text-xs text-[var(--ptxt)]">
            جعل العداد بنفس لون الخلفية تلقائياً
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={template.useTimerVideo}
            onChange={(e) => patch({ useTimerVideo: e.target.checked })}
            className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
          />
          <span className="text-xs text-[var(--ptxt)]">
            تفعيل فيديو العداد الأصلي المدمج (عند ضبط المؤقت على 5 ثوانٍ)
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(template.revealConfetti)}
            onChange={(e) => patch({ revealConfetti: e.target.checked })}
            className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
          />
          <span className="text-xs text-[var(--ptxt)]">
            إطلاق قصاصات احتفالية عند كشف الإجابة الصحيحة 🎉
          </span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(template.highlightSpokenOption)}
            onChange={(e) => patch({ highlightSpokenOption: e.target.checked })}
            className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
          />
          <span className="text-xs text-[var(--ptxt)]">
            تمييز وتوهج كل خيار أثناء قراءته صوتياً ✨
          </span>
        </label>

        {/* Intro Hook Card Setting */}
        <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-[var(--surface)] border border-[var(--pline)]">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-xs font-bold text-[var(--ptxt)]">شريحة مقدمة سريعة (Hook) + الصوت</span>
            <input
              type="checkbox"
              checked={Boolean(template.showIntroHook)}
              onChange={(e) => patch({ showIntroHook: e.target.checked })}
              className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
            />
          </label>
          {template.showIntroHook && (
            <div className="flex flex-col gap-2.5 pt-1 border-t border-[var(--pline)]">
              <input
                type="text"
                value={template.introHookText ?? 'اختبر معلوماتك الآن!'}
                onChange={(e) => patch({ introHookText: e.target.value })}
                placeholder="اختبر معلوماتك الآن!"
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <div className="flex justify-between text-[11px] text-[var(--pmuted)]">
                    <span>مدة المقدمة</span>
                    <span className="font-mono-nums">{(template.introHookDuration ?? 1.2).toFixed(1)} ث</span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={6.0}
                    step={0.1}
                    value={template.introHookDuration ?? 1.2}
                    onChange={(e) => patch({ introHookDuration: parseFloat(e.target.value) })}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-[var(--pmuted)]">مؤثر دخول الهوك (SFX)</span>
                  <select
                    value={template.introHookSfx ?? 'whoosh'}
                    onChange={(e) => patch({ introHookSfx: e.target.value as BuiltInSfxId })}
                    className="px-2.5 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)] text-[11px] text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
                  >
                    {BUILTIN_SFX_OPTIONS.map((sfx) => (
                      <option key={sfx.id} value={sfx.id}>
                        {sfx.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Hook Voiceover Controls: AI TTS + Mic Record + File Upload */}
              <div className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[var(--ptxt)]">
                    صوت المقدمة (الهوك)
                  </span>
                  {template.introHookAudio?.duration ? (
                    <span className="text-[10px] font-mono-nums text-[#00B050] dark:text-[#6ee7b7]">
                      {template.introHookAudio.fileName} ({template.introHookAudio.duration.toFixed(1)}ث)
                    </span>
                  ) : (
                    <span className="text-[10px] text-[var(--pmuted)]">
                      بدون تعليق صوتي (يُسمع المؤثر فقط)
                    </span>
                  )}
                </div>

                <input
                  ref={hookAudioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => void handleUploadHookAudio(e)}
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isHookVoicing}
                    onClick={() => void handleGenerateHookAiVoice()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#00B050] hover:bg-[#00c85b] disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
                  >
                    {isHookVoicing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isHookVoicing ? 'جارٍ التوليد...' : 'توليد صوت للهوك'}</span>
                  </button>

                  <MicRecordButton
                    compact
                    fileNameBase="hook-voice"
                    onError={(msg) => setHookAudioError(msg)}
                    onRecorded={(clip) => {
                      setHookAudioError('');
                      patch({ introHookAudio: clip });
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => hookAudioInputRef.current?.click()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--surface)] hover:border-[var(--gold)] border border-[var(--pline)] text-[11px] font-semibold text-[var(--ptxt)] cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف صوت</span>
                  </button>

                  {template.introHookAudio?.dataUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (template.introHookAudio) {
                            void soundEngine.playClip(template.introHookAudio, 1);
                          }
                        }}
                        title="تشغيل صوت المقدمة"
                        className="p-1.5 rounded-lg bg-[var(--surface)] hover:border-[#00B050] border border-[var(--pline)] text-[#00B050] cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => patch({ introHookAudio: undefined })}
                        title="حذف صوت المقدمة"
                        className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>

                {hookAudioError && (
                  <p className="text-[11px] text-rose-400">{hookAudioError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* End Screen Card Setting */}
        <div className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--surface)] border border-[var(--pline)]">
          <label className="flex items-center justify-between gap-2 cursor-pointer">
            <span className="text-xs font-bold text-[var(--ptxt)]">شاشة نهاية الفيديو</span>
            <input
              type="checkbox"
              checked={template.showEndCard}
              onChange={(e) => patch({ showEndCard: e.target.checked })}
              className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
            />
          </label>
          {template.showEndCard && (
            <>
              <input
                type="text"
                value={template.endCardText}
                onChange={(e) => patch({ endCardText: e.target.value })}
                placeholder="شكراً لمشاهدتكم"
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--panel)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
              />
              <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={Boolean(template.showEndSubscribeCta)}
                  onChange={(e) => patch({ showEndSubscribeCta: e.target.checked })}
                  className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
                />
                <span className="text-[11px] text-[var(--ptxt)]">
                  إظهار زر دعوة الاشتراك والتعليق أسفل شاشة النهاية
                </span>
              </label>
            </>
          )}
        </div>
      </section>

      {/* 5. Channel Brand Logo (Animated Watermark) & Slide Progress */}
      <section className="flex flex-col gap-3 border-t border-[var(--pline)] pt-5">
        <h2 className="text-sm font-bold text-[var(--ptxt)]">
          5. شعار القناة المتحرك والعلامة المائية
        </h2>

        <div className="flex items-center gap-2">
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => void handleUploadBrandLogo(e)}
            className="hidden"
          />

          {template.brandLogoDataUrl ? (
            <div className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--pline)]">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={template.brandLogoDataUrl}
                  alt="شعار القناة"
                  className="w-10 h-10 rounded-lg object-contain bg-black/30 p-1 border border-[var(--pline)] shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[var(--ptxt)] truncate">
                    {template.brandLogoName || 'شعار القناة'}
                  </div>
                  <div className="text-[10px] text-[#00B050] dark:text-[#6ee7b7]">
                    يظهر متحركاً في المعاينة والفيديو المصدّر
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--panel)] hover:border-[var(--gold)] border border-[var(--pline)] text-[11px] font-semibold cursor-pointer"
                >
                  تغيير
                </button>
                <button
                  type="button"
                  onClick={() =>
                    patch({ brandLogoDataUrl: undefined, brandLogoName: undefined })
                  }
                  title="إزالة الشعار"
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--surface)] hover:border-[var(--gold)] border border-dashed border-[var(--pline)] text-xs font-bold text-[var(--ptxt)] transition-colors cursor-pointer"
            >
              <ImagePlus className="w-4 h-4 text-[var(--gold)]" />
              <span>رفع شعار القناة (PNG شفاف / SVG / JPG)</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">حركة الشعار في الفيديو</span>
            <select
              value={template.brandLogoAnim || 'pulse'}
              onChange={(e) =>
                patch({ brandLogoAnim: e.target.value as BrandLogoAnimation })
              }
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="pulse">نبض احترافي (Pulse)</option>
              <option value="float">طفو ناعم (Float)</option>
              <option value="glow">توهج ذهبي متموج (Glow)</option>
              <option value="spin">دوران مستمر (Spin)</option>
              <option value="none">ثابت بدون حركة</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--pmuted)]">مكان الشعار</span>
            <select
              value={template.brandLogoPosition || 'topRight'}
              onChange={(e) =>
                patch({ brandLogoPosition: e.target.value as BrandCornerPosition })
              }
              className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] text-xs text-[var(--ptxt)] focus:border-[#00B050] focus:outline-none"
            >
              <option value="topRight">أعلى اليمين</option>
              <option value="topLeft">أعلى اليسار</option>
              <option value="bottomRight">أسفل اليمين</option>
              <option value="bottomLeft">أسفل اليسار</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>حجم الشعار</span>
              <span className="font-mono-nums">{template.brandLogoSize ?? 108}px</span>
            </div>
            <input
              type="range"
              min={56}
              max={220}
              step={4}
              value={template.brandLogoSize ?? 108}
              onChange={(e) => patch({ brandLogoSize: parseInt(e.target.value, 10) })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <div className="flex justify-between text-xs text-[var(--ptxt)]">
              <span>شفافية الشعار</span>
              <span className="font-mono-nums">
                {Math.round((template.brandOpacity ?? 0.92) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={template.brandOpacity ?? 0.92}
              onChange={(e) => patch({ brandOpacity: parseFloat(e.target.value) })}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--pmuted)]">معرف أو اسم القناة أسفل الشعار (اختياري)</span>
          <input
            type="text"
            value={template.brandHandleText || ''}
            onChange={(e) => patch({ brandHandleText: e.target.value })}
            placeholder="@اسم_قناتك"
            dir="ltr"
            className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--pline)] focus:border-[#00B050] focus:outline-none text-xs text-[var(--ptxt)] text-right placeholder:text-[var(--pmuted)]"
          />
        </label>

        <label className="flex items-center gap-2 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={Boolean(template.showProgressCounter)}
            onChange={(e) => patch({ showProgressCounter: e.target.checked })}
            className="w-4 h-4 accent-[#00B050] rounded cursor-pointer"
          />
          <span className="text-xs text-[var(--ptxt)]">
            إظهار عداد رقم السؤال وشريط التقدم أعلى الشاشة (سؤال 2 من 5)
          </span>
        </label>
      </section>
    </div>
  );
};
