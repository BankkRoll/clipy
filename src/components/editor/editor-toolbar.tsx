import type { ReactNode } from "react";
import {
  Clipboard,
  Copy,
  Download,
  FolderOpen,
  Redo,
  Save,
  Scissors,
  Trash2,
  Undo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEditorStore } from "@/stores/editorStore";

/** Props for {@link EditorToolbar}. */
export interface EditorToolbarProps {
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSplit: () => void;
  onDelete: () => void;
  /** Whether the clipboard holds a clip. */
  canPaste: boolean;
}

function IconAction({
  label,
  hint,
  onClick,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Top bar of the editor: project open/save/name, undo/redo, clipboard and
 * clip commands, and the export button. Must be rendered inside a
 * `TooltipProvider`.
 */
export function EditorToolbar({
  onOpen,
  onSave,
  onExport,
  onCopy,
  onPaste,
  onSplit,
  onDelete,
  canPaste,
}: EditorToolbarProps) {
  const name = useEditorStore((s) => s.project?.name ?? "");
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const canUndo = useEditorStore((s) => s.historyIndex > 0);
  const canRedo = useEditorStore((s) => s.historyIndex < s.history.length - 1);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const selectedCount = useEditorStore((s) => s.selectedClipIds.length);

  return (
    <header className="flex h-12 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Open
        </Button>
        <Button variant="ghost" size="sm" onClick={onSave}>
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <Input
          aria-label="Project name"
          value={name}
          onChange={(e) => setProjectName(e.target.value)}
          className="h-8 w-48"
        />
      </div>

      <div className="flex items-center gap-1">
        <IconAction label="Undo" hint="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
          <Undo className="h-4 w-4" />
        </IconAction>
        <IconAction label="Redo" hint="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
          <Redo className="h-4 w-4" />
        </IconAction>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <IconAction
          label="Copy"
          hint="Copy (Ctrl+C)"
          onClick={onCopy}
          disabled={selectedCount !== 1}
        >
          <Copy className="h-4 w-4" />
        </IconAction>
        <IconAction label="Paste" hint="Paste (Ctrl+V)" onClick={onPaste} disabled={!canPaste}>
          <Clipboard className="h-4 w-4" />
        </IconAction>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <IconAction
          label="Split at playhead"
          hint="Split at Playhead (S)"
          onClick={onSplit}
          disabled={selectedCount !== 1}
        >
          <Scissors className="h-4 w-4" />
        </IconAction>
        <IconAction
          label="Delete"
          hint="Delete (Del)"
          onClick={onDelete}
          disabled={selectedCount === 0}
        >
          <Trash2 className="h-4 w-4" />
        </IconAction>
        <Separator orientation="vertical" className="mx-2 h-6" />
        <Button variant="default" size="sm" onClick={onExport}>
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
      </div>
    </header>
  );
}
