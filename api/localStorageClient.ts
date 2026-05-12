import { AppApiClient, WalkthroughDraft } from './client';
import { Project, Room, User } from '../types';

const STORAGE_KEY = 'zorvo_iq_projects';
const USER_KEY = 'zorvo_iq_user';
const LEGACY_STORAGE_KEY = 'renovate_iq_projects';
const LEGACY_USER_KEY = 'renovate_iq_user';
const WALKTHROUGH_DRAFT_KEY_PREFIX = 'zorvo_iq_walkthrough_draft_';

const normalizeRoom = (room: Room): Room => ({
  ...room,
  photoUrls: room.photoUrls || [],
  intendedScope: room.intendedScope || [],
  notes: room.notes || '',
  scopeInputs: room.scopeInputs || {},
  expenses: room.expenses || [],
});

const normalizeProject = (project: Project): Project => ({
  ...project,
  rooms: (project.rooms || []).map(normalizeRoom),
});

const readProjects = (): Project[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return (Array.isArray(parsed) ? parsed : []).map(normalizeProject);
  } catch {
    return [];
  }
};

const writeProjects = (projects: Project[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};

export const createLocalStorageApiClient = (): AppApiClient => ({
  projects: {
    async list() {
      return readProjects();
    },
    async replaceAll(projects) {
      writeProjects(projects);
    },
    async getById(projectId) {
      return readProjects().find(project => project.id === projectId) || null;
    },
    async updateById(projectId, updater) {
      const projects = readProjects();
      let updatedProject: Project | null = null;
      const updatedProjects = projects.map(project => {
        if (project.id !== projectId) return project;
        updatedProject = updater(project);
        return updatedProject;
      });
      if (!updatedProject) return null;
      writeProjects(updatedProjects);
      return updatedProject;
    },
    async updateRoomById(projectId, roomId, updater) {
      let nextRoom: Room | null = null;
      const updatedProject = await this.updateById(projectId, project => {
        const updatedRooms = project.rooms.map(room => {
          if (room.id !== roomId) return room;
          nextRoom = updater(room);
          return nextRoom;
        });
        return { ...project, rooms: updatedRooms };
      });
      if (!updatedProject || !nextRoom) return null;
      return { project: updatedProject, room: nextRoom };
    },
    async unlock(projectId) {
      const projects = readProjects();
      const updated = projects.map(project =>
        project.id === projectId ? { ...project, isUnlocked: true } : project
      );
      writeProjects(updated);
      return updated;
    },
  },
  auth: {
    async getCurrentUser() {
      try {
        const raw = localStorage.getItem(USER_KEY) || localStorage.getItem(LEGACY_USER_KEY);
        return raw ? (JSON.parse(raw) as User) : null;
      } catch {
        return null;
      }
    },
    async saveUser(user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    async logout() {
      localStorage.removeItem(USER_KEY);
    },
  },
  drafts: {
    async getWalkthroughDraft(projectId) {
      try {
        const raw = localStorage.getItem(`${WALKTHROUGH_DRAFT_KEY_PREFIX}${projectId}`);
        return raw ? (JSON.parse(raw) as WalkthroughDraft) : null;
      } catch {
        return null;
      }
    },
    async saveWalkthroughDraft(projectId, draft) {
      localStorage.setItem(`${WALKTHROUGH_DRAFT_KEY_PREFIX}${projectId}`, JSON.stringify(draft));
    },
    async clearWalkthroughDraft(projectId) {
      localStorage.removeItem(`${WALKTHROUGH_DRAFT_KEY_PREFIX}${projectId}`);
    },
  },
});
