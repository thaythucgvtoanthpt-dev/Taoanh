/**
 * Repairs common LaTeX escaping glitches, Vietnamese ex_test macros, and Unicode math
 * symbols so KaTeX renders mathematical formulas cleanly with zero parse errors.
 */

const UNICODE_MATH_MAP: Array<[RegExp, string]> = [
  [/≤/g, '\\le '],
  [/≥/g, '\\ge '],
  [/≠/g, '\\neq '],
  [/≈/g, '\\approx '],
  [/≡/g, '\\equiv '],
  [/±/g, '\\pm '],
  [/∓/g, '\\mp '],
  [/×/g, '\\times '],
  [/÷/g, '\\div '],
  [/·/g, '\\cdot '],
  [/∞/g, '\\infty '],
  [/⇒/g, '\\Rightarrow '],
  [/⇔/g, '\\Leftrightarrow '],
  [/→/g, '\\to '],
  [/←/g, '\\leftarrow '],
  [/∈/g, '\\in '],
  [/∉/g, '\\notin '],
  [/⊂/g, '\\subset '],
  [/⊆/g, '\\subseteq '],
  [/∪/g, '\\cup '],
  [/∩/g, '\\cap '],
  [/∅/g, '\\varnothing '],
  [/∀/g, '\\forall '],
  [/∃/g, '\\exists '],
  [/∠/g, '\\angle '],
  [/⊥/g, '\\perp '],
  [/∥/g, '\\parallel '],
  [/△/g, '\\triangle '],
  [/°/g, '^\\circ '],
  [/ℝ/g, '\\mathbb{R}'],
  [/ℤ/g, '\\mathbb{Z}'],
  [/ℕ/g, '\\mathbb{N}'],
  [/ℚ/g, '\\mathbb{Q}'],
  [/ℂ/g, '\\mathbb{C}'],
  [/π/g, '\\pi '],
  [/α/g, '\\alpha '],
  [/β/g, '\\beta '],
  [/γ/g, '\\gamma '],
  [/δ/g, '\\delta '],
  [/Δ/g, '\\Delta '],
  [/θ/g, '\\theta '],
  [/λ/g, '\\lambda '],
  [/μ/g, '\\mu '],
  [/σ/g, '\\sigma '],
  [/φ/g, '\\varphi '],
  [/Φ/g, '\\Phi '],
  [/ω/g, '\\omega '],
  [/Ω/g, '\\Omega '],
  [/∑/g, '\\sum '],
  [/∫/g, '\\int '],
  [/−/g, '-'],
  [/–/g, '-'],
];

/**
 * Expands Vietnamese ex_test macros \heva{...} (system of equations) and
 * \hoac{...} (disjunction bracket) using balanced brace matching.
 */
function expandVietnameseMacro(
  input: string,
  macroName: 'heva' | 'hoac',
  leftDelim: string
): string {
  const needle = `\\${macroName}{`;
  let result = input;
  let guard = 0;

  while (result.includes(needle) && guard < 20) {
    guard++;
    const startIdx = result.indexOf(needle);
    let depth = 0;
    let endIdx = -1;
    for (let i = startIdx + needle.length - 1; i < result.length; i++) {
      if (result[i] === '{' && result[i - 1] !== '\\') depth++;
      else if (result[i] === '}' && result[i - 1] !== '\\') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    if (endIdx === -1) break;

    const inner = result.slice(startIdx + needle.length, endIdx).trim();
    const cleanedInner = inner.replace(/&/g, '');
    const replacement = `\\left${leftDelim}\\begin{array}{l}${cleanedInner}\\end{array}\\right.`;
    result = result.slice(0, startIdx) + replacement + result.slice(endIdx + 1);
  }

  return result;
}

/**
 * Repairs ASCII control characters created when a single backslash before f/t/r/b
 * was interpreted by JSON.parse (e.g. "\frac" -> "\u000crac", "\times" -> "\times").
 */
export function repairControlEscapedLatex(text: string): string {
  return text
    .replace(/\f(rac|orall|lat|rown)/g, '\\f$1')
    .replace(/\t(ext|imes|o\b|an\b|au\b|heta|riangle|op|frac|ilde|herefore)/g, '\\t$1')
    .replace(/\r(ight|ho|angle|ceil|floor|m\b)/g, '\\r$1')
    .replace(/\x08(egin|eta|inom|ig|ar|oldsymbol|ot|oxed|ullet)/g, '\\b$1');
}

/**
 * Safely normalizes escaped literal "\n" sequences in text WITHOUT corrupting
 * LaTeX commands starting with \n (\neq, \notin, \nu, \nabla, \natural, etc.).
 */
export function normalizeTextNewlines(raw: string): string {
  const repaired = repairControlEscapedLatex(raw);
  return repaired.replace(
    /\\n(?!(?:eq\b|e\b|otin\b|ot\b|u\b|abla\b|atural\b|eg\b|exists\b|i\b|less\b|gtr\b|leq\b|geq\b|mid\b|parallel\b|subset|supset|rightarrow|leftarrow|leftrightarrow|Rightarrow|Leftarrow|Leftrightarrow|ormalsize\b|ewline\b|oindent\b|olimits\b|onumber\b|cong\b|sim\b|vdash\b|vDash\b|VDash\b|triangle|short|prec|succ))/g,
    '\n'
  );
}

/**
 * Sanitizes a single KaTeX math expression (the content inside $...$ or $$...$$).
 */
export function sanitizeLatexExpression(expr: string): string {
  let s = repairControlEscapedLatex(expr).trim();

  // Expand Vietnamese math LaTeX macros
  s = expandVietnameseMacro(s, 'heva', '\\{');
  s = expandVietnameseMacro(s, 'hoac', '[');

  // Convert unsupported or non-standard commands to KaTeX equivalents
  s = s
    .replace(/\\wideparen\{/g, '\\overset{\\frown}{')
    .replace(/\\mathscr\{/g, '\\mathcal{')
    .replace(/\\rm\s+/g, '\\mathrm ')
    .replace(/\\limits\b/g, '\\limits')
    .replace(/\\operatorname\*?\{([^}]+)\}/g, '\\operatorname{$1}')
    .replace(/\\dx\b/g, '\\,\\mathrm{d}x')
    .replace(/\\dy\b/g, '\\,\\mathrm{d}y')
    .replace(/\\dt\b/g, '\\,\\mathrm{d}t')
    .replace(/\\du\b/g, '\\,\\mathrm{d}u')
    // Fix unescaped % inside math mode which KaTeX treats as a comment!
    .replace(/(^|[^\\])%/g, '$1\\%');

  for (const [pattern, replacement] of UNICODE_MATH_MAP) {
    s = s.replace(pattern, replacement);
  }

  return s.trim();
}
