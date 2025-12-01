import { RGB, HSL, ColorData, PaletteAnalysis } from '../types';

// Convert RGB to Hex
export const rgbToHex = ({ r, g, b }: RGB): string => {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

// Convert Hex to RGB
export const hexToRgb = (hex: string): RGB | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// Convert RGB to HSL
export const rgbToHsl = ({ r, g, b }: RGB): HSL => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s, l };
};

// Categorize Color: Simple Rule-Based
export const categorizeColor = (hsl: HSL): 'Warm' | 'Cool' | 'Neutral' => {
  const { h, s, l } = hsl;
  
  // 1. Neutral: Low saturation, very dark, or very light
  if (s <= 0.18 || l <= 0.12 || l >= 0.95) return 'Neutral';

  // 2. Warm: Red, Orange, Yellow, Pink
  if ((h >= 0 && h < 90) || (h >= 315 && h <= 360)) return 'Warm';

  // 3. Cool: Green, Cyan, Blue, Purple
  return 'Cool';
};

// Detect Accents
export const isAccentColor = (hsl: HSL): boolean => {
  return hsl.s >= 0.45 && hsl.l >= 0.2 && hsl.l <= 0.85;
};

// Euclidean distance squared
const colorDistanceSq = (c1: RGB, c2: RGB) => {
  return (c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2;
};

// Main Extraction Logic (Async & Optimized)
export const extractColors = async (
  imageElement: HTMLImageElement,
  sampleRate: number = 10,
  maxColors: number = 8
): Promise<PaletteAnalysis> => {
  // Use a promise to yield to the main thread immediately
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) throw new Error("Could not get canvas context");

      // Resize for performance - 150px is sufficient for dominant color extraction
      const maxSize = 150;
      const scale = Math.min(1, maxSize / Math.max(imageElement.naturalWidth, imageElement.naturalHeight));
      canvas.width = Math.floor(imageElement.naturalWidth * scale);
      canvas.height = Math.floor(imageElement.naturalHeight * scale);
      
      ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Use integer keys for the map to avoid string GC overhead
      // Format: (r << 16) | (g << 8) | b
      const colorCounts = new Map<number, { count: number, r: number, g: number, b: number }>();
      const quantize = 12; // Slightly higher quantization for better grouping

      // Loop with optimization
      for (let i = 0; i < data.length; i += 4 * sampleRate) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        if (a < 200) continue; 

        // Quantize
        const qr = (r / quantize | 0) * quantize;
        const qg = (g / quantize | 0) * quantize;
        const qb = (b / quantize | 0) * quantize;

        // Bitwise hash
        const key = (qr << 16) | (qg << 8) | qb;
        
        const existing = colorCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          colorCounts.set(key, { count: 1, r: qr, g: qg, b: qb });
        }
      }

      // Sort by dominance
      const sortedColors = Array.from(colorCounts.values())
        .sort((a, b) => b.count - a.count);

      // Filter for distinct visual differences
      const distinctColors: typeof sortedColors = [];
      const minDistanceSq = 50 * 50; // Threshold

      for (const color of sortedColors) {
        if (distinctColors.length >= maxColors) break;
        
        const rgb = { r: color.r, g: color.g, b: color.b };
        const isDistinct = distinctColors.every(
          existing => colorDistanceSq({ r: existing.r, g: existing.g, b: existing.b }, rgb) > minDistanceSq
        );

        if (isDistinct) {
          distinctColors.push(color);
        }
      }

      // Construct Result
      const all: ColorData[] = distinctColors.map(c => {
        const rgb = { r: c.r, g: c.g, b: c.b };
        const hsl = rgbToHsl(rgb);
        return {
          rgb,
          hex: rgbToHex(rgb),
          hsl,
          category: categorizeColor(hsl),
          population: c.count
        };
      });

      resolve({
        all,
        warm: all.filter(c => c.category === 'Warm'),
        cool: all.filter(c => c.category === 'Cool'),
        neutral: all.filter(c => c.category === 'Neutral'),
        accents: all.filter(c => isAccentColor(c.hsl)),
      });
    } catch (e) {
      reject(e);
    }
  });
};