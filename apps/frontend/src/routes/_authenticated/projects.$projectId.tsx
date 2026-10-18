import { createFileRoute, Link, type ErrorComponentProps } from "@tanstack/react-router";
import { useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useConversation } from "@/features/chat/conversation-queries";
import { useComposerDraftStore } from "@/features/chat/composer-draft.store";
import { Composer } from "@/features/chat/composer";
import { EmptyState } from "@/features/chat/empty-state";
import { MessageList } from "@/features/chat/message-list";
import { useSummarise } from "@/features/chat/use-summarise";
import { useIsStreaming } from "@/features/chat/use-is-streaming";
import { DeleteProjectDialog } from "@/features/projects/delete-project-dialog";
import { ProjectFormDialog } from "@/features/projects/project-form-dialog";
import { ProjectHeader } from "@/features/projects/project-header";
import {
  conversationQueryOptions,
  projectQueryOptions,
  useProject,
} from "@/features/projects/projects-queries";
import { ResetConversationDialog } from "@/features/projects/reset-conversation-dialog";
import { isApiError } from "@/lib/api-error";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  // Hover/focus preload runs this too, so both requests are warm before navigation.
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(projectQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(conversationQueryOptions(params.projectId)),
    ]);
  },
  // Skeletons appear only when the loader has to wait for the network (first visit).
  pendingMs: 150,
  pendingComponent: ProjectSkeleton,
  errorComponent: ProjectError,
  component: ProjectPage,
});

function ProjectSkeleton() {
  return (
    <div role="status" aria-label="Loading project" className="flex flex-col gap-4 p-4">
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-6 h-16 w-3/4" />
      <Skeleton className="h-16 w-1/2 self-end" />
    </div>
  );
}

function ProjectError({ error }: ErrorComponentProps) {
  const notFound = isApiError(error) && error.status === 404;
  return (
    <div className="flex flex-col items-start gap-2 p-6" role="alert">
      <h1 className="text-xl font-semibold">
        {notFound ? "Project not found" : "Something went wrong"}
      </h1>
      <Link to="/projects" className="text-sm underline">
        Back to projects
      </Link>
    </div>
  );
}

/** Container: reads the caches and owns dialog state; children are presentational. */
function ProjectPage() {
  const { projectId } = Route.useParams();
  const { data: project } = useProject(projectId);
  const { data: conversation } = useConversation(projectId);
  const isStreaming = useIsStreaming(projectId);
  const summarise = useSummarise(projectId);
  const setDraft = useComposerDraftStore((state) => state.setDraft);
  const [isEditOpen, setEditOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const [isResetOpen, setResetOpen] = useState(false);

  if (!project || !conversation) return <ProjectSkeleton />;

  const canSummarise = conversation.messages.some(
    (message) =>
      message.role === "assistant" && message.kind === "chat" && message.status === "complete",
  );

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader
        project={project}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
        onReset={() => setResetOpen(true)}
        onSummarise={() => void summarise()}
        canSummarise={canSummarise && !isStreaming}
        isStreaming={isStreaming}
      />
      {conversation.messages.length === 0 ? (
        <EmptyState project={project} onSuggest={(text) => setDraft(projectId, text)} />
      ) : (
        <MessageList key={`list-${projectId}`} projectId={projectId} messages={conversation.messages} />
      )}
      <Composer key={`composer-${projectId}`} projectId={projectId} />
      <ProjectFormDialog open={isEditOpen} onOpenChange={setEditOpen} project={project} />
      <DeleteProjectDialog project={project} open={isDeleteOpen} onOpenChange={setDeleteOpen} />
      <ResetConversationDialog
        projectId={projectId}
        open={isResetOpen}
        onOpenChange={setResetOpen}
      />
    </div>
  );
}
