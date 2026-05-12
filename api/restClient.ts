import { AppApiClient, WalkthroughDraft } from './client';
import { Project, Room, User } from '../types';

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const AUTH_TOKEN_KEY = 'zorvo_iq_api_token';

const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
};

const setAuthToken = (token: string): void => {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors for token persistence.
  }
};

const clearAuthToken = (): void => {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Ignore storage errors for token persistence.
  }
};

const jsonFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const token = getAuthToken();
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
};

export const createRestApiClient = (): AppApiClient => ({
  projects: {
    async list() {
      const data = await jsonFetch<{ projects: Project[] }>(`${baseUrl}/projects`);
      return data.projects;
    },
    async replaceAll(_projects: Project[]) {
      throw new Error('replaceAll is not supported in rest mode');
    },
    async getById(projectId: string) {
      try {
        const data = await jsonFetch<{ project: Project }>(`${baseUrl}/projects/${projectId}`);
        return data.project;
      } catch {
        return null;
      }
    },
    async updateById(projectId: string, updater: (project: Project) => Project) {
      const current = await this.getById(projectId);
      if (!current) return null;
      const payload = updater(current);
      const data = await jsonFetch<{ project: Project }>(`${baseUrl}/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return data.project;
    },
    async updateRoomById(projectId: string, roomId: string, updater: (room: Room) => Room) {
      const project = await this.getById(projectId);
      if (!project) return null;
      const room = project.rooms.find(item => item.id === roomId);
      if (!room) return null;
      const payload = updater(room);
      const data = await jsonFetch<{ room: Room }>(`${baseUrl}/projects/${projectId}/rooms/${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      return { project, room: data.room };
    },
    async unlock(projectId: string) {
      await jsonFetch<{ project: Project }>(`${baseUrl}/projects/${projectId}/unlock`, { method: 'PATCH' });
      return this.list();
    },
  },
  auth: {
    async getCurrentUser() {
      try {
        const data = await jsonFetch<{ user: User }>(`${baseUrl}/auth/me`);
        return data.user;
      } catch {
        return null;
      }
    },
    async saveUser(user: User) {
      // Demo-friendly auth flow: attempts login, falls back to register.
      // Password can be provided via env for non-demo environments.
      const password = import.meta.env.VITE_DEMO_AUTH_PASSWORD || 'demo-password-123';
      try {
        const login = await jsonFetch<{ token: string; user: User }>(`${baseUrl}/auth/login`, {
          method: 'POST',
          body: JSON.stringify({ email: user.email, password }),
        });
        setAuthToken(login.token);
      } catch {
        const register = await jsonFetch<{ token: string; user: User }>(`${baseUrl}/auth/register`, {
          method: 'POST',
          body: JSON.stringify({ email: user.email, password }),
        });
        setAuthToken(register.token);
      }
    },
    async logout() {
      clearAuthToken();
    },
  },
  drafts: {
    async getWalkthroughDraft(projectId: string) {
      const data = await jsonFetch<{ draft: WalkthroughDraft | null }>(`${baseUrl}/drafts/${projectId}`);
      return data.draft;
    },
    async saveWalkthroughDraft(projectId: string, draft: WalkthroughDraft) {
      await jsonFetch<{ draft: WalkthroughDraft }>(`${baseUrl}/drafts/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
    },
    async clearWalkthroughDraft(projectId: string) {
      await jsonFetch<void>(`${baseUrl}/drafts/${projectId}`, { method: 'DELETE' });
    },
  },
});
