import React, { useMemo } from 'react';
import katex from 'katex';
import {
  normalizeTextNewlines,
  sanitizeLatexExpression,
} from '../utils/latexSanitizer';

interface MathTextProps {
  text: string;
  className?: string;
}

interface Token {
  type: 'text' | 'inline-math' | 'display-math' | 'bold' | 'italic';
  value: string;
}

type Block =
  | { kind: 'blank' }
  | { kind: 'display-math'; expr: string }
  | { kind: 'line'; raw: string }
  | { kind: 'table'; headers: string[]; rows: string[][] };

function tokenizeInline(line: string): Token[] {
  const tokens: Token[] = [];
  // Matches $$...$$, \[...\], $...$, \(...\), **...**, *...*
  const regex =
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$(?:\\.|[^$\\])+\$|\\\([\s\S]+?\\\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: line.slice(lastIndex, match.index) });
    }

    const raw = match[0];
    if (raw.startsWith('$$') && raw.endsWith('$$')) {
      tokens.push({ type: 'display-math', value: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('\\[') && raw.endsWith('\\]')) {
      tokens.push({ type: 'display-math', value: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('$') && raw.endsWith('$')) {
      tokens.push({ type: 'inline-math', value: raw.slice(1, -1).trim() });
    } else if (raw.startsWith('\\(') && raw.endsWith('\\)')) {
      tokens.push({ type: 'inline-math', value: raw.slice(2, -2).trim() });
    } else if (raw.startsWith('**') && raw.endsWith('**')) {
      tokens.push({ type: 'bold', value: raw.slice(2, -2) });
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push({ type: 'italic', value: raw.slice(1, -1) });
    } else {
      tokens.push({ type: 'text', value: raw });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({ type: 'text', value: line.slice(lastIndex) });
  }

  return tokens;
}

function renderKatexHtml(expr: string, displayMode: boolean): string {
  const sanitized = sanitizeLatexExpression(expr);
  if (!sanitized) return '';
  try {
    return katex.renderToString(sanitized, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
    });
  } catch {
    return sanitized;
  }
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  let inMath = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length) {
      if (trimmed[i + 1] === '|' && !inMath) {
        current += '|';
        i++;
        continue;
      }
      current += ch + trimmed[i + 1];
      i++;
      continue;
    }
    if (ch === '$') {
      inMath = !inMath;
      current += ch;
      continue;
    }
    if (ch === '|' && !inMath) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  const cells = splitMarkdownTableRow(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Extracts multi-line display math blocks ($$...$$, \[...\], and multi-line
 * $...\begin{...}...\end{...}...$) FIRST so systems of equations, matrices,
 * and aligned formulas spanning multiple lines are never split in half.
 */
function parseBlocks(text: string): Block[] {
  const normalized = normalizeTextNewlines(text);

  const displayPlaceholders: string[] = [];
  // 1. Protect $$...$$ and \[...\]
  let protectedText = normalized.replace(
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/g,
    (match) => {
      const inner = match.slice(2, -2).trim();
      const idx = displayPlaceholders.length;
      displayPlaceholders.push(inner);
      return `\n__DISPLAY_MATH_${idx}__\n`;
    }
  );

  // 2. Collapse accidental newlines inside single-dollar math expressions (e.g. $\begin{cases}\n...\n\end{cases}$)
  protectedText = protectedText.replace(
    /\$(?:\\.|[^$\\])+\$/g,
    (match) => (match.includes('\n') ? match.replace(/\s*\n\s*/g, ' ') : match)
  );

  // 3. Wrap bare LaTeX math environments (\begin{cases}...\end{cases}, etc.) not already inside $
  protectedText = protectedText.replace(
    /(^|\n)[ \t]*(\\begin\{(cases|aligned|align\*?|array|pmatrix|bmatrix|vmatrix|matrix)\}[\s\S]*?\\end\{\3\})[ \t]*(?=\n|$)/g,
    (_m, lead: string, envExpr: string) => {
      const idx = displayPlaceholders.length;
      displayPlaceholders.push(envExpr.trim());
      return `${lead}\n__DISPLAY_MATH_${idx}__\n`;
    }
  );

  const lines = protectedText.split('\n');
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    const dmMatch = trimmed.match(/^__DISPLAY_MATH_(\d+)__$/);
    if (dmMatch) {
      const expr = displayPlaceholders[Number(dmMatch[1])] || '';
      if (expr) {
        blocks.push({ kind: 'display-math', expr });
      }
      i++;
      continue;
    }

    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = splitMarkdownTableRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().includes('|')) {
        rows.push(splitMarkdownTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    if (!trimmed) {
      // Avoid consecutive duplicate blank lines created by display-math placeholders
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind !== 'blank' && prev.kind !== 'display-math') {
        blocks.push({ kind: 'blank' });
      }
    } else {
      blocks.push({ kind: 'line', raw: line });
    }
    i++;
  }

  // Trim leading/trailing blank blocks
  while (blocks.length > 0 && blocks[0].kind === 'blank') blocks.shift();
  while (blocks.length > 0 && blocks[blocks.length - 1].kind === 'blank') blocks.pop();

  return blocks;
}

const InlineTokens: React.FC<{ line: string }> = ({ line }) => {
  const tokens = tokenizeInline(line);
  return (
    <>
      {tokens.map((tok, idx) => {
        if (tok.type === 'display-math') {
          return (
            <div
              key={idx}
              style={{ margin: '0.2em 0', textAlign: 'center' }}
              dangerouslySetInnerHTML={{
                __html: renderKatexHtml(tok.value, true),
              }}
            />
          );
        }
        if (tok.type === 'inline-math') {
          return (
            <span
              key={idx}
              dangerouslySetInnerHTML={{
                __html: renderKatexHtml(tok.value, false),
              }}
            />
          );
        }
        if (tok.type === 'bold') {
          const nested = tokenizeInline(tok.value);
          return (
            <strong key={idx} style={{ fontWeight: 700 }}>
              {nested.map((sub, sIdx) =>
                sub.type === 'inline-math' ? (
                  <span
                    key={sIdx}
                    dangerouslySetInnerHTML={{
                      __html: renderKatexHtml(sub.value, false),
                    }}
                  />
                ) : (
                  <React.Fragment key={sIdx}>{sub.value}</React.Fragment>
                )
              )}
            </strong>
          );
        }
        if (tok.type === 'italic') {
          return (
            <em key={idx} style={{ fontStyle: 'italic' }}>
              {tok.value}
            </em>
          );
        }
        return <React.Fragment key={idx}>{tok.value}</React.Fragment>;
      })}
    </>
  );
};

export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  const blocks = useMemo(() => (text ? parseBlocks(text) : []), [text]);

  if (!text) return null;

  return (
    <div className={`exam-math-content ${className}`}>
      {blocks.map((block, bIdx) => {
        if (block.kind === 'blank') {
          return <div key={bIdx} style={{ height: '0.28em' }} />;
        }

        if (block.kind === 'display-math') {
          return (
            <div
              key={bIdx}
              style={{ margin: '0.22em 0', textAlign: 'center' }}
              dangerouslySetInnerHTML={{
                __html: renderKatexHtml(block.expr, true),
              }}
            />
          );
        }

        if (block.kind === 'table') {
          return (
            <div key={bIdx} style={{ margin: '0.35em 0', overflowX: 'auto' }}>
              <table
                style={{
                  borderCollapse: 'collapse',
                  width: 'auto',
                  minWidth: '54%',
                  margin: '0 auto',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #475569',
                }}
              >
                <thead>
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        style={{
                          border: '1.5px solid #475569',
                          padding: '5px 12px',
                          backgroundColor: '#eef4fc',
                          fontWeight: 700,
                          textAlign: 'center',
                          verticalAlign: 'middle',
                        }}
                      >
                        <InlineTokens line={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {block.headers.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            border: '1.5px solid #475569',
                            padding: '5px 12px',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                          }}
                        >
                          <InlineTokens line={row[cIdx] ?? ''} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <div
            key={bIdx}
            style={{
              marginBottom: bIdx < blocks.length - 1 ? '0.18em' : 0,
              wordBreak: 'break-word',
            }}
          >
            <InlineTokens line={block.raw} />
          </div>
        );
      })}
    </div>
  );
};
