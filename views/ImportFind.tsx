import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { createProject, PROJECT_LIMIT_ERROR, updateProjectById } from '../store/projectStore';

type ImportState = 'loading' | 'error' | 'limit_error';

type FindSourceContext = {
  source: 'find';
  originalAddress: string;
  suburb: string;
  yearsHeld: number;
  opportunityScore: number;
};

function parseHashQuery(): URLSearchParams {
  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  const query = queryIndex >= 0 ? hash.slice(queryIndex + 1) : '';
  return new URLSearchParams(query);
}

function parsePostcode(address: string): string {
  const m = address.match(/\b(\d{4})\b/);
  return m ? m[1] : '0000';
}

const ImportFind: React.FC = () => {
  const [state, setState] = useState<ImportState>('loading');

  useEffect(() => {
    const params = parseHashQuery();
    const address = (params.get('address') || '').trim();
    const suburb = (params.get('suburb') || '').trim();
    const yearsHeldRaw = params.get('yearsHeld');
    const scoreRaw = params.get('score');

    const yearsHeld = yearsHeldRaw == null ? NaN : Number(yearsHeldRaw);
    const opportunityScore = scoreRaw == null ? NaN : Number(scoreRaw);

    if (!address || !suburb || !Number.isFinite(yearsHeld) || !Number.isFinite(opportunityScore)) {
      setState('error');
      return;
    }

    const projectName = `${address.split(',')[0] || 'Imported Property'} Project`;
    const projectAddress = `${address}${address.toLowerCase().includes(suburb.toLowerCase()) ? '' : `, ${suburb}`}`;
    let project;
    try {
      project = createProject(projectName, projectAddress, parsePostcode(projectAddress), 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setState(msg === PROJECT_LIMIT_ERROR ? 'limit_error' : 'error');
      return;
    }

    const context: FindSourceContext = {
      source: 'find',
      originalAddress: address,
      suburb,
      yearsHeld,
      opportunityScore,
    };

    updateProjectById(project.id, p => ({
      ...p,
      description: p.description
        ? `${p.description}\n\nSource context: ${JSON.stringify(context)}`
        : `Source context: ${JSON.stringify(context)}`,
    }));

    window.location.hash = `#/project/${project.id}`;
  }, []);

  if (state === 'error' || state === 'limit_error') {
    return (
      <Layout title="Import from Find" showBack onBack={() => { window.location.hash = '#/'; }}>
        <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Import failed</p>
          <p className="text-sm text-slate-300">
            {state === 'limit_error'
              ? 'Unlock another project to create additional walkthroughs.'
              : 'Could not import property from Find.'}
          </p>
          <button
            type="button"
            onClick={() => { window.location.hash = '#/'; }}
            className="w-full rounded-2xl bg-[#3ddb6f] text-black py-3 text-[11px] font-black uppercase tracking-widest"
          >
            Back to projects
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Import from Find">
      <div className="rounded-3xl border border-[#1f2e1f] bg-[#111810] p-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Importing property...</p>
      </div>
    </Layout>
  );
};

export default ImportFind;
