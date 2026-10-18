import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";

import { authClient } from "./auth-client";

/** Revokes the session, clears the client cache and sends the user to `/login`. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign out failed");
    },
    onSuccess: async () => {
      queryClient.clear();
      await router.navigate({ to: "/login", search: {} });
    },
  });
}
