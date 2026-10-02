import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** What the user chose in {@link DeleteVideosDialog}. */
export type DeleteChoice = "cancel" | "library" | "files";

/** Props for {@link DeleteVideosDialog}. */
export interface DeleteVideosDialogProps {
  /** Number of videos the action applies to; the dialog is open while > 0. */
  count: number;
  /** Called once with the user's choice; closing the dialog counts as `cancel`. */
  onChoose: (choice: DeleteChoice) => void;
}

/**
 * Three-way confirmation for removing library videos: cancel, remove only the
 * library entries, or also delete the files from disk.
 */
export function DeleteVideosDialog({ count, onChoose }: DeleteVideosDialogProps) {
  const plural = count === 1 ? "this video" : `${count} videos`;

  return (
    // NOTE: there is no trigger, so Radix only calls onOpenChange to close
    // (Escape, outside click, the X button) — every such close is a cancel.
    <Dialog open={count > 0} onOpenChange={() => onChoose("cancel")}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Remove {plural}?</DialogTitle>
          <DialogDescription>
            Remove {plural} from your library only, or also delete the{" "}
            {count === 1 ? "file" : "files"} from disk. Deleting files cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChoose("cancel")}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => onChoose("library")}>
            Remove from library
          </Button>
          <Button variant="destructive" onClick={() => onChoose("files")} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete files too
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
