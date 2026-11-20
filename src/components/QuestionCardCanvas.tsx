import React from 'react';
import {
  CardFontId,
  CardTemplateSettings,
  CardThemeId,
  ExamQuestion,
} from '../types/exam';
import { MathText } from './MathText';

interface ThemePalette {
  outerBg: string;
  outerBorder: string;
  partRibbonBg: string;
  partRibbonBorder: string;
  qBadgeBg: string;
  qBadgeBorder: string;
  qBoxBg: string;
  qBoxBorder: string;
  optionLabelColor: string;
  correctBg: string;
  correctBorder: string;
  correctLabelColor: string;
  solBadgeBg: string;
  solBadgeBorder: string;
  solBoxBg: string;
  solBoxBorder: string;
  brandBannerBg: string;
  brandBannerBorder: string;
}

const THEMES: Record<CardThemeId, ThemePalette> = {
  classic_sample: {
    outerBg: 'linear-gradient(180deg, #f3f7fd 0%, #e7f0fb 100%)',
    outerBorder: '#c5d8f0',
    partRibbonBg: 'linear-gradient(180deg, #217ae8 0%, #0d52c2 100%)',
    partRibbonBorder: '#0a44a5',
    qBadgeBg: 'linear-gradient(180deg, #1686a7 0%, #0c5e80 56%, #084463 100%)',
    qBadgeBorder: '#3ec5ea',
    qBoxBg: 'linear-gradient(180deg, #fffdf8 0%, #fff7ea 100%)',
    qBoxBorder: '#2a6cb5',
    optionLabelColor: '#134ea8',
    correctBg: '#e8f8ef',
    correctBorder: '#16a34a',
    correctLabelColor: '#15803d',
    solBadgeBg: 'linear-gradient(180deg, #27c766 0%, #16984d 56%, #0f783b 100%)',
    solBadgeBorder: '#50df89',
    solBoxBg: 'linear-gradient(180deg, #f4fcf6 0%, #ecf8ef 100%)',
    solBoxBorder: '#138254',
    brandBannerBg: 'linear-gradient(180deg, #2154dc 0%, #1436aa 56%, #0d257c 100%)',
    brandBannerBorder: '#4f82f7',
  },
  navy_emerald: {
    outerBg: 'linear-gradient(180deg, #f5f7fb 0%, #eaeff7 100%)',
    outerBorder: '#cbd5e1',
    partRibbonBg: 'linear-gradient(180deg, #1e3a8a 0%, #172554 100%)',
    partRibbonBorder: '#0f172a',
    qBadgeBg: 'linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%)',
    qBadgeBorder: '#60a5fa',
    qBoxBg: 'linear-gradient(180deg, #ffffff 0%, #fdfbf7 100%)',
    qBoxBorder: '#1e3a8a',
    optionLabelColor: '#1e3a8a',
    correctBg: '#ecfdf5',
    correctBorder: '#059669',
    correctLabelColor: '#047857',
    solBadgeBg: 'linear-gradient(180deg, #059669 0%, #065f46 100%)',
    solBadgeBorder: '#34d399',
    solBoxBg: 'linear-gradient(180deg, #f5fdf9 0%, #edf9f3 100%)',
    solBoxBorder: '#047857',
    brandBannerBg: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
    brandBannerBorder: '#475569',
  },
  slate_teal: {
    outerBg: 'linear-gradient(180deg, #f4f7f9 0%, #e8eff4 100%)',
    outerBorder: '#c9d7e3',
    partRibbonBg: 'linear-gradient(180deg, #0f766e 0%, #115e59 100%)',
    partRibbonBorder: '#134e4a',
    qBadgeBg: 'linear-gradient(180deg, #0284c7 0%, #0369a1 100%)',
    qBadgeBorder: '#38bdf8',
    qBoxBg: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
    qBoxBorder: '#0f766e',
    optionLabelColor: '#0369a1',
    correctBg: '#f0fdfa',
    correctBorder: '#0d9488',
    correctLabelColor: '#0f766e',
    solBadgeBg: 'linear-gradient(180deg, #0d9488 0%, #0f766e 100%)',
    solBadgeBorder: '#2dd4bf',
    solBoxBg: 'linear-gradient(180deg, #f5fbfb 0%, #edf7f7 100%)',
    solBoxBorder: '#0d9488',
    brandBannerBg: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
    brandBannerBorder: '#38bdf8',
  },
};

const FONT_FAMILIES: Record<CardFontId, string> = {
  times_new_roman: "'Times New Roman', 'Tinos', 'Noto Serif', Times, Georgia, serif",
  noto_serif: "'Noto Serif', 'Times New Roman', Georgia, serif",
  be_vietnam: "'Be Vietnam Pro', 'Plus Jakarta Sans', sans-serif",
  lora: "'Lora', 'Noto Serif', Georgia, serif",
};

function computeOptionColumns(question: ExamQuestion): number {
  if (question.type === 'true_false') return 1;
  if (question.optionColumns && question.optionColumns !== 'auto') {
    return question.optionColumns;
  }
  const opts = question.options || [];
  if (opts.length === 0) return 1;
  const maxLen = Math.max(...opts.map((o) => o.content.length));
  if (maxLen <= 24 && opts.length === 4) return 4;
  if (maxLen <= 56) return 2;
  return 1;
}

interface QuestionCardCanvasProps {
  question: ExamQuestion;
  settings: CardTemplateSettings;
  forceShowSolution?: boolean;
  cardRef?: React.Ref<HTMLDivElement>;
  exportRenderId?: string;
}

/**
 * Native 1600px wide exam slide card faithfully matching the user's reference image:
 * - Top blue part header ribbon with reader+book icon
 * - Warm ivory question box with glossy cyan-blue "Câu X." floating badge
 * - Mint-white solution box with glossy green "Hướng dẫn giải" tab & royal-blue teacher branding banner
 * Uses explicit hex/rgba inline styles for deterministic, razor-sharp PNG rendering via html-to-image.
 */
export const QuestionCardCanvas: React.FC<QuestionCardCanvasProps> = ({
  question,
  settings,
  forceShowSolution,
  cardRef,
  exportRenderId,
}) => {
  const theme = THEMES[settings.themeId] || THEMES.classic_sample;
  const fontFamily = FONT_FAMILIES[settings.fontId] || FONT_FAMILIES.times_new_roman;
  const showSolution =
    typeof forceShowSolution === 'boolean'
      ? forceShowSolution
      : settings.showSolutionBox;

  const scale = settings.fontScale || 1;
  const lineHeight = settings.lineHeight || 1.2;
  const isStemBold = settings.boldQuestionStem !== false;

  const partFontSize = Math.round(28 * scale);
  const badgeFontSize = Math.round(30 * scale);
  const stemFontSize = Math.round(28 * scale);
  const optionFontSize = Math.round(26 * scale);
  const solBadgeFontSize = Math.round(28 * scale);
  const brandFontSize = Math.round(27 * scale);
  const solBodyFontSize = Math.round(26 * scale);

  const optionCols = computeOptionColumns(question);
  const isFixed169 = settings.aspectMode === 'fixed_16_9';

  return (
    <div
      ref={cardRef}
      data-export-render-id={exportRenderId}
      style={{
        width: '1600px',
        minHeight: isFixed169 && showSolution ? '900px' : 'auto',
        height: 'auto',
        background: theme.outerBg,
        fontFamily,
        color: '#0b1120',
        padding: '10px 14px 16px 14px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'visible',
        border: `1.5px solid ${theme.outerBorder}`,
        borderRadius: '16px',
      }}
    >
      {/* 1. TOP PART HEADER RIBBON */}
      {settings.showPartHeader && question.partTitle.trim() && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '13px',
            alignSelf: 'flex-start',
            minWidth: '52%',
            maxWidth: '94%',
            background: theme.partRibbonBg,
            borderTopLeftRadius: '18px',
            borderTopRightRadius: '22px',
            padding: '8px 30px 9px 20px',
            boxShadow: 'inset 0 2px 3px rgba(255,255,255,0.28)',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {/* Crisp Reader + Open Book SVG Icon matching sample image */}
          <svg
            width="40"
            height="40"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ flexShrink: 0 }}
          >
            <circle cx="24" cy="11" r="6.2" fill="#FFFFFF" />
            <path
              d="M6.5 19.5C11.8 19.5 18.2 21.5 22.8 25.4V42.5C18 39 12.2 37.3 6.5 37.3V19.5Z"
              fill="#FFFFFF"
            />
            <path
              d="M41.5 19.5C36.2 19.5 29.8 21.5 25.2 25.4V42.5C30 39 35.8 37.3 41.5 37.3V19.5Z"
              fill="#FFFFFF"
            />
            <path
              d="M14.5 18.2C17.4 16.5 20.8 17.8 24 21.2C27.2 17.8 30.6 16.5 33.5 18.2"
              stroke="#FFFFFF"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              color: '#FFFFFF',
              fontSize: `${partFontSize}px`,
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: '0.01em',
              textShadow: '0 1px 2px rgba(0,0,0,0.28)',
            }}
          >
            {question.partTitle}
          </span>
        </div>
      )}

      {/* 2. QUESTION CONTAINER BOX */}
      <div
        style={{
          position: 'relative',
          background: theme.qBoxBg,
          border: `2.5px solid ${theme.qBoxBorder}`,
          borderRadius:
            settings.showPartHeader && question.partTitle.trim()
              ? '0px 18px 18px 18px'
              : '18px',
          boxShadow: '0 5px 12px rgba(15, 58, 125, 0.13)',
          padding: '12px 24px 16px 24px',
          minHeight: '92px',
          flexShrink: 0,
        }}
      >
        {/* Floating glossy "Câu X." badge overlapping top-left corner */}
        <div
          style={{
            position: 'absolute',
            top: '-3px',
            left: '-3px',
            background: theme.qBadgeBg,
            border: `2.5px solid ${theme.qBadgeBorder}`,
            borderRadius: '12px',
            padding: '5px 24px 6px 24px',
            boxShadow:
              '0 4px 10px rgba(7, 68, 99, 0.32), inset 0 2px 3px rgba(255,255,255,0.38)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '158px',
            zIndex: 3,
          }}
        >
          <span
            style={{
              color: '#FFFFFF',
              fontSize: `${badgeFontSize}px`,
              fontWeight: 700,
              lineHeight: 1.12,
              textShadow: '0 1px 3px rgba(0,0,0,0.35)',
              whiteSpace: 'nowrap',
            }}
          >
            Câu {question.questionNumber}.
          </span>
        </div>

        {/* Question Stem Content + Optional Original Figures */}
        {(() => {
          const qImgs = question.questionImages || [];
          const hasSideFigure =
            qImgs.length === 1 && question.questionImagePosition !== 'below';
          const sideWidthPct = Math.min(52, Math.max(22, qImgs[0]?.widthPercent ?? 34));

          if (hasSideFigure) {
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '20px',
                  paddingTop: '2px',
                }}
              >
                <div
                  className={isStemBold ? 'question-stem-bold' : undefined}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: `${stemFontSize}px`,
                    lineHeight,
                    fontWeight: isStemBold ? 700 : 500,
                    color: '#0a0f1c',
                  }}
                >
                  <div
                    style={{
                      float: 'left',
                      width: '174px',
                      height: '38px',
                    }}
                  />
                  <MathText text={question.content} />
                  <div style={{ clear: 'both' }} />
                </div>

                <div
                  style={{
                    width: `${sideWidthPct}%`,
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#ffffff',
                    border: '1.5px solid rgba(42, 108, 181, 0.25)',
                    borderRadius: '12px',
                    padding: '10px',
                    boxSizing: 'border-box',
                  }}
                >
                  <img
                    src={qImgs[0].dataUrl}
                    alt={qImgs[0].caption || `Hình vẽ Câu ${question.questionNumber}`}
                    referrerPolicy="no-referrer"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '320px',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />
                  {qImgs[0].caption && (
                    <span
                      style={{
                        fontSize: `${Math.round(optionFontSize * 0.78)}px`,
                        color: '#475569',
                        fontStyle: 'italic',
                        textAlign: 'center',
                      }}
                    >
                      {qImgs[0].caption}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          return (
            <>
              <div
                className={isStemBold ? 'question-stem-bold' : undefined}
                style={{
                  fontSize: `${stemFontSize}px`,
                  lineHeight,
                  fontWeight: isStemBold ? 700 : 500,
                  color: '#0a0f1c',
                  paddingTop: '2px',
                }}
              >
                <div
                  style={{
                    float: 'left',
                    width: '174px',
                    height: '38px',
                  }}
                />
                <MathText text={question.content} />
                <div style={{ clear: 'both' }} />
              </div>

              {qImgs.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'flex-start',
                    gap: '18px',
                    marginTop: '14px',
                  }}
                >
                  {qImgs.map((fig, fIdx) => (
                    <div
                      key={fig.id || fIdx}
                      style={{
                        width: `${Math.min(100, Math.max(24, fig.widthPercent ?? (qImgs.length === 1 ? 48 : 44)))}%`,
                        backgroundColor: '#ffffff',
                        border: '1.5px solid rgba(42, 108, 181, 0.25)',
                        borderRadius: '12px',
                        padding: '10px',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <img
                        src={fig.dataUrl}
                        alt={fig.caption || `Hình vẽ Câu ${question.questionNumber}`}
                        referrerPolicy="no-referrer"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '340px',
                          objectFit: 'contain',
                          display: 'block',
                        }}
                      />
                      {fig.caption && (
                        <span
                          style={{
                            fontSize: `${Math.round(optionFontSize * 0.78)}px`,
                            color: '#475569',
                            fontStyle: 'italic',
                            textAlign: 'center',
                          }}
                        >
                          {fig.caption}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          );
        })()}

        {/* Question Options (A, B, C, D or a, b, c, d) */}
        {question.options && question.options.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${optionCols}, minmax(0, 1fr))`,
              gap: optionCols === 1 ? '6px' : '8px 24px',
              marginTop: '12px',
              paddingTop: '10px',
              borderTop: '1px dashed rgba(42, 108, 181, 0.22)',
            }}
          >
            {question.options.map((opt, idx) => {
              const isHighlighted =
                showSolution && settings.highlightCorrectOption && opt.isCorrect;
              const labelSuffix = question.type === 'true_false' ? ')' : '.';

              return (
                <div
                  key={`${opt.label}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: `${optionFontSize}px`,
                    lineHeight,
                    padding: isHighlighted ? '3px 10px' : '2px 4px',
                    borderRadius: '8px',
                    backgroundColor: isHighlighted ? theme.correctBg : 'transparent',
                    border: isHighlighted
                      ? `1.5px solid ${theme.correctBorder}`
                      : '1.5px solid transparent',
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: isHighlighted
                        ? theme.correctLabelColor
                        : theme.optionLabelColor,
                      flexShrink: 0,
                      textDecoration:
                        isHighlighted && question.type === 'multiple_choice'
                          ? 'underline'
                          : 'none',
                      textUnderlineOffset: '4px',
                    }}
                  >
                    {opt.label}
                    {labelSuffix}
                  </span>
                  <div style={{ flex: 1, color: '#0f172a', fontWeight: 500 }}>
                    <MathText text={opt.content} />
                  </div>
                  {showSolution &&
                    question.type === 'true_false' &&
                    typeof opt.isCorrect === 'boolean' && (
                      <span
                        style={{
                          fontSize: `${Math.round(optionFontSize * 0.78)}px`,
                          fontWeight: 700,
                          color: opt.isCorrect ? '#15803d' : '#b91c1c',
                          flexShrink: 0,
                          marginLeft: '8px',
                        }}
                      >
                        [{opt.isCorrect ? 'Đúng' : 'Sai'}]
                      </span>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. SOLUTION CONTAINER BOX ("Hướng dẫn giải") */}
      {showSolution && (
        <div
          style={{
            position: 'relative',
            marginTop: '16px',
            flex: isFixed169 ? 1 : '0 0 auto',
            display: 'flex',
            flexDirection: 'column',
            background: theme.solBoxBg,
            border: `2.5px solid ${theme.solBoxBorder}`,
            borderRadius: '16px',
            boxShadow: '0 5px 14px rgba(16, 124, 79, 0.13)',
            padding: '0 24px 18px 24px',
            minHeight: isFixed169 ? '360px' : '150px',
          }}
        >
          {/* Top bar with green "Hướng dẫn giải" tab on left and royal-blue Teacher Branding Banner on right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '18px',
              marginLeft: '-27px',
              marginRight: '-24px',
              marginTop: '-13px',
              marginBottom: '10px',
            }}
          >
            {/* Glossy Green "Hướng dẫn giải" tab */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '11px',
                background: theme.solBadgeBg,
                border: `2.5px solid ${theme.solBadgeBorder}`,
                borderRadius: '11px',
                padding: '7px 26px 8px 18px',
                boxShadow:
                  '0 4px 10px rgba(15, 120, 59, 0.32), inset 0 2px 3px rgba(255,255,255,0.36)',
                flexShrink: 0,
              }}
            >
              {/* White Magnifying Glass SVG matching reference image */}
              <svg
                width="30"
                height="30"
                viewBox="0 0 36 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
              >
                <circle
                  cx="20"
                  cy="14.5"
                  r="9"
                  stroke="#FFFFFF"
                  strokeWidth="3.4"
                />
                <path
                  d="M13.5 21.5L5.5 29.5"
                  stroke="#FFFFFF"
                  strokeWidth="4.4"
                  strokeLinecap="round"
                />
              </svg>
              <span
                style={{
                  color: '#FFFFFF',
                  fontSize: `${solBadgeFontSize}px`,
                  fontWeight: 700,
                  lineHeight: 1.12,
                  textShadow: '0 1px 2px rgba(0,0,0,0.28)',
                  whiteSpace: 'nowrap',
                }}
              >
                Hướng dẫn giải
              </span>
            </div>

            {/* Glossy Blue Teacher Branding Banner on right */}
            {settings.showBrandBanner && settings.brandText.trim() && (
              <div
                style={{
                  marginTop: '11px',
                  marginRight: '0px',
                  background: theme.brandBannerBg,
                  border: `2px solid ${theme.brandBannerBorder}`,
                  borderRadius: '11px',
                  padding: '7px 24px 8px 24px',
                  boxShadow:
                    '0 4px 12px rgba(13, 37, 124, 0.32), inset 0 2px 3px rgba(255,255,255,0.32)',
                  maxWidth: '64%',
                }}
              >
                <span
                  style={{
                    color: '#FFFFFF',
                    fontSize: `${brandFontSize}px`,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    letterSpacing: '0.01em',
                    textShadow: '0 1px 2px rgba(0,0,0,0.32)',
                    whiteSpace: 'nowrap',
                    display: 'block',
                  }}
                >
                  {settings.brandText}
                </span>
              </div>
            )}
          </div>

          {/* Solution Detailed Body + Optional Solution Figures */}
          <div
            style={{
              flex: 1,
              fontSize: `${solBodyFontSize}px`,
              lineHeight,
              color: '#0f172a',
              fontWeight: 400,
              paddingTop: '2px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {question.solution.trim() ? (
              <MathText text={question.solution} />
            ) : (question.solutionImages || []).length === 0 ? (
              <div
                style={{
                  color: '#64748b',
                  fontStyle: 'italic',
                  paddingTop: '12px',
                }}
              >
                Chưa có bài giải chi tiết. Nhấn &ldquo;Giải tự động (GDPT 2018)&rdquo; để hệ thống tự giải câu này.
              </div>
            ) : null}

            {(question.solutionImages || []).length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  alignItems: 'flex-start',
                  gap: '18px',
                  marginTop: '4px',
                }}
              >
                {(question.solutionImages || []).map((fig, fIdx) => (
                  <div
                    key={fig.id || fIdx}
                    style={{
                      width: `${Math.min(100, Math.max(24, fig.widthPercent ?? 52))}%`,
                      backgroundColor: '#ffffff',
                      border: '1.5px solid rgba(19, 130, 84, 0.25)',
                      borderRadius: '12px',
                      padding: '10px',
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <img
                      src={fig.dataUrl}
                      alt={fig.caption || `Hình vẽ bài giải Câu ${question.questionNumber}`}
                      referrerPolicy="no-referrer"
                      style={{
                        maxWidth: '100%',
                        maxHeight: '360px',
                        objectFit: 'contain',
                        display: 'block',
                      }}
                    />
                    {fig.caption && (
                      <span
                        style={{
                          fontSize: `${Math.round(solBodyFontSize * 0.78)}px`,
                          color: '#475569',
                          fontStyle: 'italic',
                          textAlign: 'center',
                        }}
                      >
                        {fig.caption}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
