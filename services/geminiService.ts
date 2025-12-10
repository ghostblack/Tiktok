import { GoogleGenAI, Type } from "@google/genai";
import { GeneratedCampaign, CampaignConfig } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateAffiliatePrompts = async (
  imageBase64: string,
  mimeType: string,
  config: CampaignConfig
): Promise<GeneratedCampaign> => {
  const modelId = "gemini-2.5-flash"; // Excellent for multimodal analysis

  // Define instruction parts based on user selection
  let modelInstruction = "";
  if (config.modelType === 'indo_man') {
    modelInstruction = `
      MODEL UTAMA: Gunakan subjek "Handsome Indonesian Man" (Pria Indonesia, kulit sawo matang, wajah lokal, ganteng, rapi).
      KONSISTENSI WAJAH: Gunakan deskripsi fisik yang sangat spesifik (e.g., "short messy black hair, warm brown skin, sharp jawline") dan ulangi di setiap prompt.
      INTERAKSI: Model harus berinteraksi dengan produk secara natural (memakai, memegang, atau melihat).
    `;
  } else if (config.modelType === 'indo_woman') {
    modelInstruction = `
      MODEL UTAMA: Gunakan subjek "Beautiful Indonesian Woman" (Wanita Indonesia cantik, kulit cerah natural/sawo matang, anggun, wajah lokal).
      KONSISTENSI WAJAH: Gunakan deskripsi fisik yang sangat spesifik (e.g., "long straight black hair, soft natural makeup, brown eyes") dan ulangi di setiap prompt.
      INTERAKSI: Model harus berinteraksi dengan produk secara elegan (memakai, memegang, atau melihat).
    `;
  } else {
    modelInstruction = `
      MODEL UTAMA: TIDAK ADA MANUSIA. Fokus sepenuhnya pada PRODUK (Product Only).
      VISUAL: Buat produk terlihat sangat premium dengan pencahayaan dan background yang menonjolkan fitur produk.
      BACKGROUND: Gunakan background yang relevan tapi blur (bokeh) agar produk menonjol.
    `;
  }

  let styleInstruction = "";
  if (config.styleType === 'cinematic') {
    styleInstruction = `
      GAYA VISUAL: CINEMATIC & DRAMATIS.
      Lighting: Gunakan pencahayaan dramatis (Rim light, Golden Hour, atau Moody lighting).
      Camera: Gunakan depth of field dangkal (bokeh), sudut pandang artistik.
      Vibe: Mewah, Mahal, Elegan.
    `;
  } else {
    styleInstruction = `
      GAYA VISUAL: CASUAL & TIKTOK/REELS STYLE.
      Lighting: Bright & Airy, pencahayaan natural yang terang.
      Camera: Handheld look tapi stabil, angle yang relatable (eye level).
      Vibe: Autentik, Daily Life, Review Jujur, Mengundang klik.
    `;
  }

  const productNameContext = config.productName 
    ? `NAMA PRODUK USER: "${config.productName}". Gunakan nama ini untuk membuat copywriting yang spesifik.`
    : `NAMA PRODUK: Analisis dari gambar.`;

  const systemInstruction = `
    Anda adalah Direktur Kreatif AI Spesialis Konten Viral Indonesia.
    Tugas: Menganalisis gambar produk dan membuat 3 prompt gambar yang SANGAT KONSISTEN, beserta Copywriting (Naskah) persuasif.

    KONFIGURASI USER:
    ${modelInstruction}
    ${styleInstruction}
    ${productNameContext}

    ATURAN KRUSIAL (STRICT RULES):
    1. **ANALISIS VISUAL DNA**: Ekstrak setiap detail produk (Warna Hex, Bahan, Logo, Pola, Bentuk Kerah/Sepatu). Masukkan detail ini ke dalam variabel teks yang wajib ada di semua prompt.
    2. **SINGLE IMAGE ONLY**: Prompt harus memaksa AI membuat SATU gambar utuh. Gunakan kata kunci: "A single full-frame photo", "No collage", "No split screen", "No grid".
    3. **REFERENSI PRODUK**: Dalam prompt, selalu tulis: "The product is EXACTLY as shown in the reference image: [Deskripsi Detail Produk Anda]".
    4. **NO TALKING / LIP SYNC (VIDEO)**: Karena video ini menggunakan Text Overlay (tanpa suara model), Model TIDAK BOLEH BERBICARA. Instruksikan gerakan bibir diam (closed mouth) atau senyum natural saja. Fokus pada akting/posing.

    STRUKTUR SCENE (Storytelling Affiliate):
    - Scene 1 (Hook): Shot paling menarik. ${config.modelType !== 'no_model' ? 'Model memamerkan produk dengan percaya diri (Pose Only, No Talking).' : 'Produk muncul dengan transisi dinamis/hero shot.'}
      * Copywriting/Naskah: Fokus pada MASALAH atau KEINGINAN user. (Contoh: "Buat kamu yang ingin tampil keren...", "Lagi cari sepatu lari murah?")
    - Scene 2 (Detail/Benefit): Close Up. Fokus pada tekstur, bahan, atau kualitas produk.
      * Copywriting/Naskah: Fokus pada SOLUSI dan FITUR. (Contoh: "Bahannya adem banget...", "Jahitannya super rapi.")
    - Scene 3 (Call to Action vibe): ${config.modelType !== 'no_model' ? 'Model tersenyum puas atau berjalan menjauh memakai produk (No Talking).' : 'Shot produk di environment lifestyle yang estetik.'}
      * Copywriting/Naskah: Fokus pada AJAKAN BELI. (Contoh: "Klik keranjang kuning sebelum kehabisan!", "Diskon khusus hari ini aja.")

    Output JSON harus berisi 3 scene.
    
    Field 'cta_text' harus dalam BAHASA INDONESIA:
    Buat kalimat persuasif pendek (1-2 kalimat) yang cocok untuk Text Overlay atau Voiceover di TikTok/Reels. Gunakan gaya bahasa santai/gaul namun sopan.

    Field 'image_prompt' harus dalam BAHASA INGGRIS:
    "[Subject Description] wearing/holding [Extremely Detailed Product Description] at [Location]. [Lighting & Camera]. A single full-frame photograph. High fidelity to product reference."
    
    Field 'kling_video_prompt' harus dalam BAHASA INGGRIS:
    "High quality video motion. [Action Description]. The subject is posing elegantly. CRITICAL: The subject is NOT speaking. Mouth remains closed or smiling naturally. No lip movement. Focus on product interaction."
    
    Pastikan deskripsi Subject dan Product identik (copy-paste) di ketiga prompt.
  `;

  const response = await ai.models.generateContent({
    model: modelId,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          product_name: { 
            type: Type.STRING, 
            description: "Nama singkat produk yang menarik (Clickbait style)" 
          },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene_title: { type: Type.STRING },
                angle_description: { type: Type.STRING, description: "Penjelasan angle (e.g., Medium Shot, Low Angle)" },
                image_prompt: { type: Type.STRING, description: "Prompt English detail & konsisten. MUST include 'Single photo', 'Exact product match'." },
                kling_video_prompt: { type: Type.STRING, description: "Prompt English untuk gerakan video. MUST specify 'No talking', 'Static mouth'." },
                cta_text: { type: Type.STRING, description: "Kalimat promosi (Copywriting) Bahasa Indonesia yang persuasif untuk scene ini." }
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
        {
          inlineData: {
            mimeType: mimeType,
            data: imageBase64
          }
        },
        {
          text: `Buatkan 3 scene video affiliate yang menarik untuk produk ${config.productName || 'ini'}.`
        }
      ]
    }
  });

  if (!response.text) {
    throw new Error("Gagal mendapatkan respons dari Gemini.");
  }

  return JSON.parse(response.text) as GeneratedCampaign;
};

export const generateImageFromPrompt = async (prompt: string, referenceImageBase64?: string): Promise<string> => {
  const modelId = "gemini-2.5-flash-image";

  // Prepare contents. If reference image exists, add it to guide the generation (Image-to-Image)
  const parts: any[] = [];

  if (referenceImageBase64) {
    // Adding the reference image helps the model maintain product consistency
    parts.push({
      inlineData: {
        mimeType: "image/jpeg", // Assuming generic image type, API handles most
        data: referenceImageBase64
      }
    });
    // Add instruction to use the image as reference
    parts.push({
      text: "Generate a high-quality image based on the following prompt. IMPORTANT: The product in the generated image must look EXACTLY like the product in the provided reference image. Do not change the color, logo, or shape of the product. \n\nPrompt: " + prompt
    });
  } else {
    parts.push({ text: prompt });
  }

  const response = await ai.models.generateContent({
    model: modelId,
    contents: {
      parts: parts
    },
    config: {
      imageConfig: {
        aspectRatio: "9:16", // Vertical for TikTok/Shorts/Reels
      }
    }
  });

  // Extract image from response parts
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        return part.inlineData.data;
      }
    }
  }

  throw new Error("Gambar tidak ditemukan dalam respons Gemini.");
};
