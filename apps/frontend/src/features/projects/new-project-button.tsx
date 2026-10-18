import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { ProjectFormDialog } from "./project-form-dialog";

/** "New project" button that owns its create dialog. */
export function NewProjectButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Plus aria-hidden /> New project
      </Button>
      <ProjectFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
