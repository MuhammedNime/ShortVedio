import { TemplateSettings } from '../types/quiz';

const CUSTOM_PRESETS_KEY = 'shorts_quiz_custom_presets_v1';

export interface CustomTemplatePreset {
  id: string;
  name: string;
  createdAt: number;
  template: Partial<TemplateSettings>;
}

export function loadCustomPresets(): CustomTemplatePreset[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomTemplatePreset =>
        Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && item.template)
    );
  } catch {
    return [];
  }
}

export function saveCustomPreset(name: string, template: TemplateSettings): CustomTemplatePreset[] {
  const cleanName = name.trim() || `قالب مخصص ${new Date().toLocaleTimeString('ar-EG')}`;
  // Strip large binary dataUrls if not needed for logo, keeping customBg only if small
  const snapshot: Partial<TemplateSettings> = { ...template };
  delete snapshot.brandLogoDataUrl;
  delete snapshot.brandLogoName;
  if (snapshot.customBgDataUrl && snapshot.customBgDataUrl.length > 350_000) {
    delete snapshot.customBgDataUrl;
    delete snapshot.customBgName;
    if (snapshot.backgroundType === 'custom') {
      snapshot.backgroundType = 'preset';
    }
  }

  const nextItem: CustomTemplatePreset = {
    id: `custom-${Date.now()}`,
    name: cleanName,
    createdAt: Date.now(),
    template: snapshot,
  };

  const existing = loadCustomPresets();
  const nextList = [nextItem, ...existing].slice(0, 20);
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(nextList));
  } catch {
    // Fallback: drop customBgDataUrl if storage quota exceeded
    delete snapshot.customBgDataUrl;
    delete snapshot.customBgName;
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(nextList));
    } catch {
      // ignore
    }
  }
  return nextList;
}

export function deleteCustomPreset(id: string): CustomTemplatePreset[] {
  const existing = loadCustomPresets();
  const nextList = existing.filter((p) => p.id !== id);
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(nextList));
  } catch {
    // ignore
  }
  return nextList;
}
