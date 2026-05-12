import React, { useEffect, useRef, useState } from 'react';
import { authApi, getPhotoStorageStats, getStorageStatus, loadProjects, logout, saveProjects } from '../store/projectStore';
import { exportProjectsJson, getStorageUsageKB, importProjectsJson } from '../utils/safePersistence';

const LOCAL_STORAGE_PREFIXES = ['zorvo_iq_', 'renovate_iq_', 'zorvoiq_'] as const;

export function clearLocalAppData(): void {
  Object.keys(localStorage).forEach(key => {
    if (LOCAL_STORAGE_PREFIXES.some(p => key.startsWith(p))) {
      localStorage.removeItem(key);
    }
  });
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Session email saved at login */
  email: string;
}

const SettingsSheet: React.FC<Props> = ({ isOpen, onClose, email }) => {
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [storageKb, setStorageKb] = useState(0);
  const [photoStats, setPhotoStats] = useState({ totalPhotos: 0, estimatedKB: 0 });
  const [backupStatus, setBackupStatus] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowClearConfirm(false);
      setBackupStatus(null);
    } else {
      setStorageKb(getStorageUsageKB());
      const plist = loadProjects({ forceRefresh: true });
      setPhotoStats(getPhotoStorageStats(plist));
    }
  }, [isOpen]);

  const photoMbLabel =
    photoStats.estimatedKB >= 1024
      ? `${(photoStats.estimatedKB / 1024).toFixed(1)} MB`
      : `${photoStats.estimatedKB} KB`;

  const handleSignOut = async () => {
    try {
      await authApi.logout();
    } finally {
      logout();
      onClose();
      window.location.hash = '#/login';
    }
  };

  const handleClearDataConfirmed = () => {
    clearLocalAppData();
    setShowClearConfirm(false);
    onClose();
    window.location.hash = '#/login';
    window.location.reload();
  };

  const handleExportBackup = () => {
    setBackupStatus(null);
    const projects = loadProjects({ forceRefresh: true });
    const json = exportProjectsJson(projects);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const day = new Date().toISOString().slice(0, 10);
    a.download = `zorvoiq-backup-${day}.json`;
    a.rel = 'noopener';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackupPick = () => {
    setBackupStatus(null);
    importInputRef.current?.click();
  };

  const handleImportFileChange: React.ChangeEventHandler<HTMLInputElement> = e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const imported = importProjectsJson(text);
      if (imported == null) {
        setBackupStatus({ tone: 'err', text: 'Invalid backup file' });
        return;
      }
      const existing = loadProjects({ forceRefresh: true });
      const existingIds = new Set(existing.map(p => p.id));
      const toAppend = imported.filter(p => !existingIds.has(p.id));
      saveProjects([...existing, ...toAppend]);
      const { ok, message } = getStorageStatus();
      if (!ok) {
        setBackupStatus({
          tone: 'err',
          text: message?.trim() ? message.trim() : 'Could not save imported data',
        });
        return;
      }
      setBackupStatus({
        tone: 'ok',
        text: `${toAppend.length} project${toAppend.length === 1 ? '' : 's'} imported`,
      });
      setStorageKb(getStorageUsageKB());
      setPhotoStats(getPhotoStorageStats(loadProjects({ forceRefresh: true })));
    };
    reader.onerror = () => {
      setBackupStatus({ tone: 'err', text: 'Invalid backup file' });
    };
    reader.readAsText(file, 'utf-8');
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm px-4"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-labelledby="settings-sheet-title"
          className="bg-[#111810] border border-[#1f2e1f] w-full max-w-md rounded-t-[50px] p-10 shadow-2xl animate-in slide-in-from-bottom duration-500"
          onClick={e => e.stopPropagation()}
        >
          <div className="w-14 h-1.5 bg-[#1f2e1f] rounded-full mx-auto mb-10" />
          <h2 id="settings-sheet-title" className="text-2xl font-black mb-6 text-slate-100 tracking-tighter">
            Settings
          </h2>
          <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-4 py-3 mb-6">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">Signed in</p>
            <p className="text-sm font-bold text-slate-200 break-all">{email}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-3 mb-0.5">Local app data (zorvo_iq_*)</p>
            <p className="text-[11px] font-bold text-slate-400 tabular-nums">~{storageKb} KB (estimate)</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-3 mb-0.5">Room photos (base64)</p>
            <p className="text-[11px] font-bold text-slate-400 tabular-nums">
              {photoStats.totalPhotos} photo{photoStats.totalPhotos === 1 ? '' : 's'} · ~{photoMbLabel} used
            </p>
          </div>
          <div className="rounded-2xl border border-[#1f2e1f] bg-[#0f150f] px-4 py-3 mb-6">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Local backup</p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleExportBackup}
                className="w-full py-5 rounded-2xl border border-[#1f2e1f] bg-[#111810] text-[11px] font-black uppercase tracking-widest text-slate-200 active:scale-[0.99] transition-transform"
              >
                Export backup
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-hidden
                onChange={handleImportFileChange}
              />
              <button
                type="button"
                onClick={handleImportBackupPick}
                className="w-full py-5 rounded-2xl border border-[#1f2e1f] bg-[#111810] text-[11px] font-black uppercase tracking-widest text-slate-200 active:scale-[0.99] transition-transform"
              >
                Import backup
              </button>
            </div>
            {backupStatus && (
              <p
                className={
                  backupStatus.tone === 'ok'
                    ? 'mt-3 text-[11px] font-bold text-emerald-400/90'
                    : 'mt-3 text-[11px] font-bold text-red-400/90'
                }
                role="status"
              >
                {backupStatus.text}
              </p>
            )}
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full py-5 rounded-2xl border border-[#1f2e1f] bg-[#111810] text-[11px] font-black uppercase tracking-widest text-slate-200 active:scale-[0.99] transition-transform"
            >
              Sign out
            </button>
            <button
              type="button"
              onClick={() => setShowClearConfirm(true)}
              className="w-full py-5 rounded-2xl border border-red-500/40 bg-red-950/30 text-[11px] font-black uppercase tracking-widest text-red-300 active:scale-[0.99] transition-transform hover:bg-red-950/45"
            >
              Clear local data
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full mt-6 py-4 text-slate-500 font-bold text-[11px] uppercase tracking-widest"
          >
            Close
          </button>
        </div>
      </div>

      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-[#111810] w-full max-w-md rounded-t-[40px] p-8 shadow-2xl border border-[#1f2e1f]" role="alertdialog">
            <div className="w-12 h-1.5 bg-[#1f2e1f] rounded-full mx-auto mb-8" />
            <h3 className="text-xl font-black text-slate-100 tracking-tighter text-center mb-3">Clear local app data?</h3>
            <p className="text-[12px] text-slate-400 text-center mb-6">
              Removes all saved projects and app data from this browser. You will be signed out. This cannot be undone.
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleClearDataConfirmed}
                className="w-full p-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-sm hover:bg-red-500 active:scale-[0.99] transition-all"
              >
                Clear data now
              </button>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="w-full py-3 text-slate-500 font-bold text-[11px] uppercase tracking-widest"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SettingsSheet;
