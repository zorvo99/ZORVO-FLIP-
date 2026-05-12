import { loadProjects, unlockProject } from '../store/projectStore';

const AUTH_TOKEN_KEY = 'zorvo_iq_api_token';

/**
 * After Stripe checkout, the server sets `Project.isUnlocked`. REST clients merge that into localStorage on load.
 */
export async function syncPaidUnlocksFromServer(): Promise<void> {
  const apiMode = (import.meta.env.VITE_API_MODE || 'local').toLowerCase();
  if (apiMode !== 'rest') return;

  let token: string | null = null;
  try {
    token = localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return;
  }
  if (!token) return;

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
  const projects = loadProjects();

  await Promise.all(
    projects.map(async p => {
      if (p.isUnlocked) return;
      try {
        const res = await fetch(
          `${baseUrl}/unlock-status?projectId=${encodeURIComponent(p.id)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { unlocked?: boolean };
        if (data.unlocked) unlockProject(p.id);
      } catch {
        // ignore per-project failures (offline, etc.)
      }
    })
  );
}
