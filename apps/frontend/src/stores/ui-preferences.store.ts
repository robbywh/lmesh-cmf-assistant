import { create } from "zustand";

/** Client-only UI state. Server data belongs in TanStack Query, not here. */
interface UiPreferencesState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>()((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
}));
