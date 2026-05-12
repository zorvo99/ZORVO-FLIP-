import React, { useState } from 'react';
import type {
  ActualCostItem,
  QuoteItem,
  QuoteItemStatus,
  Room,
  ActualPaymentStatus,
  QuotePayment,
  QuotePaymentStatus,
  QuotePaymentType,
} from '../types';
import { Activity, BarChart3, FileText, Hammer, Receipt } from 'lucide-react';
import { generateId } from '../utils/id';
import {
  formatVariance,
  hasRoomQuotesInPlay,
  roomEstimateMid,
  roomActualPaidTotal,
  roomBudgetBaselineTotal,
  roomRemainingToPay,
  roomPaidFromQuotes,
  roomQuotedCompareTotal,
  sumPaymentsByType,
  sumQuotesAccepted,
} from '../utils/budgetAggregates';
import { numberInputQuickEntryProps } from './forms/quickNumericInput';
import { filesToBase64DataUrls } from '../utils/imageFiles';

const QUOTE_STATUS_OPTS: { value: QuoteItemStatus; label: string }[] = [
  { value: 'received', label: 'Received' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

const PAYMENT_TYPE_OPTS: { value: QuotePaymentType; label: string }[] = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'progress', label: 'Progress payment' },
  { value: 'final', label: 'Final payment' },
  { value: 'variation', label: 'Variation / extra' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_STATUS_OPTS: { value: QuotePaymentStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
];

const PAY_STATUS_OPTS: { value: ActualPaymentStatus; label: string }[] = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'part-paid', label: 'Part-paid' },
  { value: 'paid', label: 'Paid' },
];

const emptyQuote = (roomId: string): Omit<QuoteItem, 'id'> => ({
  roomId,
  category: 'Other',
  description: '',
  supplierOrTrade: '',
  quoteAmount: 0,
  status: 'received',
  quoteDate: new Date().toISOString().slice(0, 10),
  notes: '',
  payments: [],
});

const emptyActual = (roomId: string): Omit<ActualCostItem, 'id'> => ({
  roomId,
  category: 'Other',
  description: '',
  amountPaid: 0,
  paidDate: new Date().toISOString().slice(0, 10),
  paymentStatus: 'paid',
  notes: '',
});

interface Props {
  room: Room;
  onSave: (next: Room) => void;
}

const QuotesActualsTab: React.FC<Props> = ({ room, onSave }) => {
  const [quoteForm, setQuoteForm] = useState<{ id?: string } & Partial<QuoteItem> | null>(null);
  const [actualForm, setActualForm] = useState<{ id?: string } & Partial<ActualCostItem> | null>(null);
  const [paymentFormByQuoteId, setPaymentFormByQuoteId] = useState<Record<string, Partial<QuotePayment>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [quoteAmountError, setQuoteAmountError] = useState<string | null>(null);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [actualAmountError, setActualAmountError] = useState<string | null>(null);
  const [paymentAmountErrorByQuoteId, setPaymentAmountErrorByQuoteId] = useState<Record<string, string | null>>({});

  const estMid = roomEstimateMid(room);
  const hasQuotesInPlay = hasRoomQuotesInPlay(room);
  const activeBaseline = roomBudgetBaselineTotal(room);
  const quotedAccepted = sumQuotesAccepted(room.quoteItems);
  const quotedCompare = roomQuotedCompareTotal(room);
  const paidFromQuotes = roomPaidFromQuotes(room);
  const actualTotal = roomActualPaidTotal(room);
  const remainingTotal = roomRemainingToPay(room);
  const varEstVsQuote = quotedCompare - estMid;
  const varBaselineVsActual = actualTotal - activeBaseline;
  const varEstVsActual = actualTotal - estMid;
  const quoteCount = (room.quoteItems || []).length;
  const paidPaymentCount = (room.quoteItems || []).reduce(
    (sum, q) => sum + (q.payments || []).filter(p => p.status === 'paid').length,
    0
  );
  const actualItemCount = (room.actualCostItems || []).length;
  const today = Date.now();

  const actionableAlerts: string[] = [];
  (room.quoteItems || []).forEach(q => {
    if (q.status !== 'accepted' && q.quoteDate) {
      const ageDays = Math.floor((today - new Date(q.quoteDate).getTime()) / (1000 * 60 * 60 * 24));
      if (ageDays >= 30) actionableAlerts.push(`Quote may be stale (${q.supplierOrTrade || q.description || 'Quote'} · ${ageDays}d old)`);
    }
    if ((q.payments || []).some(p => p.status === 'paid' && (!p.receiptPhotoUrls || p.receiptPhotoUrls.length === 0))) {
      actionableAlerts.push(`No invoice/receipt photo (${q.supplierOrTrade || q.description || 'Payment'})`);
    }
  });
  if (quotedCompare > 0 && actualTotal > quotedCompare) {
    actionableAlerts.push(`Actual paid is $${Math.round(actualTotal - quotedCompare).toLocaleString()} over quoted`);
  }

  const startAddQuote = () => {
    setQuoteForm({ ...emptyQuote(room.id), id: undefined });
    setActualForm(null);
    setQuoteAmountError(null);
    setSupplierError(null);
    setActualAmountError(null);
  };
  const startAddActual = () => {
    setActualForm({ ...emptyActual(room.id), id: undefined });
    setQuoteForm(null);
    setQuoteAmountError(null);
    setSupplierError(null);
    setActualAmountError(null);
  };

  const saveQuote = () => {
    if (!quoteForm) return;
    setQuoteAmountError(null);
    if (!quoteForm.description?.trim()) {
      setMessage('Add a short quote description.');
      return;
    }
    if (!quoteForm.supplierOrTrade?.trim()) {
      setSupplierError('Builder name is required');
      return;
    }
    if (!Number.isFinite(Number(quoteForm.quoteAmount)) || Number(quoteForm.quoteAmount) <= 0) {
      setQuoteAmountError('Enter a valid amount');
      return;
    }
    const q: QuoteItem = {
      id: quoteForm.id || generateId(),
      roomId: room.id,
      category: (quoteForm.category || 'Other').trim() || 'Other',
      description: (quoteForm.description || '').trim(),
      supplierOrTrade: (quoteForm.supplierOrTrade || '').trim(),
      quoteAmount: Math.max(0, Number(quoteForm.quoteAmount) || 0),
      status: (quoteForm.status as QuoteItemStatus) || 'received',
      quoteDate: (quoteForm.quoteDate || '').trim(),
      notes: (quoteForm.notes || '').trim(),
      payments: Array.isArray(quoteForm.payments) ? quoteForm.payments : [],
    };
    const list = [...(room.quoteItems || [])];
    const idx = list.findIndex(x => x.id === q.id);
    if (idx >= 0) list[idx] = q;
    else list.push(q);
    onSave({ ...room, quoteItems: list });
    setQuoteForm(null);
    setMessage('Quote saved.');
  };

  const removeQuote = (id: string) => {
    onSave({ ...room, quoteItems: (room.quoteItems || []).filter(q => q.id !== id) });
    setPaymentFormByQuoteId(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const markQuoteAccepted = (quoteId: string) => {
    const next = (room.quoteItems || []).map(q => (q.id === quoteId ? { ...q, status: 'accepted' as QuoteItemStatus } : q));
    onSave({ ...room, quoteItems: next });
    setMessage('Quote marked as accepted.');
  };

  const startAddPayment = (quoteId: string) => {
    setPaymentAmountErrorByQuoteId(prev => ({ ...prev, [quoteId]: null }));
    setPaymentFormByQuoteId(prev => ({
      ...prev,
      [quoteId]: {
        amount: 0,
        paymentType: 'deposit',
        paidDate: new Date().toISOString().slice(0, 10),
        status: 'paid',
        notes: '',
      },
    }));
  };

  const savePayment = (quoteId: string) => {
    const form = paymentFormByQuoteId[quoteId];
    if (!form) return;
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentAmountErrorByQuoteId(prev => ({ ...prev, [quoteId]: 'Enter a valid payment amount' }));
      return;
    }
    const list = [...(room.quoteItems || [])];
    const idx = list.findIndex(q => q.id === quoteId);
    if (idx < 0) return;
    const target = list[idx]!;
    const nextPayment: QuotePayment = {
      id: generateId(),
      amount: Math.max(0, amount),
      paymentType: (form.paymentType as QuotePaymentType) || 'other',
      paidDate: (form.paidDate || '').trim(),
      status: (form.status as QuotePaymentStatus) || 'paid',
      notes: (form.notes || '').trim(),
    };
    const payments = [...(target.payments || []), nextPayment];
    list[idx] = { ...target, payments };
    onSave({ ...room, quoteItems: list });
    setPaymentFormByQuoteId(prev => {
      const next = { ...prev };
      delete next[quoteId];
      return next;
    });
    setMessage('Payment saved.');
  };

  const removePayment = (quoteId: string, paymentId: string) => {
    const list = [...(room.quoteItems || [])];
    const idx = list.findIndex(q => q.id === quoteId);
    if (idx < 0) return;
    const target = list[idx]!;
    list[idx] = { ...target, payments: (target.payments || []).filter(p => p.id !== paymentId) };
    onSave({ ...room, quoteItems: list });
  };

  const addQuotePhotos = async (quoteId: string, files: FileList | null) => {
    if (!files?.length) return;
    try {
      const encoded = await filesToBase64DataUrls(Array.from(files));
      const next = (room.quoteItems || []).map(q =>
        q.id === quoteId ? { ...q, quotePhotoUrls: [...(q.quotePhotoUrls || []), ...encoded] } : q
      );
      onSave({ ...room, quoteItems: next });
      setMessage('Quote photo added.');
    } catch {
      setMessage('Could not process quote photo.');
    }
  };

  const addPaymentReceiptPhotos = async (quoteId: string, paymentId: string, files: FileList | null) => {
    if (!files?.length) return;
    try {
      const encoded = await filesToBase64DataUrls(Array.from(files));
      const next = (room.quoteItems || []).map(q => {
        if (q.id !== quoteId) return q;
        const payments = (q.payments || []).map(p =>
          p.id === paymentId ? { ...p, receiptPhotoUrls: [...(p.receiptPhotoUrls || []), ...encoded] } : p
        );
        return { ...q, payments };
      });
      onSave({ ...room, quoteItems: next });
      setMessage('Receipt photo added.');
    } catch {
      setMessage('Could not process receipt photo.');
    }
  };

  const saveActual = () => {
    if (!actualForm) return;
    setActualAmountError(null);
    if (!actualForm.description?.trim()) {
      setMessage('Add a short paid item description.');
      return;
    }
    if (!Number.isFinite(Number(actualForm.amountPaid)) || Number(actualForm.amountPaid) <= 0) {
      setActualAmountError('Enter a valid amount');
      return;
    }
    const a: ActualCostItem = {
      id: actualForm.id || generateId(),
      roomId: room.id,
      category: (actualForm.category || 'Other').trim() || 'Other',
      description: (actualForm.description || '').trim(),
      amountPaid: Math.max(0, Number(actualForm.amountPaid) || 0),
      paidDate: (actualForm.paidDate || '').trim(),
      paymentStatus: (actualForm.paymentStatus as ActualPaymentStatus) || 'paid',
      notes: (actualForm.notes || '').trim(),
    };
    const list = [...(room.actualCostItems || [])];
    const idx = list.findIndex(x => x.id === a.id);
    if (idx >= 0) list[idx] = a;
    else list.push(a);
    onSave({ ...room, actualCostItems: list });
    setActualForm(null);
    setMessage('Actual paid item saved.');
  };

  const removeActual = (id: string) => {
    onSave({ ...room, actualCostItems: (room.actualCostItems || []).filter(x => x.id !== id) });
  };

  return (
    <div className="space-y-6 pb-56">
      <div className="rounded-[28px] border border-[#1f2e1f] bg-[#111810] p-4 space-y-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
          <BarChart3 size={16} className="opacity-80" />
          Real-world Quotes & Payments
        </h3>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Add real builder or trade quotes. This room auto-switches from AI estimate to quote-driven budgeting once a received/accepted quote exists.
        </p>
        <p className="text-[7px] text-slate-500/70 leading-relaxed">
          Indicative estimate only · Based on your room inputs · Live calculation
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[8px] font-black uppercase tracking-widest text-slate-500">
          <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-2 group transition-all duration-200 hover:-translate-y-0.5">
            <p className="flex items-center gap-1.5"><FileText size={16} className="opacity-70 transition-opacity duration-200 group-hover:opacity-100" />Estimate (mid)</p>
            <p className="text-sm font-black text-slate-100 tabular-nums mt-0.5">${Math.round(estMid).toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-2 group transition-all duration-200 hover:-translate-y-0.5">
            <p className="flex items-center gap-1.5"><Receipt size={16} className="opacity-70 transition-opacity duration-200 group-hover:opacity-100" />Active baseline</p>
            <p className="text-sm font-black text-slate-200 tabular-nums mt-0.5">${Math.round(activeBaseline).toLocaleString()}</p>
            <p className="text-[7px] font-bold text-slate-500 normal-case leading-tight mt-1">{hasQuotesInPlay ? 'Using quotes (accepted first, else received).' : 'Using AI estimate until quotes are added.'}</p>
          </div>
          <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-2 group transition-all duration-200 hover:-translate-y-0.5">
            <p className="flex items-center gap-1.5"><Hammer size={16} className="opacity-70 transition-opacity duration-200 group-hover:opacity-100" />Accepted quote</p>
            <p className="text-sm font-black text-slate-200 tabular-nums mt-0.5">${Math.round(quotedAccepted).toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-2 group transition-all duration-200 hover:-translate-y-0.5">
            <p className="flex items-center gap-1.5"><Activity size={16} className="opacity-70 transition-opacity duration-200 group-hover:opacity-100" />Actual paid</p>
            <p className="text-sm font-black text-[#3ddb6f] tabular-nums mt-0.5">${Math.round(actualTotal).toLocaleString()}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[8px] uppercase font-black tracking-widest">
          <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-2 text-slate-400">
            Paid so far
            <p className="text-sm text-[#3ddb6f] mt-1 tabular-nums">${Math.round(paidFromQuotes).toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-[#0f150f] border border-[#1f2e1f] p-2 text-slate-400">
            Remaining
            <p className={`text-sm mt-1 tabular-nums ${remainingTotal > 0 ? 'text-amber-200' : 'text-slate-200'}`}>
              ${Math.abs(Math.round(remainingTotal)).toLocaleString()}
            </p>
          </div>
        </div>
        <p className="text-[10px] font-black text-slate-200">
          Active baseline: ${Math.round(activeBaseline).toLocaleString()} ({hasQuotesInPlay ? 'quote-driven' : 'AI estimate-driven'})
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[9px] text-slate-400">
          <p>
            Variance (Estimate vs Quote):{' '}
            <span className="text-slate-200 font-bold">{quotedCompare > 0 ? formatVariance(varEstVsQuote) : 'Missing quote'}</span>
          </p>
          <p>
            Variance (Active baseline vs Actual):{' '}
            <span className="text-slate-200 font-bold">{actualTotal > 0 ? formatVariance(varBaselineVsActual) : 'Missing payments'}</span>
          </p>
          <p>
            Variance (Estimate vs Actual):{' '}
            <span className="text-slate-200 font-bold">{estMid > 0 ? formatVariance(varEstVsActual) : 'Missing estimate'}</span>
          </p>
        </div>
        {message && <p className="text-[9px] text-[#3ddb6f] font-bold">{message}</p>}
      </div>

      <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 space-y-3">
        <h4 className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1 flex items-center gap-2"><Receipt size={16} className="opacity-80" />Builder Quotes</h4>
        <p className="text-[10px] text-slate-500">Add real builder or trade quotes to compare against your estimate.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={startAddQuote}
          className="py-3 rounded-2xl bg-[#3ddb6f] text-black text-[10px] font-black uppercase tracking-widest transition-transform duration-150 hover:scale-[1.02]"
        >
          + Add Quote
        </button>
        <button
          type="button"
          onClick={startAddActual}
          className="py-3 rounded-2xl border border-[#1f2e1f] bg-[#0f150f] text-slate-200 text-[10px] font-black uppercase tracking-widest transition-transform duration-150 hover:scale-[1.02]"
        >
          + Add Payment
        </button>
        </div>
        <p className="text-[8px] text-slate-500">Based on {quoteCount} quote records · {paidPaymentCount + actualItemCount} paid records</p>
      </div>

      <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Actionable alerts</p>
        {actionableAlerts.length === 0 ? (
          <p className="text-[10px] text-slate-500">No actionable alerts from local records.</p>
        ) : (
          <ul className="space-y-1">
            {actionableAlerts.slice(0, 4).map((alert, idx) => (
              <li key={`${alert}-${idx}`} className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[9px] text-amber-100">
                {alert}
              </li>
            ))}
          </ul>
        )}
      </div>

      {quoteForm && (
        <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 space-y-3">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{quoteForm.id ? 'Edit quote' : 'New quote'}</p>
          <div className="grid grid-cols-1 gap-2">
            <input
              className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              placeholder="Category / trade"
              value={quoteForm.category || ''}
              onChange={e => setQuoteForm(f => f && { ...f, category: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              placeholder="Description"
              value={quoteForm.description || ''}
              onChange={e => setQuoteForm(f => f && { ...f, description: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              placeholder="Supplier / tradesperson"
              value={quoteForm.supplierOrTrade || ''}
              onChange={e => setQuoteForm(f => f && { ...f, supplierOrTrade: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
                placeholder="Quote amount"
                value={quoteForm.quoteAmount === undefined || quoteForm.quoteAmount === 0 ? '' : String(quoteForm.quoteAmount)}
                onChange={e => {
                  setQuoteAmountError(null);
                  setQuoteForm(f => f && { ...f, quoteAmount: parseFloat(e.target.value) || 0 });
                }}
                {...numberInputQuickEntryProps}
              />
              <input
                type="date"
                className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
                value={quoteForm.quoteDate || ''}
                onChange={e => setQuoteForm(f => f && { ...f, quoteDate: e.target.value })}
              />
            </div>
            <select
              className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              value={quoteForm.status || 'received'}
              onChange={e => setQuoteForm(f => f && { ...f, status: e.target.value as QuoteItemStatus })}
            >
              {QUOTE_STATUS_OPTS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <textarea
              className="w-full min-h-[60px] rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              placeholder="Notes"
              value={quoteForm.notes || ''}
              onChange={e => setQuoteForm(f => f && { ...f, notes: e.target.value })}
            />
            {quoteAmountError && (
              <p className="text-[10px] font-black text-red-300 uppercase tracking-widest">{quoteAmountError}</p>
            )}
            {supplierError && (
              <p className="text-[10px] font-black text-red-300 uppercase tracking-widest">{supplierError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setQuoteForm(null)} className="flex-1 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase text-slate-400">
              Cancel
            </button>
            <button type="button" onClick={saveQuote} className="flex-1 py-2 rounded-xl bg-[#3ddb6f] text-[9px] font-black uppercase text-black">
              Save quote
            </button>
          </div>
        </div>
      )}

      {actualForm && (
        <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 space-y-3">
          <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{actualForm.id ? 'Edit cost' : 'New actual cost'}</p>
          <div className="grid grid-cols-1 gap-2">
            <input
              className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              placeholder="Category / trade"
              value={actualForm.category || ''}
              onChange={e => setActualForm(f => f && { ...f, category: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              placeholder="Description"
              value={actualForm.description || ''}
              onChange={e => setActualForm(f => f && { ...f, description: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
                placeholder="Amount paid"
                value={actualForm.amountPaid === undefined || actualForm.amountPaid === 0 ? '' : String(actualForm.amountPaid)}
                onChange={e => {
                  setActualAmountError(null);
                  setActualForm(f => f && { ...f, amountPaid: parseFloat(e.target.value) || 0 });
                }}
                {...numberInputQuickEntryProps}
              />
              <input
                type="date"
                className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
                value={actualForm.paidDate || ''}
                onChange={e => setActualForm(f => f && { ...f, paidDate: e.target.value })}
              />
            </div>
            <select
              className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              value={actualForm.paymentStatus || 'paid'}
              onChange={e => setActualForm(f => f && { ...f, paymentStatus: e.target.value as ActualPaymentStatus })}
            >
              {PAY_STATUS_OPTS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <textarea
              className="w-full min-h-[60px] rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-3 text-xs text-slate-100"
              placeholder="Notes"
              value={actualForm.notes || ''}
              onChange={e => setActualForm(f => f && { ...f, notes: e.target.value })}
            />
            {actualAmountError && (
              <p className="text-[10px] font-black text-red-300 uppercase tracking-widest">{actualAmountError}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setActualForm(null)} className="flex-1 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase text-slate-400">
              Cancel
            </button>
            <button type="button" onClick={saveActual} className="flex-1 py-2 rounded-xl bg-[#3ddb6f] text-[9px] font-black uppercase text-black">
              Save cost
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20">
        <h4 className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-2 flex items-center gap-2"><Receipt size={16} className="opacity-80" />Quotes</h4>
        {(room.quoteItems || []).length === 0 ? (
          <p className="text-xs text-slate-500">No quotes added yet. Add your first builder or trade quote.</p>
        ) : (
          <ul className="space-y-2">
            {(room.quoteItems || []).map(q => (
              <li
                key={q.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-[#1f2e1f] bg-[#0f150f] p-3"
              >
                <div className="w-full space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-slate-100 leading-tight">{q.supplierOrTrade || 'Builder'}</p>
                      <p className="text-[8px] text-slate-500 font-bold mt-0.5">{q.description || q.category}</p>
                      <p className="text-[7px] font-black uppercase text-slate-500 mt-1">{q.quoteDate || 'No date'}</p>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-sm font-black text-amber-200/90 tabular-nums">${q.quoteAmount.toLocaleString()}</span>
                      <span
                        className={`text-[7px] px-2 py-0.5 rounded-full border uppercase font-black tracking-widest ${
                          q.status === 'accepted'
                            ? 'bg-[#3ddb6f]/20 border-[#3ddb6f]/40 text-[#3ddb6f]'
                            : q.status === 'rejected'
                              ? 'bg-red-500/20 border-red-500/40 text-red-300'
                              : 'bg-slate-500/20 border-slate-500/40 text-slate-300'
                        }`}
                      >
                        {q.status}
                      </span>
                      {q.status !== 'accepted' && (
                        <button
                          type="button"
                          onClick={() => markQuoteAccepted(q.id)}
                          className="text-[7px] px-2 py-1 rounded-full border border-[#3ddb6f]/40 bg-[#3ddb6f]/10 text-[#3ddb6f] font-black uppercase tracking-widest"
                        >
                          Mark accepted
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-300 px-2 py-1 rounded-lg border border-[#1f2e1f] bg-[#111810] cursor-pointer">
                      Upload quote photo
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        capture="environment"
                        onChange={e => {
                          addQuotePhotos(q.id, e.target.files);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    <span className="text-[8px] text-slate-500">{(q.quotePhotoUrls || []).length} photos</span>
                  </div>
                  {(() => {
                    const paid = (q.payments || []).filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
                    const remaining = q.quoteAmount - paid;
                    const progressPct = q.quoteAmount > 0 ? Math.min(100, (paid / q.quoteAmount) * 100) : 0;
                    const statusLabel = paid <= 0 ? 'Not started' : remaining > 0 ? 'Part-paid' : 'Paid';
                    const overpaid = paid > q.quoteAmount && q.quoteAmount > 0;
                    return (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-[8px] uppercase font-black tracking-widest">
                          <div className="rounded-lg border border-[#1f2e1f] bg-[#111810] p-2 text-slate-400">Quote<p className="text-slate-200 text-[10px] mt-1">${Math.round(q.quoteAmount).toLocaleString()}</p></div>
                          <div className="rounded-lg border border-[#1f2e1f] bg-[#111810] p-2 text-slate-400">Paid so far<p className="text-[#3ddb6f] text-[10px] mt-1">${Math.round(paid).toLocaleString()}</p></div>
                          <div className="rounded-lg border border-[#1f2e1f] bg-[#111810] p-2 text-slate-400">Remaining<p className={`text-[10px] mt-1 ${remaining > 0 ? 'text-amber-200' : 'text-slate-200'}`}>${Math.abs(Math.round(remaining)).toLocaleString()}</p></div>
                        </div>
                        <div className="h-2 rounded-full bg-[#111810] border border-[#1f2e1f] overflow-hidden">
                          <div className="h-full bg-[#3ddb6f]" style={{ width: `${progressPct}%` }} />
                        </div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Payment status: <span className="text-slate-200">{statusLabel}</span></p>
                        {overpaid && (
                          <p className="text-[8px] font-black text-amber-300">Payments exceed quote amount. Check for variation or extra cost.</p>
                        )}
                      </div>
                    );
                  })()}
                  {(q.payments || []).length > 0 && (
                    <ul className="space-y-1">
                      {(q.payments || []).map(p => (
                        <li key={p.id} className="flex items-center justify-between text-[8px] bg-[#111810] border border-[#1f2e1f] rounded-lg p-2">
                          <span className="text-slate-300 font-bold uppercase tracking-widest">{p.paymentType} · {p.status} · {p.paidDate || 'No date'} · {(p.receiptPhotoUrls || []).length} receipt</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[#3ddb6f] font-black tabular-nums">${Math.round(p.amount).toLocaleString()}</span>
                            <label className="text-[7px] font-black uppercase text-slate-300 cursor-pointer">
                              Photo
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                capture="environment"
                                onChange={e => {
                                  addPaymentReceiptPhotos(q.id, p.id, e.target.files);
                                  e.currentTarget.value = '';
                                }}
                              />
                            </label>
                            <button type="button" onClick={() => removePayment(q.id, p.id)} className="text-red-300 font-black uppercase">Del</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {paymentFormByQuoteId[q.id] ? (
                    <div className="rounded-xl border border-[#1f2e1f] bg-[#111810] p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          placeholder="Amount"
                          className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-2 text-xs text-slate-100"
                          value={paymentFormByQuoteId[q.id]?.amount ? String(paymentFormByQuoteId[q.id]?.amount) : ''}
                          onChange={e => {
                            setPaymentAmountErrorByQuoteId(prev => ({ ...prev, [q.id]: null }));
                            setPaymentFormByQuoteId(prev => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), amount: parseFloat(e.target.value) || 0 } }));
                          }}
                          {...numberInputQuickEntryProps}
                        />
                        <input
                          type="date"
                          className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-2 text-xs text-slate-100"
                          value={paymentFormByQuoteId[q.id]?.paidDate || ''}
                          onChange={e => setPaymentFormByQuoteId(prev => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), paidDate: e.target.value } }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-2 text-xs text-slate-100"
                          value={paymentFormByQuoteId[q.id]?.paymentType || 'deposit'}
                          onChange={e => setPaymentFormByQuoteId(prev => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), paymentType: e.target.value as QuotePaymentType } }))}
                        >
                          {PAYMENT_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        <select
                          className="w-full rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-2 text-xs text-slate-100"
                          value={paymentFormByQuoteId[q.id]?.status || 'paid'}
                          onChange={e => setPaymentFormByQuoteId(prev => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), status: e.target.value as QuotePaymentStatus } }))}
                        >
                          {PAYMENT_STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <textarea
                        placeholder="Notes"
                        className="w-full min-h-[56px] rounded-xl border border-[#1f2e1f] bg-[#0f150f] p-2 text-xs text-slate-100"
                        value={paymentFormByQuoteId[q.id]?.notes || ''}
                        onChange={e => setPaymentFormByQuoteId(prev => ({ ...prev, [q.id]: { ...(prev[q.id] || {}), notes: e.target.value } }))}
                      />
                      {paymentAmountErrorByQuoteId[q.id] && (
                        <p className="text-[9px] font-black text-red-300 uppercase tracking-widest">{paymentAmountErrorByQuoteId[q.id]}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="flex-1 py-2 rounded-xl border border-[#1f2e1f] text-[9px] font-black uppercase text-slate-300"
                          onClick={() => setPaymentFormByQuoteId(prev => {
                            const next = { ...prev };
                            delete next[q.id];
                            return next;
                          })}
                        >
                          Cancel
                        </button>
                        <button type="button" onClick={() => savePayment(q.id)} className="flex-1 py-2 rounded-xl bg-[#3ddb6f] text-[9px] font-black uppercase text-black">
                          Save payment
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => startAddPayment(q.id)} className="w-full py-2 rounded-xl border border-[#1f2e1f] bg-[#111810] text-[9px] font-black uppercase tracking-widest text-[#3ddb6f]">
                      + Add Payment
                    </button>
                  )}
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setQuoteForm({ ...q });
                        setActualForm(null);
                      }}
                      className="text-[7px] font-black uppercase text-[#3ddb6f] px-1"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => removeQuote(q.id)} className="text-[7px] font-black uppercase text-red-300 px-1">
                      Del
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20">
        <h4 className="text-[9px] font-black text-[#3ddb6f] uppercase tracking-widest mb-2 flex items-center gap-2"><Activity size={16} className="opacity-80" />Actual paid</h4>
        <p className="text-[10px] text-slate-500 mb-2">Legacy actual paid entries are still supported and included in totals.</p>
        {(room.actualCostItems || []).length === 0 ? (
          <p className="text-xs text-slate-500">No payments recorded yet. Track what you've actually spent.</p>
        ) : (
          <ul className="space-y-2">
            {(room.actualCostItems || []).map(a => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-2 rounded-2xl border border-[#1f2e1f] bg-[#0f150f] p-3"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-100 leading-tight">{a.description || a.category}</p>
                  <p className="text-[8px] text-slate-500 font-bold mt-0.5">{a.category}</p>
                  <p className="text-[7px] font-black uppercase text-slate-500 mt-1">
                    {a.paymentStatus} {a.paidDate && `· ${a.paidDate}`}
                  </p>
                </div>
                <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-sm font-black text-[#3ddb6f] tabular-nums">${a.amountPaid.toLocaleString()}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setActualForm({ ...a });
                        setQuoteForm(null);
                      }}
                      className="text-[7px] font-black uppercase text-[#3ddb6f] px-1"
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => removeActual(a.id)} className="text-[7px] font-black uppercase text-red-300 px-1">
                      Del
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-2xl border border-[#1f2e1f] bg-[#111810] p-3">
        <p className="text-[8px] uppercase tracking-widest text-slate-500 font-black">
          Paid by type: Deposit ${Math.round(sumPaymentsByType(room.quoteItems, 'deposit')).toLocaleString()} · Progress ${Math.round(sumPaymentsByType(room.quoteItems, 'progress')).toLocaleString()} · Final ${Math.round(sumPaymentsByType(room.quoteItems, 'final')).toLocaleString()} · Variation ${Math.round(sumPaymentsByType(room.quoteItems, 'variation')).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default QuotesActualsTab;
