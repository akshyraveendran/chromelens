import React, { useState } from 'react';
import { ColorData } from '../types';
import { Check, Copy, X } from 'lucide-react';

interface ColorSwatchProps {
  color: ColorData;
  large?: boolean;
  onRemove?: () => void;
}

export const ColorSwatch: React.FC<ColorSwatchProps> = ({ color, large = false, onRemove }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(color.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) onRemove();
  };

  return (
    <div 
      className={`
        group relative flex flex-col items-center justify-between
        bg-white border border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200
        transition-all duration-300 ease-out cursor-pointer
        ${large ? 'p-5 rounded-3xl aspect-[3/4]' : 'p-3 rounded-2xl aspect-[4/5]'}
      `}
      onClick={handleCopy}
    >
      {/* Remove Button */}
      {onRemove && (
        <button
          onClick={handleRemove}
          className="absolute -top-2 -right-2 bg-white shadow-sm border border-slate-100 p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors z-10 opacity-0 group-hover:opacity-100"
          title="Remove color"
        >
          <X size={14} />
        </button>
      )}

      {/* Color Circle */}
      <div 
        className={`
          rounded-full shadow-inner ring-1 ring-black/5 flex-shrink-0
          transition-transform duration-500 group-hover:scale-110 ease-out
          ${large ? 'w-20 h-20 mb-4' : 'w-10 h-10 mb-2'}
        `}
        style={{ backgroundColor: color.hex }}
      />

      {/* Info Section */}
      <div className="flex flex-col items-center w-full gap-1">
        <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-slate-50 group-hover:bg-slate-100 transition-colors">
            <span className={`font-mono font-bold text-slate-700 tracking-wide ${large ? 'text-sm' : 'text-[10px]'}`}>
                {color.hex}
            </span>
            <div className={`text-slate-400 ${copied ? 'text-green-500' : 'group-hover:text-blue-500'}`}>
                {copied ? <Check size={large ? 14 : 10} /> : <Copy size={large ? 14 : 10} />}
            </div>
        </div>
      </div>
    </div>
  );
};
