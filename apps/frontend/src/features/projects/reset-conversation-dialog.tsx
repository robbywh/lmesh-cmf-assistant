import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useResetConversation } from "@/features/chat/conversation-queries";
import { errorMessageFor } from "@/features/chat/error-messages";
import { isApiError } from "@/lib/api-error";

interface ResetConversationDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Confirmation for starting a new conversation (FSD 6.5). */
export function ResetConversationDialog({
  projectId,
  open,
  onOpenChange,
}: ResetConversationDialogProps) {
  const reset = useResetConversation(projectId);

  function handleReset() {
    reset.mutate(undefined, {
      onSuccess: () => {
        toast.success("Conversation reset");
        onOpenChange(false);
      },
      onError: (error) => {
        toast.error(
          isApiError(error) && error.code === "STREAM_IN_PROGRESS"
            ? errorMessageFor(error.code)
            : "Couldn't reset the conversation. Please try again.",
        );
        onOpenChange(false);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset conversation</DialogTitle>
          <DialogDescription>
            Start a new conversation? The current one will be archived and the AI will no longer
            see it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleReset} disabled={reset.isPending}>
            {reset.isPending ? "Resetting…" : "Reset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
