import { GoogleGenAI, Type } from "@google/genai";
import { AIAnalysisResult } from '../types';

const getGeminiClient = () => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API_KEY is missing from environment variables.");
      return null;
    }
    return new GoogleGenAI({ apiKey });
};

export const analyzePaletteMood = async (colors: string[]): Promise<AIAnalysisResult | null> => {
    const ai = getGeminiClient();
    if (!ai) return null;

    const prompt = `
      Analyze this color palette: ${colors.join(', ')}.
      Provide a creative, short 2-3 word name for this palette.
      Provide a single sentence description of the mood or vibe it conveys.
      Provide 3 short, punchy design tips for using these colors together.
      Return JSON.
    `;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              paletteName: { type: Type.STRING },
              moodDescription: { type: Type.STRING },
              designTips: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            }
          }
        }
      });

      const text = response.text;
      if (!text) return null;
      return JSON.parse(text) as AIAnalysisResult;

    } catch (error) {
      console.error("Gemini analysis failed:", error);
      return null;
    }
};