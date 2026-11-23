import { useCallback, useEffect, useState } from 'react';
import {
  Film,
  FolderOpen,
  Layers,
  Lock,
  Moon,
  Music,
  Palette,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react';
import { AiGeneratorPanel } from './components/AiGeneratorPanel';
import { AppLockScreen, ManageLockModal } from './components/AppLockGate';
import { AudioTimingPanel } from './components/AudioTimingPanel';
import { BulkImportPanel } from './components/BulkImportPanel';
import { ExportVideoModal } from './components/ExportVideoModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ProjectsModal } from './components/ProjectsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { ShortsPreviewStage } from './components/ShortsPreviewStage';
import { SlidesEditorPanel } from './components/SlidesEditorPanel';
import { TemplateDesignPanel } from './components/TemplateDesignPanel';
import {
  loadProjectFromStore,
  normalizeLoadedProject,
  saveProjectToStore,
} from './storage/projectStore';
import {
  QuestionSlide,
  QuizProject,
  STUDIO_THEME_ORDER,
  applyChannelThemePreset,
  applyStudioThemePreset,
  createDefaultProject,
  getCanvasDimensions,
  getTotalDuration,
} from './types/quiz';
import { isAppLockEnabled } from './utils/appLock';
import { setRootBackHandler } from './utils/androidBack';

type StudioTab = 'slides' | 'ai' | 'template' | 'audio' | 'import';
type MobileView = 'editor' | 'preview';

export default function App() {
  const [project, setProject] = useState<QuizProject>(() => createDefaultProject());
  const [isLoaded, setIsLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<StudioTab>('slides');
  const [tabHistory, setTabHistory] = useState<StudioTab[]>([]);
  const [mobileView, setMobileView] = useState<MobileView>('editor');
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [studioDark, setStudioDark] = useState(true);
  const [isLocked, setIsLocked] = useState(() => isAppLockEnabled());
  const [isLockModalOpen, setIsLockModalOpen] = useState(false);
  const [isProjectsOpen, setIsProjectsOpen] = useState(false);

  const navigateToTab = useCallback((nextTab: StudioTab) => {
    setActiveTab((prev) => {
      if (prev !== nextTab) {
        setTabHistory((hist) => [...hist.slice(-10), prev]);
      }
      return nextTab;
    });
  }, []);

  useEffect(() => {
    return setRootBackHandler(() => {
      if (isExportOpen) {
        setIsExportOpen(false);
        return true;
      }
      if (isProjectsOpen) {
        setIsProjectsOpen(false);
        return true;
      }
      if (isLockModalOpen) {
        setIsLockModalOpen(false);
        return true;
      }
      if (mobileView === 'preview') {
        setMobileView('editor');
        return true;
      }
      if (tabHistory.length > 0) {
        const prevTab = tabHistory[tabHistory.length - 1];
        setTabHistory((hist) => hist.slice(0, -1));
        setActiveTab(prevTab);
        return true;
      }
      if (activeTab !== 'slides') {
        setActiveTab('slides');
        return true;
      }
      return false;
    });
  }, [isExportOpen, isProjectsOpen, isLockModalOpen, mobileView, tabHistory, activeTab]);

  useEffect(() => {
    const root = document.documentElement;
    if (studioDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [studioDark]);

  useEffect(() => {
    void loadProjectFromStore().then((loaded) => {
      setProject(loaded);
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    const timer = setTimeout(() => {
      void saveProjectToStore(project);
    }, 450);
    return () => clearTimeout(timer);
  }, [project, isLoaded]);

  const totalDuration = getTotalDuration(
    project.slides,
    project.timing,
    project.audio,
    project.template
  );
  const canvasDims = getCanvasDimensions(project.template);

  const handleUpdateSlide = useCallback((idx: number, updated: QuestionSlide) => {
    setProject((prev) => {
      const nextSlides = [...prev.slides];
      nextSlides[idx] = updated;
      return { ...prev, slides: nextSlides };
    });
  }, []);

  const handleAddSlide = useCallback(() => {
    setProject((prev) => {
      const nextNum = prev.slides.length + 1;
      const newSlide: QuestionSlide = {
        id: `slide-${Date.now()}`,
        badgeText: `السؤال ${nextNum}`,
        question: 'اكتب نص السؤال الجديد هنا',
        options: ['الجواب الصحيح', 'خيار خاطئ 1', 'خيار خاطئ 2', 'خيار خاطئ 3'],
        correctIndex: 0,
        explanationText: '',
      };
      const nextSlides = [...prev.slides, newSlide];
      setActiveSlideIndex(nextSlides.length - 1);
      return { ...prev, slides: nextSlides };
    });
  }, []);

  const handleDuplicateSlide = useCallback((idx: number) => {
    setProject((prev) => {
      const source = prev.slides[idx];
      if (!source) return prev;
      const copy: QuestionSlide = {
        ...source,
        id: `slide-${Date.now()}`,
        options: [...source.options] as [string, string, string, string],
      };
      const nextSlides = [
        ...prev.slides.slice(0, idx + 1),
        copy,
        ...prev.slides.slice(idx + 1),
      ];
      setActiveSlideIndex(idx + 1);
      return { ...prev, slides: nextSlides };
    });
  }, []);

  const handleDeleteSlide = useCallback((idx: number) => {
    setProject((prev) => {
      if (prev.slides.length <= 1) return prev;
      const nextSlides = prev.slides.filter((_, i) => i !== idx);
      setActiveSlideIndex((curr) => Math.min(curr, nextSlides.length - 1));
      return { ...prev, slides: nextSlides };
    });
  }, []);

  const handleCycleChannelTheme = useCallback(() => {
    setProject((prev) => {
      const currentIdx = STUDIO_THEME_ORDER.indexOf(prev.template.presetId);
      const nextId =
        STUDIO_THEME_ORDER[(currentIdx + 1) % STUDIO_THEME_ORDER.length];
      return {
        ...prev,
        template: applyStudioThemePreset(prev.template, nextId),
      };
    });
  }, []);

  const handleToggleAspectRatio = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      template: {
        ...prev.template,
        aspectRatio: prev.template.aspectRatio === '16:9' ? '9:16' : '16:9',
      },
    }));
  }, []);

  const navTabs: { id: StudioTab; label: string }[] = [
    { id: 'slides', label: 'الأسئلة' },
    { id: 'ai', label: 'توليد ذكي' },
    { id: 'template', label: 'القالب والتصميم' },
    { id: 'audio', label: 'الأصوات والتوقيت' },
    { id: 'import', label: 'استيراد سريع' },
  ];

  if (isLocked) {
    return <AppLockScreen onUnlock={() => setIsLocked(false)} />;
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[var(--page)] text-[var(--ptxt)] overflow-x-hidden lg:overflow-hidden">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-4 lg:gap-8 px-4 lg:px-6 h-16 border-b border-[var(--pline)] bg-[var(--panel)] shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => e.preventDefault()}
          className="font-display text-base lg:text-lg font-extrabold tracking-tight text-[var(--ptxt)] whitespace-nowrap shrink-0"
        >
          استوديو شورتس الأسئلة
        </a>

        {/* Zone 2: 5 single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-[var(--pmuted)]">
          {navTabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigateToTab(tab.id)}
                className={`relative py-5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active ? 'text-[var(--ptxt)] font-bold' : 'hover:text-[var(--ptxt)]'
                }`}
              >
                {tab.label}
                {active && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-[#00B050] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary CTA */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#00B050] hover:bg-[#00c85b] text-white text-xs lg:text-sm font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Film className="w-4 h-4" />
            <span>تصدير الفيديو</span>
          </button>
        </div>
      </header>

      {/* Mobile View Switcher + Mobile Tab Strip */}
      <div className="lg:hidden flex flex-col border-b border-[var(--pline)] bg-[var(--panel)] shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-[var(--pline)]">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface)] border border-[var(--pline)] w-full">
            <button
              type="button"
              onClick={() => setMobileView('editor')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                mobileView === 'editor'
                  ? 'bg-[var(--panel)] text-[var(--ptxt)] border border-[var(--pline)]'
                  : 'text-[var(--pmuted)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>المحرر</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileView('preview')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                mobileView === 'preview'
                  ? 'bg-[#00B050] text-white'
                  : 'text-[var(--pmuted)]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>
                معاينة {project.template.aspectRatio === '16:9' ? '16:9' : '9:16'}
              </span>
            </button>
          </div>
        </div>

        {mobileView === 'editor' && (
          <div className="flex md:hidden items-center gap-1 overflow-x-auto px-3 py-2">
            {[
              { id: 'slides', label: 'الأسئلة', icon: Layers },
              { id: 'ai', label: 'توليد ذكي', icon: Sparkles },
              { id: 'template', label: 'القالب', icon: Palette },
              { id: 'audio', label: 'الأصوات', icon: Music },
              { id: 'import', label: 'استيراد', icon: Film },
            ].map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => navigateToTab(t.id as StudioTab)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[#00B050]/18 text-[#00B050] dark:text-[#6ee7b7] border border-[#00B050]/45'
                      : 'text-[var(--pmuted)] bg-[var(--surface)] border border-[var(--pline)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Studio Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[440px_1fr] min-h-0">
        {/* Right Column (RTL): Active Editor Panel */}
        <aside
          className={`${
            mobileView === 'editor' ? 'flex' : 'hidden lg:flex'
          } flex-col bg-[var(--panel)] border-l border-[var(--pline)] min-h-0`}
        >
          {/* Unboxed workspace metadata strip + lock + light/dark toggle */}
          <div className="flex items-center justify-between px-5 py-2.5 border-b border-[var(--pline)] text-xs text-[var(--pmuted)] shrink-0">
            <div className="flex items-center gap-2">
              <span>{project.slides.length} أسئلة</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-nums">
                {canvasDims.width}×{canvasDims.height}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-nums">{totalDuration.toFixed(1)} ث</span>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsProjectsOpen(true)}
                title="مكتبة المشاريع المحفوظة"
                className="flex items-center gap-1 text-[11px] font-bold text-[#00B050] dark:text-[#6ee7b7] hover:underline cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>المشاريع</span>
              </button>
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => setIsLockModalOpen(true)}
                title="قفل الخصوصية الشخصي (كلمة مرور التطبيق)"
                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--pmuted)] hover:text-[var(--ptxt)] cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-[#00B050]" />
                <span>القفل</span>
              </button>
              <button
                type="button"
                onClick={() => setStudioDark((d) => !d)}
                title={studioDark ? 'التبديل للوضع الفاتح الدافئ' : 'التبديل للوضع الداكن'}
                className="flex items-center gap-1 text-[11px] font-semibold text-[var(--pmuted)] hover:text-[var(--ptxt)] cursor-pointer"
              >
                {studioDark ? <Sun className="w-3.5 h-3.5 text-[var(--gold)]" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{studioDark ? 'فاتح' : 'داكن'}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {aiNotice && (
              <div className="mb-4 flex items-start justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/35 text-xs text-amber-300 leading-relaxed">
                <span>{aiNotice}</span>
                <button
                  type="button"
                  onClick={() => setAiNotice(null)}
                  className="text-amber-300 hover:text-white font-bold px-1 cursor-pointer shrink-0"
                  aria-label="إغلاق التنبيه"
                >
                  ×
                </button>
              </div>
            )}

            {activeTab === 'slides' && (
              <SlidesEditorPanel
                slides={project.slides}
                activeIndex={activeSlideIndex}
                aiVoiceName={project.preferredAiVoice ?? 'Kore'}
                onAiVoiceChange={(voice) =>
                  setProject((prev) => ({ ...prev, preferredAiVoice: voice }))
                }
                onSelectSlide={setActiveSlideIndex}
                onUpdateSlide={handleUpdateSlide}
                onAddSlide={handleAddSlide}
                onDuplicateSlide={handleDuplicateSlide}
                onDeleteSlide={handleDeleteSlide}
              />
            )}

            {activeTab === 'ai' && (
              <AiGeneratorPanel
                voiceName={project.preferredAiVoice ?? 'Kore'}
                onVoiceChange={(voice) =>
                  setProject((prev) => ({ ...prev, preferredAiVoice: voice }))
                }
                onInsertSlides={(newSlides, mode, enableAutoSync, warningMessage, applyMathTheme) => {
                  const targetIdx = mode === 'replace' ? 0 : project.slides.length;
                  setProject((prev) => {
                    const updatedSlides =
                      mode === 'replace' ? newSlides : [...prev.slides, ...newSlides];
                    return {
                      ...prev,
                      slides: updatedSlides,
                      template: applyMathTheme
                        ? applyChannelThemePreset(prev.template, 'channelMath')
                        : prev.template,
                      timing: enableAutoSync
                        ? { ...prev.timing, autoSyncWithAudio: true }
                        : prev.timing,
                    };
                  });
                  setAiNotice(warningMessage ?? null);
                  setActiveSlideIndex(targetIdx);
                  setActiveTab('slides');
                }}
              />
            )}

            {activeTab === 'template' && (
              <TemplateDesignPanel
                template={project.template}
                aiVoiceName={project.preferredAiVoice ?? 'Kore'}
                onChange={(nextTemplate) =>
                  setProject((prev) => ({ ...prev, template: nextTemplate }))
                }
              />
            )}

            {activeTab === 'audio' && (
              <AudioTimingPanel
                audio={project.audio}
                timing={project.timing}
                onAudioChange={(nextAudio) =>
                  setProject((prev) => ({ ...prev, audio: nextAudio }))
                }
                onTimingChange={(nextTiming) =>
                  setProject((prev) => ({ ...prev, timing: nextTiming }))
                }
              />
            )}

            {activeTab === 'import' && (
              <BulkImportPanel
                project={project}
                onReplaceSlides={(newSlides) => {
                  setProject((prev) => ({ ...prev, slides: newSlides }));
                  setActiveSlideIndex(0);
                }}
                onAppendSlides={(moreSlides) => {
                  setProject((prev) => ({
                    ...prev,
                    slides: [...prev.slides, ...moreSlides],
                  }));
                }}
                onImportFullProject={(loaded) => {
                  setProject(normalizeLoadedProject(loaded));
                  setActiveSlideIndex(0);
                }}
              />
            )}
          </div>
        </aside>

        {/* Left Column (RTL): Live Stage */}
        <section
          className={`${
            mobileView === 'preview' ? 'flex' : 'hidden lg:flex'
          } flex-col items-center justify-center bg-[var(--page)] min-h-0 overflow-hidden`}
        >
          <ShortsPreviewStage
            slides={project.slides}
            activeSlideIndex={activeSlideIndex}
            template={project.template}
            timing={project.timing}
            audio={project.audio}
            isExporting={isExportOpen}
            onToggleSafeGuides={() =>
              setProject((prev) => ({
                ...prev,
                template: {
                  ...prev.template,
                  showSafeGuides: !prev.template.showSafeGuides,
                },
              }))
            }
            onToggleAspectRatio={handleToggleAspectRatio}
            onCycleChannelTheme={handleCycleChannelTheme}
            onActiveSlideChange={setActiveSlideIndex}
          />
        </section>
      </main>

      {/* Video Export Modal */}
      <ExportVideoModal
        isOpen={isExportOpen}
        project={project}
        onClose={() => setIsExportOpen(false)}
      />

      {/* Multi-Project Library Modal */}
      <ProjectsModal
        isOpen={isProjectsOpen}
        currentProject={project}
        onClose={() => setIsProjectsOpen(false)}
        onSelectProject={(loaded) => {
          setProject(normalizeLoadedProject(loaded));
          setActiveSlideIndex(0);
          setAiNotice(null);
        }}
        onRenameCurrent={(name) =>
          setProject((prev) => ({ ...prev, name }))
        }
      />

      {/* Personal Passcode Lock Management Modal */}
      <ManageLockModal
        isOpen={isLockModalOpen}
        onClose={() => setIsLockModalOpen(false)}
        onLockNow={() => setIsLocked(true)}
      />

      <OfflineIndicator />
    </div>
  );
}
