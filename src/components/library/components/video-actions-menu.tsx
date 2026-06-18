import { Play, Pencil, FolderOpen, Trash2, MoreVertical, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface VideoActionsMenuProps {
  onPlay: () => void;
  onEdit: () => void;
  onOpenFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
  triggerClassName?: string;
  showPlayEdit?: boolean;
}

export function VideoActionsMenu({
  onPlay,
  onEdit,
  onOpenFolder,
  onDelete,
  onRename,
  triggerClassName,
  showPlayEdit = true,
}: VideoActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={triggerClassName}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {showPlayEdit && (
          <>
            <DropdownMenuItem onClick={onPlay}>
              <Play className="mr-2 h-4 w-4" />
              Play
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={onRename}>
          <Type className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenFolder}>
          <FolderOpen className="mr-2 h-4 w-4" />
          Show in folder
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
