export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';

export interface QuestionOption {
  label: string;
  content: string;
  isCorrect?: boolean;
}

export interface QuestionFigure {
  id: string;
  dataUrl: string;
  caption?: string;
  widthPercent?: number;
}

export interface FigureBoundingBox {
  page: number;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  caption?: string;
}

export interface ExamQuestion {
  id: string;
  questionNumber: number;
  partTitle: string;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  solution: string;
  hasOriginalSolution: boolean;
  isAiSolved: boolean;
  selectedForExport: boolean;
  optionColumns?: 'auto' | 1 | 2 | 4;
  questionImages?: QuestionFigure[];
  solutionImages?: QuestionFigure[];
  questionImagePosition?: 'right' | 'below';
}

export type CardThemeId = 'classic_sample' | 'navy_emerald' | 'slate_teal';
export type CardFontId = 'times_new_roman' | 'noto_serif' | 'be_vietnam' | 'lora';
export type ExportContentMode = 'both' | 'question_only' | 'split_zip';
export type CanvasAspectMode = 'auto_16_9' | 'fixed_16_9';

export interface CardTemplateSettings {
  brandText: string;
  showBrandBanner: boolean;
  showPartHeader: boolean;
  showSolutionBox: boolean;
  highlightCorrectOption: boolean;
  boldQuestionStem: boolean;
  lineHeight: number;
  themeId: CardThemeId;
  fontId: CardFontId;
  fontScale: number;
  aspectMode: CanvasAspectMode;
  filePrefix: string;
  exportScale: 1 | 2;
}

export interface ParsedQuestionItem {
  questionNumber: number;
  partTitle: string;
  type: QuestionType;
  content: string;
  options: QuestionOption[];
  correctAnswer: string;
  solution: string;
  hasOriginalSolution: boolean;
  isAiSolved: boolean;
  questionImages?: QuestionFigure[];
  solutionImages?: QuestionFigure[];
  questionFigureBoxes?: FigureBoundingBox[];
  solutionFigureBoxes?: FigureBoundingBox[];
}

export interface ParseExamResponse {
  examTitle: string;
  subject: string;
  gradeLevel: string;
  questions: ParsedQuestionItem[];
}

export interface SolveQuestionResponse {
  correctAnswer: string;
  solution: string;
  options?: QuestionOption[];
}
