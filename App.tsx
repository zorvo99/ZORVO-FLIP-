
import React, { useEffect, useState } from 'react';
import Dashboard from './views/Dashboard';
import ProjectDetails from './views/ProjectDetails';
import RoomDetails from './views/RoomDetails';
import RoomWalkthroughMode from './views/RoomWalkthroughMode';
import AIInsights from './views/AIInsights';
import Analytics from './views/Analytics';
import Login from './views/Login';
import NotFound from './views/NotFound';
import ProjectEstimateSummary from './views/ProjectEstimateSummary';
import ImportFind from './views/ImportFind';
import WalkthroughLauncher from './views/WalkthroughLauncher';
import More from './views/More';
import Layout from './components/Layout';
import { syncPaidUnlocksFromServer } from './api/unlockSync';
import { loadUser } from './store/projectStore';

const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(window.location.hash || '#/login');

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = '#/login';
    }

    if (!loadUser() && window.location.hash !== '#/login') {
      window.location.hash = '#/login';
    }

    const handleHashChange = () => {
      setCurrentPath(window.location.hash || '#/');
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const baseRoute = currentPath.split('?')[0];
    if (baseRoute === '#/login' || !loadUser()) return;
    void syncPaidUnlocksFromServer().then(() => {
      window.dispatchEvent(new CustomEvent('zorvo-projects-unlock-sync'));
    });
  }, [currentPath]);

  const renderView = () => {
    const baseRoute = currentPath.split('?')[0];

    if (baseRoute === '#/import-find') return <ImportFind />;
    if (baseRoute === '#/login') return <Login />;

    if (!loadUser()) return <Login />;

    if (baseRoute === '#/' || baseRoute === '' || baseRoute === '#') return <Dashboard />;
    if (baseRoute === '#/walkthrough') return <WalkthroughLauncher />;
    if (baseRoute === '#/discover') {
      return (
        <Layout title="Discover">
          <p className="text-sm text-slate-500 leading-relaxed">
            Discover hub is not built yet. Use AI Discovery from each room when that work is scheduled.
          </p>
          <button
            type="button"
            onClick={() => { window.location.hash = '#/'; }}
            className="mt-6 w-full min-h-[48px] rounded-2xl border border-[#1f2e1f] bg-[#111810] text-[10px] font-black uppercase tracking-widest text-slate-200 active:scale-95 transition-all"
          >
            Home
          </button>
        </Layout>
      );
    }
    if (baseRoute === '#/more') return <More />;
    if (baseRoute === '#/insights') return <AIInsights />;
    if (baseRoute === '#/budget' || baseRoute === '#/analytics') return <Analytics />;

    const estimateMatch = baseRoute.match(/^#\/project\/([^/]+)\/estimate\/?$/);
    if (estimateMatch) return <ProjectEstimateSummary projectId={decodeURIComponent(estimateMatch[1])} />;

    const projectMatch = baseRoute.match(/^#\/project\/([^/]+)\/?$/);
    if (projectMatch) return <ProjectDetails id={decodeURIComponent(projectMatch[1])} />;

    const roomMatch = baseRoute.match(/^#\/project\/([^/]+)\/room\/([^/]+)\/?$/);
    if (roomMatch) return <RoomDetails projectId={decodeURIComponent(roomMatch[1])} roomId={decodeURIComponent(roomMatch[2])} />;

    const roomWalkthroughMatch = baseRoute.match(/^#\/project\/([^/]+)\/walkthrough\/([^/]+)\/?$/);
    if (roomWalkthroughMatch) return <RoomWalkthroughMode projectId={decodeURIComponent(roomWalkthroughMatch[1])} roomId={decodeURIComponent(roomWalkthroughMatch[2])} />;

    return <NotFound />;
  };

  return <div className="min-h-screen bg-[#0a0d0a] antialiased selection:bg-emerald-300/30">{renderView()}</div>;
};

export default App;
