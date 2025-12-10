
import React, { useState, useRef } from 'react';
import { UploadIcon, ManIcon, WomanIcon, BoxIcon, CameraIcon, PhoneIcon } from './components/Icon';
import { generateAffiliatePrompts } from './services/geminiService';
import { GeneratedCampaign, ProcessStatus, ModelType, StyleType, CampaignConfig } from './types';
import { SceneCard } from './components/SceneCard';

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadedImageBase64, setUploadedImageBase64] = useState<string | null>(null);
  
  const [status, setStatus] = useState<ProcessStatus>(ProcessStatus.IDLE);
  const [result, setResult] = useState<GeneratedCampaign | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  
  // Configuration State
  const [productName, setProductName] = useState<string>("");
  const [modelType, setModelType] = useState<ModelType>('indo_woman');
  const [styleType, setStyleType] = useState<StyleType>('natural');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file selection
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const processFile = async (selectedFile: File) => {
    if (!selectedFile.type.startsWith('image/')) {
      setErrorMsg("Mohon upload file gambar.");
      return;
    }
    setFile(selectedFile);
    setPreviewUrl(URL.createObjectURL(selectedFile));
    setResult(null);
    setErrorMsg("");
    setStatus(ProcessStatus.IDLE);

    // Create Base64 immediately for later use
    try {
        const base64 = await fileToBase64(selectedFile);
        setUploadedImageBase64(base64);
    } catch (e) {
        console.error("Error reading file", e);
    }
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          // Remove Data URL prefix for API
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  // Main Generation Logic
  const handleGenerate = async () => {
    if (!file || !uploadedImageBase64) return;

    setStatus(ProcessStatus.ANALYZING);
    setErrorMsg("");

    try {
      const config: CampaignConfig = {
        modelType,
        styleType,
        productName
      };

      const campaign = await generateAffiliatePrompts(
        uploadedImageBase64, 
        file.type, 
        config
      );
      setResult(campaign);
      setStatus(ProcessStatus.SUCCESS);
    } catch (error: any) {
      console.error(error);
      setStatus(ProcessStatus.ERROR);
      setErrorMsg(error.message || "Terjadi kesalahan saat menghubungi Gemini.");
    }
  };

  const ModelOption = ({ type, label, icon }: { type: ModelType, label: string, icon: React.ReactNode }) => (
    <button
      onClick={() => setModelType(type)}
      className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
        modelType === type
          ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-900/50'
          : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <div className="mb-2">{icon}</div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  );

  const StyleOption = ({ type, label, desc, icon }: { type: StyleType, label: string, desc: string, icon: React.ReactNode }) => (
    <button
      onClick={() => setStyleType(type)}
      className={`flex items-center gap-4 p-3 rounded-xl border transition-all text-left ${
        styleType === type
          ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/50'
          : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <div className={`p-2 rounded-lg ${styleType === type ? 'bg-blue-500' : 'bg-slate-700'}`}>
        {icon}
      </div>
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className={`text-xs ${styleType === type ? 'text-blue-100' : 'text-slate-500'}`}>{desc}</div>
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-purple-900/20">
              <span className="font-bold text-xl">Ai</span>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">Affiliate Director</h1>
              <p className="text-xs text-slate-400">Gemini 2.5 & Kling AI Workflow</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* SECTION 1: DASHBOARD INPUT (Top) */}
        <div className="bg-slate-900/50 rounded-3xl border border-slate-800 p-6 md:p-8 mb-12 shadow-2xl relative overflow-hidden">
          {/* Decorative gradients */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-purple-600/5 rounded-full blur-3xl pointer-events-none -mr-32 -mt-32"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl pointer-events-none -ml-32 -mb-32"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start relative z-10">
            
            {/* Left Column: Image Upload */}
            <div className="space-y-4">
               <h2 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                 <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs">1</span>
                 Upload Produk
               </h2>
               
               <div className="bg-slate-900 rounded-2xl p-1 border border-slate-800 shadow-xl h-full">
                <div 
                  className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all h-[320px] ${
                    previewUrl ? 'border-purple-500/30 bg-slate-800/50' : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/50 cursor-pointer'
                  }`}
                  onClick={() => !previewUrl && fileInputRef.current?.click()}
                >
                  {previewUrl ? (
                    <div className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-lg group">
                      <img 
                        src={previewUrl} 
                        alt="Product Preview" 
                        className="max-h-full max-w-full object-contain"
                      />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setPreviewUrl(null);
                          setResult(null);
                          setUploadedImageBase64(null);
                        }}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-medium"
                      >
                        Ganti Gambar
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="bg-slate-800/50 p-4 rounded-full mb-4">
                         <UploadIcon />
                      </div>
                      <p className="mb-2 text-lg text-slate-300 font-semibold">
                        Klik untuk Upload
                      </p>
                      <p className="text-sm text-slate-500 max-w-[200px]">
                        Gunakan foto produk yang jelas dan terang
                      </p>
                    </>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*" 
                    onChange={handleFileChange} 
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Configuration */}
            <div className="space-y-6 flex flex-col justify-center h-full">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                  <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs">2</span>
                  Konfigurasi Video
                </h2>
                
                <div className="space-y-6">
                  {/* Product Name Input */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Nama Produk (Untuk Naskah)</label>
                    <input 
                      type="text" 
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Contoh: Sepatu Lari Nike Pegasus, Serum Avoskin, dll."
                      className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all"
                    />
                    <p className="text-xs text-slate-500 mt-2 ml-1">Nama ini membantu AI membuat kata-kata promosi yang pas.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Pilih Model Talent</label>
                    <div className="grid grid-cols-3 gap-2">
                      <ModelOption type="indo_woman" label="Cewek Indo" icon={<WomanIcon />} />
                      <ModelOption type="indo_man" label="Cowok Indo" icon={<ManIcon />} />
                      <ModelOption type="no_model" label="Tanpa Model" icon={<BoxIcon />} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Gaya Visual (Vibe)</label>
                    <div className="grid grid-cols-1 gap-2">
                      <StyleOption 
                        type="natural" 
                        label="Natural / TikTok Style" 
                        desc="Terang, autentik, dan relatable (Viral)" 
                        icon={<PhoneIcon />} 
                      />
                      <StyleOption 
                        type="cinematic" 
                        label="Cinematic / Iklan TV" 
                        desc="Dramatis, pencahayaan moody, elegan" 
                        icon={<CameraIcon />} 
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleGenerate}
                  disabled={!file || status === ProcessStatus.ANALYZING}
                  className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-[0.99] ${
                    !file 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : status === ProcessStatus.ANALYZING
                        ? 'bg-purple-900/50 text-purple-200 cursor-wait'
                        : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-purple-900/30'
                  }`}
                >
                  {status === ProcessStatus.ANALYZING ? (
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sedang Menganalisis...
                    </div>
                  ) : (
                    "Generate Prompt & Gambar"
                  )}
                </button>
                
                {errorMsg && (
                  <div className="mt-4 p-3 bg-red-900/20 border border-red-900/50 text-red-200 text-sm rounded-lg text-center">
                    {errorMsg}
                  </div>
                )}
              </div>
            </div>
            
          </div>
        </div>

        {/* SECTION 2: OUTPUT RESULTS (Bottom) */}
        <div className="w-full">
          {status === ProcessStatus.ANALYZING && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-900 rounded-xl h-[500px] w-full border border-slate-800"></div>
              ))}
            </div>
          )}

          {result && (
            <div className="space-y-8 animate-fade-in-up">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/50 pb-6">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">{result.product_name}</h2>
                  <p className="text-slate-400">Campaign generated for affiliate marketing.</p>
                </div>
                <div className="flex gap-2">
                   <span className="text-sm bg-slate-800 text-slate-300 px-4 py-2 rounded-full border border-slate-700 flex items-center gap-2">
                    {modelType === 'indo_woman' ? <WomanIcon /> : modelType === 'indo_man' ? <ManIcon /> : <BoxIcon />}
                    {modelType === 'indo_woman' ? 'Cewek Indo' : modelType === 'indo_man' ? 'Cowok Indo' : 'Produk Only'}
                  </span>
                  <span className="text-sm bg-blue-500/10 text-blue-400 px-4 py-2 rounded-full border border-blue-500/20 flex items-center gap-2">
                    {styleType === 'natural' ? <PhoneIcon /> : <CameraIcon />}
                    {styleType === 'natural' ? 'Natural Vibe' : 'Cinematic Vibe'}
                  </span>
                </div>
              </div>
              
              {/* Scenes Grid Layout - 3 Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {result.scenes.map((scene, index) => (
                  <SceneCard 
                      key={index} 
                      scene={scene} 
                      index={index} 
                      uploadedImageBase64={uploadedImageBase64 || undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
