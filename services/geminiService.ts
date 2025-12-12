import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeneratedCampaign, CampaignConfig, ImageQuality } from "../types";

// Helper untuk mengambil API Key dengan aman
const getApiKey = (): string => {
  const key = process.env.VITE_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return ""; // Return empty string instead of throwing, to allow manual mode
  return key;
};

// Variabel throttling (Removed strict throttling for paid/pro usage, kept only minimal buffer)
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 0.5 Detik buffer

const enforceThrottling = async () => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
};

const retryWithBackoff = async <T>(
  operation: () => Promise<T>,
  retries: number = 3,
  initialDelay: number = 2000
): Promise<T> => {
  let lastError: any;
  
  for (let i = 0; i < retries; i++) {
    try {
      await enforceThrottling(); // Cek throttling sebelum request
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const isRateLimit = 
        error.status === 429 || 
        error.code === 429 || 
        error.status === "RESOURCE_EXHAUSTED" ||
        (error.message && error.message.toLowerCase().includes('quota')) ||
        (error.message && error.message.toLowerCase().includes('rate limit'));

      const isOverloaded = 
        error.status === 503 || 
        error.code === 503 ||
        (error.message && error.message.toLowerCase().includes('overloaded')) ||
        (error.message && error.message.toLowerCase().includes('unavailable'));

      if ((isRateLimit || isOverloaded) && i < retries - 1) {
        let waitTime = initialDelay * Math.pow(2, i);
        waitTime += Math.random() * 1000;

        if (error.message) {
            const match = error.message.match(/retry in (\d+(\.\d+)?)s/);
            if (match && match[1]) {
                const serverRequestedWait = parseFloat(match[1]) * 1000;
                waitTime = Math.max(waitTime, serverRequestedWait + 1000);
            }
        }

        console.warn(`Gemini API Busy/Rate Limited. Waiting ${Math.round(waitTime/1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

// EXPORTED HELPER: Generate Prompt Text for Manual Mode
export const generateManualPromptText = (config: CampaignConfig): string => {
  let modelInstruction = "";
  if (config.modelType === 'indo_man') {
    modelInstruction = `
      MODEL UTAMA: Pria Indonesia (Indonesian Man).
      
      ATURAN KONSISTENSI KARAKTER (WAJIB):
      1. Tentukan SATU outfit spesifik. Contoh: "Wearing a plain solid black t-shirt".
      2. Tentukan fitur wajah spesifik. Contoh: "Short fade haircut, brown skin".
      3. ANDA WAJIB MENULIS ULANG deskripsi pakaian dan fisik ini secara LENGKAP di SETIAP field "image_prompt" (Scene 1, 2, & 3).
      4. Karakter harus terlihat SAMA PERSIS (Same Person, Same Clothes) di semua scene.
    `;
  } else if (config.modelType === 'indo_woman') {
    modelInstruction = `
      MODEL UTAMA: Wanita Indonesia (Indonesian Woman).
      
      ATURAN KONSISTENSI KARAKTER (WAJIB):
      1. Tentukan SATU outfit spesifik. Contoh: "Wearing a beige modest blouse and white pants".
      2. Tentukan fitur wajah spesifik. Contoh: "Long straight black hair, soft natural makeup".
      3. ANDA WAJIB MENULIS ULANG deskripsi pakaian dan fisik ini secara LENGKAP di SETIAP field "image_prompt" (Scene 1, 2, & 3).
      4. Karakter harus terlihat SAMA PERSIS (Same Person, Same Clothes) di semua scene.
    `;
  } else {
    modelInstruction = `
      MODEL UTAMA: TIDAK ADA MANUSIA (Product Only).
      
      ATURAN KONSISTENSI BACKGROUND (WAJIB):
      1. Tentukan SATU setting meja/ruangan. Contoh: "On a white minimalist wooden table with a small plant in background".
      2. Ulangi deskripsi setting ini di setiap scene agar lokasi tidak berubah-ubah.
    `;
  }

  let styleInstruction = "";
  if (config.styleType === 'cinematic') {
    styleInstruction = `GAYA VISUAL: CLEAN STUDIO REVIEW. Background: Tembok studio polos atau rak minimalis yang blur. Lighting: Softbox lighting (terang tapi lembut). Vibe: Profesional tech/product reviewer, bersih.`;
  } else {
    styleInstruction = `GAYA VISUAL: HOME REVIEW (UGC). Background: Kamar tidur atau ruang tamu yang rapi tapi "homey". Lighting: Natural window light. Vibe: Jujur, autentik, barang dipakai sehari-hari.`;
  }

  const productNameContext = config.productName 
    ? `NAMA PRODUK: "${config.productName}"`
    : `NAMA PRODUK: Analisis dari gambar yang saya upload.`;

  return `
Role: Anda adalah Affiliate Content Strategist.
Tugas: Buat struktur konten video pendek (3 Scene) yang KONSISTEN.

KONTEKS PENGGUNA:
${productNameContext}
${modelInstruction}
${styleInstruction}

ATURAN UTAMA (STRICT):
1. LOKASI WAJIB INDOOR/DALAM RUANGAN.
2. KONSISTENSI VISUAL: Gunakan deskripsi karakter/outfit yang SAMA PERSIS (Copy-Paste) di setiap scene.
3. WAJIB DETAIL PRODUK: Salah satu dari Scene 1 atau Scene 2 HARUS menggunakan angle "Extreme Close Up" atau "Macro Shot" untuk memperlihatkan tekstur/kualitas produk.
4. Prompt Gambar: Tambahkan "no text, no watermark, no typography, clean image" di akhir.
5. Prompt Video (kling_video_prompt): WAJIB PORTRAIT/VERTICAL (9:16). Tambahkan kata kunci "Vertical video, portrait mode" di awal prompt. Fokus pada gerakan tangan atau panning.
6. Naskah: Santai & persuasif.

STRUKTUR OUTPUT (WAJIB JSON MURNI):
{
  "product_name": "Nama Produk",
  "scenes": [
    {
      "scene_title": "Scene 1: Intro/Hook",
      "angle_description": "Medium Shot / Eye Level",
      "image_prompt": "[Deskripsi Karakter SAMA] holding product...",
      "kling_video_prompt": "Vertical video, portrait mode, [Deskripsi Gerakan]...",
      "cta_text": "..."
    },
    {
      "scene_title": "Scene 2: Detail Texture (WAJIB CLOSE UP)",
      "angle_description": "Extreme Close Up / Macro Shot",
      "image_prompt": "Extreme close up of the product texture/details, [Deskripsi Karakter SAMA]...",
      "kling_video_prompt": "Vertical video, portrait mode, camera slowly zooms in to show texture...",
      "cta_text": "..."
    },
    {
      "scene_title": "Scene 3: Outro/CTA",
      "angle_description": "Wide Shot",
      "image_prompt": "[Deskripsi Karakter SAMA] showing thumb up...",
      "kling_video_prompt": "Vertical video, portrait mode, [Deskripsi Gerakan]...",
      "cta_text": "..."
    }
  ]
}
  `.trim();
};

export const generateAffiliatePrompts = async (
  imageBase64: string,
  mimeType: string,
  config: CampaignConfig
): Promise<GeneratedCampaign> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  // Text generation always uses efficient Flash model
  const modelId = "gemini-2.5-flash"; 

  const systemInstruction = `
    Anda adalah Direktur Kreatif AI. Output WAJIB JSON.
    ${generateManualPromptText(config)}
  `;

  const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
    model: modelId,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      // Schema didefinisikan untuk API Mode
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          product_name: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene_title: { type: Type.STRING },
                angle_description: { type: Type.STRING },
                image_prompt: { type: Type.STRING },
                kling_video_prompt: { type: Type.STRING },
                cta_text: { type: Type.STRING }
              },
              required: ["scene_title", "angle_description", "image_prompt", "kling_video_prompt", "cta_text"]
            }
          }
        },
        required: ["product_name", "scenes"]
      }
    },
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: imageBase64 } },
        { text: "Generate JSON campaign with STRICT character consistency and CLOSE UP shot." }
      ]
    }
  }));

  if (!response.text) throw new Error("Gagal mendapatkan respons dari Gemini.");
  return JSON.parse(response.text) as GeneratedCampaign;
};

export const generateImageFromPrompt = async (
    prompt: string, 
    referenceImageBase64?: string,
    quality: ImageQuality = 'standard'
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  
  // SELECT MODEL BASED ON QUALITY CONFIG
  const modelId = quality === 'premium' 
    ? "gemini-3-pro-image-preview" 
    : "gemini-2.5-flash-image";

  console.log(`Generating image using ${modelId} (${quality} mode)`);

  const parts: any[] = [];
  
  // Revised prompt prefix for "Simple Indoor/Studio Review"
  let visualStyle = "";
  if (quality === 'premium') {
    visualStyle = "High-quality product photography, indoor studio setting, soft lighting, 8k, photorealistic, blurred background. ";
  } else {
    visualStyle = "Simple indoor product review photo, good lighting, realistic. ";
  }
  
  // We append specific "Indoor/Tabletop" keywords and NEGATIVE TEXT prompt to ensure clean images
  const finalPrompt = `${visualStyle} ${prompt}, indoor setting, depth of field, no text, no watermark, no typography, clean image.`;

  if (referenceImageBase64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: referenceImageBase64 } });
    parts.push({ text: "Generate image based on this product. " + finalPrompt });
  } else {
    parts.push({ text: finalPrompt });
  }

  // Config options differ slightly by model capability
  const imageConfig = quality === 'premium' 
    ? { aspectRatio: "9:16", imageSize: "1K" }
    : { aspectRatio: "9:16" };

  const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
    model: modelId,
    contents: { parts: parts },
    config: { imageConfig: imageConfig }
  }));

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) return part.inlineData.data;
    }
  }
  throw new Error("Gambar tidak ditemukan dalam respons Gemini.");
};