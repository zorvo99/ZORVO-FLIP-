
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { getRenovationSuggestions } from '../services/geminiService';
import { ICONS } from '../constants';
import { AIActionItem } from '../types';
import { getRoomById, updateRoomById } from '../store/projectStore';

const AIInsights: React.FC = () => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [discoveredItems, setDiscoveredItems] = useState<AIActionItem[]>([]);
  const [roomType, setRoomType] = useState('');
  const [insightMessage, setInsightMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<{ projectId: string, roomId: string } | null>(null);
  const hasGeminiKey = Boolean(import.meta.env.VITE_GEMINI_API_KEY);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    const projectId = params.get('projectId');
    const roomId = params.get('roomId');
    if (projectId && roomId) {
      setTarget({ projectId, roomId });
      const data = getRoomById(projectId, roomId);
      if (!data) {
        setInsightMessage('Room not found. Returning to dashboard.');
        window.location.hash = '#/';
        return;
      }
      setRoomType(data.room.type);
      setImages(data.room.photoUrls || []);
    } else {
      window.location.hash = '#/';
    }
  }, []);

  const goBackToRoom = () => {
    if (target) {
      window.location.hash = `#/project/${target.projectId}/room/${target.roomId}`;
      return;
    }
    window.location.hash = '#/';
  };

  const runDiscovery = async () => {
    if (!hasGeminiKey) {
      setInsightMessage('Add VITE_GEMINI_API_KEY to enable AI discovery.');
      return;
    }
    if (images.length === 0 || !roomType) {
      setInsightMessage('Add room photos before running visual discovery.');
      return;
    }
    setInsightMessage(null);
    setLoading(true);
    try {
      const result = await getRenovationSuggestions(images, roomType);
      setDiscoveredItems(result.actions || []);
      if (!result.actions?.length) {
        setInsightMessage('No items were discovered this time. Try clearer photos.');
      }
    } finally {
      setLoading(false);
    }
  };

  const addToScope = (itemDesc: string) => {
    if (!target) return;
    updateRoomById(target.projectId, target.roomId, room => {
      const current = room.intendedScope || [];
      const scopeInputs = { ...(room.scopeInputs || {}) };
      const normalizedKey = `aiDetected_${itemDesc.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      scopeInputs[normalizedKey] = true;
      const nextScope = current.includes(itemDesc) ? current : [...current, itemDesc];
      const nextNotes = room.notes?.includes(itemDesc)
        ? room.notes || ''
        : `${room.notes ? `${room.notes}\n` : ''}AI discovered: ${itemDesc}`;
      return { ...room, intendedScope: nextScope, scopeInputs, notes: nextNotes };
    });

    // Visual feedback: remove from discovered list locally to show it's "Done"
    setDiscoveredItems(prev => prev.filter(i => i.description !== itemDesc));
  };

  const addAllToScope = () => {
    if (!target || discoveredItems.length === 0) return;

    const uniqueDescriptions = Array.from(new Set(discoveredItems.map(item => item.description)));
    updateRoomById(target.projectId, target.roomId, room => {
      const current = room.intendedScope || [];
      const merged = Array.from(new Set([...current, ...uniqueDescriptions]));
      const scopeInputs = { ...(room.scopeInputs || {}) };
      uniqueDescriptions.forEach(description => {
        const normalizedKey = `aiDetected_${description.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        scopeInputs[normalizedKey] = true;
      });
      const noteLines = uniqueDescriptions.map(description => `AI discovered: ${description}`);
      const existingNotes = room.notes || '';
      const nextNotes = [...new Set([existingNotes, ...noteLines].filter(Boolean))].join('\n');
      return { ...room, intendedScope: merged, scopeInputs, notes: nextNotes };
    });
    setDiscoveredItems([]);
  };

  return (
    <Layout 
      title="AI Scope Discovery" 
      showBack 
      onBack={goBackToRoom}
    >
      <div className="space-y-6">
        {!hasGeminiKey && (
          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              AI not configured. Set `VITE_GEMINI_API_KEY` in your environment.
            </p>
          </div>
        )}

        {insightMessage && (
          <div className="rounded-[24px] border border-[#1f2e1f] bg-[#0f150f] px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#3ddb6f]">{insightMessage}</p>
          </div>
        )}

        <div className="bg-[#111810] border border-[#1f2e1f] text-white p-6 rounded-[32px] shadow-xl shadow-black/30">
           <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
             <ICONS.Sparkles /> Vision Discovery
           </h2>
           <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-90">
             Analyzing {images.length} photos of your {roomType}
           </p>
        </div>

        {discoveredItems.length === 0 ? (
          <div className="text-center py-12 space-y-8">
            <div className="flex justify-center gap-3 overflow-hidden px-4">
              {images.map((img, i) => (
                <img key={i} src={img} className="w-24 h-24 rounded-2xl object-cover shadow-lg border-2 border-white rotate-3 odd:-rotate-3 flex-shrink-0" />
              ))}
            </div>
            <div className="space-y-4 px-8">
              <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest">Ready to scan?</h3>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.1em] leading-relaxed">
                AI will identify specific renovation tasks, fixtures, and materials visible in your photos.
              </p>
              <button 
                onClick={runDiscovery}
                disabled={loading || images.length === 0 || !roomType || !hasGeminiKey}
                className="w-full bg-[#3ddb6f] text-black px-8 py-5 rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-900/40 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3 transition-all"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing Viewpoints...
                  </>
                ) : 'Run Visual Discovery'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom duration-500 pb-20">
             <div className="flex justify-between items-center px-1">
               <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discovered Work Items</h3>
               <button onClick={addAllToScope} className="text-[10px] font-black text-[#3ddb6f] uppercase tracking-widest underline">Add All</button>
             </div>
             
             <div className="space-y-3">
               {discoveredItems.map((item, i) => (
                 <div key={i} className="bg-[#111810] border border-[#1f2e1f] p-5 rounded-[28px] shadow-sm flex justify-between items-center group animate-in fade-in zoom-in">
                    <div className="flex-1 pr-4">
                      <p className="text-xs font-black uppercase text-slate-100 tracking-tight">{item.description}</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Identified fixture/surface</p>
                    </div>
                    <button 
                      onClick={() => addToScope(item.description)}
                      className="bg-[#0f150f] text-[#3ddb6f] px-4 py-3 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase tracking-widest active:bg-[#3ddb6f] active:text-black transition-all"
                    >
                      + Select
                    </button>
                 </div>
               ))}
             </div>
             
             <button 
              onClick={goBackToRoom}
              className="w-full p-6 bg-slate-900 text-white rounded-[28px] font-black text-[11px] uppercase tracking-widest mt-8 shadow-xl"
             >
               Confirm & Go to Plan
             </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AIInsights;
