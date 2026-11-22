import { soundEngine } from '../audio/soundEngine';
import { QuestionSlide, SlideAudioClip } from '../types/quiz';

export type AiVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';
export type AiVoiceMode = 'questionOnly' | 'questionAndAnswer' | 'full';

export const AI_VOICE_OPTIONS: { id: AiVoiceName; label: string }[] = [
  { id: 'Kore', label: 'كوري (واضح واحترافي)' },
  { id: 'Puck', label: 'باك (حماسي سريع)' },
  { id: 'Charon', label: 'شارون (عميق رصين)' },
  { id: 'Zephyr', label: 'زيفير (هادئ سلس)' },
  { id: 'Fenrir', label: 'فنرير (جهوري قوي)' },
];

export class AiApiError extends Error {
  public readonly status: number;
  public readonly quotaExhausted: boolean;

  constructor(message: string, status = 500, quotaExhausted = false) {
    super(message);
    this.name = 'AiApiError';
    this.status = status;
    this.quotaExhausted = quotaExhausted;
  }
}

async function parseJsonSafe<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 403) {
      throw new AiApiError(
        'تم رفض الاتصال بالخادم (خطأ 403). تأكد من فتح التطبيق من داخل AI Studio وتحديث الصفحة، أو مراجعة مفتاح API في Settings > Secrets.',
        403,
        false
      );
    }
    throw new AiApiError(
      res.ok
        ? 'استجابة غير صالحة من الخادم.'
        : `تعذر الاتصال بالخادم (رمز ${res.status}).`,
      res.status,
      false
    );
  }
}

const API_BASE = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');

function buildApiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

async function fetchAi(path: string, payload: unknown): Promise<Response> {
  try {
    return await fetch(buildApiUrl(path), {
      method: 'POST',
      credentials: API_BASE ? 'omit' : 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AiApiError(
      'تعذر الوصول إلى خادم الذكاء الاصطناعي. تأكد من الاتصال بالإنترنت، أو أضف أسئلتك يدوياً / عبر الاستيراد السريع.',
      0,
      false
    );
  }
}

export async function generateAiQuizSlides(
  topic: string,
  count: number,
  difficulty: string,
  contentType: 'general' | 'math' = 'general'
): Promise<QuestionSlide[]> {
  const res = await fetchAi('/api/ai/generate-quiz', {
    topic,
    count,
    difficulty,
    contentType,
  });

  const data = await parseJsonSafe<{
    slides?: QuestionSlide[];
    error?: string;
    quotaExhausted?: boolean;
  }>(res);
  if (!res.ok || !data.slides) {
    throw new AiApiError(
      data.error || 'تعذر توليد الأسئلة من الخادم.',
      res.status,
      Boolean(data.quotaExhausted)
    );
  }
  return data.slides;
}

export async function generateSingleTtsClip(
  text: string,
  voiceName: AiVoiceName,
  fileName: string
): Promise<SlideAudioClip> {
  const consistentStyle =
    'Clear, steady, articulate Modern Standard Arabic quiz presenter speaking at a consistent natural pace';
  return generateTtsClip(text, voiceName, fileName, consistentStyle);
}

export async function generateTtsClip(
  text: string,
  voiceName: AiVoiceName,
  fileName: string,
  style?: string
): Promise<SlideAudioClip> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchAi('/api/ai/tts', { text, voiceName, style });

      const data = await parseJsonSafe<{
        dataUrl?: string;
        error?: string;
        quotaExhausted?: boolean;
      }>(res);

      if (!res.ok || !data.dataUrl) {
        const errMsg = data.error || 'تعذر توليد الصوت بالذكاء الاصطناعي.';
        // Never retry daily quota exhaustion or auth errors
        if (data.quotaExhausted || res.status === 403 || res.status === 400) {
          throw new AiApiError(errMsg, res.status, Boolean(data.quotaExhausted));
        }
        if ((res.status === 429 || res.status >= 500) && attempt === 0) {
          await new Promise((r) => setTimeout(r, res.status === 429 ? 2000 : 800));
          continue;
        }
        throw new AiApiError(errMsg, res.status, false);
      }

      const duration = await soundEngine.getAudioDuration(data.dataUrl);
      return {
        fileName,
        dataUrl: data.dataUrl,
        duration: duration > 0 ? duration : 1.5,
      };
    } catch (err) {
      if (err instanceof AiApiError && (err.quotaExhausted || err.status === 403 || err.status === 400)) {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      break;
    }
  }

  throw lastError ?? new AiApiError('تعذر توليد الصوت بالذكاء الاصطناعي.', 500, false);
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface VoiceoverResult {
  slide: QuestionSlide;
  warning?: string;
  quotaExhausted?: boolean;
}

export async function generateSlideVoiceoverSafe(
  slide: QuestionSlide,
  voiceName: AiVoiceName,
  mode: AiVoiceMode,
  onStep?: (label: string) => void
): Promise<VoiceoverResult> {
  const voiceover = {
    question: slide.voiceover?.question,
    options: [...(slide.voiceover?.options ?? [undefined, undefined, undefined, undefined])] as [
      SlideAudioClip | undefined,
      SlideAudioClip | undefined,
      SlideAudioClip | undefined,
      SlideAudioClip | undefined
    ],
    answer: slide.voiceover?.answer,
  };

  const consistentStyle =
    'Clear, steady, articulate Modern Standard Arabic quiz presenter speaking at a consistent natural pace';

  try {
    onStep?.('جارٍ توليد صوت السؤال...');
    voiceover.question = await generateTtsClip(
      slide.question,
      voiceName,
      'ai-question.wav',
      consistentStyle
    );

    if (mode === 'full') {
      for (let i = 0; i < 4; i++) {
        await pause(280);
        onStep?.(`جارٍ توليد صوت الخيار ${i + 1} من 4...`);
        voiceover.options[i] = await generateTtsClip(
          slide.options[i],
          voiceName,
          `ai-option-${i + 1}.wav`,
          consistentStyle
        );
      }
    }

    if (mode === 'questionAndAnswer' || mode === 'full') {
      await pause(280);
      onStep?.('جارٍ توليد صوت الإجابة الصحيحة...');
      const correctOptText = slide.options[slide.correctIndex] || '';
      const ansText = `الإجابة الصحيحة هي: ${correctOptText}`;
      voiceover.answer = await generateTtsClip(
        ansText,
        voiceName,
        'ai-answer.wav',
        consistentStyle
      );
    }

    return {
      slide: { ...slide, voiceover },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'تعذر إكمال توليد الصوت.';
    const quotaExhausted = err instanceof AiApiError ? err.quotaExhausted : false;
    return {
      slide: { ...slide, voiceover },
      warning: message,
      quotaExhausted,
    };
  }
}
