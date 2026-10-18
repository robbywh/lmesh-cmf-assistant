import { create } from "zustand";

/** Inline notice per project for pre-stream failures (shown near the composer). */
interface StreamNoticeState {
  notices: Record<string, string | null>;
  setNotice: (projectId: string, message: string | null) => void;
}

export const useStreamNoticeStore = create<StreamNoticeState>()((set) => ({
  notices: {},
  setNotice: (projectId, message) =>
    set((state) => ({ notices: { ...state.notices, [projectId]: message } })),
}));

export function useStreamNotice(projectId: string): string | null {
  return useStreamNoticeStore((state) => state.notices[projectId] ?? null);
}
