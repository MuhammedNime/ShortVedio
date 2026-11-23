import { isAndroidNativeApp } from '../utils/nativeDownload';

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  thumbnailUrl?: string;
}

export interface YouTubePlaylistItem {
  id: string;
  title: string;
}

export type YouTubePrivacyStatus = 'private' | 'unlisted' | 'public';

export interface YouTubeUploadOptions {
  blob: Blob;
  mimeType: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: YouTubePrivacyStatus;
  publishAtIso?: string;
  playlistId?: string;
  pinnedComment?: string;
  onProgress?: (percent: number, stageText: string) => void;
}

export interface YouTubeUploadResult {
  videoId: string;
  videoUrl: string;
  commentPosted: boolean;
  commentNote?: string;
  playlistAdded: boolean;
}

export interface YouTubeOAuthStatus {
  configured: boolean;
  hasClientId: boolean;
  callbackUrl: string;
  requiresBackendUrl?: boolean;
}

const ENV_MAP = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const BUILD_API_BASE = (ENV_MAP.VITE_API_BASE_URL || '').trim().replace(/\/$/, '');
const CLIENT_GOOGLE_ID = (ENV_MAP.VITE_GOOGLE_CLIENT_ID || '').trim();

function isStaticPagesRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host.endsWith('.github.io') || host === 'github.io';
}

function isServerlessStandaloneRuntime(): boolean {
  return (isAndroidNativeApp() || isStaticPagesRuntime()) && !BUILD_API_BASE;
}

// Strictly in-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let memoryAccessToken: string | null = null;
let memoryTokenExpiresAt = 0;
let memoryChannel: YouTubeChannelInfo | null = null;

function buildBackendUrl(path: string): string {
  return BUILD_API_BASE ? `${BUILD_API_BASE}${path}` : path;
}

export function getCachedYouTubeSession(): {
  connected: boolean;
  token: string | null;
  channel: YouTubeChannelInfo | null;
} {
  if (!memoryAccessToken || Date.now() >= memoryTokenExpiresAt - 15_000) {
    return { connected: false, token: null, channel: null };
  }
  return {
    connected: true,
    token: memoryAccessToken,
    channel: memoryChannel,
  };
}

export function disconnectYouTubeSession(): void {
  memoryAccessToken = null;
  memoryTokenExpiresAt = 0;
  memoryChannel = null;
}

export async function checkYouTubeOAuthStatus(): Promise<YouTubeOAuthStatus> {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const fallbackCallback = origin ? `${origin}/auth/youtube/callback` : '/auth/youtube/callback';

  if (isServerlessStandaloneRuntime()) {
    return {
      configured: false,
      hasClientId: Boolean(CLIENT_GOOGLE_ID),
      callbackUrl: fallbackCallback,
      requiresBackendUrl: true,
    };
  }

  try {
    const res = await fetch(
      buildBackendUrl(`/api/youtube/status?origin=${encodeURIComponent(origin)}`),
      { credentials: BUILD_API_BASE ? 'omit' : 'same-origin' }
    );
    if (!res.ok) {
      return {
        configured: false,
        hasClientId: Boolean(CLIENT_GOOGLE_ID),
        callbackUrl: fallbackCallback,
      };
    }
    const data = (await res.json()) as Partial<YouTubeOAuthStatus>;
    return {
      configured: Boolean(data.configured),
      hasClientId: Boolean(data.hasClientId || CLIENT_GOOGLE_ID),
      callbackUrl: data.callbackUrl || fallbackCallback,
    };
  } catch {
    return {
      configured: false,
      hasClientId: Boolean(CLIENT_GOOGLE_ID),
      callbackUrl: fallbackCallback,
    };
  }
}

export async function getYouTubeAuthUrl(): Promise<{ url: string; redirectUri: string }> {
  if (isServerlessStandaloneRuntime()) {
    throw new Error(
      'الرفع المباشر عبر OAuth يتطلب وجود خادم خلفي (VITE_API_BASE_URL). داخل APK يمكنك استخدام زر «مشاركة / حفظ» لإرسال الفيديو لتطبيق YouTube ولصق حزمة النشر.'
    );
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(
    buildBackendUrl(`/api/youtube/auth-url?origin=${encodeURIComponent(origin)}`),
    { credentials: BUILD_API_BASE ? 'omit' : 'same-origin' }
  );
  const data = (await res.json()) as {
    url?: string;
    redirectUri?: string;
    error?: string;
    callbackUrl?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error || 'تعذر تجهيز رابط تفويض YouTube.');
  }
  return {
    url: data.url,
    redirectUri: data.redirectUri || `${origin}/auth/youtube/callback`,
  };
}

export async function connectYouTubeWithPopup(): Promise<{
  accessToken: string;
  channel: YouTubeChannelInfo | null;
}> {
  const { url } = await getYouTubeAuthUrl();

  return await new Promise((resolve, reject) => {
    const popup = window.open(url, 'youtube_oauth_popup', 'width=540,height=700');
    if (!popup) {
      reject(
        new Error('قام المتصفح بحظر النافذة المنبثقة. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.')
      );
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
    };

    const onMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      const payload = event.data as {
        type?: string;
        accessToken?: string;
        expiresIn?: number;
        channel?: YouTubeChannelInfo | null;
        error?: string;
      };

      if (payload.type === 'YOUTUBE_OAUTH_ERROR') {
        settled = true;
        cleanup();
        reject(new Error(payload.error || 'تعذر ربط قناة YouTube.'));
        return;
      }

      if (payload.type === 'YOUTUBE_OAUTH_SUCCESS' && payload.accessToken) {
        settled = true;
        cleanup();
        memoryAccessToken = payload.accessToken;
        memoryTokenExpiresAt = Date.now() + (payload.expiresIn || 3500) * 1000;
        memoryChannel = payload.channel ?? null;
        if (!memoryChannel) {
          try {
            memoryChannel = await fetchYouTubeChannel(payload.accessToken);
          } catch {
            // optional
          }
        }
        resolve({
          accessToken: payload.accessToken,
          channel: memoryChannel,
        });
      }
    };

    const pollTimer = window.setInterval(() => {
      if (popup.closed && !settled) {
        settled = true;
        cleanup();
        reject(new Error('تم إغلاق نافذة تسجيل الدخول قبل إتمام الربط.'));
      }
    }, 500);

    const timeoutTimer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('انتهت مهلة انتظار تسجيل الدخول.'));
      }
    }, 180_000);

    window.addEventListener('message', onMessage);
  });
}

export async function fetchYouTubeChannel(accessToken: string): Promise<YouTubeChannelInfo | null> {
  const res = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: Array<{
      id?: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
    }>;
  };
  const first = data.items?.[0];
  if (!first?.id) return null;
  return {
    id: first.id,
    title: first.snippet?.title || 'قناتي على YouTube',
    thumbnailUrl: first.snippet?.thumbnails?.default?.url,
  };
}

export async function fetchMyYouTubePlaylists(
  accessToken: string
): Promise<YouTubePlaylistItem[]> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=25',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{ id?: string; snippet?: { title?: string } }>;
    };
    return (data.items || [])
      .filter((p) => p.id && p.snippet?.title)
      .map((p) => ({
        id: p.id!,
        title: p.snippet!.title!,
      }));
  } catch {
    return [];
  }
}

export async function uploadVideoToYouTube(
  options: YouTubeUploadOptions
): Promise<YouTubeUploadResult> {
  const session = getCachedYouTubeSession();
  if (!session.connected || !session.token) {
    throw new Error('انتهت جلسة تسجيل الدخول. أعد ربط قناة YouTube أولاً.');
  }
  const accessToken = session.token;
  const {
    blob,
    mimeType,
    title,
    description,
    tags,
    privacyStatus,
    publishAtIso,
    playlistId,
    pinnedComment,
    onProgress,
  } = options;

  onProgress?.(4, 'جارٍ تهيئة جلسة الرفع مع YouTube...');

  const statusPayload: Record<string, unknown> = {
    privacyStatus: publishAtIso ? 'private' : privacyStatus,
    selfDeclaredMadeForKids: false,
  };
  if (publishAtIso) {
    statusPayload.publishAt = publishAtIso;
  }

  const metadataBody = {
    snippet: {
      title: (title || 'تحدي الأسئلة #Shorts').trim().slice(0, 100),
      description: (description || '').trim().slice(0, 4900),
      tags: tags.slice(0, 20),
      categoryId: '27', // Education
      defaultLanguage: 'ar',
    },
    status: statusPayload,
  };

  const cleanMime = mimeType.split(';')[0].trim() || 'video/webm';

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(blob.size),
        'X-Upload-Content-Type': cleanMime,
      },
      body: JSON.stringify(metadataBody),
    }
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    let parsedMsg = 'تعذر بدء رفع الفيديو إلى YouTube.';
    try {
      const errJson = JSON.parse(errText) as { error?: { message?: string } };
      if (errJson?.error?.message) {
        parsedMsg = `YouTube API: ${errJson.error.message}`;
      }
    } catch {
      // keep fallback
    }
    throw new Error(parsedMsg);
  }

  const uploadUrl = initRes.headers.get('Location') || initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('لم يُرجع YouTube رابط الرفع القابل للاستكمال.');
  }

  const uploadedVideoId = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', cleanMime);

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        const pct = Math.min(90, Math.max(6, Math.round((ev.loaded / ev.total) * 86) + 4));
        onProgress?.(pct, `جارٍ رفع الفيديو (${Math.round((ev.loaded / ev.total) * 100)}%)...`);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const resJson = JSON.parse(xhr.responseText) as { id?: string };
          if (resJson.id) {
            resolve(resJson.id);
            return;
          }
        } catch {
          // fallthrough
        }
        reject(new Error('تم الرفع لكن تعذر قراءة معرّف الفيديو من استجابة YouTube.'));
      } else {
        reject(new Error(`فشل رفع ملف الفيديو (رمز ${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('انقطع الاتصال أثناء رفع الفيديو إلى YouTube.'));
    };

    xhr.send(blob);
  });

  let playlistAdded = false;
  if (playlistId && playlistId.trim()) {
    onProgress?.(93, 'جارٍ إضافة الفيديو لقائمة التشغيل...');
    try {
      const plRes = await fetch(
        'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snippet: {
              playlistId: playlistId.trim(),
              resourceId: {
                kind: 'youtube#video',
                videoId: uploadedVideoId,
              },
            },
          }),
        }
      );
      playlistAdded = plRes.ok;
    } catch {
      playlistAdded = false;
    }
  }

  let commentPosted = false;
  let commentNote: string | undefined;
  const cleanComment = (pinnedComment || '').trim();
  if (cleanComment) {
    if (privacyStatus === 'private' || publishAtIso) {
      commentNote =
        'ملاحظة: يوتيوب يمنع إضافة التعليقات على الفيديوهات الخاصة/المجدولة؛ انسخ التعليق وأضفه بعد التبديل لعلني أو غير مدرج.';
    } else {
      onProgress?.(96, 'جارٍ نشر التعليق التفاعلي تحت الفيديو...');
      try {
        const cmRes = await fetch(
          'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              snippet: {
                videoId: uploadedVideoId,
                topLevelComment: {
                  snippet: {
                    textOriginal: cleanComment,
                  },
                },
              },
            }),
          }
        );
        if (cmRes.ok) {
          commentPosted = true;
          commentNote =
            'تم نشر التعليق تلقائياً! لتثبيته في الأعلى (Pin)، افتح YouTube Studio واضغط تثبيت لأن API يوتيوب لا يتيح التثبيت البرمجي.';
        } else {
          commentNote =
            'تم رفع الفيديو بنجاح، لكن تعذر نشر التعليق التلقائي (ربما الفيديو ما زال قيد المعالجة الأولية في يوتيوب).';
        }
      } catch {
        commentNote = 'تم رفع الفيديو بنجاح، ويمكنك لصق التعليق يدوياً من هنا.';
      }
    }
  }

  onProgress?.(100, 'اكتمل النشر على YouTube!');

  return {
    videoId: uploadedVideoId,
    videoUrl: `https://youtu.be/${uploadedVideoId}`,
    commentPosted,
    commentNote,
    playlistAdded,
  };
}
