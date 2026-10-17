import { createFileRoute } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { useUiPreferencesStore } from "@/stores/ui-preferences.store";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const isSidebarOpen = useUiPreferencesStore((state) => state.isSidebarOpen);
  const toggleSidebar = useUiPreferencesStore((state) => state.toggleSidebar);

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">CMF Design Assistant</h1>
      <p className="text-muted-foreground">
        Frontend scaffold is running. Product features are coming next.
      </p>
      <Button variant="outline" onClick={toggleSidebar}>
        Sidebar: {isSidebarOpen ? "open" : "closed"}
      </Button>
    </main>
  );
}
