import {
  ActiveConversationSchema,
  ProjectListSchema,
  ProjectSchema,
  type CreateProjectRequest,
  type Project,
  type UpdateProjectRequest,
} from "@lmesh/api-contract";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import { apiRequest } from "@/lib/api-client";

const STALE_TIME = 30_000;

export const projectsKey = ["projects"] as const;
export const projectKey = (projectId: string) => ["projects", projectId] as const;
export const conversationKey = (projectId: string) =>
  ["projects", projectId, "conversation"] as const;

export const projectsQueryOptions = queryOptions({
  queryKey: projectsKey,
  staleTime: STALE_TIME,
  queryFn: () => apiRequest("listProjects", { schema: ProjectListSchema }),
});

export const projectQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: projectKey(projectId),
    staleTime: STALE_TIME,
    queryFn: () => apiRequest("getProject", { params: { projectId }, schema: ProjectSchema }),
  });

export const conversationQueryOptions = (projectId: string) =>
  queryOptions({
    queryKey: conversationKey(projectId),
    staleTime: STALE_TIME,
    queryFn: () =>
      apiRequest("getActiveConversation", {
        params: { projectId },
        schema: ActiveConversationSchema,
      }),
  });

/** Projects sorted by `updatedAt` descending, as returned by the API. */
export function useProjects() {
  return useQuery(projectsQueryOptions);
}

export function useProject(projectId: string) {
  return useQuery(projectQueryOptions(projectId));
}

/** Creates a project, adds it to the cached list and navigates to it. */
export function useCreateProject() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (body: CreateProjectRequest) =>
      apiRequest("createProject", { body, schema: ProjectSchema }),
    onSuccess: async (project) => {
      queryClient.setQueryData(projectKey(project.id), project);
      queryClient.setQueryData<Project[]>(projectsKey, (list) => [project, ...(list ?? [])]);
      // Toast here, not in mutate() callbacks: navigating can unmount the caller, and
      // TanStack Query skips those callbacks once the observer has no listeners.
      toast.success("Project created");
      await router.navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
    },
  });
}

/** Updates a project and refreshes the list and detail caches. */
export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateProjectRequest) =>
      apiRequest("updateProject", { params: { projectId }, body, schema: ProjectSchema }),
    onSuccess: async (project) => {
      queryClient.setQueryData(projectKey(projectId), project);
      queryClient.setQueryData<Project[]>(projectsKey, (list) =>
        list?.map((item) => (item.id === project.id ? project : item)),
      );
      // The server re-sorts by updatedAt.
      await queryClient.invalidateQueries({ queryKey: projectsKey, exact: true });
    },
  });
}

/** Deletes a project, leaves its page, then drops its cached data. */
export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => apiRequest("deleteProject", { params: { projectId } }),
    onSuccess: async () => {
      toast.success("Project deleted");
      await router.navigate({ to: "/projects" });
      queryClient.removeQueries({ queryKey: projectKey(projectId) });
      queryClient.setQueryData<Project[]>(projectsKey, (list) =>
        list?.filter((item) => item.id !== projectId),
      );
      await queryClient.invalidateQueries({ queryKey: projectsKey, exact: true });
    },
  });
}
