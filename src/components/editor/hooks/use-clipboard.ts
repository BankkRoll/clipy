import { useState, useCallback } from "react";
import type { Clip } from "@/types/editor";

export function useClipboard() {
  const [clipboardClip, setClipboardClip] = useState<Clip | null>(null);

  const copy = useCallback((clip: Clip) => {
    setClipboardClip({ ...clip });
  }, []);

  const cut = useCallback((clip: Clip, deleteClip: () => void) => {
    setClipboardClip({ ...clip });
    deleteClip();
  }, []);

  const clear = useCallback(() => {
    setClipboardClip(null);
  }, []);

  return {
    clipboardClip,
    hasCopied: !!clipboardClip,
    copy,
    cut,
    clear,
  };
}
