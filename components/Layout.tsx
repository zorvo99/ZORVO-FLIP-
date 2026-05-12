
import React, { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BarChart2, ClipboardList, Home, MoreHorizontal, Sparkles, Zap } from 'lucide-react';
import { ICONS } from '../constants';
import { getUserCredits } from '../store/projectStore';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
}

const NAV_BADGE_KEY = 'zorvo_iq_nav_notification_count';

const TABS: { id: string; label: string; icon: LucideIcon; hash: string }[] = [
  { id: 'home', label: 'Home', icon: Home, hash: '#/' },
  { id: 'walkthrough', label: 'Walk', icon: ClipboardList, hash: '#/walkthrough' },
  { id: 'discover', label: 'Discover', icon: Sparkles, hash: '#/discover' },
  { id: 'budget', label: 'Budget', icon: BarChart2, hash: '#/budget' },
  { id: 'more', label: 'More', icon: MoreHorizontal, hash: '#/more' },
];

function baseHash(raw: string): string {
  const h = (raw || '#/').split('?')[0];
  if (h === '' || h === '#') return '#/';
  return h;
}

function activeTabIdForHash(hashRaw: string): string {
  const h = baseHash(hashRaw);
  if (h === '#/more' || h === '#/import-find') return 'more';
  if (h === '#/walkthrough') return 'walkthrough';
  if (h === '#/discover' || h === '#/insights') return 'discover';
  if (h === '#/budget' || h === '#/analytics') return 'budget';
  if (h.startsWith('#/project')) return 'walkthrough';
  return 'home';
}

function readNotificationCount(): number {
  try {
    const raw = localStorage.getItem(NAV_BADGE_KEY);
    if (raw == null || raw === '') return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

const Layout: React.FC<LayoutProps> = ({ children, title, showBack, onBack, actions }) => {
  const [pageUrl, setPageUrl] = useState('');
  const [routeHash, setRouteHash] = useState(() => window.location.hash || '#/');
  const [notifCount, setNotifCount] = useState(readNotificationCount);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const syncUrl = () => {
      setPageUrl(window.location.href);
      setRouteHash(window.location.hash || '#/');
      setNotifCount(readNotificationCount());
    };
    syncUrl();
    window.addEventListener('hashchange', syncUrl);
    return () => window.removeEventListener('hashchange', syncUrl);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const qrSrc =
    pageUrl &&
    `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(pageUrl)}`;

  const activeTab = activeTabIdForHash(routeHash);
  const credits = getUserCredits();

  return (
    <div className="min-h-screen md:bg-[#e8ebe6] md:min-h-screen">
      <div className="md:flex md:min-h-screen md:items-stretch md:justify-center md:gap-10 md:px-8 md:py-10 lg:gap-14 lg:px-12">
        <aside
          className="hidden md:flex md:max-w-[17rem] md:shrink-0 md:flex-col md:justify-start md:gap-4 md:rounded-2xl md:border md:border-stone-300/80 md:bg-white/90 md:p-6 md:shadow-sm lg:max-w-xs"
          aria-label="Mobile experience tip"
        >
          <p className="m-0 text-xs font-extrabold uppercase tracking-widest text-stone-500">
            Best experienced on mobile
          </p>
          <p className="m-0 text-sm leading-relaxed text-stone-600">
            Scan to open this app on your phone — layout and navigation are tuned for small screens.
          </p>
          {qrSrc && (
            <a
              href={pageUrl}
              className="block overflow-hidden rounded-xl border border-stone-200 bg-white p-2 shadow-inner"
              title="Open current URL"
            >
              <img
                src={qrSrc}
                alt="QR code for this page URL"
                width={140}
                height={140}
                className="h-[140px] w-[140px] object-contain"
              />
            </a>
          )}
          {pageUrl && (
            <a
              href={pageUrl}
              className="break-all text-xs font-medium text-emerald-700 underline decoration-emerald-700/40 underline-offset-2 hover:text-emerald-800"
            >
              {pageUrl}
            </a>
          )}
        </aside>

        <div
          className="md:!max-w-2xl md:shadow-2xl"
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            maxWidth: '448px',
            margin: '0 auto',
            background: '#111810',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            position: 'relative',
            overflow: 'hidden',
            borderLeft: '1px solid #1f2e1f',
            borderRight: '1px solid #1f2e1f',
          }}
        >
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(17, 24, 16, 0.95)',
        borderBottom: '1px solid #1f2e1f',
        padding: '0 16px',
        height: '64px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {showBack && (
            <button onClick={onBack} style={{
              padding: '8px',
              marginLeft: '-8px',
              color: '#cbd5e1',
              background: 'transparent',
              border: 'none',
              borderRadius: '999px',
              cursor: 'pointer',
            }}>
              <ICONS.ArrowLeft />
            </button>
          )}
          <h1 style={{
            fontWeight: 700,
            fontSize: '20px',
            color: '#f1f5f9',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
            margin: 0,
          }}>
            {title}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {credits > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#0f2a1a] border border-[#1f4a2a] text-[9px] font-black text-[#3ddb6f] uppercase tracking-widest shrink-0">
              <Zap size={10} className="shrink-0" aria-hidden />
              {credits}
            </span>
          )}
          {actions}
        </div>
      </header>

      <main style={{
        flex: 1,
        overflowY: 'auto',
        paddingBottom: 'max(120px, calc(80px + env(safe-area-inset-bottom, 0px)))',
        paddingLeft: '16px',
        paddingRight: '16px',
        paddingTop: '16px',
        background: '#0f150f',
      }}>
        {!isOnline && (
          <div style={{ marginBottom: '12px', border: '1px solid rgba(251,191,36,0.35)', background: 'rgba(120,53,15,0.25)', borderRadius: '12px', padding: '10px 12px' }}>
            <p style={{ margin: 0, fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fde68a' }}>
              You are offline. Saving locally.
            </p>
          </div>
        )}
        {children}
      </main>

      <nav
        className="md:!max-w-2xl border-t border-[#1f2e1f] bg-[#0a0d0a] flex flex-col items-stretch shrink-0"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          maxWidth: '448px',
          margin: '0 auto',
          zIndex: 10,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex h-16 min-h-[64px] items-stretch justify-between gap-0.5 px-1">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { window.location.hash = tab.hash; }}
                className={`flex flex-1 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-transparent bg-transparent py-2 transition-all active:scale-95 ${
                  isActive ? 'text-[#3ddb6f]' : 'text-slate-500'
                }`}
              >
                <span className="relative inline-flex">
                  <Icon size={22} strokeWidth={isActive ? 2.4 : 2} className={isActive ? 'text-[#3ddb6f]' : 'text-slate-500'} aria-hidden />
                  {notifCount > 0 && tab.id === 'more' && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#3ddb6f] ring-2 ring-[#0a0d0a]" aria-label="Notifications" />
                  )}
                </span>
                <span className="text-[8px] font-black uppercase tracking-widest truncate max-w-full px-0.5">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
        </div>
      </div>
    </div>
  );
};

export default Layout;
