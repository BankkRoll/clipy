import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RenameDialog, VideoGridCard, VideoListRow } from "@/components/library";
import { libraryVideoFixture } from "@/test/fixtures";

const handlers = () => ({
  onPlay: vi.fn(),
  onEdit: vi.fn(),
  onOpenFolder: vi.fn(),
  onDelete: vi.fn(),
  onRename: vi.fn(),
});

describe("library items outside selection mode", () => {
  it.each([
    ["grid card", VideoGridCard],
    ["list row", VideoListRow],
  ])("%s hides checkboxes and the Select action without a toggle handler", async (_n, Item) => {
    const user = userEvent.setup();
    render(<Item video={libraryVideoFixture()} {...handlers()} />);
    expect(screen.queryByRole("button", { name: /Select video/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.queryByRole("menuitem", { name: "Select" })).toBeNull();
  });

  it("list row plays from the thumbnail", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<VideoListRow video={libraryVideoFixture()} {...h} />);
    await user.click(screen.getByRole("img"));
    expect(h.onPlay).toHaveBeenCalled();
  });
});

describe("RenameDialog", () => {
  it("resets the field to the current title each time it opens", async () => {
    const user = userEvent.setup();
    const props = { initialTitle: "Original", onOpenChange: vi.fn(), onConfirm: vi.fn() };
    const { rerender } = render(<RenameDialog open {...props} />);
    await user.type(screen.getByPlaceholderText("Video title"), " edited");
    rerender(<RenameDialog open={false} {...props} />);
    rerender(<RenameDialog open {...props} />);
    expect(screen.getByPlaceholderText("Video title")).toHaveValue("Original");
  });

  it("ignores Enter until the title is non-empty and changed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <RenameDialog open initialTitle="Same" onOpenChange={onOpenChange} onConfirm={onConfirm} />
    );
    const input = screen.getByPlaceholderText("Video title");
    await user.type(input, "{Enter}");
    await user.clear(input);
    await user.type(input, "   {Enter}");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
