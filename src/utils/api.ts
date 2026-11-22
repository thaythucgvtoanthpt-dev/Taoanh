export interface SafeFetchOptions extends RequestInit {
  retries?: number;
}

export class ApiConnectionError extends Error {
  public readonly needsReload: boolean;
  constructor(message: string, needsReload = false) {
    super(message);
    this.name = 'ApiConnectionError';
    this.needsReload = needsReload;
  }
}

function buildFallbackRelativeUrl(input: RequestInfo | URL): string | null {
  if (typeof input !== 'string' || !input.startsWith('/api/')) return null;
  try {
    const relativePath = input.slice(1); // "api/parse-exam"
    const resolved = new URL(relativePath, window.location.href).toString();
    const rootResolved = new URL(input, window.location.origin).toString();
    return resolved !== rootResolved ? resolved : null;
  } catch {
    return null;
  }
}

async function checkServerHealth(): Promise<boolean> {
  const candidates = ['/api/health'];
  const rel = buildFallbackRelativeUrl('/api/health');
  if (rel) candidates.push(rel);

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (text.includes('"ok":true')) return true;
    } catch {
      // try next candidate
    }
  }
  return false;
}

function tryParseJson(trimmed: string): unknown {
  if (!trimmed) return null;
  const looksLikeHtml =
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');
  if (looksLikeHtml) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export async function safeFetchJson<T>(
  input: RequestInfo | URL,
  init?: SafeFetchOptions
): Promise<T> {
  const maxRetries = init?.retries ?? 2;
  const fetchInit: RequestInit = {
    credentials: 'include',
    cache: 'no-store',
    ...init,
  };

  let targetInput: RequestInfo | URL = input;
  const fallbackRelativeUrl = buildFallbackRelativeUrl(input);

  let res: Response | null = null;
  let rawText = '';
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      res = await fetch(targetInput, fetchInit);
      rawText = await res.text();
      const trimmedCheck = rawText.trim();
      const parsedCheck = tryParseJson(trimmedCheck);

      // If Nginx returned its warmup HTML page while the server was starting, retry automatically
      const isWarmupPage =
        trimmedCheck.includes('Starting Server...') ||
        trimmedCheck.includes('warmup');

      // Non-JSON 404/502/503/504 usually comes from a cold-starting proxy or sub-path mismatch (never our Express JSON handler)
      const isTransientProxyError =
        !res.ok &&
        parsedCheck === null &&
        (res.status === 404 ||
          res.status === 502 ||
          res.status === 503 ||
          res.status === 504);

      if (res.status === 404 && parsedCheck === null && fallbackRelativeUrl && targetInput === input) {
        targetInput = fallbackRelativeUrl;
        continue;
      }

      if ((isWarmupPage || isTransientProxyError) && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1600 * (attempt + 1)));
        await checkServerHealth();
        continue;
      }

      lastNetworkError = null;
      break;
    } catch (err) {
      lastNetworkError = err;
      res = null;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
  }

  if (!res) {
    console.error('safeFetchJson network error:', lastNetworkError);
    const serverAlive = await checkServerHealth();
    if (serverAlive) {
      throw new ApiConnectionError(
        'Máy chủ vẫn hoạt động nhưng không thể gửi tệp này (có thể do tệp quá lớn hoặc đường truyền bị gián đoạn). Vui lòng thử tệp nhỏ hơn 10MB hoặc chuyển sang tab "Dán nội dung văn bản".',
        false
      );
    }
    throw new ApiConnectionError(
      'Không thể kết nối tới máy chủ (do phiên xem trước hết hạn hoặc máy chủ đang khởi động lại). Vui lòng bấm "Tải lại trang" rồi thử lại.',
      true
    );
  }

  const trimmed = rawText.trim();
  const looksLikeHtml =
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');
  const parsed = tryParseJson(trimmed);

  if (!res.ok) {
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error: unknown }).error === 'string'
    ) {
      throw new Error((parsed as { error: string }).error);
    }
    if (res.status === 404) {
      throw new ApiConnectionError(
        'Không tìm thấy dịch vụ xử lý AI trên phiên hiện tại (mã 404 — có thể máy chủ vừa khởi động lại hoặc phiên xem trước đã cũ). Vui lòng bấm "Tải lại trang" rồi thử lại.',
        true
      );
    }
    if (res.status === 413) {
      throw new Error(
        'Tệp đề thi quá lớn so với giới hạn máy chủ. Vui lòng nén tệp nhỏ hơn 15MB hoặc chia nhỏ đề.'
      );
    }
    if (res.status === 504 || res.status === 502 || res.status === 408) {
      throw new Error(
        'Máy chủ xử lý quá thời gian chờ. Vui lòng thử lại hoặc chia nhỏ tệp đề.'
      );
    }
    if (res.status === 503 || res.status === 429) {
      throw new Error(
        'Hệ thống AI đang bận tạm thời. Vui lòng chờ vài giây rồi thử lại.'
      );
    }
    throw new Error(
      `Máy chủ trả về lỗi (mã ${res.status}). Vui lòng thử lại sau giây lát.`
    );
  }

  if (looksLikeHtml || parsed === null) {
    if (trimmed.includes('Starting Server...')) {
      throw new ApiConnectionError(
        'Máy chủ đang khởi động lại hoặc AI quá tải tạm thời. Vui lòng chờ vài giây rồi thử lại.',
        false
      );
    }
    throw new ApiConnectionError(
      'Phiên làm việc đã hết hạn hoặc máy chủ vừa khởi động lại. Vui lòng bấm "Tải lại trang" rồi thử lại.',
      true
    );
  }

  return parsed as T;
}
