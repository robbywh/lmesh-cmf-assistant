/** Base URL for backend API calls, e.g. `/api/v1`. Resolved at build time. */
export const apiBaseUrl: string = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

/** When true, `main.tsx` starts the MSW browser worker instead of calling a backend. */
export const apiMockingEnabled: boolean = import.meta.env.VITE_API_MOCKING === "true";
