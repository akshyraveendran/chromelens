import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, Loader2, Sparkles, Plus, Trash2, MousePointer2, CheckCircle2, Droplet, Download, FileJson, Image as ImageIcon } from 'lucide-react';
import { extractColors, rgbToHex, rgbToHsl, categorizeColor } from './utils/colorAnalysis';
import { analyzePaletteMood } from './services/geminiService';
import { PaletteAnalysis, AIAnalysisResult, RGB, ColorData } from './types';
import { ColorSwatch } from './components/ColorSwatch';

const App: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteAnalysis | null>(null);
  const [customColors, setCustomColors] = useState<ColorData[]>([]);
  
  // Interaction State
  const [hoverPixel, setHoverPixel] = useState<{ hex: string; rgb: RGB } | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<{ hex: string; rgb: RGB } | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);

  // Refs for pixel picking - 1x1 canvas is enough!
  const pickerCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Cleanup Object URL on unmount or change
  useEffect(() => {
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  // Consolidated file processing logic
  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;

    setIsProcessing(true);
    setAiAnalysis(null);
    setPalette(null);
    setCustomColors([]); 
    setHoverPixel(null);
    setSelectedPixel(null);
    
    // Revoke previous URL to free memory
    setImageSrc(prev => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
    });
  }, []);

  // Handle Paste (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
    };
  }, [processFile]);

  // Handle Manual File Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // Handle Drag and Drop
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      processFile(file);
    }
  };

  const handleImageLoad = async () => {
    if (!imageRef.current) return;
    
    try {
      // Async extraction so UI doesn't block
      const result = await extractColors(imageRef.current);
      setPalette(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    const image = imageRef.current;
    
    // Lazy create picker canvas if needed
    let canvas = pickerCanvasRef.current;
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        pickerCanvasRef.current = canvas;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Get the bounding rectangle of the displayed image
    const rect = image.getBoundingClientRect();
    
    // Calculate cursor position relative to the image element
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Map displayed coordinates to natural image coordinates
    const scaleX = image.naturalWidth / rect.width;
    const scaleY = image.naturalHeight / rect.height;

    const pixelX = Math.floor(x * scaleX);
    const pixelY = Math.floor(y * scaleY);

    // Safety check boundaries
    if (pixelX < 0 || pixelY < 0 || pixelX >= image.naturalWidth || pixelY >= image.naturalHeight) return;

    // Optimized: Draw only the 1 pixel we need!
    // No need to keep a giant canvas in memory.
    ctx.drawImage(image, pixelX, pixelY, 1, 1, 0, 0, 1, 1);
    
    const pixelData = ctx.getImageData(0, 0, 1, 1).data;
    const rgb = { r: pixelData[0], g: pixelData[1], b: pixelData[2] };
    const hex = rgbToHex(rgb);
    
    setHoverPixel({ hex, rgb });
  }, []);

  const handleImageClick = () => {
    if (hoverPixel) {
      setSelectedPixel(hoverPixel);
    }
  };

  const addColorToPalette = (pixelObj: { hex: string; rgb: RGB } | null) => {
    if (!pixelObj) return;
    
    // Avoid duplicates
    if (customColors.some(c => c.hex === pixelObj.hex)) return;

    const hsl = rgbToHsl(pixelObj.rgb);
    const newColor: ColorData = {
      hex: pixelObj.hex,
      rgb: pixelObj.rgb,
      hsl,
      category: categorizeColor(hsl),
      population: 0
    };

    setCustomColors(prev => [...prev, newColor]);
  };

  const removeCustomColor = (hexToRemove: string) => {
    setCustomColors(prev => prev.filter(c => c.hex !== hexToRemove));
  };

  const handleGeminiAnalysis = async () => {
    if (!palette) return;
    setIsAnalyzingAi(true);
    const topColors = palette.all.slice(0, 5).map(c => c.hex);
    const result = await analyzePaletteMood(topColors);
    setAiAnalysis(result);
    setIsAnalyzingAi(false);
  };

  // --- Export Logic ---

  const handleExportJSON = () => {
    if (!palette) return;
    const data = {
      appName: "ChromaLens",
      date: new Date().toISOString(),
      dominantColors: palette.all.map(c => ({ hex: c.hex, category: c.category })),
      customColors: customColors.map(c => ({ hex: c.hex, category: c.category }))
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chromalens-palette-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportPNG = () => {
    if (!palette) return;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Config
    const colors = palette.all.slice(0, 8);
    const width = 800;
    const height = 450;
    const padding = 50;
    const headerHeight = 100;
    
    canvas.width = width;
    canvas.height = height;
    
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Title
    ctx.fillStyle = '#1e293b'; // slate-800
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText("ChromaLens Palette", padding, 60);
    
    // Subtitle
    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.font = '14px sans-serif';
    ctx.fillText(new Date().toLocaleDateString(), padding, 85);

    // Draw Swatches
    const gap = 20;
    const availableWidth = width - (padding * 2);
    const swatchWidth = (availableWidth - (gap * (colors.length - 1))) / colors.length;
    const swatchHeight = 180;
    const startY = headerHeight + 20;

    colors.forEach((color, i) => {
        const x = padding + i * (swatchWidth + gap);
        
        // Color block
        ctx.fillStyle = color.hex;
        ctx.fillRect(x, startY, swatchWidth, swatchHeight);
        
        // Hex text
        ctx.fillStyle = '#334155'; // slate-700
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(color.hex, x + swatchWidth/2, startY + swatchHeight + 30);
    });

    // Download
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `chromalens-palette-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Minimal Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md z-40 border-b border-slate-100 flex items-center justify-center px-6">
         <div className="max-w-6xl w-full flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 shadow-sm"></div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-800">ChromaLens</h1>
            </div>
            {imageSrc && (
                <button 
                  onClick={() => { 
                      setImageSrc(null); 
                      setPalette(null); 
                      setAiAnalysis(null); 
                      setCustomColors([]); 
                      setSelectedPixel(null);
                      setHoverPixel(null);
                  }}
                  className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500"
                  title="Clear Image"
                >
                    <X size={20} />
                </button>
            )}
         </div>
      </header>

      <main className="pt-24 pb-20 px-4 sm:px-6 flex flex-col items-center">
        <div className="max-w-6xl w-full flex flex-col gap-8">
            
            {/* Upload / Image Section */}
            <section className="w-full transition-all duration-500">
                {!imageSrc ? (
                    <div className="relative group w-full aspect-[21/9] min-h-[400px] rounded-[2.5rem] bg-white border-2 border-dashed border-slate-200 flex flex-col items-center justify-center transition-all hover:border-blue-400 hover:shadow-xl hover:shadow-blue-500/5 overflow-hidden">
                        <input 
                            type="file" 
                            accept="image/png, image/jpeg, image/webp" 
                            onChange={handleFileChange} 
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                             <Upload size={32} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
                        </div>
                        <h2 className="text-2xl font-semibold text-slate-700 mb-2">Drop, Select, or Paste Image</h2>
                        <p className="text-slate-400 text-sm font-medium">PNG, JPG, WEBP • Ctrl+V supported</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-6">
                        {/* Image Container */}
                        <div className="relative rounded-[2rem] overflow-hidden shadow-2xl shadow-slate-200 bg-white ring-1 ring-slate-100 select-none max-w-full">
                            
                            <div 
                                className="relative cursor-crosshair group"
                                onMouseMove={handleMouseMove}
                                onMouseLeave={() => setHoverPixel(null)}
                                onClick={handleImageClick}
                            >
                                <img 
                                    ref={imageRef}
                                    src={imageSrc} 
                                    alt="Analysis Target" 
                                    className="block max-h-[60vh] object-contain mx-auto w-auto"
                                    onLoad={handleImageLoad}
                                />
                            </div>
                        </div>

                        {/* Inspector Bar (Persistent UI) */}
                        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg border border-slate-100 p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                            
                            {/* Left: Live Hover Preview */}
                            <div className="flex items-center gap-4 w-full md:w-auto">
                                <div className="flex flex-col items-center gap-1">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hover</span>
                                    <div 
                                        className="w-12 h-12 rounded-full shadow-inner border border-slate-200 transition-colors duration-75"
                                        style={{ backgroundColor: hoverPixel?.hex || '#f1f5f9' }}
                                    ></div>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-lg font-mono font-bold text-slate-700">
                                        {hoverPixel ? hoverPixel.hex : '...'}
                                    </span>
                                    <span className="text-xs text-slate-400 font-mono">
                                        {hoverPixel ? `R${hoverPixel.rgb.r} G${hoverPixel.rgb.g} B${hoverPixel.rgb.b}` : 'Move cursor over image'}
                                    </span>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="hidden md:block w-px h-12 bg-slate-100"></div>

                            {/* Right: Selected Color & Action */}
                            <div className="flex items-center justify-between md:justify-end gap-4 w-full md:w-auto bg-slate-50 md:bg-transparent p-3 md:p-0 rounded-xl">
                                {selectedPixel ? (
                                    <>
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className="w-10 h-10 rounded-lg shadow-sm border border-black/5"
                                                style={{ backgroundColor: selectedPixel.hex }}
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-[10px] uppercase font-bold text-blue-500 tracking-wider flex items-center gap-1">
                                                    <CheckCircle2 size={10} /> Selected
                                                </span>
                                                <span className="text-sm font-bold text-slate-800 font-mono">
                                                    {selectedPixel.hex}
                                                </span>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => addColorToPalette(selectedPixel)}
                                            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-blue-600 active:scale-95 transition-all shadow-md shadow-slate-900/10 font-medium text-sm"
                                        >
                                            <Plus size={16} />
                                            Add to Palette
                                        </button>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-2 text-slate-400 text-sm italic">
                                        <MousePointer2 size={16} />
                                        <span>Click image to pick color</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* Results Section */}
            {(palette || customColors.length > 0) && (
                <section className="animate-in slide-in-from-bottom-8 duration-700 fade-in fill-mode-forwards space-y-12">
                    
                    {/* 1. Custom Colors Section */}
                    {customColors.length > 0 && (
                        <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                             <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-pink-500 to-violet-500 animate-pulse"></div>
                                    <h2 className="text-xl font-bold text-slate-800">Your Picks</h2>
                                    <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded-full text-slate-500">{customColors.length}</span>
                                </div>
                                <button 
                                    onClick={() => setCustomColors([])}
                                    className="text-xs font-medium text-slate-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                                >
                                    <Trash2 size={12} /> Clear
                                </button>
                             </div>
                             <div className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                                {customColors.map((color, idx) => (
                                    <ColorSwatch 
                                        key={`${color.hex}-${idx}`} 
                                        color={color} 
                                        onRemove={() => removeCustomColor(color.hex)}
                                    />
                                ))}
                             </div>
                        </div>
                    )}

                    {palette && (
                        <>
                            {/* 2. Auto Palette Section */}
                            <div>
                                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mb-6 px-2 gap-4">
                                    <div className="flex items-baseline gap-3">
                                        <h2 className="text-2xl font-bold text-slate-800">Dominant Palette</h2>
                                        <span className="text-sm font-medium text-slate-400">{palette.all.length} Colors</span>
                                    </div>
                                    
                                    {/* Export Actions */}
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={handleExportJSON}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 rounded-lg text-xs font-medium transition-all shadow-sm"
                                            title="Download JSON"
                                        >
                                            <FileJson size={14} /> JSON
                                        </button>
                                        <button 
                                            onClick={handleExportPNG}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 rounded-lg text-xs font-medium transition-all shadow-sm"
                                            title="Download Image"
                                        >
                                            <ImageIcon size={14} /> PNG
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 min-[400px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-8 gap-4">
                                    {palette.all.slice(0, 8).map((color, idx) => (
                                        <ColorSwatch key={idx} color={color} large />
                                    ))}
                                </div>
                            </div>

                            {/* 3. Grouped Colors Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                                {/* Warm */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                                        <h3 className="font-semibold text-slate-700">Warm</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {palette.warm.length > 0 ? (
                                            palette.warm.slice(0, 6).map((c, i) => <ColorSwatch key={i} color={c} />)
                                        ) : (
                                            <p className="col-span-2 text-sm text-slate-400 italic py-2">No warm tones.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Cool */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                        <h3 className="font-semibold text-slate-700">Cool</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {palette.cool.length > 0 ? (
                                            palette.cool.slice(0, 6).map((c, i) => <ColorSwatch key={i} color={c} />)
                                        ) : (
                                            <p className="col-span-2 text-sm text-slate-400 italic py-2">No cool tones.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Neutral */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                                        <h3 className="font-semibold text-slate-700">Neutral</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {palette.neutral.length > 0 ? (
                                            palette.neutral.slice(0, 6).map((c, i) => <ColorSwatch key={i} color={c} />)
                                        ) : (
                                            <p className="col-span-2 text-sm text-slate-400 italic py-2">No neutrals.</p>
                                        )}
                                    </div>
                                </div>

                                {/* Accents */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                        <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                                        <h3 className="font-semibold text-slate-700">Accents</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {palette.accents.length > 0 ? (
                                            palette.accents.slice(0, 6).map((c, i) => <ColorSwatch key={i} color={c} />)
                                        ) : (
                                            <p className="col-span-2 text-sm text-slate-400 italic py-2">No accents.</p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* AI Insight Card */}
                            <div className="bg-white rounded-3xl p-1 shadow-xl shadow-slate-200/50 border border-slate-100">
                                {!aiAnalysis ? (
                                    <div className="p-8 text-center flex flex-col items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
                                            <Sparkles className="text-slate-400" size={24} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-slate-800">Need some inspiration?</h3>
                                            <p className="text-slate-500 text-sm mt-1">Ask AI to interpret this color mood.</p>
                                        </div>
                                        <button 
                                            onClick={handleGeminiAnalysis}
                                            disabled={isAnalyzingAi}
                                            className="mt-2 px-6 py-2.5 rounded-full bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-wait transition-all flex items-center gap-2"
                                        >
                                            {isAnalyzingAi && <Loader2 size={14} className="animate-spin" />}
                                            {isAnalyzingAi ? 'Analyzing...' : 'Analyze Vibe'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-8 grid md:grid-cols-[1fr_2fr] gap-8">
                                        <div className="flex flex-col justify-center">
                                            <span className="text-xs font-bold tracking-wider text-blue-600 uppercase mb-2">Palette Mood</span>
                                            <h3 className="text-3xl font-bold text-slate-900 mb-2">{aiAnalysis.paletteName}</h3>
                                            <p className="text-slate-600 leading-relaxed">"{aiAnalysis.moodDescription}"</p>
                                            <button 
                                                onClick={() => setAiAnalysis(null)} 
                                                className="mt-6 text-sm text-slate-400 hover:text-slate-800 self-start underline decoration-slate-200 underline-offset-4 transition-colors"
                                            >
                                                Try again
                                            </button>
                                        </div>
                                        <div className="bg-slate-50 rounded-2xl p-6">
                                            <h4 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                                                <Droplet size={16} className="text-blue-500" />
                                                Design Tips
                                            </h4>
                                            <ul className="space-y-3">
                                                {aiAnalysis.designTips.map((tip, i) => (
                                                    <li key={i} className="text-sm text-slate-600 flex items-start gap-3">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 flex-shrink-0"></span>
                                                        {tip}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </section>
            )}

            {!palette && !imageSrc && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center opacity-40 grayscale pointer-events-none select-none">
                     <div className="h-32 bg-slate-100 rounded-2xl"></div>
                     <div className="h-32 bg-slate-100 rounded-2xl"></div>
                     <div className="h-32 bg-slate-100 rounded-2xl"></div>
                </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default App;