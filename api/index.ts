import { AppApiClient } from './client';
import { createLocalStorageApiClient } from './localStorageClient';
import { createMockRestApiClient } from './mockRestClient';
import { createRestApiClient } from './restClient';

const apiMode = (import.meta.env.VITE_API_MODE || 'local').toLowerCase();

export const apiClient: AppApiClient =
  apiMode === 'mock'
    ? createMockRestApiClient()
    : apiMode === 'rest'
      ? createRestApiClient()
      : createLocalStorageApiClient();
