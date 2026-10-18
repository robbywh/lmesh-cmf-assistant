import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PanelLeft } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ProjectSidebar } from "@/features/projects/project-sidebar";
import { projectsQueryOptions } from "@/features/projects/projects-queries";
import { useUiPreferencesStore } from "@/stores/ui-preferences.store";

export const Route = createFileRoute("/_authenticated/projects")({
  // Warm the list without blocking navigation; the sidebar shows its own loading state.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(projectsQueryOptions);
  },
  component: AppShell,
});

function AppShell() {
  const isSidebarOpen = useUiPreferencesStore((state) => state.isSidebarOpen);
  const toggleSidebar = useUiPreferencesStore((state) => state.toggleSidebar);
  const setSidebarOpen = useUiPreferencesStore((state) => state.setSidebarOpen);

  // Start collapsed on narrow screens, where the sidebar overlays the content.
  useEffect(() => {
    if (window.matchMedia?.("(max-width: 767px)").matches) setSidebarOpen(false);
  }, [setSidebarOpen]);

  return (
    <div className="flex h-svh">
      <aside
        id="app-sidebar"
        aria-label="Sidebar"
        hidden={!isSidebarOpen}
        className="fixed inset-y-0 left-0 z-20 w-72 shrink-0 border-r bg-background md:static"
      >
        <ProjectSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center border-b px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle sidebar"
            aria-controls="app-sidebar"
            aria-expanded={isSidebarOpen}
            onClick={toggleSidebar}
          >
            <PanelLeft aria-hidden />
          </Button>
        </div>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
