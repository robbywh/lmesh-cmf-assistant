import { ActiveConversationSchema } from "@lmesh/api-contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/api-client";

import { conversationKey, conversationQueryOptions } from "../projects/projects-queries";
import { cancelResync } from "./use-stream-run";

export function useConversation(projectId: string) {
  return useQuery(conversationQueryOptions(projectId));
}

/** Archives the active conversation and replaces the cache with the new empty one. */
export function useResetConversation(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => {
      // A pending post-Stop resync must not bring the archived conversation back.
      cancelResync(projectId);
      return apiRequest("resetConversation", {
        params: { projectId },
        schema: ActiveConversationSchema,
      });
    },
    onSuccess: (conversation) => {
      cancelResync(projectId);
      queryClient.setQueryData(conversationKey(projectId), conversation);
    },
  });
}
