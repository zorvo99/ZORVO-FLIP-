
import React, { useEffect, useRef, useState } from 'react';
import { ICONS } from '../constants';

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children, title, showBack, onBack, actions }) => {
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const minSwipeDistance = 70;
  const [pageUrl, setPageUrl] = useState('');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    const syncUrl = () => setPageUrl(window.location.href);
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    
    // Swipe Left -> Go to Analytics
    if (distance > minSwipeDistance && (window.location.hash === '#/' || window.location.hash === '')) {
      window.location.hash = '#/analytics';
    }
    // Swipe Right -> Go to Projects
    if (distance < -minSwipeDistance && window.location.hash === '#/analytics') {
      window.location.hash = '#/';
    }
  };

  const qrSrc =
    pageUrl &&
    `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(pageUrl)}`;

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
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{actions}</div>
      </header>

      <main style={{
        flex: 1,
        overflowY: 'auto',
        // Bottom nav (64px) + thumb clearance + safe area so CTAs are not covered on mobile
        paddingBottom: 'max(112px, calc(96px + env(safe-area-inset-bottom, 0px)))',
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
        className="md:!max-w-2xl"
        style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        maxWidth: '448px',
        margin: '0 auto',
        background: 'rgba(17, 24, 16, 0.95)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid #1f2e1f',
        height: '64px',
        padding: '0 48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        zIndex: 10,
      }}
      >
        <button 
          onClick={() => window.location.hash = '#/'} 
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            color: (window.location.hash === '#/' || window.location.hash === '' || window.location.hash.startsWith('#/project')) ? '#3ddb6f' : '#64748b',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <ICONS.Home />
          <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projects</span>
        </button>
        <button 
          onClick={() => window.location.hash = '#/analytics'} 
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            color: window.location.hash === '#/analytics' ? '#3ddb6f' : '#64748b',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <ICONS.Chart />
          <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Analytics</span>
        </button>
      </nav>
        </div>
      </div>
    </div>
  );
}

export default Layout;
