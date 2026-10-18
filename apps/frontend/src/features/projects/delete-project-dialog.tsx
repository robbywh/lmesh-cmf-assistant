import type { Project } from "@lmesh/api-contract";
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

import { useDeleteProject } from "./projects-queries";

interface DeleteProjectDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Destructive confirmation for deleting a project (FSD 6.5). */
export function DeleteProjectDialog({ project, open, onOpenChange }: DeleteProjectDialogProps) {
  const deleteProject = useDeleteProject(project.id);

  function handleDelete() {
    deleteProject.mutate(undefined, {
      onSuccess: () => onOpenChange(false),
      onError: () => toast.error("Couldn't delete the project. Please try again."),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete project</DialogTitle>
          <DialogDescription>
            Delete '{project.title}'? Its conversations will be deleted too.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteProject.isPending}
          >
            {deleteProject.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
