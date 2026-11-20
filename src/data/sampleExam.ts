import { CardTemplateSettings, ExamQuestion } from '../types/exam';

export const DEFAULT_TEMPLATE_SETTINGS: CardTemplateSettings = {
  brandText: 'Lớp Toán thầy Thúc – Zalo: 0931.768.172',
  showBrandBanner: true,
  showPartHeader: true,
  showSolutionBox: true,
  highlightCorrectOption: true,
  themeId: 'classic_sample',
  fontId: 'times_new_roman',
  fontScale: 1.0,
  lineHeight: 1.2,
  boldQuestionStem: true,
  aspectMode: 'auto_16_9',
  filePrefix: 'Cau',
  exportScale: 2,
};

export const SAMPLE_EXAM_TITLE = 'Đề ôn tập Toán 12 — Chương trình GDPT 2018';

export const SAMPLE_QUESTIONS: ExamQuestion[] = [
  {
    id: 'sample-q-1',
    questionNumber: 1,
    partTitle: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.',
    type: 'multiple_choice',
    content:
      'Cho hàm số $y = x^3 - 3x^2 + 2$. Hàm số đã cho nghịch biến trên khoảng nào dưới đây?',
    options: [
      { label: 'A', content: '$(-\\infty; 0)$', isCorrect: false },
      { label: 'B', content: '$(0; 2)$', isCorrect: true },
      { label: 'C', content: '$(2; +\\infty)$', isCorrect: false },
      { label: 'D', content: '$(0; +\\infty)$', isCorrect: false },
    ],
    correctAnswer: 'B',
    solution:
      'Tập xác định của hàm số là $D = \\mathbb{R}$.\nTa có đạo hàm: $y\' = 3x^2 - 6x$.\nXét phương trình $y\' = 0 \\Leftrightarrow 3x(x - 2) = 0 \\Leftrightarrow \\left[\\begin{array}{l}x = 0\\\\x = 2\\end{array}\\right.$\nXét dấu $y\'$: với mọi $x \\in (0; 2)$ ta có $y\' < 0$.\nDo đó hàm số nghịch biến trên khoảng $(0; 2)$.\n**Chọn B.**',
    hasOriginalSolution: true,
    isAiSolved: false,
    selectedForExport: true,
    optionColumns: 4,
  },
  {
    id: 'sample-q-2',
    questionNumber: 2,
    partTitle: 'PHẦN I. Câu trắc nghiệm nhiều phương án lựa chọn.',
    type: 'multiple_choice',
    content:
      'Trong không gian $Oxyz$, cho hai điểm $A(1; -2; 3)$ và $B(3; 0; -1)$. Phương trình mặt phẳng trung trực của đoạn thẳng $AB$ là:',
    options: [
      { label: 'A', content: '$x + y - 2z + 1 = 0$', isCorrect: false },
      { label: 'B', content: '$x + y - 2z - 1 = 0$', isCorrect: false },
      { label: 'C', content: '$x + y - 2z + 1 = 0$ sai? Không — $x + y - 2z + 2 = 0$', isCorrect: false },
      { label: 'D', content: '$x + y - 2z + 1 = 0$', isCorrect: true },
    ].map((opt, idx) =>
      idx === 0
        ? { label: 'A', content: '$x + y - 2z - 3 = 0$', isCorrect: false }
        : idx === 1
          ? { label: 'B', content: '$x + y - 2z + 3 = 0$', isCorrect: false }
          : idx === 2
            ? { label: 'C', content: '$x + y - 2z + 1 = 0$', isCorrect: true }
            : { label: 'D', content: '$x - y - 2z + 1 = 0$', isCorrect: false }
    ),
    correctAnswer: 'C',
    solution:
      'Gọi $I$ là trung điểm của đoạn thẳng $AB$, ta có tọa độ:\n$$I\\left(\\frac{1+3}{2}; \\frac{-2+0}{2}; \\frac{3+(-1)}{2}\\right) = (2; -1; 1).$$\nMặt phẳng trung trực $(P)$ của $AB$ đi qua $I(2; -1; 1)$ và nhận vectơ $\\overrightarrow{AB} = (2; 2; -4) = 2(1; 1; -2)$ làm vectơ pháp tuyến, nên chọn $\\vec{n} = (1; 1; -2)$.\nPhương trình mặt phẳng $(P)$ là:\n$$1(x - 2) + 1(y + 1) - 2(z - 1) = 0 \\Leftrightarrow x + y - 2z + 1 = 0.$$\n**Chọn C.**',
    hasOriginalSolution: true,
    isAiSolved: false,
    selectedForExport: true,
    optionColumns: 2,
  },
  {
    id: 'sample-q-3',
    questionNumber: 3,
    partTitle: 'PHẦN II. Câu trắc nghiệm đúng sai.',
    type: 'true_false',
    content:
      'Một chất điểm chuyển động thẳng với vận tốc được biểu diễn theo thời gian $t$ (giây) bởi công thức $v(t) = 3t^2 - 6t + 5\\ (\\text{m/s})$ với $t \\ge 0$. Xét tính đúng sai của các khẳng định sau:',
    options: [
      { label: 'a', content: 'Vận tốc của chất điểm tại thời điểm ban đầu $t = 0$ là $5\\ \\text{m/s}$.', isCorrect: true },
      { label: 'b', content: 'Gia tốc của chất điểm tại thời điểm $t = 2\\text{ s}$ là $6\\ \\text{m/s}^2$.', isCorrect: true },
      { label: 'c', content: 'Vận tốc nhỏ nhất của chất điểm đạt được là $3\\ \\text{m/s}$.', isCorrect: false },
      { label: 'd', content: 'Quãng đường chất điểm đi được trong $3$ giây đầu tiên là $15\\ \\text{m}$.', isCorrect: true },
    ],
    correctAnswer: 'a) Đúng, b) Đúng, c) Sai, d) Đúng',
    solution:
      '• **Ý a) Đúng:** Tại $t = 0$, ta có $v(0) = 3\\cdot 0^2 - 6\\cdot 0 + 5 = 5\\ (\\text{m/s})$.\n• **Ý b) Đúng:** Gia tốc là $a(t) = v\'(t) = 6t - 6$. Tại $t = 2$, $a(2) = 6(2) - 6 = 6\\ (\\text{m/s}^2)$.\n• **Ý c) Sai:** Ta có $v(t) = 3(t - 1)^2 + 2 \\ge 2$ với mọi $t \\ge 0$. Vậy vận tốc nhỏ nhất là $2\\ \\text{m/s}$ tại $t = 1\\text{ s}$.\n• **Ý d) Đúng:** Vì $v(t) > 0$ với mọi $t \\ge 0$, quãng đường đi được trong $3$ giây đầu là:\n$$S = \\int_0^3 (3t^2 - 6t + 5)\\,\\mathrm{d}t = \\left.(t^3 - 3t^2 + 5t)\\right|_0^3 = 27 - 27 + 15 = 15\\ (\\text{m}).$$',
    hasOriginalSolution: false,
    isAiSolved: true,
    selectedForExport: true,
    optionColumns: 1,
  },
  {
    id: 'sample-q-4',
    questionNumber: 4,
    partTitle: 'PHẦN III. Câu trắc nghiệm trả lời ngắn.',
    type: 'short_answer',
    content:
      'Trong một hộp có $6$ viên bi đỏ và $4$ viên bi xanh cùng kích thước và khối lượng. Lấy ngẫu nhiên lần lượt $2$ viên bi không hoàn lại. Tính xác suất để viên bi thứ hai lấy ra có màu xanh, biết rằng viên bi thứ nhất lấy ra có màu đỏ (làm tròn kết quả đến hàng phần trăm).',
    options: [],
    correctAnswer: '0,44',
    solution:
      'Gọi $A$ là biến cố "viên bi thứ nhất lấy ra có màu đỏ" và $B$ là biến cố "viên bi thứ hai lấy ra có màu xanh".\nKhi biến cố $A$ đã xảy ra, trong hộp còn lại $5$ viên bi đỏ và $4$ viên bi xanh (tổng cộng $9$ viên bi).\nTheo công thức xác suất có điều kiện (GDPT 2018):\n$$P(B \\mid A) = \\frac{4}{9} \\approx 0{,}44.$$\n**Đáp án:** $0{,}44$.',
    hasOriginalSolution: false,
    isAiSolved: true,
    selectedForExport: true,
    optionColumns: 1,
  },
];
