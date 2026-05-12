import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Images } from 'lucide-react';
import Layout from '../components/Layout';
import { getRoomById, updateRoomById } from '../store/projectStore';
import type { Project, Room } from '../types';
import { computeRoomCalculations } from '../utils/roomCalculations';
import { applyRoomPricing } from '../utils/calculateRoomEstimate';
import { computeIndicativeEstimate } from '../utils/indicativeEstimate';
import { getRoomCompletionPercent, isRoomMissingDimensions } from '../utils/roomStatus';
import { roomEstimateMid } from '../utils/budgetAggregates';
import { getRoomScopeSections, type ScopeField } from '../config/roomScopes';
import ToggleField from '../components/forms/ToggleField';
import SelectField from '../components/forms/SelectField';
import NumberField from '../components/forms/NumberField';
import TextField from '../components/forms/TextField';
import DimensionsField from '../components/forms/DimensionsField';
import { selectAllOnNumberFocus } from '../components/forms/quickNumericInput';
import { filesToBase64DataUrls } from '../utils/imageFiles';

interface Props {
  projectId: string;
  roomId: string;
}

type StepKey = 'dimensions' | 'photos' | 'demolition' | 'services' | 'fixtures' | 'review';

type DimKey = 'length' | 'width' | 'height';

function normalizeMetresValue(raw: number): number {
  const n = Number.isFinite(raw) ? raw : 0;
  if (n <= 0) return 0;
  if (n > 50) return Math.min(50, n / 1000);
  return Math.min(50, n);
}

function parseDimensionInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 0;
  return normalizeMetresValue(n);
}

const FIELD_KEYWORDS = {
  demolition: ['demo', 'remove', 'strip'],
  services: ['plumb', 'electri', 'waterproof', 'drain', 'gas', 'hvac'],
};

const RoomWalkthroughMode: React.FC<Props> = ({ projectId, roomId }) => {
  const loaded = getRoomById(projectId, roomId);
  const [project, setProject] = useState<Project | null>(loaded?.project || null);
  const [room, setRoom] = useState<Room | null>(loaded?.room || null);
  const [stepIdx, setStepIdx] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string>(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  const [dimDraft, setDimDraft] = useState<Partial<Record<DimKey, string>>>({});
  const [focusedDim, setFocusedDim] = useState<DimKey | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const photoCameraInputRef = useRef<HTMLInputElement>(null);
  const photoGalleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!room) return;
    setDimDraft(prev => {
      const next = { ...prev };
      for (const dim of ['length', 'width', 'height'] as const) {
        if (focusedDim === dim) continue;
        next[dim] = String(room.dimensions[dim]);
      }
      return next;
    });
  }, [room, focusedDim]);

  const saveRoom = (next: Room) => {
    const result = updateRoomById(projectId, roomId, () => next);
    if (!result) return;
    setProject(result.project);
    setRoom(result.room);
    setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  const fields = useMemo(() => {
    if (!room) return [];
    return getRoomScopeSections(room.type).flatMap(s => s.fields);
  }, [room]);

  const byGroup = useMemo(() => {
    const demolition: ScopeField[] = [];
    const services: ScopeField[] = [];
    const fixtures: ScopeField[] = [];
    for (const f of fields) {
      const k = `${f.key} ${f.label}`.toLowerCase();
      if (FIELD_KEYWORDS.demolition.some(w => k.includes(w))) demolition.push(f);
      else if (FIELD_KEYWORDS.services.some(w => k.includes(w))) services.push(f);
      else fixtures.push(f);
    }
    return { demolition, services, fixtures };
  }, [fields]);

  const steps: Array<{ key: StepKey; title: string; subtitle: string }> = [
    { key: 'dimensions', title: 'Room dimensions', subtitle: 'Capture shell size first' },
    { key: 'photos', title: 'Site photos', subtitle: 'Camera or gallery — optional context' },
    { key: 'demolition', title: 'Demolition', subtitle: 'Quick demolition decisions' },
    { key: 'services', title: 'Services', subtitle: 'Plumbing, electrical, waterproofing' },
    { key: 'fixtures', title: 'Fixtures / finishes', subtitle: 'Fit-off and finish selections' },
    { key: 'review', title: 'Final review', subtitle: 'Confirm and return to project' },
  ];

  if (!project || !room) {
    return (
      <Layout title="Walkthrough Mode" showBack onBack={() => { window.location.hash = `#/project/${projectId}/room/${roomId}`; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6">
          <p className="text-sm text-slate-300">Room not found.</p>
        </div>
      </Layout>
    );
  }

  const values = { ...(room.scopeInputs || {}), ...(room.scope || {}) };

  const current = steps[stepIdx]!;
  const progressPct = Math.round(((stepIdx + 1) / steps.length) * 100);

  const patchScope = (patch: Record<string, string | number | boolean>) => {
    const nextScope = { ...(room.scopeInputs || {}), ...(room.scope || {}), ...patch };
    const calculations = computeRoomCalculations(room.dimensions);
    try {
      saveRoom(applyRoomPricing({ ...room, scopeInputs: nextScope, scope: nextScope, calculations }));
    } catch {
      saveRoom({
        ...room,
        scopeInputs: nextScope,
        scope: nextScope,
        calculations,
        estimate: computeIndicativeEstimate({ ...room, scopeInputs: nextScope, scope: nextScope, calculations }),
        pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' },
      });
    }
  };

  const handleWalkthroughPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    try {
      const encoded = await filesToBase64DataUrls(files);
      const result = updateRoomById(projectId, roomId, r => ({
        ...r,
        photoUrls: [...(r.photoUrls || []), ...encoded],
      }));
      if (result) {
        setProject(result.project);
        setRoom(result.room);
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        setPhotoMessage(null);
      }
    } catch (err) {
      setPhotoMessage(err instanceof Error ? err.message : 'Could not process photos.');
    }
  };

  const patchDimensions = (dim: 'length' | 'width' | 'height', value: number) => {
    const nextDims = { ...room.dimensions, [dim]: normalizeMetresValue(value) };
    const calculations = computeRoomCalculations(nextDims);
    try {
      saveRoom(applyRoomPricing({ ...room, dimensions: nextDims, calculations }));
    } catch {
      saveRoom({
        ...room,
        dimensions: nextDims,
        calculations,
        estimate: computeIndicativeEstimate({ ...room, dimensions: nextDims, calculations }),
        pricingV1: { lineItems: [], tradeBreakdown: [], source: 'placeholder' },
      });
    }
  };

  const renderField = (field: ScopeField) => {
    const key = field.key;
    const sv = values[key];
    if (field.type === 'toggle') return <ToggleField key={key} label={field.label} value={Boolean(sv)} onChange={v => patchScope({ [key]: v })} />;
    if (field.type === 'select') return <SelectField key={key} label={field.label} value={sv == null ? '' : String(sv)} options={field.options || []} onChange={v => patchScope({ [key]: v })} />;
    if (field.type === 'number' || field.type === 'quantity') return <NumberField key={key} label={field.label} value={typeof sv === 'number' ? sv : Number(sv) || 0} onChange={v => patchScope({ [key]: v })} unit={field.unit} placeholder={field.placeholder} />;
    if (field.type === 'text') return <TextField key={key} label={field.label} value={sv == null ? '' : String(sv)} onChange={v => patchScope({ [key]: v })} placeholder={field.placeholder} />;
    if (field.type === 'dimensions') return <DimensionsField key={key} baseKey={key} label={field.label} values={values} onChange={p => patchScope(p)} unit={field.unit || 'm'} />;
    return null;
  };

  const chosenSummary = fields
    .filter(f => {
      const v = values[f.key];
      if (typeof v === 'boolean') return v;
      if (typeof v === 'number') return v > 0;
      return typeof v === 'string' && v.trim().length > 0;
    })
    .map(f => f.label);

  const next = () => setStepIdx(i => Math.min(steps.length - 1, i + 1));
  const back = () => setStepIdx(i => Math.max(0, i - 1));
  const saveAndExit = () => { window.location.hash = `#/project/${projectId}`; };
  const exit = () => {
    const ok = window.confirm('Exit Walkthrough Mode? Changes are saved as you go.');
    if (ok) window.location.hash = `#/project/${projectId}/room/${roomId}`;
  };

  return (
    <Layout title={`${room.name} Walkthrough`} showBack onBack={exit}>
      <div className="space-y-4 pb-[calc(9rem+env(safe-area-inset-bottom,0px))]">
        <div className="sticky top-0 z-20 -mx-2 px-2 pt-1 pb-3 bg-[#0f150f]/95 backdrop-blur-sm border-b border-[#1f2e1f]">
          <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] uppercase tracking-widest font-black text-slate-500">{project.name}</p>
                <p className="text-sm font-black text-slate-100">{room.name} · {room.type}</p>
              </div>
              <button type="button" onClick={exit} className="min-h-[44px] px-4 rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[10px] font-black uppercase tracking-widest text-slate-300">Exit</button>
            </div>
            <div className="h-2 rounded-full bg-[#0f150f] border border-[#1f2e1f] overflow-hidden">
              <div className="h-full bg-[#3ddb6f]" style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Step {stepIdx + 1} of {steps.length} · {progressPct}%</p>
          </div>
        </div>

        <section className="rounded-[28px] border border-[#1f2e1f] bg-[#111810] p-4 space-y-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{current.subtitle}</p>
            <h3 className="text-lg font-black text-slate-100">{current.title}</h3>
          </div>

          {current.key === 'dimensions' && (
            <div className="space-y-3">
              {(['length', 'width', 'height'] as const).map(dim => (
                <div key={dim} className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] p-3 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{dim}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const nextRaw = room.dimensions[dim] - 0.1;
                        patchDimensions(dim, nextRaw);
                        setDimDraft(prev => ({ ...prev, [dim]: String(normalizeMetresValue(nextRaw)) }));
                      }}
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-[#1f2e1f] bg-[#111810] text-slate-200 text-lg font-black"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      max={50}
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoComplete="off"
                      value={dimDraft[dim] ?? String(room.dimensions[dim])}
                      onChange={e => {
                        const raw = e.target.value;
                        setDimDraft(prev => ({ ...prev, [dim]: raw }));
                        patchDimensions(dim, parseDimensionInput(raw));
                      }}
                      onFocus={e => {
                        setFocusedDim(dim);
                        selectAllOnNumberFocus(e);
                      }}
                      onBlur={() => setFocusedDim(null)}
                      className="flex-1 min-h-[44px] rounded-xl border border-[#1f2e1f] bg-[#111810] px-3 text-center font-black text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const nextRaw = room.dimensions[dim] + 0.1;
                        patchDimensions(dim, nextRaw);
                        setDimDraft(prev => ({ ...prev, [dim]: String(normalizeMetresValue(nextRaw)) }));
                      }}
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-[#3ddb6f] bg-[#3ddb6f] text-black text-lg font-black"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {current.key === 'photos' && (
            <div className="space-y-3">
              {photoMessage && (
                <p className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-200">
                  {photoMessage}
                </p>
              )}
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Use the camera for live shots on site; choose photos to pick from your library. Same 2MB limit per image as elsewhere.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => photoCameraInputRef.current?.click()}
                  className="min-h-[48px] flex-1 min-w-[140px] rounded-2xl border-2 border-dashed border-[#1f2e1f] bg-[#0f150f] px-4 py-3 flex flex-col items-center justify-center gap-1 text-slate-200 active:scale-[0.98] transition-transform"
                >
                  <Camera className="w-5 h-5" strokeWidth={2} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Take photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => photoGalleryInputRef.current?.click()}
                  className="min-h-[48px] flex-1 min-w-[140px] rounded-2xl border-2 border-dashed border-[#1f2e1f] bg-[#111810] px-4 py-3 flex flex-col items-center justify-center gap-1 text-slate-400 active:scale-[0.98] transition-transform"
                >
                  <Images className="w-5 h-5 opacity-90" strokeWidth={2} />
                  <span className="text-[9px] font-black uppercase tracking-widest">Choose photos</span>
                </button>
                <input
                  ref={photoCameraInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handleWalkthroughPhotos}
                />
                <input
                  ref={photoGalleryInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*"
                  multiple
                  onChange={handleWalkthroughPhotos}
                />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                {(room.photoUrls?.length || 0) === 0 && (
                  <p className="text-[10px] text-slate-500 py-2">No photos yet.</p>
                )}
                {room.photoUrls?.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt=""
                    className="h-28 w-28 flex-shrink-0 rounded-2xl border border-[#1f2e1f] object-cover"
                  />
                ))}
              </div>
            </div>
          )}

          {current.key === 'demolition' && <div className="space-y-2">{byGroup.demolition.map(renderField)}</div>}
          {current.key === 'services' && <div className="space-y-2">{byGroup.services.map(renderField)}</div>}
          {current.key === 'fixtures' && <div className="space-y-2">{byGroup.fixtures.map(renderField)}</div>}

          {current.key === 'review' && (
            <div className="space-y-3 text-sm text-slate-300">
              <p><span className="text-slate-500">Dimensions:</span> {room.dimensions.length}m × {room.dimensions.width}m × {room.dimensions.height}m</p>
              <p><span className="text-slate-500">Photos:</span> {room.photoUrls?.length || 0}</p>
              <p><span className="text-slate-500">Selected scope:</span> {chosenSummary.length} items</p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-400">
                {chosenSummary.slice(0, 12).map(item => <li key={item}>{item}</li>)}
              </ul>
              <p><span className="text-slate-500">Estimate range:</span> ${room.estimate?.low?.toLocaleString() || 0} – ${room.estimate?.high?.toLocaleString() || 0}</p>
            </div>
          )}
        </section>

        <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-3">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estimate (mid): <span className="text-slate-200">${Math.round(roomEstimateMid(room)).toLocaleString()}</span></p>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Completion: <span className="text-[#3ddb6f]">{getRoomCompletionPercent(room)}%</span></p>
          {isRoomMissingDimensions(room) && <p className="text-[9px] font-black text-amber-300">Missing dimensions warning: complete room dimensions.</p>}
          <p className="text-[8px] text-slate-500 mt-1">Saved as you go · Last saved {lastSavedAt}</p>
        </div>
      </div>

      <div className="fixed left-1/2 z-20 w-full max-w-[448px] -translate-x-1/2 px-4" style={{ bottom: 'max(4rem, env(safe-area-inset-bottom, 0px))' }}>
        <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810]/95 backdrop-blur p-3 grid grid-cols-3 gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          <button type="button" onClick={back} disabled={stepIdx === 0} className="min-h-[48px] rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[10px] font-black uppercase tracking-widest text-slate-300 disabled:opacity-40">Back</button>
          {current.key === 'review' ? (
            <button type="button" onClick={saveAndExit} className="col-span-2 min-h-[48px] rounded-xl bg-[#3ddb6f] text-[10px] font-black uppercase tracking-widest text-black">Save room & return</button>
          ) : (
            <>
              <button type="button" onClick={next} className="min-h-[48px] rounded-xl border border-[#1f2e1f] bg-[#0f150f] text-[10px] font-black uppercase tracking-widest text-slate-200">Next</button>
              <button type="button" onClick={saveAndExit} className="min-h-[48px] rounded-xl bg-[#3ddb6f] text-[10px] font-black uppercase tracking-widest text-black">Save & exit</button>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default RoomWalkthroughMode;

