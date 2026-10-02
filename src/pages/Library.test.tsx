import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Library } from "@/pages/Library";
import { emitBackendEvent, mockBackend, type IpcHandler } from "@/test/tauri";
import { currentLocation, renderWithRouter } from "@/test/render";
import { libraryStatsFixture, libraryVideoFixture } from "@/test/fixtures";
import type { LibraryVideo } from "@/hooks/useLibrary";

const VIDEOS: LibraryVideo[] = [
  libraryVideoFixture({
    id: "a",
    title: "Alpha",
    channel: "Chan One",
    fileSize: 300,
    downloadedAt: "2026-01-02T00:00:00Z",
  }),
  libraryVideoFixture({
    id: "b",
    title: "Bravo",
    channel: "Chan Two",
    fileSize: 100,
    downloadedAt: "2026-01-03T00:00:00Z",
    thumbnail: "",
  }),
  libraryVideoFixture({
    id: "c",
    title: "Charlie",
    channel: "Chan One",
    fileSize: 200,
    downloadedAt: "2026-01-01T00:00:00Z",
    thumbnail: "http://vimeo.example/c.jpg",
  }),
];

function setup(handlers: Record<string, IpcHandler> = {}, videos = VIDEOS) {
  let current = [...videos];
  const backend = mockBackend({
    get_library_videos: () => current,
    get_library_stats: () => libraryStatsFixture({ totalVideos: current.length }),
    delete_library_video: (args) => {
      current = current.filter((v) => v.id !== args.id);
      return null;
    },
    bulk_delete_library_videos: (args) => {
      const ids = args.ids as string[];
      current = current.filter((v) => !ids.includes(v.id));
      return ids.length;
    },
    ...handlers,
  });
  const view = renderWithRouter(<Library />, { route: "/library" });
  return { backend, ...view, setVideos: (v: LibraryVideo[]) => (current = v) };
}

const titles = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const card = (id: string) => within(screen.getByTestId(`video-${id}`));

async function openMenu(user: ReturnType<typeof setup>["user"], id: string) {
  await user.click(card(id).getByRole("button", { name: "More actions" }));
}

describe("Library page", () => {
  it("lists videos newest first with stats", async () => {
    setup();
    await screen.findByText("Alpha");
    expect(titles()).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(screen.getByText("3 videos")).toBeInTheDocument();
  });

  it("shows a loading state, then the empty state with working actions", async () => {
    const { user, backend } = setup({ "plugin:dialog|open": () => null }, []);
    expect(screen.getByText("Loading library...")).toBeInTheDocument();
    const empty = (await screen.findByText("Your library is empty")).parentElement!.parentElement!;
    await user.click(within(empty).getByRole("button", { name: "Import" }));
    await waitFor(() => expect(backend.callsTo("plugin:dialog|open")).toHaveLength(1));
    await user.click(within(empty).getByRole("button", { name: "Download" }));
    expect(currentLocation()).toBe("/");
  });

  it("filters by title or channel and explains an empty search", async () => {
    const { user } = setup();
    await screen.findByText("Alpha");
    const search = screen.getByRole("textbox", { name: "Search videos" });
    await user.type(search, "chan two");
    expect(titles()).toEqual(["Bravo"]);
    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("No videos found")).toBeInTheDocument();
  });

  it.each([
    ["Oldest first", ["Charlie", "Alpha", "Bravo"]],
    ["Title A-Z", ["Alpha", "Bravo", "Charlie"]],
    ["Title Z-A", ["Charlie", "Bravo", "Alpha"]],
    ["Largest first", ["Alpha", "Charlie", "Bravo"]],
    ["Smallest first", ["Bravo", "Charlie", "Alpha"]],
  ])("sorts by %s", async (label, expected) => {
    const { user } = setup();
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("combobox", { name: "Sort videos" }));
    await user.click(await screen.findByRole("option", { name: label }));
    expect(titles()).toEqual(expected);
  });

  it("switches between grid and list views", async () => {
    const { user } = setup();
    await screen.findByText("Alpha");
    await user.click(screen.getByRole("button", { name: "List view" }));
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(card("a").getByText("Chan One")).toBeInTheDocument();
    await user.click(card("a").getByRole("button", { name: "Play" }));
    expect(document.querySelector("video")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close player" }));
    await user.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("renders a placeholder for imported videos and upgrades http thumbnails", async () => {
    setup();
    await screen.findByText("Alpha");
    expect(card("b").getByTestId("thumbnail-placeholder")).toBeInTheDocument();
    expect(card("c").getByRole("img")).toHaveAttribute("src", "https://vimeo.example/c.jpg");
  });

  it("falls back to the placeholder when a thumbnail fails to load", async () => {
    setup();
    await screen.findByText("Alpha");
    const img = card("a").getByRole("img");
    fireEvent.error(img);
    expect(await card("a").findByTestId("thumbnail-placeholder")).toBeInTheDocument();
  });

  it("plays a video and opens it in the editor", async () => {
    const { user } = setup();
    await screen.findByText("Alpha");
    await user.click(card("a").getByRole("button", { name: "Play" }));
    expect(document.querySelector("video")?.getAttribute("src")).toContain("rick.mp4");
    await user.click(screen.getByRole("button", { name: "Close player" }));
    await user.click(card("a").getByRole("button", { name: "Edit" }));
    expect(currentLocation()).toBe("/editor?import=a");
  });

  it("menu actions: play, edit and show in folder", async () => {
    const { user, backend } = setup();
    await screen.findByText("Alpha");
    await openMenu(user, "a");
    await user.click(await screen.findByRole("menuitem", { name: "Show in folder" }));
    await waitFor(() =>
      expect(backend.callsTo("show_in_folder")[0]?.args).toEqual({ path: VIDEOS[0]!.filePath })
    );
    await openMenu(user, "a");
    await user.click(await screen.findByRole("menuitem", { name: "Play" }));
    expect(document.querySelector("video")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close player" }));
    await openMenu(user, "a");
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    expect(currentLocation()).toBe("/editor?import=a");
  });

  it("toasts when the folder cannot be shown", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup({
      show_in_folder: () => {
        throw "gone";
      },
    });
    await screen.findByText("Alpha");
    await openMenu(user, "a");
    await user.click(await screen.findByRole("menuitem", { name: "Show in folder" }));
    expect(await screen.findByText("Failed to show file in folder")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  describe("single delete", () => {
    async function remove(user: ReturnType<typeof setup>["user"]) {
      await screen.findByText("Alpha");
      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
      return screen.findByRole("dialog", { name: "Remove this video?" });
    }

    it("Cancel leaves the library untouched", async () => {
      const { user, backend } = setup();
      const dialog = await remove(user);
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(backend.callsTo("delete_library_video")).toHaveLength(0);
    });

    it("closing the dialog also cancels", async () => {
      const { user, backend } = setup();
      await remove(user);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(backend.callsTo("delete_library_video")).toHaveLength(0);
    });

    it("Remove from library keeps the file", async () => {
      const { user, backend } = setup();
      const dialog = await remove(user);
      await user.click(within(dialog).getByRole("button", { name: "Remove from library" }));
      await waitFor(() =>
        expect(backend.callsTo("delete_library_video")[0]?.args).toEqual({
          id: "a",
          deleteFile: false,
        })
      );
      expect(await screen.findByText("Removed 1 video from library")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    });

    it("Delete files too deletes from disk", async () => {
      const { user, backend } = setup();
      const dialog = await remove(user);
      await user.click(within(dialog).getByRole("button", { name: "Delete files too" }));
      await waitFor(() =>
        expect(backend.callsTo("delete_library_video")[0]?.args).toEqual({
          id: "a",
          deleteFile: true,
        })
      );
      expect(await screen.findByText("Deleted 1 video")).toBeInTheDocument();
    });

    it("toasts when deletion fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { user } = setup({
        delete_library_video: () => {
          throw "locked";
        },
      });
      const dialog = await remove(user);
      await user.click(within(dialog).getByRole("button", { name: "Remove from library" }));
      expect(await screen.findByText("Failed to delete videos")).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  describe("selection and bulk delete", () => {
    async function selectTwo(user: ReturnType<typeof setup>["user"]) {
      await screen.findByText("Alpha");
      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Select" }));
      await user.click(card("b").getByRole("button", { name: "Select video" }));
      expect(screen.getByText("2 selected")).toBeInTheDocument();
    }

    it("enters selection mode from the menu and toggles items", async () => {
      const { user } = setup();
      await selectTwo(user);
      await user.click(card("b").getByRole("button", { name: "Deselect video" }));
      expect(screen.getByText("1 selected")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Select all" }));
      expect(screen.getByText("3 selected")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Clear selection" }));
      expect(screen.queryByText(/selected/)).toBeNull();
    });

    it("Cancel keeps every selected video", async () => {
      const { user, backend } = setup();
      await selectTwo(user);
      await user.click(screen.getByRole("button", { name: /Delete selected/ }));
      const dialog = await screen.findByRole("dialog", { name: "Remove 2 videos?" });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(backend.callsTo("bulk_delete_library_videos")).toHaveLength(0);
      expect(screen.getByText("2 selected")).toBeInTheDocument();
    });

    it.each([
      ["Remove from library", false, "Removed 2 videos from library"],
      ["Delete files too", true, "Deleted 2 videos"],
    ])("%s sends deleteFiles=%s", async (label, deleteFiles, message) => {
      const { user, backend } = setup();
      await selectTwo(user);
      await user.click(screen.getByRole("button", { name: /Delete selected/ }));
      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: label }));
      await waitFor(() =>
        expect(backend.callsTo("bulk_delete_library_videos")[0]?.args).toEqual({
          ids: ["a", "b"],
          deleteFiles,
        })
      );
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByText(/selected/)).toBeNull();
    });

    it("list view rows edit, show in folder, rename and remove", async () => {
      const { user, backend } = setup();
      await screen.findByText("Alpha");
      await user.click(screen.getByRole("button", { name: "List view" }));
      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Show in folder" }));
      await waitFor(() => expect(backend.callsTo("show_in_folder")).toHaveLength(1));
      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" })
      );
      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Remove" }));
      await user.click(
        within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" })
      );
      await user.click(card("a").getByRole("button", { name: "Edit" }));
      expect(currentLocation()).toBe("/editor?import=a");
    });

    it("works in list view too", async () => {
      const { user } = setup();
      await screen.findByText("Alpha");
      await user.click(screen.getByRole("button", { name: "List view" }));
      await openMenu(user, "c");
      await user.click(await screen.findByRole("menuitem", { name: "Select" }));
      expect(card("c").getByRole("button", { name: "Deselect video" })).toBeInTheDocument();
      await user.click(card("a").getByRole("button", { name: "Select video" }));
      expect(screen.getByText("2 selected")).toBeInTheDocument();
    });
  });

  describe("rename", () => {
    it("renames through the dialog", async () => {
      const { user, backend } = setup();
      await screen.findByText("Alpha");
      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
      const dialog = await screen.findByRole("dialog", { name: "Rename video" });
      const input = within(dialog).getByPlaceholderText("Video title");
      expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
      await user.clear(input);
      await user.type(input, "  New name  {Enter}");
      await waitFor(() =>
        expect(backend.callsTo("rename_library_video")[0]?.args).toEqual({
          id: "a",
          newTitle: "New name",
        })
      );
      expect(await screen.findByText("Video renamed")).toBeInTheDocument();
    });

    it("cancel closes without renaming and failures toast", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { user, backend } = setup({
        rename_library_video: () => {
          throw "db locked";
        },
      });
      await screen.findByText("Alpha");
      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
      let dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(backend.callsTo("rename_library_video")).toHaveLength(0);

      await openMenu(user, "a");
      await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
      dialog = await screen.findByRole("dialog");
      await user.type(within(dialog).getByPlaceholderText("Video title"), "!");
      await user.click(within(dialog).getByRole("button", { name: "Save" }));
      expect(await screen.findByText("Failed to rename video")).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  describe("import and export", () => {
    it("imports every picked file and reports per-file results", async () => {
      const { user, backend } = setup({
        "plugin:dialog|open": () => ["C:\\v\\one.mp4", "D:/v/two.mkv"],
        import_video: (args) => {
          if (String(args.filePath).endsWith("two.mkv")) throw "unsupported";
          return libraryVideoFixture({ id: "new" });
        },
      });
      await screen.findByText("Alpha");
      await user.click(screen.getByRole("button", { name: "Import" }));
      expect(await screen.findByText("Imported: one.mp4")).toBeInTheDocument();
      expect(await screen.findByText("Failed to import: two.mkv")).toBeInTheDocument();
      const openArgs = backend.callsTo("plugin:dialog|open")[0]?.args as {
        options: { multiple: boolean; filters: { extensions: string[] }[] };
      };
      expect(openArgs.options.multiple).toBe(true);
      expect(openArgs.options.filters[0]?.extensions).toContain("mp4");
      expect(backend.callsTo("import_video")[0]?.args).toMatchObject({
        filePath: "C:\\v\\one.mp4",
      });
    });

    it("accepts a single picked path and ignores a cancelled picker", async () => {
      let picked: string | null = "C:\\v\\solo.mp4";
      const { user, backend } = setup({
        "plugin:dialog|open": () => picked,
        import_video: () => libraryVideoFixture(),
      });
      await screen.findByText("Alpha");
      await user.click(screen.getByRole("button", { name: "Import" }));
      expect(await screen.findByText("Imported: solo.mp4")).toBeInTheDocument();
      picked = null;
      await user.click(screen.getByRole("button", { name: "Import" }));
      await waitFor(() => expect(backend.callsTo("plugin:dialog|open")).toHaveLength(2));
      expect(backend.callsTo("import_video")).toHaveLength(1);
    });

    it("logs when the picker itself fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { user } = setup({
        "plugin:dialog|open": () => {
          throw "no window";
        },
      });
      await screen.findByText("Alpha");
      await user.click(screen.getByRole("button", { name: "Import" }));
      await waitFor(() => expect(errorSpy).toHaveBeenCalled());
      errorSpy.mockRestore();
    });

    it("exports to the chosen file", async () => {
      let target: string | null = "C:\\backup\\lib.json";
      const { user, backend } = setup({ "plugin:dialog|save": () => target });
      await screen.findByText("Alpha");
      await user.click(screen.getByRole("button", { name: "Export library" }));
      await waitFor(() =>
        expect(backend.callsTo("export_library_to_file")[0]?.args).toEqual({
          path: "C:\\backup\\lib.json",
        })
      );
      expect(await screen.findByText("Library exported")).toBeInTheDocument();

      target = null;
      await user.click(screen.getByRole("button", { name: "Export library" }));
      await waitFor(() => expect(backend.callsTo("plugin:dialog|save")).toHaveLength(2));
      expect(backend.callsTo("export_library_to_file")).toHaveLength(1);
    });

    it("toasts when export fails", async () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { user } = setup({
        "plugin:dialog|save": () => "x.json",
        export_library_to_file: () => {
          throw "denied";
        },
      });
      await screen.findByText("Alpha");
      await user.click(screen.getByRole("button", { name: "Export library" }));
      expect(await screen.findByText("Failed to export library")).toBeInTheDocument();
      errorSpy.mockRestore();
    });
  });

  it("reloads on library-updated and via the refresh button", async () => {
    const { user, backend, setVideos } = setup();
    await screen.findByText("Alpha");
    setVideos([...VIDEOS, libraryVideoFixture({ id: "d", title: "Delta" })]);
    await emitBackendEvent("library-updated", null);
    expect(await screen.findByText("Delta")).toBeInTheDocument();
    expect(backend.callsTo("get_library_stats").length).toBeGreaterThanOrEqual(2);

    setVideos([libraryVideoFixture({ id: "e", title: "Echo" })]);
    await user.click(screen.getByRole("button", { name: "Refresh library" }));
    expect(await screen.findByText("Echo")).toBeInTheDocument();
  });
});
