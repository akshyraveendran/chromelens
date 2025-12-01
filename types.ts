export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ColorData {
  hex: string;
  rgb: RGB;
  hsl: HSL;
  category: 'Warm' | 'Cool' | 'Neutral';
  population: number; // For dominance sorting
}

export interface PaletteAnalysis {
  all: ColorData[];
  warm: ColorData[];
  cool: ColorData[];
  neutral: ColorData[];
  accents: ColorData[];
}

export interface AIAnalysisResult {
  paletteName: string;
  moodDescription: string;
  designTips: string[];
}