import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

/** Props for {@link CommitInput}. */
export interface CommitInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "onBlur"
> {
  /** Persisted value; re-synced into the field whenever it changes. */
  value: string;
  /** Called with the edited text on blur or Enter, only if it changed. */
  onCommit: (value: string) => void;
}

/**
 * Text input that edits locally and commits once on blur or Enter, so a
 * backend-backed setting is written once per edit rather than per keystroke.
 * Escape reverts to the persisted value.
 */
export function CommitInput({ value, onCommit, onKeyDown, ...props }: CommitInputProps) {
  const [draft, setDraft] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    committed.current = value;
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (draft === committed.current) return;
    committed.current = draft;
    onCommit(draft);
  };

  return (
    <Input
      {...props}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(committed.current);
        onKeyDown?.(e);
      }}
    />
  );
}
