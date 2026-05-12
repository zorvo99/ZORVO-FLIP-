import { Project, Room, User } from '../types';

export interface WalkthroughDraft {
  walkthroughStep: 'select' | 'detail';
  selectedRoomCounts?: Record<string, number>;
  selectedRoomTypes?: string[];
  detailQueue: Room[];
  currentDetailIndex: number;
}

export interface ProjectsApi {
  list(): Promise<Project[]>;
  replaceAll(projects: Project[]): Promise<void>;
  getById(projectId: string): Promise<Project | null>;
  updateById(projectId: string, updater: (project: Project) => Project): Promise<Project | null>;
  updateRoomById(
    projectId: string,
    roomId: string,
    updater: (room: Room) => Room
  ): Promise<{ project: Project; room: Room } | null>;
  unlock(projectId: string): Promise<Project[]>;
}

export interface AuthApi {
  getCurrentUser(): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  logout(): Promise<void>;
}

export interface DraftsApi {
  getWalkthroughDraft(projectId: string): Promise<WalkthroughDraft | null>;
  saveWalkthroughDraft(projectId: string, draft: WalkthroughDraft): Promise<void>;
  clearWalkthroughDraft(projectId: string): Promise<void>;
}

export interface AppApiClient {
  projects: ProjectsApi;
  auth: AuthApi;
  drafts: DraftsApi;
}
