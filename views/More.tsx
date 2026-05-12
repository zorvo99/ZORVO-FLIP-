import React from 'react';
import Layout from '../components/Layout';

/** Task 1.3 will replace this stub with the real More screen. */
const More: React.FC = () => (
  <Layout title="More">
    <p className="text-sm text-slate-500 leading-relaxed">
      More hub ships in Task 1.3. Use Home for projects and settings from the header where available.
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

export default More;
