import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx >= 0 && process.argv[portFlagIdx + 1]) {
    const cliPort = Number(process.argv[portFlagIdx + 1]);
    if (!Number.isNaN(cliPort) && cliPort > 0) return cliPort;
  }
  return Number(process.env.PORT || 3000);
}

const PORT = resolvePort();
const IS_PROD =
  process.env.NODE_ENV === 'production' ||
  (process.env.NODE_ENV !== 'development' &&
    fs.existsSync(path.resolve(__dirname, 'dist', 'index.html')));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Promise Rejection (caught safely):', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception (caught safely):', err);
});

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Chưa tìm thấy GEMINI_API_KEY trên máy chủ. Vui lòng kiểm tra cấu hình khóa API trong Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('DEADLINE_EXCEEDED') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('overloaded') ||
    msg.includes('high demand') ||
    msg.includes('fetch failed')
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`DEADLINE_EXCEEDED: ${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function extractCleanJsonString(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

async function generateJsonWithFallback(params: {
  contents: unknown;
  systemInstruction: string;
  responseSchema: Record<string, unknown>;
  thinkingLevel: ThinkingLevel;
}): Promise<string> {
  const ai = getAiClient();

  const callModel = async (model: string, useThinking: boolean, timeoutMs: number) => {
    const config: Record<string, unknown> = {
      systemInstruction: params.systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: params.responseSchema,
    };
    if (useThinking) {
      config.thinkingConfig = { thinkingLevel: params.thinkingLevel };
    }
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config: config as Parameters<typeof ai.models.generateContent>[0]['config'],
      }),
      timeoutMs,
      model
    );
    return extractCleanJsonString(response.text ?? '{}');
  };

  let lastError: unknown;
  try {
    return await callModel('gemini-4-hydrogen', true, 90000);
  } catch (err) {
    lastError = err;
    console.warn('gemini-4-hydrogen failed:', err instanceof Error ? err.message : err);
    if (!isTransientError(err)) {
      throw err;
    }
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      console.warn(`Falling back to gemini-3.1-flash-lite (attempt ${attempt + 1})`);
      return await callModel('gemini-3.1-flash-lite', false, 90000);
    } catch (fallbackErr) {
      lastError = fallbackErr;
      console.error(
        'Fallback model failed:',
        fallbackErr instanceof Error ? fallbackErr.message : fallbackErr
      );
      if (!isTransientError(fallbackErr) || attempt === 1) {
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw lastError;
}

/**
 * Maps upstream Gemini errors to safe HTTP status codes that Nginx will NEVER
 * intercept/overwrite with HTML (Nginx intercepts 403 -> forbidden.html and
 * 502/503/504 -> warmup.html with HTTP 200). Always return 400/401/429/500 JSON.
 */
function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 401,
      message:
        'Khóa Gemini API chưa hợp lệ hoặc thiếu quyền truy cập. Vui lòng kiểm tra lại trong Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Hệ thống đang đạt giới hạn lượt gọi API. Vui lòng chờ vài giây rồi thử lại.',
    };
  }
  if (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('high demand') ||
    raw.includes('overloaded')
  ) {
    return {
      status: 429,
      message: 'Hệ thống AI đang quá tải tạm thời. Vui lòng chờ 5–10 giây rồi nhấn thử lại.',
    };
  }
  if (raw.includes('DEADLINE_EXCEEDED') || raw.includes('timed out')) {
    return {
      status: 500,
      message:
        'Tệp đề thi quá dài nên xử lý vượt quá thời gian cho phép. Vui lòng chia nhỏ tệp (ví dụ 10–15 câu mỗi lần) rồi thử lại.',
    };
  }
  if (raw.includes('Chưa tìm thấy GEMINI_API_KEY')) {
    return { status: 500, message: raw };
  }
  return {
    status: 500,
    message: 'Đã xảy ra lỗi khi xử lý nội dung đề thi. Vui lòng kiểm tra tệp và thử lại.',
  };
}

function getMimeFromExt(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.svg') return 'image/svg+xml';
  return null;
}

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: Array<XmlNode | string>;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseXmlFragment(xml: string): XmlNode {
  const root: XmlNode = { tag: '__root__', attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  const tokenRegex = /<(\/?)([a-zA-Z0-9_:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(xml)) !== null) {
    const [, isClosing, tagName, attrStr, isSelfClosing, textContent] = match;
    if (textContent !== undefined) {
      if (textContent.length > 0) {
        stack[stack.length - 1].children.push(decodeXmlEntities(textContent));
      }
      continue;
    }

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }

    const attrs: Record<string, string> = {};
    if (attrStr) {
      const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*"([^"]*)"/g;
      let aMatch: RegExpExecArray | null;
      while ((aMatch = attrRegex.exec(attrStr)) !== null) {
        attrs[aMatch[1]] = decodeXmlEntities(aMatch[2]);
      }
    }

    const node: XmlNode = { tag: tagName, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!isSelfClosing) {
      stack.push(node);
    }
  }

  return root;
}

function findChild(node: XmlNode, tag: string): XmlNode | undefined {
  for (const ch of node.children) {
    if (typeof ch !== 'string' && ch.tag === tag) return ch;
  }
  return undefined;
}

function findChildren(node: XmlNode, tag: string): XmlNode[] {
  const out: XmlNode[] = [];
  for (const ch of node.children) {
    if (typeof ch !== 'string' && ch.tag === tag) out.push(ch);
  }
  return out;
}

const UNICODE_TO_LATEX_MAP: Record<string, string> = {
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\neq ',
  '≈': '\\approx ',
  '≡': '\\equiv ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '×': '\\times ',
  '÷': '\\div ',
  '·': '\\cdot ',
  '∙': '\\cdot ',
  '∞': '\\infty ',
  '∈': '\\in ',
  '∉': '\\notin ',
  '⊂': '\\subset ',
  '⊆': '\\subseteq ',
  '⊃': '\\supset ',
  '⊇': '\\supseteq ',
  '∪': '\\cup ',
  '∩': '\\cap ',
  '∅': '\\emptyset ',
  '⇒': '\\Rightarrow ',
  '⇐': '\\Leftarrow ',
  '⇔': '\\Leftrightarrow ',
  '→': '\\to ',
  '←': '\\leftarrow ',
  '↔': '\\leftrightarrow ',
  '∀': '\\forall ',
  '∃': '\\exists ',
  '¬': '\\neg ',
  '∧': '\\wedge ',
  '∨': '\\vee ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '∠': '\\widehat{} ',
  '△': '\\triangle ',
  '∂': '\\partial ',
  '∇': '\\nabla ',
  'ℝ': '\\mathbb{R}',
  'ℕ': '\\mathbb{N}',
  'ℤ': '\\mathbb{Z}',
  'ℚ': '\\mathbb{Q}',
  'ℂ': '\\mathbb{C}',
  'π': '\\pi ',
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'δ': '\\delta ',
  'ε': '\\varepsilon ',
  'ϵ': '\\varepsilon ',
  'θ': '\\theta ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'ρ': '\\rho ',
  'σ': '\\sigma ',
  'τ': '\\tau ',
  'φ': '\\varphi ',
  'ϕ': '\\phi ',
  'ω': '\\omega ',
  'Δ': '\\Delta ',
  'Γ': '\\Gamma ',
  'Λ': '\\Lambda ',
  'Σ': '\\Sigma ',
  'Φ': '\\Phi ',
  'Ω': '\\Omega ',
  '°': '^\\circ ',
  '−': '-',
  '–': '-',
  '…': '\\ldots ',
  '⋯': '\\cdots ',
  '⋮': '\\vdots ',
  '′': "'",
  '″': "''",
  '′′': "''",
  '\u00A0': ' ',
};

const KNOWN_MATH_FUNCS = new Set([
  'sin',
  'cos',
  'tan',
  'cot',
  'sec',
  'csc',
  'arcsin',
  'arccos',
  'arctan',
  'sinh',
  'cosh',
  'tanh',
  'ln',
  'log',
  'lg',
  'exp',
  'lim',
  'max',
  'min',
  'sup',
  'inf',
  'det',
  'deg',
  'gcd',
  'arg',
  'dim',
]);

function mapMathUnicodeText(raw: string): string {
  let out = '';
  for (const ch of raw) {
    out += UNICODE_TO_LATEX_MAP[ch] ?? ch;
  }
  return out;
}

function mapDelimiterChar(ch: string | undefined, fallback: string): string {
  if (ch === undefined) return fallback;
  if (ch === '') return '.';
  if (ch === '{') return '\\{';
  if (ch === '}') return '\\}';
  if (ch === '|') return '|';
  if (ch === '‖' || ch === '∥') return '\\|';
  if (ch === '⟨') return '\\langle ';
  if (ch === '⟩') return '\\rangle ';
  if (ch === '⌊') return '\\lfloor ';
  if (ch === '⌋') return '\\rfloor ';
  if (ch === '⌈') return '\\lceil ';
  if (ch === '⌉') return '\\rceil ';
  return ch;
}

function wrapBaseIfNeeded(base: string): string {
  const b = base.trim();
  if (!b) return '{}';
  if (b.length === 1 || (b.startsWith('{') && b.endsWith('}'))) return b;
  if (/^\\[a-zA-Z]+$/.test(b)) return b;
  return `{${b}}`;
}

function ommlNodeToLatex(node: XmlNode | string): string {
  if (typeof node === 'string') return '';

  const convertChildren = (n: XmlNode | undefined): string => {
    if (!n) return '';
    return n.children.map(ommlNodeToLatex).join('');
  };

  switch (node.tag) {
    case 'm:oMath':
    case 'm:oMathPara':
    case 'm:e':
    case 'm:num':
    case 'm:den':
    case 'm:sup':
    case 'm:sub':
    case 'm:deg':
    case 'm:lim':
    case 'm:fName':
    case 'm:box':
    case 'm:borderBox':
    case 'm:phant':
    case '__root__':
      return convertChildren(node);

    case 'm:r': {
      const rPr = findChild(node, 'm:rPr');
      const isNormalText = Boolean(rPr && findChild(rPr, 'm:nor'));
      const rawText = findChildren(node, 'm:t')
        .map((t) =>
          t.children.filter((c): c is string => typeof c === 'string').join('')
        )
        .join('');
      if (!rawText) return '';
      if (isNormalText && /[a-zA-ZÀ-ỹ]{2,}/.test(rawText)) {
        return `\\text{${rawText.replace(/([{}%#&_])/g, '\\$1')}}`;
      }
      return mapMathUnicodeText(rawText);
    }

    case 'm:t':
      return mapMathUnicodeText(
        node.children.filter((c): c is string => typeof c === 'string').join('')
      );

    case 'm:f': {
      const fPr = findChild(node, 'm:fPr');
      const fType = findChild(fPr || node, 'm:type')?.attrs['m:val'];
      const num = convertChildren(findChild(node, 'm:num')).trim();
      const den = convertChildren(findChild(node, 'm:den')).trim();
      if (fType === 'noBar') {
        return `\\binom{${num}}{${den}}`;
      }
      if (fType === 'lin') {
        return `(${num})/(${den})`;
      }
      return `\\frac{${num}}{${den}}`;
    }

    case 'm:sSup': {
      const base = convertChildren(findChild(node, 'm:e')).trim();
      const sup = convertChildren(findChild(node, 'm:sup')).trim();
      return `${wrapBaseIfNeeded(base)}^{${sup}}`;
    }

    case 'm:sSub': {
      const base = convertChildren(findChild(node, 'm:e')).trim();
      const sub = convertChildren(findChild(node, 'm:sub')).trim();
      return `${wrapBaseIfNeeded(base)}_{${sub}}`;
    }

    case 'm:sSubSup': {
      const base = convertChildren(findChild(node, 'm:e')).trim();
      const sub = convertChildren(findChild(node, 'm:sub')).trim();
      const sup = convertChildren(findChild(node, 'm:sup')).trim();
      return `${wrapBaseIfNeeded(base)}_{${sub}}^{${sup}}`;
    }

    case 'm:sPre': {
      const base = convertChildren(findChild(node, 'm:e')).trim();
      const sub = convertChildren(findChild(node, 'm:sub')).trim();
      const sup = convertChildren(findChild(node, 'm:sup')).trim();
      return `{}_{${sub}}^{${sup}}${wrapBaseIfNeeded(base)}`;
    }

    case 'm:rad': {
      const radPr = findChild(node, 'm:radPr');
      const degHide = findChild(radPr || node, 'm:degHide')?.attrs['m:val'];
      const deg = convertChildren(findChild(node, 'm:deg')).trim();
      const body = convertChildren(findChild(node, 'm:e')).trim();
      if (deg && degHide !== '1' && degHide !== 'on' && degHide !== 'true') {
        return `\\sqrt[${deg}]{${body}}`;
      }
      return `\\sqrt{${body}}`;
    }

    case 'm:d': {
      const dPr = findChild(node, 'm:dPr');
      const begNode = dPr ? findChild(dPr, 'm:begChr') : undefined;
      const endNode = dPr ? findChild(dPr, 'm:endChr') : undefined;
      const sepNode = dPr ? findChild(dPr, 'm:sepChr') : undefined;
      const begRaw = begNode ? begNode.attrs['m:val'] ?? '' : '(';
      const endRaw = endNode ? endNode.attrs['m:val'] ?? '' : ')';
      const sepRaw = sepNode ? sepNode.attrs['m:val'] ?? '|' : '|';

      const elems = findChildren(node, 'm:e');
      // Special case: system of equations or "hoặc" bracket wrapping a single matrix/eqArr
      if (elems.length === 1 && endRaw === '' && (begRaw === '{' || begRaw === '[')) {
        const innerMat = findChild(elems[0], 'm:m');
        if (innerMat) {
          const rows = findChildren(innerMat, 'm:mr').map((mr) =>
            findChildren(mr, 'm:e')
              .map((cell) => convertChildren(cell).trim())
              .join(' & ')
          );
          if (begRaw === '{') {
            return `\\begin{cases} ${rows.join(' \\\\ ')} \\end{cases}`;
          }
          return `\\left[\\begin{array}{l} ${rows.join(' \\\\ ')} \\end{array}\\right.`;
        }
      }

      const beg = mapDelimiterChar(begRaw, '(');
      const end = mapDelimiterChar(endRaw, ')');
      const inner = elems.map((el) => convertChildren(el).trim()).join(` ${sepRaw} `);
      return `\\left${beg}${inner}\\right${end}`;
    }

    case 'm:nary': {
      const naryPr = findChild(node, 'm:naryPr');
      const chr = naryPr ? findChild(naryPr, 'm:chr')?.attrs['m:val'] : undefined;
      const opMap: Record<string, string> = {
        '∫': '\\int',
        '∬': '\\iint',
        '∭': '\\iiint',
        '∮': '\\oint',
        '∑': '\\sum',
        '∏': '\\prod',
        '⋃': '\\bigcup',
        '⋂': '\\bigcap',
      };
      const op = (chr && opMap[chr]) || '\\int';
      const sub = convertChildren(findChild(node, 'm:sub')).trim();
      const sup = convertChildren(findChild(node, 'm:sup')).trim();
      const body = convertChildren(findChild(node, 'm:e')).trim();
      const limits = `${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}`;
      return `${op}${limits} ${body}`;
    }

    case 'm:func': {
      const fNameRaw = convertChildren(findChild(node, 'm:fName')).trim();
      const cleanName = fNameRaw.replace(/^\\text\{(.*)\}$/, '$1').trim();
      const fNameLatex = KNOWN_MATH_FUNCS.has(cleanName) ? `\\${cleanName}` : fNameRaw;
      const body = convertChildren(findChild(node, 'm:e')).trim();
      return `${fNameLatex} ${body}`;
    }

    case 'm:limLow': {
      const base = convertChildren(findChild(node, 'm:e')).trim();
      const lim = convertChildren(findChild(node, 'm:lim')).trim();
      const cleanBase = base.replace(/^\\text\{(.*)\}$/, '$1').trim();
      if (KNOWN_MATH_FUNCS.has(cleanBase)) {
        return `\\${cleanBase}_{${lim}}`;
      }
      return `\\underset{${lim}}{${base}}`;
    }

    case 'm:limUpp': {
      const base = convertChildren(findChild(node, 'm:e')).trim();
      const lim = convertChildren(findChild(node, 'm:lim')).trim();
      return `\\overset{${lim}}{${base}}`;
    }

    case 'm:acc': {
      const accPr = findChild(node, 'm:accPr');
      const chr = accPr ? findChild(accPr, 'm:chr')?.attrs['m:val'] : '^';
      const body = convertChildren(findChild(node, 'm:e')).trim();
      if (chr === '\u20d7' || chr === '→' || chr === '\u2192') {
        return body.length <= 1 ? `\\vec{${body}}` : `\\overrightarrow{${body}}`;
      }
      if (chr === '\u0304' || chr === '\u0305' || chr === '¯' || chr === '-') {
        return `\\overline{${body}}`;
      }
      if (chr === '\u0303' || chr === '~') {
        return `\\widetilde{${body}}`;
      }
      if (chr === '\u0307' || chr === '˙') {
        return `\\dot{${body}}`;
      }
      if (chr === '\u0308' || chr === '¨') {
        return `\\ddot{${body}}`;
      }
      return body.length <= 1 ? `\\hat{${body}}` : `\\widehat{${body}}`;
    }

    case 'm:bar': {
      const barPr = findChild(node, 'm:barPr');
      const pos = barPr ? findChild(barPr, 'm:pos')?.attrs['m:val'] : 'top';
      const body = convertChildren(findChild(node, 'm:e')).trim();
      return pos === 'bot' ? `\\underline{${body}}` : `\\overline{${body}}`;
    }

    case 'm:groupChr': {
      const gcPr = findChild(node, 'm:groupChrPr');
      const pos = gcPr ? findChild(gcPr, 'm:pos')?.attrs['m:val'] : 'bot';
      const body = convertChildren(findChild(node, 'm:e')).trim();
      return pos === 'top' ? `\\overbrace{${body}}` : `\\underbrace{${body}}`;
    }

    case 'm:m': {
      const rows = findChildren(node, 'm:mr');
      const colCount = Math.max(
        1,
        ...rows.map((r) => findChildren(r, 'm:e').length)
      );
      const cols = 'c'.repeat(colCount);
      const rowStrings = rows.map((mr) =>
        findChildren(mr, 'm:e')
          .map((cell) => convertChildren(cell).trim())
          .join(' & ')
      );
      return `\\begin{array}{${cols}} ${rowStrings.join(' \\\\ ')} \\end{array}`;
    }

    case 'm:eqArr': {
      const rows = findChildren(node, 'm:e').map((el) => convertChildren(el).trim());
      return `\\begin{aligned} ${rows.join(' \\\\ ')} \\end{aligned}`;
    }

    case 'm:oMathPr':
    case 'm:fPr':
    case 'm:rPr':
    case 'm:dPr':
    case 'm:radPr':
    case 'm:naryPr':
    case 'm:accPr':
    case 'm:barPr':
    case 'm:mPr':
    case 'm:sSupPr':
    case 'm:sSubPr':
    case 'm:sSubSupPr':
    case 'm:ctrlPr':
    case 'w:rPr':
      return '';

    default:
      return convertChildren(node);
  }
}

function convertOmmlAndXmlToText(
  xmlChunk: string,
  rIdToImageToken: Map<string, string>
): string {
  // 0. Remove pretty-printed XML indentation/newlines between tags (Word line breaks use <w:br/> / <w:cr/>)
  let processed = xmlChunk.replace(/>\s*\r?\n\s*</g, '><');

  // 1. Inject [[IMG_k]] markers at exact positions of embedded Word images
  processed = processed
    .replace(/<a:blip[^>]*r:embed="([^"]+)"[^>]*\/?>/g, (_m, rId: string) => {
      const token = rIdToImageToken.get(rId);
      return token ? ` [[${token}]] ` : '';
    })
    .replace(/<v:imagedata[^>]*r:id="([^"]+)"[^>]*\/?>/g, (_m, rId: string) => {
      const token = rIdToImageToken.get(rId);
      return token ? ` [[${token}]] ` : '';
    });

  // 2. Convert display math paragraphs <m:oMathPara>...</m:oMathPara> via recursive XML AST
  processed = processed.replace(
    /<m:oMathPara\b[^>]*>[\s\S]*?<\/m:oMathPara>/g,
    (match) => {
      const ast = parseXmlFragment(match);
      const latex = ommlNodeToLatex(ast).replace(/\s{2,}/g, ' ').trim();
      return latex ? `\n$$${latex}$$\n` : '';
    }
  );

  // 3. Convert inline math <m:oMath>...</m:oMath> via recursive XML AST
  processed = processed.replace(
    /<m:oMath\b[^>]*>[\s\S]*?<\/m:oMath>/g,
    (match) => {
      const ast = parseXmlFragment(match);
      const latex = ommlNodeToLatex(ast).replace(/\s{2,}/g, ' ').trim();
      return latex ? ` $${latex}$ ` : '';
    }
  );

  return decodeXmlEntities(
    processed
      .replace(/<w:tab\/>/g, '    ')
      .replace(/<w:(?:br|cr)[^>]*\/>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
}

/**
 * Repairs common LLM JSON-escaping corruptions on LaTeX commands (e.g. \frac -> \u000crac,
 * \times -> \times, \right -> \right, \begin -> \begin) and normalizes raw \n
 * without ever damaging \neq, \notin, \nu, \nabla.
 */
function sanitizeServerMathText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\u000c(?=(?:rac|orall|lat|rown)\b)/g, '\\f')
    .replace(
      /\t(?=(?:imes|ext|an|heta|o|au|riangle|op|ilde|frac|iny)\b)/g,
      '\\t'
    )
    .replace(
      /\r(?=(?:ight|ho|angle|ceil|floor|m|arrow|ef|ule)\b)/g,
      '\\r'
    )
    .replace(/\u0008(?=(?:egin|inom|ar|ig|eta|ot|oldsymbol|oxed|ullet)\b)/g, '\\b')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(
      /\\n(?!(?:eq\b|e\b|otin\b|ot\b|u\b|abla\b|atural\b|eg\b|exists\b|i\b|less\b|gtr\b|leq\b|geq\b|mid\b|parallel\b|subset|supset|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|ormalsize\b|ewline\b|oindent\b|olimits\b|onumber\b|cong\b|sim\b|vdash\b|vDash\b|VDash\b|triangle|short|prec|succ))/g,
      '\n'
    )
    .replace(/\[\[IMG_\d+\]\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Extracts verbatim text, Word OMML equations, Markdown-formatted Word tables,
 * AND embedded images (mapped via [[IMG_k]] placeholders) from .docx files.
 */
async function extractDocxContentWithFigures(buffer: Buffer): Promise<{
  text: string;
  images: Record<string, string>;
}> {
  const images: Record<string, string> = {};

  try {
    const zip = await JSZip.loadAsync(buffer);
    const relsFile = zip.file('word/_rels/document.xml.rels');
    const rIdToImageToken = new Map<string, string>();

    if (relsFile) {
      const relsXml = await relsFile.async('string');
      const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*\/?>/g;
      let match: RegExpExecArray | null;
      let imgCounter = 1;

      while ((match = relRegex.exec(relsXml)) !== null) {
        const rId = match[1];
        const target = match[2];
        const normalizedTarget = target.startsWith('/')
          ? target.slice(1)
          : target.startsWith('word/')
            ? target
            : `word/${target.replace(/^\.\//, '')}`;

        const mime = getMimeFromExt(normalizedTarget);
        if (!mime) continue;

        const mediaFile = zip.file(normalizedTarget);
        if (!mediaFile) continue;

        const imgBuf = await mediaFile.async('nodebuffer');
        // Skip tiny 1px spacer icons (< 300 bytes unless SVG)
        if (imgBuf.length < 300 && mime !== 'image/svg+xml') continue;

        const token = `IMG_${imgCounter++}`;
        images[token] = `data:${mime};base64,${imgBuf.toString('base64')}`;
        rIdToImageToken.set(rId, token);
      }
    }

    const docXmlFile = zip.file('word/document.xml');
    if (docXmlFile) {
      const xml = await docXmlFile.async('string');
      const bodyMatch = xml.match(/<w:body[^>]*>([\s\S]*?)<\/w:body>/);
      const bodyXml = bodyMatch ? bodyMatch[1] : xml;

      // Tokenize top-level tables (<w:tbl>) and paragraphs (<w:p>) in exact document order
      const outputBlocks: string[] = [];
      const blockRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g;
      let bMatch: RegExpExecArray | null;

      while ((bMatch = blockRegex.exec(bodyXml)) !== null) {
        const block = bMatch[0];
        if (block.startsWith('<w:tbl')) {
          const rows: string[][] = [];
          const rowRegex = /<w:tr\b[\s\S]*?<\/w:tr>/g;
          let rMatch: RegExpExecArray | null;
          while ((rMatch = rowRegex.exec(block)) !== null) {
            const cells: string[] = [];
            const cellRegex = /<w:tc\b[\s\S]*?<\/w:tc>/g;
            let cMatch: RegExpExecArray | null;
            while ((cMatch = cellRegex.exec(rMatch[0])) !== null) {
              const cellParas = cMatch[0].match(/<w:p\b[\s\S]*?<\/w:p>/g) || [cMatch[0]];
              const cellText = cellParas
                .map((cp) => convertOmmlAndXmlToText(cp, rIdToImageToken))
                .filter(Boolean)
                .join(' ')
                .replace(/\|/g, '\\|');
              cells.push(cellText);
            }
            if (cells.length > 0) rows.push(cells);
          }

          if (rows.length > 0) {
            const colCount = Math.max(...rows.map((r) => r.length));
            const mdRows = rows.map(
              (r) =>
                '| ' +
                Array.from({ length: colCount }, (_, idx) => r[idx] || '').join(' | ') +
                ' |'
            );
            const sep =
              '| ' + Array.from({ length: colCount }, () => '---').join(' | ') + ' |';
            outputBlocks.push([mdRows[0], sep, ...mdRows.slice(1)].join('\n'));
          }
        } else {
          const line = convertOmmlAndXmlToText(block, rIdToImageToken);
          if (line) {
            outputBlocks.push(line);
          }
        }
      }

      const xmlText = outputBlocks.join('\n').trim();
      if (xmlText.length > 10) {
        return { text: xmlText, images };
      }
    }
  } catch (err) {
    console.warn('DOCX XML extraction fallback to mammoth:', err);
  }

  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value.trim(), images };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

const PARSE_SYSTEM_INSTRUCTION = `Bạn là chuyên gia số hóa đề thi chuẩn Chương trình Giáo dục Phổ thông 2018 (GDPT 2018) Việt Nam.

NHIỆM VỤ TỐI THƯỢNG: GIỮ NGUYÊN VĂN 100%, GIỮ NGUYÊN CẤU TRÚC, GIỮ NGUYÊN HÌNH VẼ VÀ BẢNG BIỂU CỦA ĐỀ VÀ BÀI GIẢI GỐC!

QUY TẮC BẮT BUỘC:
1. GIỮ NGUYÊN VĂN TUYỆT ĐỐI (VERBATIM):
   - KHÔNG ĐƯỢC tóm tắt, rút gọn, diễn đạt lại (paraphrase), thay đổi thứ tự câu chữ, hoặc tự ý sửa lời văn của đề bài, các phương án (A, B, C, D hoặc a, b, c, d), tiêu đề phần, hay bài giải đã có sẵn trong tài liệu gốc!
   - Giữ đúng nguyên văn các câu dẫn, điều kiện, đơn vị đo, dấu câu và cách trình bày xuống dòng (\\n) của đề gốc.
   - Giữ nguyên số câu "questionNumber" (Câu 1 -> 1, Câu 2 -> 2...). Chỉ bỏ chữ "Câu 1." ở đầu trường "content" vì thẻ Câu đã hiển thị riêng.
2. GIỮ NGUYÊN CẤU TRÚC PHẦN & BẢNG BIỂU:
   - Nếu tài liệu gốc có dòng tiêu đề phần (ví dụ "PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn."), giữ nguyên văn tiêu đề phần đó vào "partTitle". Nếu tài liệu không ghi tiêu đề phần, tự gán theo chuẩn GDPT 2018 ("PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.", "PHẦN II. Câu trắc nghiệm đúng sai.", "PHẦN III. Câu trắc nghiệm trả lời ngắn.", "PHẦN TỰ LUẬN.").
   - Nếu câu hỏi hoặc lời giải có BẢNG SỐ LIỆU / BẢNG TẦN SỐ GHÉP NHÓM / BẢNG XÉT DẤU, giữ nguyên đầy đủ cấu trúc bảng dưới dạng bảng Markdown chuẩn (| Cột 1 | Cột 2 |\\n| --- | --- |\\n| ... |).
3. CÔNG THỨC TOÁN/LÝ/HÓA CHUẨN KaTeX (QUAN TRỌNG):
   - Chuyển CHÍNH XÁC 100% mọi công thức toán/lý/hóa sang LaTeX chuẩn KaTeX ($...$ cùng dòng, $$...$$ riêng dòng). Không được làm mất dấu trừ, dấu ngoặc, phân số lồng nhau, chỉ số trên/dưới, cận tích phân, dấu vectơ (\\overrightarrow{AB} hoặc \\vec{u}), ký hiệu tập hợp (\\mathbb{R}, \\in, \\notin, \\neq).
   - Vì đầu ra là JSON, MỌI dấu gạch chéo ngược trong LaTeX PHẢI được escape chuẩn JSON (ví dụ \\\\frac, \\\\sqrt, \\\\neq, \\\\times, \\\\right, \\\\begin, \\\\overrightarrow, \\\\int) để không bị biến thành ký tự điều khiển!
   - Hệ phương trình dùng \\begin{cases} ... \\end{cases}; dấu ngoặc vuông "hoặc" dùng \\left[\\begin{array}{l} ... \\\\ ... \\end{array}\\right. (KHÔNG dùng macro riêng như \\heva, \\hoac).
   - Trong công thức toán, dấu phần trăm phải viết \\%, dấu phẩy thập phân Việt Nam viết dạng 0{,}5 để tránh khoảng trắng thừa.
4. GIỮ NGUYÊN BÀI GIẢI ĐÃ CÓ:
   - Nếu trong tài liệu ĐÃ CÓ lời giải chi tiết cho câu hỏi: CHÉP NGUYÊN VĂN 100% từng dòng, từng bước, từng ký hiệu của bài giải gốc vào trường "solution", đặt hasOriginalSolution = true, isAiSolved = false. Tuyệt đối KHÔNG viết lại hay rút gọn bài giải sẵn có!
   - Nếu câu hỏi CHƯA CÓ bài giải chi tiết trong tài liệu: để solution = "" và hasOriginalSolution = false, isAiSolved = false (hệ thống sẽ giải tự động ở bước tiếp theo). Nếu tài liệu có bảng đáp án chữ cái thì đánh dấu isCorrect = true cho phương án đúng và điền correctAnswer.
5. GIỮ NGUYÊN HÌNH VẼ / ĐỒ THỊ / SƠ ĐỒ:
   - Với tệp Word có mã ảnh dạng [[IMG_1]], [[IMG_2]]...:
     + Nếu [[IMG_k]] thuộc phần đề bài của câu hỏi -> đưa "IMG_k" vào mảng "questionImageIds".
     + Nếu [[IMG_k]] thuộc phần lời giải của câu hỏi -> đưa "IMG_k" vào mảng "solutionImageIds".
     + Xóa chuỗi ký tự "[[IMG_k]]" khỏi nội dung chữ "content"/"solution" để không bị in chữ thừa (ảnh gốc sẽ được gắn trực tiếp vào khung).
   - Với tệp PDF hoặc Ảnh chụp đề thi:
     + Nếu câu hỏi có hình vẽ minh họa, đồ thị hàm số, hình học không gian, mạch điện, bảng biến thiên dạng ảnh... -> trả về tọa độ khung hình chính xác chuẩn hóa theo thang 0–1000 trong "questionFigureBoxes" (gồm page (bắt đầu từ 1), ymin, xmin, ymax, xmax, caption). Khung phải bao trọn toàn bộ hình vẽ và tên các đỉnh/trục tọa độ (O, x, y, A, B, C...) nhưng không cắt dính vào chữ đề bài xung quanh.
     + Tương tự, nếu phần bài giải gốc có hình vẽ riêng -> trả về tọa độ khung hình đó trong "solutionFigureBoxes".`;

const FIGURE_BOX_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    page: { type: Type.INTEGER, description: '1-based page number (1 for single image)' },
    ymin: { type: Type.INTEGER, description: 'Top coordinate 0..1000' },
    xmin: { type: Type.INTEGER, description: 'Left coordinate 0..1000' },
    ymax: { type: Type.INTEGER, description: 'Bottom coordinate 0..1000' },
    xmax: { type: Type.INTEGER, description: 'Right coordinate 0..1000' },
    caption: { type: Type.STRING, description: 'Optional short caption if printed under figure' },
  },
  required: ['page', 'ymin', 'xmin', 'ymax', 'xmax'],
};

const PARSE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    examTitle: { type: Type.STRING },
    subject: { type: Type.STRING },
    gradeLevel: { type: Type.STRING },
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          questionNumber: { type: Type.INTEGER },
          partTitle: { type: Type.STRING },
          type: { type: Type.STRING },
          content: { type: Type.STRING },
          options: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                content: { type: Type.STRING },
                isCorrect: { type: Type.BOOLEAN },
              },
              required: ['label', 'content'],
            },
          },
          correctAnswer: { type: Type.STRING },
          solution: { type: Type.STRING },
          hasOriginalSolution: { type: Type.BOOLEAN },
          isAiSolved: { type: Type.BOOLEAN },
          questionImageIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'DOCX image marker IDs like IMG_1 belonging to the question',
          },
          solutionImageIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'DOCX image marker IDs like IMG_2 belonging to the solution',
          },
          questionFigureBoxes: {
            type: Type.ARRAY,
            items: FIGURE_BOX_SCHEMA,
            description: 'Bounding boxes (0..1000) of figures/diagrams in the question (for PDF/Image files)',
          },
          solutionFigureBoxes: {
            type: Type.ARRAY,
            items: FIGURE_BOX_SCHEMA,
            description: 'Bounding boxes (0..1000) of figures/diagrams in the solution (for PDF/Image files)',
          },
        },
        required: [
          'questionNumber',
          'partTitle',
          'type',
          'content',
          'options',
          'correctAnswer',
          'solution',
          'hasOriginalSolution',
          'isAiSolved',
        ],
      },
    },
  },
  required: ['examTitle', 'subject', 'gradeLevel', 'questions'],
};

const SOLVE_SINGLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    correctAnswer: { type: Type.STRING },
    solution: { type: Type.STRING },
    correctLabels: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['correctAnswer', 'solution', 'correctLabels'],
};

const SOLVE_BATCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    solutions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          correctAnswer: { type: Type.STRING },
          solution: { type: Type.STRING },
          correctLabels: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['id', 'correctAnswer', 'solution', 'correctLabels'],
      },
    },
  },
  required: ['solutions'],
};

function stripImageMarkerTokens(text: string): string {
  return sanitizeServerMathText(text);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.post('/api/parse-exam', upload.single('file'), async (req: Request, res: Response) => {
    try {
      const textContent = typeof req.body?.textContent === 'string' ? req.body.textContent.trim() : '';
      const subjectHint = typeof req.body?.subjectHint === 'string' ? req.body.subjectHint.trim() : '';

      let fileBuffer: Buffer | null = req.file ? req.file.buffer : null;
      let fileOriginalName = req.file ? req.file.originalname : '';
      let fileMime = req.file ? req.file.mimetype : '';

      if (!fileBuffer && typeof req.body?.fileBase64 === 'string' && req.body.fileBase64.length > 0) {
        fileBuffer = Buffer.from(req.body.fileBase64, 'base64');
        fileOriginalName = typeof req.body.fileName === 'string' ? req.body.fileName : 'exam_file';
        fileMime = typeof req.body.mimeType === 'string' ? req.body.mimeType : 'application/octet-stream';
      }

      if (!fileBuffer && !textContent) {
        res.status(400).json({ error: 'Vui lòng tải lên tệp đề thi hoặc dán nội dung đề thi.' });
        return;
      }

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      let extractedDocxImages: Record<string, string> = {};

      const instructionHeader = [
        subjectHint ? `Gợi ý môn/khối lớp: ${subjectHint}.` : '',
        'YÊU CẦU BẮT BUỘC: Giữ NGUYÊN VĂN 100% câu chữ, cấu trúc xuống dòng, bảng biểu và toàn bộ bài giải nếu tệp đã có sẵn (không diễn đạt lại, không lược bỏ). Giữ nguyên hình vẽ qua questionImageIds/solutionImageIds (nếu có mã [[IMG_k]]) hoặc tọa độ khung hình questionFigureBoxes/solutionFigureBoxes (nếu là PDF/ảnh).',
      ]
        .filter(Boolean)
        .join('\n');

      if (fileBuffer) {
        const ext = path.extname(fileOriginalName).toLowerCase();
        const mime = fileMime;

        if (ext === '.docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const extracted = await extractDocxContentWithFigures(fileBuffer);
          if (!extracted.text) {
            res.status(400).json({
              error:
                'Không đọc được nội dung văn bản từ tệp Word (.docx). Vui lòng thử lưu sang PDF hoặc kiểm tra lại tệp.',
            });
            return;
          }
          extractedDocxImages = extracted.images;
          const imgListNote =
            Object.keys(extractedDocxImages).length > 0
              ? `\n(Tệp Word có ${Object.keys(extractedDocxImages).length} hình vẽ được đánh dấu bằng [[IMG_1]], [[IMG_2]]... Hãy gán đúng mã IMG_k vào questionImageIds hoặc solutionImageIds của câu hỏi tương ứng.)`
              : '';
          parts.push({
            text: `${instructionHeader}${imgListNote}\n\n--- NỘI DUNG TỆP WORD (${fileOriginalName}) ---\n${extracted.text}`,
          });
        } else if (
          ext === '.pdf' ||
          mime === 'application/pdf' ||
          mime.startsWith('image/') ||
          ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
        ) {
          const safeMime =
            ext === '.pdf'
              ? 'application/pdf'
              : ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                  ? 'image/webp'
                  : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : mime;

          parts.push({
            inlineData: {
              mimeType: safeMime,
              data: fileBuffer.toString('base64'),
            },
          });
          parts.push({
            text: `${instructionHeader}\nTên tệp gốc: ${fileOriginalName}. Hãy giữ NGUYÊN VĂN 100% đề bài & bài giải có sẵn, giữ nguyên cấu trúc bảng biểu, và xác định chính xác tọa độ khung hình (questionFigureBoxes / solutionFigureBoxes) cho mọi hình vẽ, đồ thị, hình học có trong đề và bài giải.`,
          });
        } else {
          const plain = fileBuffer.toString('utf-8').trim();
          if (!plain) {
            res.status(400).json({ error: 'Tệp tải lên đang trống.' });
            return;
          }
          parts.push({
            text: `${instructionHeader}\n\n--- NỘI DUNG TỆP (${fileOriginalName}) ---\n${plain}`,
          });
        }
      } else {
        parts.push({
          text: `${instructionHeader}\n\n--- NỘI DUNG ĐỀ THI ---\n${textContent}`,
        });
      }

      const rawJson = await generateJsonWithFallback({
        contents: { parts },
        systemInstruction: PARSE_SYSTEM_INSTRUCTION,
        responseSchema: PARSE_RESPONSE_SCHEMA,
        thinkingLevel: ThinkingLevel.MEDIUM,
      });

      const parsed = JSON.parse(rawJson) as {
        examTitle: string;
        subject: string;
        gradeLevel: string;
        questions: Array<{
          questionNumber: number;
          partTitle: string;
          type: string;
          content: string;
          options: Array<{ label: string; content: string; isCorrect?: boolean }>;
          correctAnswer: string;
          solution: string;
          hasOriginalSolution: boolean;
          isAiSolved: boolean;
          questionImageIds?: string[];
          solutionImageIds?: string[];
          questionFigureBoxes?: Array<{
            page: number;
            ymin: number;
            xmin: number;
            ymax: number;
            xmax: number;
            caption?: string;
          }>;
          solutionFigureBoxes?: Array<{
            page: number;
            ymin: number;
            xmin: number;
            ymax: number;
            xmax: number;
            caption?: string;
          }>;
        }>;
      };

      if (!parsed.questions || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        res.status(422).json({
          error:
            'Không nhận diện được câu hỏi nào từ nội dung cung cấp. Vui lòng kiểm tra lại tệp đề thi.',
        });
        return;
      }

      // Resolve DOCX extracted images into questionImages / solutionImages and strip raw [[IMG_k]] tokens
      const enrichedQuestions = parsed.questions.map((q, qIdx) => {
        const qIdSet = new Set<string>(q.questionImageIds || []);
        const sIdSet = new Set<string>(q.solutionImageIds || []);

        // Also catch any [[IMG_k]] that Gemini left inline inside content/solution text
        const inlineContentMatches = (q.content || '').match(/\[\[(IMG_\d+)\]\]/g) || [];
        for (const m of inlineContentMatches) {
          qIdSet.add(m.replace(/[\[\]]/g, ''));
        }
        const inlineSolMatches = (q.solution || '').match(/\[\[(IMG_\d+)\]\]/g) || [];
        for (const m of inlineSolMatches) {
          sIdSet.add(m.replace(/[\[\]]/g, ''));
        }

        const questionImages = Array.from(qIdSet)
          .filter((id) => Boolean(extractedDocxImages[id]))
          .map((id, idx) => ({
            id: `docx-q-${qIdx}-${idx}-${id}`,
            dataUrl: extractedDocxImages[id],
            widthPercent: 45,
          }));

        const solutionImages = Array.from(sIdSet)
          .filter((id) => Boolean(extractedDocxImages[id]))
          .map((id, idx) => ({
            id: `docx-s-${qIdx}-${idx}-${id}`,
            dataUrl: extractedDocxImages[id],
            widthPercent: 52,
          }));

        return {
          questionNumber: q.questionNumber,
          partTitle: q.partTitle,
          type: q.type,
          content: stripImageMarkerTokens(q.content || ''),
          options: (q.options || []).map((opt) => ({
            ...opt,
            content: stripImageMarkerTokens(opt.content || ''),
          })),
          correctAnswer: q.correctAnswer || '',
          solution: stripImageMarkerTokens(q.solution || ''),
          hasOriginalSolution: Boolean(q.hasOriginalSolution),
          isAiSolved: Boolean(q.isAiSolved),
          questionImages,
          solutionImages,
          questionFigureBoxes: q.questionFigureBoxes || [],
          solutionFigureBoxes: q.solutionFigureBoxes || [],
        };
      });

      res.json({
        examTitle: parsed.examTitle,
        subject: parsed.subject,
        gradeLevel: parsed.gradeLevel,
        questions: enrichedQuestions,
      });
    } catch (err: unknown) {
      console.error('Error in /api/parse-exam:', err);
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/solve-question', async (req: Request, res: Response) => {
    try {
      const { questionNumber, partTitle, type, content, options, subjectHint, questionImages } =
        req.body as {
          questionNumber?: number;
          partTitle?: string;
          type?: string;
          content?: string;
          options?: Array<{ label: string; content: string }>;
          subjectHint?: string;
          questionImages?: Array<{ dataUrl: string }>;
        };

      if (!content || !content.trim()) {
        res.status(400).json({ error: 'Nội dung câu hỏi đang trống.' });
        return;
      }

      const optionsBlock =
        Array.isArray(options) && options.length > 0
          ? '\nCác phương án:\n' + options.map((o) => `${o.label}. ${o.content}`).join('\n')
          : '';

      const prompt = [
        'Hãy giải chính xác và chi tiết câu hỏi sau theo chuẩn kiến thức Chương trình Giáo dục Phổ thông 2018 Việt Nam.',
        subjectHint ? `Môn/Khối lớp: ${subjectHint}` : '',
        partTitle ? `Thuộc phần: ${partTitle}` : '',
        `Loại câu hỏi: ${type || 'multiple_choice'}`,
        `Câu ${questionNumber ?? ''}: ${content}`,
        optionsBlock,
        `\nYêu cầu trình bày lời giải:
- Quan sát kỹ cả hình vẽ đi kèm (nếu có) và kiểm tra thật kỹ mọi bước tính toán để đảm bảo đáp án chính xác tuyệt đối.
- Viết công thức toán học/khoa học bằng LaTeX chuẩn KaTeX ($...$ hoặc $$...$$).
- Trình bày mạch lạc, rõ từng bước bằng ký tự xuống dòng \\n để hiển thị đẹp trên ảnh slide bài giảng.
- Với trắc nghiệm nhiều phương án, kết thúc bằng: **Chọn [A/B/C/D].**
- Với trắc nghiệm đúng sai, giải thích rõ từng ý a), b), c), d) và chốt Đúng/Sai cho từng ý.
- Với trả lời ngắn, kết thúc bằng: **Đáp án:** [kết quả].`,
      ]
        .filter(Boolean)
        .join('\n');

      // Include question figures as inline multimodal parts so AI solves diagram-based questions accurately!
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (Array.isArray(questionImages)) {
        for (const fig of questionImages.slice(0, 3)) {
          const m = typeof fig?.dataUrl === 'string' && fig.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (m && m[1] !== 'image/svg+xml') {
            parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
          }
        }
      }
      parts.push({ text: prompt });

      const rawJson = await generateJsonWithFallback({
        contents: { parts },
        systemInstruction:
          'Bạn là giáo viên giỏi chuyên môn theo Chương trình Giáo dục Phổ thông 2018 Việt Nam. Luôn giải chính xác tuyệt đối, sư phạm, dễ hiểu, dùng LaTeX chuẩn KaTeX.',
        responseSchema: SOLVE_SINGLE_SCHEMA,
        thinkingLevel: ThinkingLevel.MEDIUM,
      });

      const parsed = JSON.parse(rawJson) as {
        correctAnswer: string;
        solution: string;
        correctLabels?: string[];
      };

      const normalizedLabels = new Set(
        (parsed.correctLabels || []).map((l) => l.trim().toLowerCase())
      );

      const updatedOptions = Array.isArray(options)
        ? options.map((opt) => ({
            ...opt,
            isCorrect: normalizedLabels.has(opt.label.trim().toLowerCase()),
          }))
        : [];

      res.json({
        correctAnswer: sanitizeServerMathText(parsed.correctAnswer || ''),
        solution: sanitizeServerMathText(parsed.solution || ''),
        options: updatedOptions,
      });
    } catch (err: unknown) {
      console.error('Error in /api/solve-question:', err);
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/solve-batch', async (req: Request, res: Response) => {
    try {
      const { questions, subjectHint } = req.body as {
        questions?: Array<{
          id: string;
          questionNumber: number;
          partTitle?: string;
          type?: string;
          content: string;
          options?: Array<{ label: string; content: string }>;
          questionImages?: Array<{ dataUrl: string }>;
        }>;
        subjectHint?: string;
      };

      if (!Array.isArray(questions) || questions.length === 0) {
        res.status(400).json({ error: 'Danh sách câu hỏi cần giải đang trống.' });
        return;
      }

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      const headerLines = [
        'Hãy giải chính xác, rõ ràng và chi tiết TẤT CẢ các câu hỏi sau theo chuẩn kiến thức Chương trình Giáo dục Phổ thông 2018 Việt Nam.',
        subjectHint ? `Môn/Khối lớp: ${subjectHint}` : '',
        'Trả về đúng trường "id" cho từng câu. Dùng LaTeX chuẩn KaTeX ($...$, $$...$$) và \\n để xuống dòng rõ ràng. Với trắc nghiệm nhiều phương án kết thúc bằng **Chọn [A/B/C/D].**, với đúng sai giải thích và chốt từng ý a), b), c), d), với trả lời ngắn kết thúc bằng **Đáp án:** ...',
      ].filter(Boolean);
      parts.push({ text: headerLines.join('\n') });

      for (const q of questions) {
        const optText =
          Array.isArray(q.options) && q.options.length > 0
            ? '\n' + q.options.map((o) => `  ${o.label}. ${o.content}`).join('\n')
            : '';
        parts.push({
          text: `\n[ID: ${q.id}] Câu ${q.questionNumber} (${q.type || 'multiple_choice'}): ${q.content}${optText}`,
        });
        if (Array.isArray(q.questionImages)) {
          for (const fig of q.questionImages.slice(0, 2)) {
            const m =
              typeof fig?.dataUrl === 'string' &&
              fig.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (m && m[1] !== 'image/svg+xml') {
              parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
            }
          }
        }
      }

      const rawJson = await generateJsonWithFallback({
        contents: { parts },
        systemInstruction:
          'Bạn là giáo viên giỏi chuyên môn theo Chương trình Giáo dục Phổ thông 2018 Việt Nam. Giải chính xác tuyệt đối (kể cả câu có hình vẽ đồ thị/hình học), ngắn gọn mạch lạc, dùng LaTeX chuẩn KaTeX.',
        responseSchema: SOLVE_BATCH_SCHEMA,
        thinkingLevel: ThinkingLevel.MEDIUM,
      });

      const parsed = JSON.parse(rawJson) as {
        solutions: Array<{
          id: string;
          correctAnswer: string;
          solution: string;
          correctLabels?: string[];
        }>;
      };

      res.json({
        solutions: (parsed.solutions || []).map((s) => ({
          ...s,
          correctAnswer: sanitizeServerMathText(s.correctAnswer || ''),
          solution: sanitizeServerMathText(s.solution || ''),
        })),
      });
    } catch (err: unknown) {
      console.error('Error in /api/solve-batch:', err);
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Không tìm thấy đường dẫn API yêu cầu.' });
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('API middleware error:', err);
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({
          error: 'Tệp đề thi vượt quá dung lượng tối đa 20MB. Vui lòng nén tệp hoặc chia nhỏ đề.',
        });
        return;
      }
      res.status(400).json({ error: `Lỗi tải tệp lên: ${err.message}` });
      return;
    }
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Đã xảy ra lỗi không mong muốn trên máy chủ.',
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distPath, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `Server listening on http://0.0.0.0:${PORT} (mode: ${IS_PROD ? 'production' : 'development'})`
    );
  });
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.requestTimeout = 290000;
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
