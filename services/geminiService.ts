import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeneratedCampaign, CampaignConfig, ImageQuality } from "../types";

// Helper untuk mengambil API Key dengan aman
const getApiKey = (): string => {
  const key = process.env.VITE_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return ""; // Return empty string instead of throwing, to allow manual mode
  return key;
};

// Variabel throttling
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
  // 1. TENTUKAN LIGHTING KEYWORDS YANG KONSISTEN
  let lightingConsistency = "";
  if (config.styleType === 'cinematic') {
    lightingConsistency = "bright soft diffused studio lighting, neutral minimalist background, realistic product colors, 8k resolution, commercial videography";
  } else {
    lightingConsistency = "natural soft window light, bright and airy, consistent daylight temperature, soft shadows, realistic colors";
  }

  // 2. TENTUKAN BACKGROUND PROPS BERDASARKAN GENDER
  let rackDescription = "";
  let modelInstruction = "";
  
  if (config.modelType === 'indo_man') {
    rackDescription = "clothing rack hanging MEN'S minimalist jackets and shirts in background";
    modelInstruction = `
      MODEL UTAMA: Pria Indonesia (Indonesian Man).
      ATURAN KONSISTENSI:
      1. Wajah: "Short fade haircut, brown skin, friendly face".
      2. PENTING: Model SEDANG MEMAKAI PRODUK tersebut.
      3. Background: Ada rak baju isinya pakaian cowok (jaket/kemeja).
    `;
  } else if (config.modelType === 'indo_woman') {
    rackDescription = "clothing rack hanging WOMEN'S aesthetic blouses and dresses in background";
    modelInstruction = `
      MODEL UTAMA: Wanita Indonesia (Indonesian Woman).
      ATURAN KONSISTENSI:
      1. Wajah: "Long straight black hair, soft natural makeup, indonesian features".
      2. PENTING: Model SEDANG MEMAKAI PRODUK tersebut.
      3. Background: Ada rak baju isinya pakaian cewek (dress/blouse).
    `;
  } else if (config.modelType === 'indo_hijab') {
    rackDescription = "clothing rack hanging modest muslim fashion, tunics, and robes in background";
    modelInstruction = `
      MODEL UTAMA: Wanita Indonesia Berhijab (Indonesian Hijabi Woman).
      ATURAN KONSISTENSI:
      1. Wajah: "Wearing elegant modern hijab (matching product color), soft natural makeup, indonesian features".
      2. PENTING: Model SEDANG MEMAKAI PRODUK tersebut dengan gaya sopan/muslimah.
      3. Background: Ada rak baju isinya busana muslim modern.
    `;
  } else {
    rackDescription = "clothing rack with minimalist aesthetic outfits in background";
    modelInstruction = `
      MODEL UTAMA: TIDAK ADA MANUSIA (Product Only).
      Fokus pada produk di hanger atau manekin.
    `;
  }

  let styleInstruction = "";
  let structureInstruction = "";

  if (config.styleType === 'cinematic') {
    styleInstruction = `
      GAYA VISUAL: AESTHETIC FASHION STUDIO. 
      Background: Ruangan studio minimalis dinding putih bersih, ada cermin lengkung (arched mirror), tanaman pampas, dan ${rackDescription}.
      Fokus Utama: PRODUK HARUS SAMA PERSIS WARNANYA DENGAN GAMBAR ASLI.
    `;
    structureInstruction = `
      STRUKTUR SCENE (FASHION MODEL FLOW):
      1. Scene 1 (Fitting & Showcase): MEDIUM SHOT.
         - Visual: Model SUDAH MEMAKAI baju tersebut di tengah studio estetik.
         - Gerakan: Model melakukan gerakan memutar badan perlahan (body turn) atau berjalan di tempat (catwalk) untuk menunjukkan potongan baju.
         - Teks Layar: Headline Singkat (Contoh: "OOTD Wajib Punya!").
      
      2. Scene 2 (Detail & Texture): CLOSE UP.
         - Visual: Kamera zoom in ke bagian dada/lengan baju yang dipakai model.
         - Gerakan: Model memegang kerah atau merapikan baju dengan lembut.
         - Teks Layar: Fitur Utama (Contoh: "Bahannya Adem Banget").

      3. Scene 3 (Persuasion/CTA): MEDIUM SHOT.
         - Visual: Model (masih memakai baju yang sama) tersenyum ke kamera, pose "mengajak".
         - Gerakan: Static shot, tangan menunjuk ke arah keranjang kuning (imajiner) atau jempol.
         - Teks Layar: Ajakan Beli (Contoh: "Cek Keranjang Kuning!").
    `;
  } else if (config.styleType === 'unboxing') {
    styleInstruction = `GAYA VISUAL: UNBOXING POV. Background: Meja estetik. Lighting: ${lightingConsistency}.`;
    structureInstruction = `
      STRUKTUR SCENE (UNBOXING):
      1. Scene 1: Buka paket (Teks: "Unboxing Time!").
      2. Scene 2: Lihat produk (Teks: "Warnanya Cantik BGT").
      3. Scene 3: Pakai produk (Teks: "Link di Bio").
    `;
  } else {
    // Natural / UGC
    styleInstruction = `
      GAYA VISUAL: HOME REVIEW (UGC). Background: Kamar Rapi. Lighting: ${lightingConsistency}.
    `;
    structureInstruction = `
      STRUKTUR SCENE (UGC FLOW):
      1. SCENE 1: Model pamer produk (Teks: "Racun Shopee/TikTok").
      2. SCENE 2: Detail bahan (Teks: "Premium Quality").
      3. SCENE 3: Review happy (Teks: "Buruan Checkout").
    `;
  }

  const productNameContext = config.productName 
    ? `NAMA PRODUK: "${config.productName}"`
    : `NAMA PRODUK: Analisis dari gambar yang saya upload.`;

  return `
Role: Anda adalah Affiliate Video Director (Kling AI Expert).
Tugas: Buat prompt video yang menjaga KONSISTENSI PRODUK dan MENGGUNAKAN TEKS BAHASA INDONESIA.

KONTEKS:
${productNameContext}
${modelInstruction}
${styleInstruction}
${structureInstruction}

ATURAN GENERASI:
1. **BAHASA INDONESIA**: Field 'cta_text' WAJIB Bahasa Indonesia, gaya bahasa santai/marketing, MAKSIMAL 5-6 KATA. Jangan bahasa Inggris.
2. **KONSISTENSI BACKGROUND**: Pastikan prompt background selalu menyertakan "${rackDescription}" agar isi rak sesuai gender.
3. **DETAIL PRODUK**: Deskripsikan warna dan motif baju secara eksplisit (misal: "Black shirt with white embroidery").
4. **HIJAB (JIKA BERLAKU)**: Jika model berhijab, pastikan prompt mencantumkan "wearing modern hijab matching the outfit".

STRUKTUR OUTPUT (JSON MURNI):
{
  "product_name": "Nama Produk",
  "scenes": [
    {
      "scene_title": "Scene 1: Fitting Look",
      "angle_description": "Medium Shot (Body Rotation)",
      "image_prompt": "Medium shot of Indonesian model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE], standing in minimalist aesthetic studio with pampas grass and ${rackDescription}, white walls, soft bright lighting, photorealistic, 8k",
      "kling_video_prompt": "Vertical video 9:16, medium shot of model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE], turning body slowly to show the outfit, minimalist white studio background with ${rackDescription}, bright soft lighting, high quality, ${lightingConsistency}",
      "cta_text": "OOTD Kekinian Banget ✨"
    },
    {
      "scene_title": "Scene 2: Fabric Detail",
      "angle_description": "Close Up",
      "image_prompt": "Close up shot of the chest area of [INSERT DETAILED PRODUCT DESCRIPTION HERE] worn by model, showing fabric texture, high detail, sharp focus, aesthetic lighting",
      "kling_video_prompt": "Vertical video 9:16, close up shot of [INSERT DETAILED PRODUCT DESCRIPTION HERE] fabric texture, model hand touching the material, soft movement, high detail, ${lightingConsistency}",
      "cta_text": "Bahannya Lembut & Adem ☁️"
    },
    {
      "scene_title": "Scene 3: Invitation",
      "angle_description": "Medium Shot (CTA)",
      "image_prompt": "Medium shot of Indonesian model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE], smiling warmly and pointing finger up, aesthetic fashion studio background with ${rackDescription}, bright lighting",
      "kling_video_prompt": "Vertical video 9:16, medium shot, model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE] smiling enthusiastically at camera, hand pointing to imaginary cart, static camera, ${lightingConsistency}",
      "cta_text": "Cek Keranjang Kuning 👇"
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
  const modelId = "gemini-2.5-flash"; 

  const systemInstruction = `
    Anda adalah Director Video AI Profesional khusus pasar Indonesia.
    
    CRITICAL INSTRUCTION:
    1. **ANALISIS VISUAL**: Lihat warna baju, motif, dan bentuk kerah dengan sangat teliti. JANGAN UBAH WARNA.
    2. **BAHASA**: Output 'cta_text' HARUS Bahasa Indonesia gaul/marketing (pendek, padat, jelas).
    3. **PROPS**: Sesuaikan isi rak baju di background dengan gender model.
    4. **MODEL**: Jika model hijab, pastikan deskripsi prompt selalu "Indonesian Hijabi Woman wearing modern hijab".
    
    ${generateManualPromptText(config)}
  `;

  const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
    model: modelId,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
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
        { text: "Generate JSON campaign. Analyze product color carefully. Use Indonesian language for CTA." }
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
  
  const modelId = quality === 'premium' 
    ? "gemini-3-pro-image-preview" 
    : "gemini-2.5-flash-image";

  console.log(`Generating image using ${modelId} (${quality} mode)`);

  const parts: any[] = [];
  
  let visualStyle = "";
  if (quality === 'premium') {
    visualStyle = "Fashion photography, 8k resolution, photorealistic. Background: blurred minimalist white studio with specific clothing rack. Subject:";
  } else {
    visualStyle = "Realistic product photo. Background: bright clean studio. Subject:";
  }
  
  const constraint = "IMPORTANT: The product worn/shown MUST match the reference image exactly in COLOR, PATTERN, and DESIGN. Do not change the product color.";
  
  const finalPrompt = `${visualStyle} ${prompt}. ${constraint}`;

  if (referenceImageBase64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: referenceImageBase64 } });
    parts.push({ text: "Reference image provided. " + finalPrompt });
  } else {
    parts.push({ text: finalPrompt });
  }

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