
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GeneratedCampaign, CampaignConfig } from "../types";

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
  const lowerName = config.productName.toLowerCase();
  
  // 0. DETECT PRODUCT CONTEXT (SMART TAGS)
  const isRain = lowerName.includes('hujan') || lowerName.includes('mantel') || lowerName.includes('waterproof') || lowerName.includes('payung') || lowerName.includes('anti air');
  const isBatik = lowerName.includes('batik') || lowerName.includes('kebaya') || lowerName.includes('kondangan') || lowerName.includes('pesta') || lowerName.includes('wisuda') || lowerName.includes('kutu baru');
  const isOutdoorGear = lowerName.includes('gunung') || lowerName.includes('hiking') || lowerName.includes('camping') || lowerName.includes('jaket outdoor') || lowerName.includes('carrier') || lowerName.includes('tenda');

  // 1. KONSISTENSI VISUAL (LIGHTING)
  let lightingConsistency = "";
  if (config.styleType === 'cinematic') {
    lightingConsistency = "commercial fashion lighting, soft diffused studio light, bright neutral atmosphere, 8k resolution";
  } else if (config.styleType === 'outdoor') {
    lightingConsistency = "natural outdoor daylight, realistic shadows, street photography vibe, high contrast, cinematic depth of field";
  } else {
    lightingConsistency = "natural soft window light, bright and airy, consistent daylight temperature, soft shadows, realistic colors";
  }

  // 2. KONSISTENSI BACKGROUND & MODEL (STRICT INDONESIAN FACE)
  let rackContent = "";
  let modelInstruction = "";
  let lockedFaceDescription = ""; // Variable to enforce identical face description
  
  // Base instructions for Indonesian Look ensuring consistency
  const indoBase = `
    WAJAH & KULIT: Wajib "NATIVE INDONESIAN LOOK" (Wajah Melayu/Asia Tenggara).
    SKIN TONE: Sawo Matang (Light Brown/Tan Skin). JANGAN PUTIH PUCAT.
    ATURAN KRUSIAL: JANGAN GUNAKAN WAJAH DARI GAMBAR REFERENSI PRODUK. GENERATE WAJAH BARU yang fresh dan original.
  `;

  if (config.modelType === 'indo_man') {
    rackContent = "hanging MEN'S minimalist jackets and shirts";
    lockedFaceDescription = "handsome Indonesian man, 25 years old, sawo matang skin, short neat black hair, sharp jawline, warm dark brown eyes, oval face shape";
    modelInstruction = `
      MODEL UTAMA: ${lockedFaceDescription}.
      ${indoBase}
      VIBE: Cool, Ramah, Maskulin tapi "Soft Boy" aesthetic.
    `;
  } else if (config.modelType === 'indo_woman') {
    rackContent = "hanging WOMEN'S aesthetic blouses and dresses";
    lockedFaceDescription = "beautiful Indonesian woman, 22 years old, sawo matang skin, long straight black hair, soft oval face, almond dark brown eyes, natural makeup";
    modelInstruction = `
      MODEL UTAMA: ${lockedFaceDescription}.
      ${indoBase}
      VIBE: Sweet, Natural Beauty, Girl Next Door.
    `;
  } else if (config.modelType === 'indo_hijab') {
    rackContent = "hanging modest muslim fashion, tunics, and robes";
    lockedFaceDescription = "beautiful Indonesian woman, 22 years old, sawo matang skin, wearing modern beige Pashmina Hijab, oval face, gentle dark brown eyes";
    modelInstruction = `
      MODEL UTAMA: ${lockedFaceDescription}.
      ${indoBase}
      VIBE: Anggun, Soft, Muslimah Fashion.
    `;
  } else {
    // NO MODEL MODE - PRODUCT ONLY
    rackContent = "minimalist aesthetic outfits";
    lockedFaceDescription = "NO HUMAN, Product Photography only";
    modelInstruction = `
      MODEL UTAMA: TIDAK ADA MANUSIA (NO HUMANS).
      FOKUS VISUAL: Product Photography Professional.
      STYLE SHOT: Kombinasi antara Flatlay (Dari atas), Hanging (Digantung), dan Detail Shot.
      PENTING: Fokus pada tekstur kain, kerapian jahitan, dan lighting yang aesthetic.
    `;
  }

  // 3. BACKGROUND & SCENE STRUCTURE (CONTEXT AWARE)
  let fixedBackground = ""; 
  let structureInstruction = "";

  if (config.styleType === 'cinematic') {
    // CINEMATIC LOGIC
    fixedBackground = `luxury minimalist studio, pure white cyclorama wall, warm beige concrete floor, large arched standing mirror on left, dried pampas grass in ceramic vase on right, clothing rack with ${rackContent} in background center`;
    
    // Override for Batik in Cinematic
    if (isBatik) {
        fixedBackground = "Luxury Indonesian Wedding Hall interior, gold and floral decoration, warm elegant ambiance, carpeted floor";
    }

    if (config.modelType === 'no_model') {
      structureInstruction = `
        STRUKTUR SCENE (CINEMATIC PRODUCT ONLY):
        SCENE 1 (THE HOOK - HANGING): Visual: Produk digantung di hanger kayu premium, lighting dramatis (rim light). Background clean studio. Text: "Definisi mewah gak harus mahal ✨".
        SCENE 2 (THE DETAILS - MACRO): Visual: Extreme Close-up texture kain/kancing/kerah. Tunjukkan kualitas bahan. Text: "Detailnya se-rapi ini dong...".
        SCENE 3 (THE VIBE - ARTISTIC): Visual: Produk diletakkan estetik di kursi/meja studio dengan majalah/kopi. Text: "Auto check-out sih ini!".
      `;
    } else {
      structureInstruction = `
        STRUKTUR SCENE (SIMPLE STUDIO VIBE):
        SCENE 1 (THE LOOK): Visual: Model pose simple di depan cermin. Text: "Outfit ngantor/formal check ✅".
        SCENE 2 (THE FEEL): Visual: Close up model menyentuh bahan baju. Text: "Bahannya se-adem ini...".
        SCENE 3 (THE FLEX/PAMER): Visual: Model berjalan percaya diri (Slay walk). Text: "Auto kelihatan jenjang ✨".
      `;
    }

  } else if (config.styleType === 'unboxing') {
    // UNBOXING LOGIC
    fixedBackground = "Aesthetic bright modern bedroom with white bed sheets, soft morning sunlight, and a large full-length standing mirror in the corner";
    
    if (config.modelType === 'no_model') {
       structureInstruction = `
        STRUKTUR SCENE (AESTHETIC PRODUCT UNBOXING):
        SCENE 1 (THE PACKAGE - POV): Visual: POV Tangan membuka paket di atas kasur (White sheets). Box/Plastik terlihat aesthetic. Text: "Iseng checkout, ternyata...".
        SCENE 2 (THE REVEAL - FLATLAY): Visual: Baju digelar rapi di atas kasur (Flatlay angle from top). Ditata cantik dengan aksesoris. Text: "Aslinya lebih cakep dari foto 😭".
        SCENE 3 (THE QUALITY - HANGING): Visual: Baju digantung di handle lemari/rack, terkena sinar matahari (Sun kiss). Text: "Fix no debat, 10/10 ⭐".
      `;
    } else {
      structureInstruction = `
        STRUKTUR SCENE (POV UNBOXING - SEAMLESS FLOW):
        SCENE 1 (THE PACKAGE - POV HANDS ONLY): Visual: POV Shot tangan membuka paket di atas kasur. Text: "Iseng checkout, ternyata...".
        SCENE 2 (THE REVEAL - DI DEPAN CERMIN): Visual: CUT ke Model berdiri di depan cermin kamar. Action: Mirror Selfie pose. Text: "Pas dipake se-cakep ini dong 😭".
        SCENE 3 (THE FLEX / PAMER): Visual: Model yang SAMA, di ruangan yang SAMA. Action: Pose 'Flexing' / Pamer, berputar sedikit. Text: "Fix no debat, 10/10 ⭐".
      `;
    }

  } else if (config.styleType === 'outdoor') {
    // === INDONESIAN OUTDOOR & SMART CONTEXT LOGIC ===
    
    if (isRain) {
        // --- JAS HUJAN / WATERPROOF ---
        fixedBackground = "Rainy Indonesian street scene (Jalanan aspal basah), blurred motorcycles (motor bebek) parked nearby, grey cloudy sky (mendung), realistic rain atmosphere";
        
        if (config.modelType === 'no_model') {
            structureInstruction = `
            STRUKTUR SCENE (JAS HUJAN - PRODUCT TEST):
            SCENE 1 (EXTREME TEST): Visual: Produk diguyur air deras dari selang/ember (Simulasi Hujan Lebat). Air meluncur jatuh (Efek Daun Talas). Text: "Ujan badai? Siapa takut! ⛈️".
            SCENE 2 (THE PROTECTION): Visual: Close-up bagian sleting yang tertutup seal (Waterproof detail) basah-basahan. Text: "Full seal, air gak bakal rembes".
            SCENE 3 (COMPACT): Visual: Produk dilipat rapi masuk ke dalam bagasi jok motor. Text: "Praktis, muat di bagasi motor apa aja 🛵".
            `;
        } else {
            structureInstruction = `
            STRUKTUR SCENE (JAS HUJAN - RIDER EXPERIENCE):
            SCENE 1 (THE PANIC?): Visual: Langit mendung gelap di pinggir jalan Indonesia. Model buru-buru mengeluarkan jas hujan dari jok motor. Text: "Mendung gak bikin panik 🌧️".
            SCENE 2 (THE PROOF): Visual: Model memakai jas hujan, berdiri di bawah hujan atau disemprot air. Badan tetap kering, air lewat doang. Text: "Anti rembes, baju dalem aman!".
            SCENE 3 (THE RIDE): Visual: Model duduk di atas motor, siap gas, memberi jempol ke kamera. Text: "Gas terus, bikers wajib punya! 🛵".
            `;
        }
    
    } else if (isBatik) {
        // --- BATIK / FORMAL ---
        fixedBackground = "Outdoor Indonesian Garden Party wedding venue, green grass, janur kuning decoration in background, warm golden hour lighting";
        
        if (config.modelType === 'no_model') {
            structureInstruction = `
            STRUKTUR SCENE (BATIK - PRODUCT DISPLAY):
            SCENE 1 (THE VIBE): Visual: Kain/Baju batik digantung estetik dengan background dekorasi pesta kebun. Text: "Mewah buat kondangan ✨".
            SCENE 2 (THE PATTERN): Visual: Macro shot motif batik dan tekstur kain yang premium/halus. Text: "Motifnya mahal banget".
            SCENE 3 (THE OUTFIT): Visual: Flatlay batik dipadukan dengan aksesoris kondangan (tas/sepatu). Text: "Siap jadi pusat perhatian".
            `;
        } else {
            structureInstruction = `
            STRUKTUR SCENE (BATIK - KONDANGAN VIBE):
            SCENE 1 (THE ARRIVAL): Visual: Model berjalan anggun memasuki area pesta kebun (Garden Party). Text: "OOTD Kondangan check ✅".
            SCENE 2 (THE CONFIDENCE): Visual: Pose candid, model merapikan kerah/lengan, tersenyum elegan. Text: "Berasa pakai baju jutaan 😭".
            SCENE 3 (SOCIAL): Visual: Model menyapa tamu lain (blurred), terlihat percaya diri dan santun. Text: "Auto dipuji camer nih!".
            `;
        }

    } else if (isOutdoorGear) {
        // --- OUTDOOR / HIKING ---
        fixedBackground = "Indonesian Pine Forest (Hutan Pinus) hiking trail, tropical nature, dirt path, misty morning light";
        
        if (config.modelType === 'no_model') {
            structureInstruction = `
            STRUKTUR SCENE (OUTDOOR GEAR - TOUGHNESS):
            SCENE 1 (NATURE): Visual: Produk diletakkan di atas batu berlumut atau dahan pohon di hutan pinus. Text: "Teman setia petualangan 🌲".
            SCENE 2 (DURABILITY): Visual: Detail bahan yang tebal/kuat, mungkin sedikit kotor terkena tanah (Rugged look). Text: "Bahannya badak, super awet!".
            SCENE 3 (READY): Visual: Produk digantung di tenda camping atau tas carrier. Text: "Anak gunung wajib punya".
            `;
        } else {
            structureInstruction = `
            STRUKTUR SCENE (OUTDOOR GEAR - ADVENTURE):
            SCENE 1 (EXPLORE): Visual: Model hiking menanjak di jalur hutan pinus. Text: "Healing ke alam tetap stylish 🏔️".
            SCENE 2 (REST): Visual: Model istirahat duduk di batang kayu, menikmati suasana alam. Text: "Nyaman dipakai seharian, gak gerah".
            SCENE 3 (FREEDOM): Visual: Model berdiri di tebing/puncak, merentangkan tangan menikmati angin. Text: "Best investment buat traveling!".
            `;
        }

    } else {
        // --- GENERAL INDONESIAN STREET STYLE ---
        fixedBackground = "Indonesian sidewalk (trotoar) with paving blocks, tropical trees, angkringan or motorcycles (motor bebek) in blurred background, bright daylight";
        
        if (config.modelType === 'no_model') {
            structureInstruction = `
            STRUKTUR SCENE (STREET STYLE - PRODUCT):
            SCENE 1 (CITY VIBE): Visual: Produk diletakkan di bangku taman kota atau pagar estetik pinggir jalan. Text: "Vibe-nya mahal banget ✨".
            SCENE 2 (SUN KISS): Visual: Close up tekstur dengan lighting matahari natural (Sun kiss). Text: "Detailnya juara!".
            SCENE 3 (DAILY): Visual: Produk dibawa/digantung dengan background keramaian kota (Blur). Text: "Cocok buat daily activity kamu".
            `;
        } else {
            structureInstruction = `
            STRUKTUR SCENE (STREET STYLE - LIFESTYLE):
            SCENE 1 (CITY WALK): Visual: Model berjalan santai di trotoar kota (City walk). Background motor lewat blur. Text: "Outfit jalan-jalan sore check ✅".
            SCENE 2 (CANDID): Visual: Model menyeberang jalan atau stop di pinggir jalan, candid shot. Text: "Nyaman dipake seharian, gak gerah".
            SCENE 3 (POSE): Visual: Model pose fierce di depan tembok estetik/cafe jalanan. Text: "Fix, bakal sering dipake sih ini!".
            `;
        }
    }

  } else {
    // NATURAL / UGC DEFAULT
    fixedBackground = "tidy modern bedroom with wardrobe, white bed sheets, small plant on nightstand, soft warm lamp";
    structureInstruction = `
      STRUKTUR SCENE (SIMPLE DAILY LIFE):
      SCENE 1 (THE DILEMMA): Visual: Model di depan lemari, bingung. Text: "Baju andalan kalau buru-buru".
      SCENE 2 (THE SOLUTION): Visual: Model ambil produk ini dengan happy. Text: "Sat set langsung rapi ✨".
      SCENE 3 (THE FLEX / READY): Visual: Model sudah pakai, twirl, siap pergi. Text: "Siap berangkat! 👋".
    `;
    if (config.modelType === 'no_model') {
        structureInstruction = `
        STRUKTUR SCENE (DAILY AESTHETIC - PRODUCT ONLY):
        SCENE 1 (THE MOOD - FLATLAY): Visual: Baju ditaruh di kasur (Messy but aesthetic), sebelah laptop/buku. Text: "Save dulu buat inspirasi ✨".
        SCENE 2 (THE DETAILS): Visual: Tangan (Close up) memegang bahan kain. Text: "Bahannya lembut banget".
        SCENE 3 (THE READY - HANGING): Visual: Baju digantung di pintu lemari. Text: "Wajib punya minimal satu!".
        `;
    }
  }

  const productNameContext = config.productName 
    ? `NAMA PRODUK: "${config.productName}"`
    : `NAMA PRODUK: Analisis dari gambar yang saya upload.`;

  return `
Role: Anda adalah Creative Director TikTok Indonesia.

KONTEKS PRODUK:
${productNameContext}
Kategori Visual: ${isRain ? 'PERLENGKAPAN HUJAN/WATERPROOF' : isBatik ? 'FASHION FORMAL/TRADISIONAL' : isOutdoorGear ? 'OUTDOOR/NATURE' : 'CASUAL/GENERAL'}
Harga: ${config.productPrice || '(Rahasia/Terjangkau)'}

INSTRUKSI NASKAH & VISUAL (PENTING):
1. **LOCAL VIBE**: Gunakan background "${fixedBackground}". Pastikan terasa seperti di Indonesia (Trotoar paving, motor bebek, hutan pinus, atau pesta kebun).
2. **RELEVANSI NASKAH**: 
   - Jika Jas Hujan -> Script harus tentang "Anti Basah", "Aman naik motor", "Hujan". JANGAN bilang "cocok buat hangout".
   - Jika Batik -> Script harus tentang "Kondangan", "Resmi", "Elegan".
   - Jika Outdoor -> Script harus tentang "Petualangan", "Kuat", "Alam".
3. **KONSISTENSI VISUAL MUTLAK**: 
   - Anda WAJIB menggunakan deskripsi fisik berikut di SETIAP prompt (Image & Video) tanpa perubahan: "${lockedFaceDescription}".
   - Prompt Video (Kling AI) HARUS MEMUAT deskripsi fisik yang 100% SAMA PERSIS dengan prompt gambar. Jangan diringkas.

${modelInstruction}

${structureInstruction}

STRUKTUR OUTPUT JSON:
{
  "product_name": "...",
  "social_media_caption": "...",
  "voiceover_script": "...",
  "scenes": [
    {
      "scene_title": "...",
      "angle_description": "...",
      "image_prompt": "Vertical portrait 9:16, [Action], ${lockedFaceDescription}, [Detailed Outfit Description], [BACKGROUND DARI INSTRUKSI DI ATAS] (NO TEXT IN IMAGE, CLEAN NO WATERMARK)...",
      "kling_video_prompt": "Vertical video 9:16, [Action], ${lockedFaceDescription} (FULL DESCRIPTION - DO NOT SHORTEN), [Detailed Outfit Description - SAME AS SCENE 2], [BACKGROUND DARI INSTRUKSI DI ATAS], Silent video, no talking, no audio...",
      "cta_text": "..."
    },
    ...
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

  // Generate Prompt Text using the new Logic
  const manualPrompt = generateManualPromptText(config);

  const systemInstruction = `
    Anda adalah Pakar Konten TikTok Organik Indonesia.
    
    TUGAS: Generate JSON konten video berdasarkan gambar produk yang diupload.
    
    RULES UTAMA:
    1. Ikuti struktur scene dan background yang sudah didefinisikan secara spesifik di bawah ini.
    2. Pastikan Script Voiceover dan Text Overlay SESUAI dengan fungsi barang (Misal: Jas hujan untuk hujan, Batik untuk pesta).
    3. Konsistensi Visual adalah kunci.
    4. IMAGE PROMPT: Do not request text inside the image. Explicitly mention 'clean image, no watermarks'.
    
    ${manualPrompt}
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
          social_media_caption: { type: Type.STRING, description: "Caption TikTok soft selling, relevan dengan fungsi produk." },
          voiceover_script: { type: Type.STRING, description: "Narasi pendek (10-15s) yang persuasif sesuai fungsi produk." },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene_title: { type: Type.STRING },
                angle_description: { type: Type.STRING },
                image_prompt: { type: Type.STRING, description: "Prompt gambar. WAJIB: [DESKRIPSI WAJAH SPESIFIK] + [DESKRIPSI BAJU KONSISTEN] + [BACKGROUND SESUAI KONTEKS]. NO TEXT. NO WATERMARK." },
                kling_video_prompt: { type: Type.STRING, description: "Prompt video AI. WAJIB: [DESKRIPSI WAJAH SPESIFIK SAMA PERSIS DENGAN IMAGE PROMPT] + [DESKRIPSI BAJU SAMA PERSIS] + [BACKGROUND SESUAI KONTEKS], 'Silent video'." },
                cta_text: { type: Type.STRING }
              },
              required: ["scene_title", "angle_description", "image_prompt", "kling_video_prompt", "cta_text"]
            }
          }
        },
        required: ["product_name", "social_media_caption", "voiceover_script", "scenes"]
      }
    },
    contents: {
      parts: [
        { inlineData: { mimeType: mimeType, data: imageBase64 } },
        { text: `Generate TikTok Content for product: ${config.productName}. Price: ${config.productPrice}. Style: ${config.styleType}. Model: ${config.modelType}. DETECT PRODUCT CONTEXT (Rain/Batik/Outdoor) AND ADJUST SCRIPT/BACKGROUND ACCORDINGLY.` }
      ]
    }
  }));

  if (!response.text) throw new Error("Gagal mendapatkan respons dari Gemini.");
  return JSON.parse(response.text) as GeneratedCampaign;
};

export const generateImageFromPrompt = async (
    prompt: string, 
    referenceImageBase64?: string
): Promise<string> => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey });
  
  // FORCE GEMINI 2.5 FLASH IMAGE FOR COST SAVINGS
  const modelId = "gemini-2.5-flash-image"; 

  console.log(`Generating image using ${modelId} (Flash mode)`);

  const parts: any[] = [];
  
  const visualStyle = "High-quality realistic photography, 4k, professional lighting. Background: clean and aesthetic. Subject:";
  
  const constraint = "IMPORTANT: The product worn/shown MUST match the reference image exactly in COLOR, PATTERN, and DESIGN. STRICT RULE: DO NOT use the face from the reference image. You MUST generate a BRAND NEW, unique Native Indonesian model face (Sawo matang skin) that looks different from the reference. EXTREMELY IMPORTANT: IGNORE and REMOVE any text, watermarks, or logos found in the reference image. The generated image must be completely CLEAN, high-quality photography with NO WATERMARKS and NO TEXT.";
  
  const finalPrompt = `${visualStyle} ${prompt}. ${constraint}`;

  if (referenceImageBase64) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: referenceImageBase64 } });
    parts.push({ text: "Reference image provided. " + finalPrompt });
  } else {
    parts.push({ text: finalPrompt });
  }

  const imageConfig = { aspectRatio: "9:16" };

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
