import React, { useState } from 'react';
import { ScenePrompt, ImageQuality } from '../types';
import { CopyButton } from './CopyButton';
import { ImageIcon, VideoIcon, DownloadIcon, RefreshIcon, TextIcon } from './Icon';
import { generateImageFromPrompt } from '../services/geminiService';

interface SceneCardProps {
  scene: ScenePrompt;
  index: number;
  uploadedImageBase64?: string;
  imageQuality?: ImageQuality;
}

export const SceneCard: React.FC<SceneCardProps> = ({ 
    scene, 
    index, 
    uploadedImageBase64, 
    imageQuality = 'standard' 
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateImage = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      // Pass the uploaded image as a reference if available, AND the quality setting
      const base64Img = await generateImageFromPrompt(
          scene.image_prompt, 
          uploadedImageBase64,
          imageQuality as ImageQuality
      );
      setGeneratedImage(base64Img);
    } catch (err: any) {
      setError(err.message || "Gagal generate gambar");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${generatedImage}`;
    link.download = `scene-${index + 1}-${scene.scene_title.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 hover:border-purple-500/50 transition-colors duration-300 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-xs text-white">
            {index + 1}
          </span>
          {scene.scene_title}
        </h3>
        <span className="text-xs font-mono text-purple-300 bg-purple-900/30 px-2 py-1 rounded">
          {scene.angle_description}
        </span>
      </div>

      <div className="space-y-6 flex-1">
        {/* Script / CTA Section */}
        <div className="bg-gradient-to-r from-orange-900/20 to-amber-900/20 rounded-lg p-4 border border-orange-700/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-orange-400 text-sm font-semibold">
              <TextIcon />
              <span>Naskah / Text Overlay</span>
            </div>
            <CopyButton text={scene.cta_text} label="Copy Text" />
          </div>
          <p className="text-orange-100 text-lg font-medium leading-relaxed italic">
            "{scene.cta_text}"
          </p>
        </div>

        {/* Image Generation Section */}
        <div className="bg-slate-900/60 rounded-lg border border-slate-700/50 overflow-hidden">
          <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-400 text-sm font-semibold">
              <ImageIcon />
              <span>Visual Scene ({imageQuality === 'premium' ? 'Pro 3.0' : 'Std Flash'})</span>
            </div>
            {generatedImage && (
              <button
                onClick={handleGenerateImage}
                disabled={isGenerating}
                className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors"
              >
                <RefreshIcon />
                Regenerate
              </button>
            )}
          </div>
          
          <div className="p-4 flex flex-col items-center">
            {generatedImage ? (
              <div className="w-full relative group">
                <img 
                  src={`data:image/png;base64,${generatedImage}`} 
                  alt={scene.scene_title} 
                  className="w-full rounded-lg shadow-lg mb-4 max-h-[400px] object-cover object-top"
                />
                <div className="flex gap-2 w-full">
                  <button
                    onClick={handleDownload}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    <DownloadIcon />
                    Download Gambar
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full text-center py-6">
                <p className="text-slate-400 text-xs mb-4 italic px-4 line-clamp-3">
                  "{scene.image_prompt}"
                </p>
                <div className="text-xs text-slate-500 mb-4 bg-slate-800/50 inline-block px-3 py-1 rounded-full border border-slate-700">
                   Menggunakan gambar referensi asli
                </div>
                <button
                  onClick={handleGenerateImage}
                  disabled={isGenerating}
                  className={`px-6 py-2 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 mx-auto w-full ${
                    isGenerating 
                      ? 'bg-slate-700 text-slate-400 cursor-wait' 
                      : imageQuality === 'premium'
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:shadow-purple-900/20'
                        : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white hover:shadow-lg hover:shadow-blue-900/20'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Membuat ({imageQuality === 'premium' ? 'HQ' : 'Std'})...
                    </>
                  ) : (
                    <>
                      <span className="text-lg">✨</span>
                      Generate Gambar ({imageQuality === 'premium' ? 'Pro' : 'Std'})
                    </>
                  )}
                </button>
                {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Video Prompt Section */}
        <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-pink-400 text-sm font-semibold">
              <VideoIcon />
              <span>Prompt Video (Kling AI)</span>
            </div>
            <CopyButton text={scene.kling_video_prompt} label="Copy" />
          </div>
          <p className="text-slate-300 text-xs leading-relaxed font-mono bg-black/20 p-2 rounded border border-slate-800">
            {scene.kling_video_prompt}
          </p>
        </div>
      </div>
    </div>
  );
};