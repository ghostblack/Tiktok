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
    lightingConsistency = "commercial fashion lighting, soft diffused studio light, bright neutral atmosphere, 8k resolution";
  } else {
    lightingConsistency = "natural soft window light, bright and airy, consistent daylight temperature, soft shadows, realistic colors";
  }

  // 2. TENTUKAN BACKGROUND PROPS BERDASARKAN GENDER
  let rackContent = ""; // Isi raknya apa
  let modelInstruction = "";
  
  if (config.modelType === 'indo_man') {
    rackContent = "hanging MEN'S minimalist jackets and shirts";
    modelInstruction = `
      MODEL UTAMA: Pria Indonesia (Indonesian Man).
      ATURAN KONSISTENSI:
      1. Wajah: "Short fade haircut, brown skin, friendly face".
      2. PENTING: Model SEDANG MEMAKAI PRODUK tersebut.
    `;
  } else if (config.modelType === 'indo_woman') {
    rackContent = "hanging WOMEN'S aesthetic blouses and dresses";
    modelInstruction = `
      MODEL UTAMA: Wanita Indonesia (Indonesian Woman).
      ATURAN KONSISTENSI:
      1. Wajah: "Long straight black hair, soft natural makeup, indonesian features".
      2. PENTING: Model SEDANG MEMAKAI PRODUK tersebut.
    `;
  } else if (config.modelType === 'indo_hijab') {
    rackContent = "hanging modest muslim fashion, tunics, and robes";
    modelInstruction = `
      MODEL UTAMA: Wanita Indonesia Berhijab (Indonesian Hijabi Woman).
      ATURAN KONSISTENSI:
      1. Wajah: "Wearing elegant modern hijab (matching product color), soft natural makeup, indonesian features".
      2. PENTING: Model SEDANG MEMAKAI PRODUK tersebut dengan gaya sopan/muslimah.
    `;
  } else {
    rackContent = "minimalist aesthetic outfits";
    modelInstruction = `
      MODEL UTAMA: TIDAK ADA MANUSIA (Product Only).
      Fokus pada produk di hanger atau manekin.
    `;
  }

  // 3. TENTUKAN "FIXED SET DESIGN" UNTUK KONSISTENSI BACKGROUND
  let fixedBackground = ""; // Ini variabel kunci untuk konsistensi
  let styleInstruction = "";
  let structureInstruction = "";

  if (config.styleType === 'cinematic') {
    // DESKRIPSI BACKGROUND YANG SANGAT SPESIFIK DAN KAKU UNTUK KONSISTENSI
    fixedBackground = `luxury minimalist studio, pure white cyclorama wall, warm beige concrete floor, large arched standing mirror on left, dried pampas grass in ceramic vase on right, clothing rack with ${rackContent} in background center`;
    
    styleInstruction = `
      GAYA VISUAL: AESTHETIC FASHION STUDIO (HIGH END). 
      Background Wajib (Harus sama persis di semua scene): ${fixedBackground}.
      Fokus Utama: PRODUK HARUS SAMA PERSIS WARNANYA DENGAN GAMBAR ASLI.
    `;
    structureInstruction = `
      STRUKTUR SCENE (VIRAL STUDIO FORMULA):
      1. Scene 1 (THE HOOK - Dynamic Entrance): LOW ANGLE.
         - Visual: Model berjalan masuk ke dalam frame (walking into frame).
         - Teks Layar (PILIH SATU secara acak): "Jangan Skip! 🛑", "Nemuin Hidden Gem 💎", "Definisi Mewah ✨", "Outfit Sultan 👑", "Racun Fashion 😭"
      
      2. Scene 2 (THE PROOF - Detail & Touch): EXTREME CLOSE UP.
         - Visual: Tangan model menyentuh kain baju. Background agak blur tapi terlihat elemen studio yang sama.
         - Teks Layar (PILIH SATU secara acak): "Bahannya Adem Pol", "Kualitas Butik", "Tekstur Premium", "Gak Nerawang", "Jahitan Rapi BGT"

      3. Scene 3 (THE CLOSE - Confident & CTA): MEDIUM SHOT.
         - Visual: Model melihat ke cermin/kamera, tersenyum, menunjuk ke bawah.
         - Teks Layar (PILIH SATU secara acak): "Stok Dikit, Amankan!", "Cek Keranjang Kuning", "Diskon Hari Ini 👇", "Wajib Punya Fix"
    `;
  } else if (config.styleType === 'unboxing') {
    fixedBackground = "aesthetic white table, beige wall, soft sunlight from window on right";
    styleInstruction = `GAYA VISUAL: UNBOXING POV. Background: ${fixedBackground}. Lighting: ${lightingConsistency}.`;
    structureInstruction = `
      STRUKTUR SCENE (UNBOXING):
      1. Scene 1: Buka paket dengan cutter ASMR (Teks Variasi: "Unboxing Time!" / "Paket Datang!").
      2. Scene 2: Reveal produk dari plastik (Teks Variasi: "Warnanya Cantik BGT" / "Realpict Parah").
      3. Scene 3: Try-on cepat/Fitting (Teks Variasi: "Link di Bio" / "Cek Keranjang").
    `;
  } else {
    // Natural / UGC
    fixedBackground = "tidy modern bedroom, white bed sheets, small plant on nightstand, soft warm lamp";
    styleInstruction = `
      GAYA VISUAL: HOME REVIEW (UGC). Background: ${fixedBackground}. Lighting: ${lightingConsistency}.
    `;
    structureInstruction = `
      STRUKTUR SCENE (UGC FLOW):
      1. SCENE 1: Model duduk santai curhat soal baju (Teks Variasi: "Jujurly Bagus Banget" / "Baju ternyaman!").
      2. SCENE 2: Berdiri pamer full body (Teks Variasi: "Cuttingan Juara" / "Bikin Langsing").
      3. SCENE 3: Ajak kembaran (Teks Variasi: "Buruan Checkout" / "Samaan Yuk").
    `;
  }

  const productNameContext = config.productName 
    ? `NAMA PRODUK: "${config.productName}"`
    : `NAMA PRODUK: Analisis dari gambar yang saya upload.`;

  return `
Role: Anda adalah Affiliate Video Director (Kling AI Expert).
Tugas: Buat prompt video yang menjaga KONSISTENSI PRODUK, KONSISTENSI BACKGROUND, dan MENGGUNAKAN TEKS BAHASA INDONESIA.

KONTEKS:
${productNameContext}
${modelInstruction}
${styleInstruction}
${structureInstruction}

ATURAN GENERASI:
1. **FORMAT VIDEO (MUTLAK)**: Setiap 'kling_video_prompt' WAJIB diawali dengan teks: "Vertical video 9:16,".
2. **KONSISTENSI BACKGROUND (CRITICAL)**: Anda WAJIB menyertakan frasa berikut di SETIAP 'image_prompt' dan 'kling_video_prompt' untuk menjaga konsistensi tempat: "${fixedBackground}". Jangan ubah deskripsi background antar scene.
3. **BAHASA INDONESIA**: Output 'cta_text' HARUS Bahasa Indonesia gaul/marketing.
4. **DETAIL PRODUK**: Deskripsikan warna dan motif baju secara eksplisit.
5. **VARIASI TEKS**: Pilih kata-kata marketing yang berbeda-beda setiap kali generate.

STRUKTUR OUTPUT (JSON MURNI):
{
  "product_name": "Nama Produk",
  "social_media_caption": "Outfit hack biar kelihatan tinggi! 😍 Bahannya adem pol, fix wajib punya buat daily wear. Cek keranjang kuning sekarang! #racunshopee #ootdhijab #fyp",
  "scenes": [
    {
      "scene_title": "Scene 1: The Hook",
      "angle_description": "Low Angle / Dynamic Entrance",
      "image_prompt": "Vertical portrait 9:16, low angle shot of Indonesian model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE], looking confident, walking pose, ${fixedBackground}, 8k, photorealistic",
      "kling_video_prompt": "Vertical video 9:16, low angle, model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE] walking confidently into frame towards camera, ${fixedBackground}, ${lightingConsistency}",
      "cta_text": "Definisi Elegan ✨"
    },
    {
      "scene_title": "Scene 2: Quality Proof",
      "angle_description": "Extreme Close Up (Hand Interaction)",
      "image_prompt": "Vertical portrait 9:16, extreme close up of [INSERT DETAILED PRODUCT DESCRIPTION HERE] fabric texture, model's hand touching the material gently, soft lighting, ${fixedBackground} (slightly blurred), high detail",
      "kling_video_prompt": "Vertical video 9:16, extreme close up, hand gently brushing against the fabric of [INSERT DETAILED PRODUCT DESCRIPTION HERE] to show softness, slow motion, ${fixedBackground} (blurred background), ${lightingConsistency}",
      "cta_text": "Bahannya Premium Parah 😭"
    },
    {
      "scene_title": "Scene 3: The Call",
      "angle_description": "Medium Shot (Mirror/Final Pose)",
      "image_prompt": "Vertical portrait 9:16, medium shot of Indonesian model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE], looking at camera with satisfied smile, hand pointing down, ${fixedBackground}",
      "kling_video_prompt": "Vertical video 9:16, medium shot, model wearing [INSERT DETAILED PRODUCT DESCRIPTION HERE] checking appearance in mirror then turning to smile at camera and pointing down, ${fixedBackground}, ${lightingConsistency}",
      "cta_text": "Stok Dikit, Amankan! 👇"
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
    2. **FORMAT VIDEO**: Wajib PORTRAIT / VERTICAL. Semua prompt video harus diawali "Vertical video 9:16,".
    3. **BACKGROUND KONSISTEN**: Gunakan deskripsi background yang SAMA PERSIS untuk ketiga scene (White cyclorama, beige floor, etc) sesuai konfigurasi.
    4. **BAHASA**: Output 'cta_text' HARUS Bahasa Indonesia gaul/marketing (pendek, padat, jelas).
    5. **STRUKTUR**: Ikuti struktur "Viral Studio Formula" (Hook -> Proof -> CTA).
    6. **VARIASI**: Gunakan variasi naskah yang berbeda-beda untuk cta_text agar tidak monoton.
    
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
          social_media_caption: { type: Type.STRING },
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
        required: ["product_name", "social_media_caption", "scenes"]
      }
    },
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: imageBase64 } },
        { text: "Generate JSON campaign. Analyze product color carefully. Create viral caption." }
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