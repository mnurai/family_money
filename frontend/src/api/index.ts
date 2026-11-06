// The one place the screens get their data from.
// Today it is the in-browser demo (demoApi.ts). When the FastAPI endpoints exist, add an
// HTTP client with the same methods and switch here; the screens do not change.
import { demoApi } from './demoApi';

export const api = demoApi;
export * from './types';
