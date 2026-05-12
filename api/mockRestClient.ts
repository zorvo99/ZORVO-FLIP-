import { AppApiClient, WalkthroughDraft } from './client';
import { Project, Room, User } from '../types';
import { createLocalStorageApiClient } from './localStorageClient';

const delay = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));

export const createMockRestApiClient = (): AppApiClient => {
  const base = createLocalStorageApiClient();
  const drafts = new Map<string, WalkthroughDraft>();
  let currentUser: User | null = null;

  return {
    projects: {
      async list() {
        await delay();
        return base.projects.list();
      },
      async replaceAll(projects: Project[]) {
        await delay();
        return base.projects.replaceAll(projects);
      },
      async getById(projectId: string) {
        await delay();
        return base.projects.getById(projectId);
      },
      async updateById(projectId: string, updater: (project: Project) => Project) {
        await delay();
        return base.projects.updateById(projectId, updater);
      },
      async updateRoomById(projectId: string, roomId: string, updater: (room: Room) => Room) {
        await delay();
        return base.projects.updateRoomById(projectId, roomId, updater);
      },
      async unlock(projectId: string) {
        await delay();
        return base.projects.unlock(projectId);
      },
    },
    auth: {
      async getCurrentUser() {
        await delay();
        if (currentUser) return currentUser;
        currentUser = await base.auth.getCurrentUser();
        return currentUser;
      },
      async saveUser(user: User) {
        await delay();
        currentUser = user;
        return base.auth.saveUser(user);
      },
      async logout() {
        await delay();
        currentUser = null;
        return base.auth.logout();
      },
    },
    drafts: {
      async getWalkthroughDraft(projectId: string) {
        await delay(120);
        return drafts.get(projectId) || null;
      },
      async saveWalkthroughDraft(projectId: string, draft: WalkthroughDraft) {
        await delay(120);
        drafts.set(projectId, draft);
      },
      async clearWalkthroughDraft(projectId: string) {
        await delay(120);
        drafts.delete(projectId);
      },
    },
  };
};
