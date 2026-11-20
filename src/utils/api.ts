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

async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const text = await res.text();
    return text.includes('"ok":true');
  } catch {
    return false;
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

  let res: Response | null = null;
  let rawText = '';
  let lastNetworkError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      res = await fetch(input, fetchInit);
      rawText = await res.text();
      const trimmedCheck = rawText.trim();

      // If Nginx returned its warmup HTML page while the server was starting, retry automatically
      const isWarmupPage =
        trimmedCheck.includes('Starting Server...') ||
        trimmedCheck.includes('warmup');

      if (isWarmupPage && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1800 * (attempt + 1)));
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

  let parsed: unknown = null;
  const looksLikeHtml =
    trimmed.startsWith('<!') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');

  if (!looksLikeHtml && trimmed.length > 0) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    if (
      parsed &&
      typeof parsed === 'object' &&
      'error' in parsed &&
      typeof (parsed as { error: unknown }).error === 'string'
    ) {
      throw new Error((parsed as { error: string }).error);
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
