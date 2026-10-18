import { create } from "zustand";

/**
 * Composer text per project. The empty state writes a suggested prompt here;
 * the composer (T24) reads and clears it.
 */
interface ComposerDraftState {
  drafts: Record<string, string>;
  setDraft: (projectId: string, text: string) => void;
}

export const useComposerDraftStore = create<ComposerDraftState>()((set) => ({
  drafts: {},
  setDraft: (projectId, text) =>
    set((state) => ({ drafts: { ...state.drafts, [projectId]: text } })),
}));
