/**
 * Caption data model. The flat `words` array (millisecond timing from
 * whisper.cpp) is the source of truth; `lines` are a display grouping derived
 * from it. Karaoke rendering finds the active word per frame by timestamp.
 */

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  lineIndex: number;
}

export interface CaptionLine {
  index: number;
  startMs: number;
  endMs: number;
  wordIndices: number[];
  text: string;
}

export interface Caption {
  id: string;
  source: "whisper";
  model: string;
  language: string;
  styleId: CaptionStyleId;
  words: CaptionWord[];
  lines: CaptionLine[];
}

/** Raw shape returned by the Rust `generate_captions` command. */
export interface RawCaptionWord {
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface RawCaptionResult {
  language: string;
  model: string;
  words: RawCaptionWord[];
}

export type CaptionStyleId = "hormozi" | "opus" | "karaoke" | "clean" | "minimal";

export interface CaptionStylePreset {
  id: CaptionStyleId;
  label: string;
  sampleText: string;
  fontFamily: string;
  /** Color of the currently-spoken (highlighted) word. */
  activeColor: string;
  /** Color of inactive words in the same line. */
  baseColor: string;
  outlineColor: string;
  uppercase: boolean;
  /** Highlight treatment for the active word. */
  highlight: "color" | "box" | "scale" | "none";
  fontWeight: number;
  /** Max words shown per caption line. */
  maxWordsPerLine: number;
}

export const CAPTION_STYLE_PRESETS: CaptionStylePreset[] = [
  {
    id: "hormozi",
    label: "Hormozi",
    sampleText: "BOLD",
    fontFamily: "'Arial Black', system-ui, sans-serif",
    activeColor: "#FFE800",
    baseColor: "#FFFFFF",
    outlineColor: "#000000",
    uppercase: true,
    highlight: "color",
    fontWeight: 900,
    maxWordsPerLine: 4,
  },
  {
    id: "opus",
    label: "Opus",
    sampleText: "Clip",
    fontFamily: "system-ui, sans-serif",
    activeColor: "#34D399",
    baseColor: "#FFFFFF",
    outlineColor: "#000000",
    uppercase: false,
    highlight: "box",
    fontWeight: 800,
    maxWordsPerLine: 5,
  },
  {
    id: "karaoke",
    label: "Karaoke",
    sampleText: "Sing",
    fontFamily: "system-ui, sans-serif",
    activeColor: "#60A5FA",
    baseColor: "#E5E7EB",
    outlineColor: "#1E293B",
    uppercase: false,
    highlight: "color",
    fontWeight: 700,
    maxWordsPerLine: 6,
  },
  {
    id: "clean",
    label: "Clean",
    sampleText: "Aa",
    fontFamily: "system-ui, sans-serif",
    activeColor: "#FFFFFF",
    baseColor: "#FFFFFF",
    outlineColor: "#000000",
    uppercase: false,
    highlight: "none",
    fontWeight: 600,
    maxWordsPerLine: 7,
  },
  {
    id: "minimal",
    label: "Minimal",
    sampleText: "aa",
    fontFamily: "system-ui, sans-serif",
    activeColor: "#FFFFFF",
    baseColor: "#D1D5DB",
    outlineColor: "transparent",
    uppercase: false,
    highlight: "none",
    fontWeight: 500,
    maxWordsPerLine: 8,
  },
];

export function getCaptionStyle(id: CaptionStyleId): CaptionStylePreset {
  return CAPTION_STYLE_PRESETS.find((p) => p.id === id) ?? CAPTION_STYLE_PRESETS[0]!;
}

/**
 * Group a flat word list into display lines: break on a max word count or a
 * silence gap (default 600ms) between consecutive words. Returns lines and the
 * words array with `lineIndex` assigned.
 */
export function groupWordsIntoLines(
  words: { text: string; startMs: number; endMs: number; confidence: number }[],
  maxWordsPerLine: number,
  gapMs = 600
): { words: CaptionWord[]; lines: CaptionLine[] } {
  const outWords: CaptionWord[] = [];
  const lines: CaptionLine[] = [];
  let current: number[] = [];
  let lineIndex = 0;

  const flush = () => {
    if (current.length === 0) return;
    const first = outWords[current[0]!]!;
    const last = outWords[current[current.length - 1]!]!;
    lines.push({
      index: lineIndex,
      startMs: first.startMs,
      endMs: last.endMs,
      wordIndices: [...current],
      text: current.map((i) => outWords[i]!.text).join(" "),
    });
    lineIndex += 1;
    current = [];
  };

  words.forEach((w, i) => {
    const prev = words[i - 1];
    const gapTooBig = prev ? w.startMs - prev.endMs > gapMs : false;
    if (current.length >= maxWordsPerLine || gapTooBig) flush();
    outWords.push({ ...w, text: w.text.trim(), lineIndex });
    current.push(outWords.length - 1);
  });
  flush();

  return { words: outWords, lines };
}
