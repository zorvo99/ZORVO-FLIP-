import React from 'react';

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#0a0d0a] text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-3xl border border-[#1f2e1f] bg-[#111810] p-8 space-y-4 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Route Not Found</p>
        <h1 className="text-2xl font-black tracking-tight">This screen is not available.</h1>
        <p className="text-sm text-slate-400">The link may be invalid or the page may have moved.</p>
        <button
          onClick={() => {
            window.location.hash = '#/';
          }}
          className="w-full rounded-2xl bg-[#3ddb6f] text-black py-3 text-[11px] font-black uppercase tracking-widest"
        >
          Go To Dashboard
        </button>
      </div>
    </div>
  );
};

export default NotFound;
