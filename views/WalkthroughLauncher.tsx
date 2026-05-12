import React from 'react';
import Layout from '../components/Layout';

/** Task 2.3 will replace this stub with the real walkthrough launcher. */
const WalkthroughLauncher: React.FC = () => (
  <Layout title="Walk">
    <p className="text-sm text-slate-500 leading-relaxed">
      Walkthrough launcher ships in Task 2.3. Open a project from Home to continue a walkthrough.
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

export default WalkthroughLauncher;
