import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sessionQueryOptions } from "@/features/auth/session-query";
import { useSignOut } from "@/features/auth/use-sign-out";

import { NewProjectButton } from "./new-project-button";
import { useProjects } from "./projects-queries";
import { formatRelativeTime } from "./relative-time";

/** Sidebar content: new project, project list and the signed-in user (FSD 6.3). */
export function ProjectSidebar() {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <NewProjectButton className="w-full" />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ProjectList />
      </ScrollArea>
      <SidebarFooter />
    </div>
  );
}

function ProjectList() {
  const { data: projects, isPending, isError, refetch } = useProjects();

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy="true" aria-label="Loading projects">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-12 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-sm" role="alert">
        <p>Couldn't load projects.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (projects.length === 0) {
    return <p className="p-3 text-sm text-muted-foreground">No projects yet</p>;
  }

  return (
    <nav aria-label="Projects" className="px-2 pb-2">
      <ul data-testid="project-list" className="flex flex-col gap-1">
        {projects.map((project) => (
          <li key={project.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              preload="intent"
              className="flex flex-col rounded-md px-3 py-2 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[status=active]:bg-accent data-[status=active]:font-medium"
            >
              <span className="truncate">{project.title}</span>
              <span className="text-xs text-muted-foreground">
                Updated {formatRelativeTime(project.updatedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SidebarFooter() {
  const { data: session } = useQuery(sessionQueryOptions);
  const signOut = useSignOut();

  return (
    <div className="flex items-center gap-2 border-t p-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium">{session?.user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{session?.user.email}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        <LogOut aria-hidden /> Sign out
      </Button>
    </div>
  );
}
