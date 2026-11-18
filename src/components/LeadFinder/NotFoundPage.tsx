import React from 'react';
import { ArrowLeft, Terminal, AlertTriangle } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#08090B] text-[#F2F3F4] flex flex-col justify-center items-center px-4 selection:bg-[#FF6A00] selection:text-white">
      <div className="max-w-md w-full border border-[#22262B] bg-[#121417] rounded-2xl p-8 relative overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)]">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FF6A00] to-transparent" />
        
        <div className="flex items-center gap-2 mb-6">
          <Terminal className="w-4 h-4 text-[#FF6A00]" />
          <span className="font-mono text-xs uppercase tracking-widest text-[#868E96]">
            AZUMCO // ROUTE FAULT
          </span>
        </div>

        <div className="flex items-baseline gap-3 mb-3">
          <span className="text-5xl font-mono font-bold text-white tracking-tighter">404</span>
          <span className="text-xs font-mono uppercase bg-[#181B1F] border border-[#2B3037] text-[#FA5252] px-2.5 py-1 rounded">
            NODE_NOT_FOUND
          </span>
        </div>

        <h1 className="text-xl font-bold font-sans text-white mb-2">
          Route not found on this cluster
        </h1>
        <p className="text-sm text-[#868E96] leading-relaxed mb-6 font-sans">
          The requested endpoint does not exist or has been removed from this system cluster.
        </p>

        <div className="pt-4 border-t border-[#22262B] flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-[#FF6A00] hover:text-[#ff8124] transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            RETURN TO ROOT
          </a>
          <span className="text-[11px] font-mono text-[#525B66]">ERR_HTTP_404</span>
        </div>
      </div>
    </div>
  );
}
