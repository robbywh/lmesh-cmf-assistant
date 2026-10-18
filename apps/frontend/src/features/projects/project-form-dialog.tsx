import {
  CreateProjectRequestSchema,
  ErrorCode,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_TITLE_MAX,
  UpdateProjectRequestSchema,
  type CreateProjectRequest,
  type Project,
} from "@lmesh/api-contract";
import { useState, type FormEvent } from "react";
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api-error";

import { useCreateProject, useUpdateProject } from "./projects-queries";

type FieldName = "title" | "description";
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_LABELS: Record<FieldName, { name: string; max: number }> = {
  title: { name: "Title", max: PROJECT_TITLE_MAX },
  description: { name: "Description", max: PROJECT_DESCRIPTION_MAX },
};

function messageFor(field: FieldName, issue: { code: string }): string {
  const { name, max } = FIELD_LABELS[field];
  return issue.code === "too_big"
    ? `${name} must be at most ${max} characters.`
    : `${name} is required.`;
}

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Project to edit; omit to create a new one. */
  project?: Project;
}

/** Create or edit dialog (FSD 6.5). The form mounts only while open, so it always starts fresh. */
export function ProjectFormDialog({ open, onOpenChange, project }: ProjectFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ProjectForm project={project} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ProjectForm({ project, onDone }: { project?: Project; onDone: () => void }) {
  const isEdit = project !== undefined;
  const [title, setTitle] = useState(project?.title ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});

  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? "");
  const isPending = isEdit ? update.isPending : create.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const schema = isEdit ? UpdateProjectRequestSchema : CreateProjectRequestSchema;
    const parsed = schema.safeParse({ title, description });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "title" || field === "description") next[field] ??= messageFor(field, issue);
      }
      setErrors(next);
      return;
    }
    setErrors({});

    const options = {
      onSuccess: () => {
        if (isEdit) toast.success("Project updated");
        onDone();
      },
      onError: (error: Error) => {
        if (isApiError(error) && error.code === ErrorCode.VALIDATION_FAILED && error.errors) {
          setErrors({
            title: error.errors.title?.[0],
            description: error.errors.description?.[0],
          });
          return;
        }
        toast.error("Couldn't save the project. Please try again.");
      },
    };
    // In create mode the data was parsed with the create schema, so `title` is present.
    if (isEdit) update.mutate(parsed.data, options);
    else create.mutate(parsed.data as CreateProjectRequest, options);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
        <DialogDescription>
          The title and description give the assistant context for every answer.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field data-invalid={errors.title ? true : undefined}>
          <FieldLabel htmlFor="project-title">Title</FieldLabel>
          <Input
            id="project-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby="project-title-count"
            autoComplete="off"
          />
          <Counter id="project-title-count" length={title.length} max={PROJECT_TITLE_MAX} />
          {errors.title && <FieldError>{errors.title}</FieldError>}
        </Field>

        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="project-description">Description</FieldLabel>
          <Textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. warm earth tones, matte leather, premium SUV interior"
            rows={4}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby="project-description-count"
          />
          <Counter
            id="project-description-count"
            length={description.length}
            max={PROJECT_DESCRIPTION_MAX}
          />
          {errors.description && <FieldError>{errors.description}</FieldError>}
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  return (
    <p
      id={id}
      className={length > max ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
    >
      {length}/{max}
    </p>
  );
}
