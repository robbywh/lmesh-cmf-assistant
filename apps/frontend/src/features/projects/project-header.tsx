import type { Project } from "@lmesh/api-contract";
import { MoreHorizontal } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { useIsNarrow } from "./use-is-narrow";

interface ProjectHeaderProps {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  onReset: () => void;
  onSummarise: () => void;
  /** Needs a completed assistant reply and no running stream (FR-SUM-05). */
  canSummarise: boolean;
  /** Disables Reset while a stream runs for this project. */
  isStreaming: boolean;
}

/** Project title, clamped description and actions (FSD 6.4). */
export function ProjectHeader({
  project,
  onEdit,
  onDelete,
  onReset,
  onSummarise,
  canSummarise,
  isStreaming,
}: ProjectHeaderProps) {
  const isNarrow = useIsNarrow();

  return (
    <header className="flex flex-col gap-2 border-b p-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-xl font-semibold tracking-tight">{project.title}</h1>
        {project.description && <Description text={project.description} />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" disabled={!canSummarise} onClick={onSummarise}>
          Summarise
        </Button>
        {isNarrow ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Project actions">
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={isStreaming} onSelect={onReset}>Reset conversation</DropdownMenuItem>
              <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button variant="outline" onClick={onReset} disabled={isStreaming}>
              Reset conversation
            </Button>
            <Button variant="outline" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="outline" onClick={onDelete}>
              Delete
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

function Description({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setExpanded] = useState(false);
  const [isOverflowing, setOverflowing] = useState(false);

  // Measure only while clamped; once expanded the toggle stays so it can collapse again.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !isExpanded) setOverflowing(element.scrollHeight > element.clientHeight);
  }, [text, isExpanded]);

  return (
    <div>
      <p ref={ref} className={cn("text-sm text-muted-foreground", !isExpanded && "line-clamp-2")}>
        {text}
      </p>
      {(isOverflowing || isExpanded) && (
        <button
          type="button"
          className="text-xs underline underline-offset-2"
          aria-expanded={isExpanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {isExpanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
