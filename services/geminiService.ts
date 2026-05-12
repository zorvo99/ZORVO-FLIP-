
import { GoogleGenAI, Type } from "@google/genai";

const apiKey = (
  import.meta.env.VITE_GEMINI_API_KEY ||
  (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '') ||
  ''
).trim();

let genAi: GoogleGenAI | null = null;
const getGenAI = (): GoogleGenAI | null => {
  if (!apiKey) return null;
  if (!genAi) genAi = new GoogleGenAI({ apiKey });
  return genAi;
};

/**
 * Generates rough ballpark estimates for renovation items.
 * Uses Flash model for high speed and responsiveness.
 */
export const getDetailedItemEstimates = async (
  items: string[], 
  roomType: string, 
  dims: { length: number; width: number; height: number },
  postcode: string,
  quantities: Record<string, number> = {}
) => {
  if (!apiKey) {
    console.warn("Missing Gemini key in .env (VITE_GEMINI_API_KEY or GEMINI_API_KEY).");
    return [];
  }

  // Using Flash for maximum speed - User requested "Snappy"
  const model = 'gemini-3-flash-preview';
  
  const itemsWithQuantities = items.map(item => {
    const qty = quantities[item];
    return qty ? `${item} (${qty} units)` : item;
  }).join(', ');

  const prompt = `Professional Australian cost estimator. 
  Area: ${roomType} (${dims.length}m x ${dims.width}m x ${dims.height}m). 
  Postcode: ${postcode}.
  Items: ${itemsWithQuantities}.

  Provide ball-park mid-point AUD estimates.
  Return JSON:
  {
    "estimates": [
      {
        "description": "Item name",
        "amount": number,
        "category": "Labour" | "Materials",
        "supplier": "Bunnings/Reece/Local",
        "supplierUrl": "Search URL",
        "calculationBreakdown": "Note"
      }
    ]
  }`;

  const ai = getGenAI();
  if (!ai) return [];

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            estimates: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  supplier: { type: Type.STRING },
                  supplierUrl: { type: Type.STRING },
                  calculationBreakdown: { type: Type.STRING }
                },
                required: ["description", "amount", "category", "supplier", "supplierUrl", "calculationBreakdown"]
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || '{"estimates": []}').estimates;
  } catch (error) {
    console.error("Estimation Error:", error);
    return [];
  }
};

/**
 * Analyzes multiple room photos and provides renovation strategy.
 */
export const getRenovationSuggestions = async (images: string[], roomType: string) => {
  if (!apiKey) {
    console.warn("Missing Gemini API key in .env (VITE_GEMINI_API_KEY or GEMINI_API_KEY).");
    return { text: "AI is not configured yet. Add VITE_GEMINI_API_KEY or GEMINI_API_KEY.", actions: [] };
  }

  const model = 'gemini-3-flash-preview';
  
  const imageParts = images.map(img => {
    const match = img.match(/^data:(image\/[a-zA-Z]*);base64,(.*)$/);
    const mimeType = match ? match[1] : 'image/jpeg';
    const base64Data = match ? match[2] : img;
    return {
      inlineData: { data: base64Data, mimeType },
    };
  });

  const textPart = {
    text: `Expert Australian designer. Analyze these ${images.length} photos of a ${roomType}.
    1. AI Design Strategy.
    2. Mapped Action Items.
    3. AUD estimates and search queries.

    Return JSON:
    {
      "text": "Strategy...",
      "actions": [
        {
          "description": "Item",
          "category": "Labour" | "Materials",
          "estimatedCost": number,
          "searchQuery": "Search",
          "supplier": "Supplier",
          "supplierUrl": "URL"
        }
      ]
    }`
  };

  const ai = getGenAI();
  if (!ai) {
    return { text: "AI is not configured yet. Add VITE_GEMINI_API_KEY or GEMINI_API_KEY to continue.", actions: [] };
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [...imageParts, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING },
            actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  category: { type: Type.STRING },
                  estimatedCost: { type: Type.NUMBER },
                  searchQuery: { type: Type.STRING },
                  supplier: { type: Type.STRING },
                  supplierUrl: { type: Type.STRING }
                },
                required: ["description", "category", "estimatedCost", "searchQuery", "supplier", "supplierUrl"]
              }
            }
          },
          required: ["text", "actions"]
        }
      }
    });

    return JSON.parse(response.text || '{"text": "", "actions": []}');
  } catch (error) {
    console.error("Vision Analysis Error:", error);
    return { text: "Failed to analyze room images.", actions: [] };
  }
};
