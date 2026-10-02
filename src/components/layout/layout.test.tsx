import { describe, it, expect, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { clearMocks } from "@tauri-apps/api/mocks";
import { Layout } from "@/components/layout";
import { CommandMenu } from "@/components/layout/command-menu";
import { useDownloadStore } from "@/stores/downloadStore";
import { useThemeStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";
import { emitBackendEvent, mockBackend, type IpcHandler } from "@/test/tauri";
import { currentLocation, renderWithRouter } from "@/test/render";
import { downloadFixture, libraryVideoFixture } from "@/test/fixtures";

const VIDEOS = Array.from({ length: 7 }, (_, i) =>
  libraryVideoFixture({
    id: `v${i}`,
    title: `Video ${i}`,
    downloadedAt: new Date(Date.UTC(2026, 0, 1 + ((i * 3) % 7))).toISOString(),
  })
);

function setupMenu(handlers: Record<string, IpcHandler> = {}, route = "/library") {
  const backend = mockBackend({ get_library_videos: () => VIDEOS, ...handlers });
  const view = renderWithRouter(
    <>
      <input aria-label="Some field" />
      <div contentEditable suppressContentEditableWarning aria-label="Rich text">
        x
      </div>
      <CommandMenu />
    </>,
    { route }
  );
  return { backend, ...view };
}

type User = ReturnType<typeof setupMenu>["user"];

async function openMenu(user: User) {
  await user.keyboard("{Control>}k{/Control}");
  return screen.findByRole("dialog");
}

describe("CommandMenu", () => {
  it("toggles with Ctrl/⌘+K and opens from the trigger", async () => {
    const { user } = setupMenu();
    await openMenu(user);
    await user.keyboard("{Meta>}k{/Meta}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Open command menu" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("loads the library only while open and lists the 5 newest videos", async () => {
    const { user, backend } = setupMenu();
    expect(backend.callsTo("get_library_videos")).toHaveLength(0);
    const dialog = await openMenu(user);
    await within(dialog).findByText("Video 2");
    expect(backend.callsTo("get_library_videos")).toHaveLength(1);
    const recent = within(dialog)
      .getAllByRole("option")
      .map((o) => o.textContent)
      .filter((t) => t?.startsWith("Video"))
      .map((t) => t!.replace("Rick Astley", ""));
    // downloadedAt days: v0=1, v1=4, v2=7, v3=3, v4=6, v5=2, v6=5
    expect(recent).toEqual(["Video 2", "Video 4", "Video 6", "Video 1", "Video 3"]);
  });

  it("opens a recent video in the editor", async () => {
    const { user } = setupMenu();
    const dialog = await openMenu(user);
    await user.click(await within(dialog).findByText("Video 2"));
    expect(currentLocation()).toBe("/editor?import=v2");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tolerates a null or failing library load", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let result: () => unknown = () => null;
    const { user } = setupMenu({ get_library_videos: () => result() });
    let dialog = await openMenu(user);
    expect(within(dialog).queryByText("Recent Videos")).toBeNull();
    await user.keyboard("{Escape}");
    result = () => {
      throw "db locked";
    };
    dialog = await openMenu(user);
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    errorSpy.mockRestore();
  });

  it.each([
    ["Home", "/"],
    ["Editor", "/editor"],
    ["Library", "/library"],
    ["Downloads", "/downloads"],
    ["Settings", "/settings"],
    ["New Download", "/"],
    ["New Project", "/editor"],
  ])("%s navigates to %s", async (name, path) => {
    const { user } = setupMenu({}, "/somewhere");
    const dialog = await openMenu(user);
    await user.click(within(dialog).getByRole("option", { name: new RegExp(`^${name}`) }));
    expect(currentLocation()).toBe(path);
  });

  it("shows Ctrl-style shortcut labels off macOS and ⌘ on macOS", async () => {
    const { user, unmount } = setupMenu();
    let dialog = await openMenu(user);
    expect(within(dialog).getByRole("option", { name: /^Home/ })).toHaveTextContent("Ctrl+1");
    expect(within(dialog).getByRole("option", { name: /^New Project/ })).toHaveTextContent(
      "Ctrl+Shift+N"
    );
    unmount();

    const platform = vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    const mac = setupMenu();
    expect(screen.getByText("⌘")).toBeInTheDocument();
    dialog = await openMenu(mac.user);
    expect(within(dialog).getByRole("option", { name: /^Settings/ })).toHaveTextContent("⌘,");
    expect(within(dialog).getByRole("option", { name: /^New Project/ })).toHaveTextContent("⌘⇧N");
    platform.mockRestore();
  });

  it.each([
    ["{Control>}1{/Control}", "/"],
    ["{Control>}2{/Control}", "/editor"],
    ["{Control>}3{/Control}", "/library"],
    ["{Meta>}4{/Meta}", "/downloads"],
    ["{Control>},{/Control}", "/settings"],
    ["{Control>}n{/Control}", "/"],
    ["{Control>}{Shift>}N{/Shift}{/Control}", "/editor"],
  ])("global shortcut %s goes to %s", async (keys, path) => {
    const { user } = setupMenu({}, "/somewhere");
    await user.keyboard(keys);
    expect(currentLocation()).toBe(path);
  });

  it("ignores shortcuts while typing and with extra modifiers", async () => {
    const { user } = setupMenu({}, "/somewhere");
    await user.click(screen.getByRole("textbox", { name: "Some field" }));
    await user.keyboard("{Control>}3{/Control}");
    expect(currentLocation()).toBe("/somewhere");

    screen.getByLabelText("Rich text").focus();
    await user.keyboard("{Control>}3{/Control}");
    expect(currentLocation()).toBe("/somewhere");

    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}{Alt>}3{/Alt}{/Control}");
    await user.keyboard("3");
    expect(currentLocation()).toBe("/somewhere");
  });

  it("ignores shortcuts another handler already consumed", async () => {
    const { user } = setupMenu({}, "/somewhere");
    const consume = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener("keydown", consume, { capture: true });
    await user.keyboard("{Control>}3{/Control}");
    window.removeEventListener("keydown", consume, { capture: true });
    expect(currentLocation()).toBe("/somewhere");
  });

  it("Refresh Library reloads via the library-updated event instead of the window", async () => {
    const { user, backend } = setupMenu();
    const heard = vi.fn();
    await listen("library-updated", heard);
    const dialog = await openMenu(user);
    await within(dialog).findByText("Video 2");
    await user.click(within(dialog).getByRole("option", { name: /Refresh Library/ }));
    await waitFor(() => expect(heard).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Library refreshed")).toBeInTheDocument();
    expect(backend.callsTo("get_library_videos")).toHaveLength(2);
  });

  it("reports a failed refresh", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setupMenu();
    const dialog = await openMenu(user);
    await within(dialog).findByText("Video 2");
    clearMocks();
    await user.click(within(dialog).getByRole("option", { name: /Refresh Library/ }));
    expect(await screen.findByText("Failed to refresh library")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("changes the theme through the backend and marks the active one", async () => {
    const { user, backend } = setupMenu();
    let dialog = await openMenu(user);
    expect(within(dialog).getByRole("option", { name: /^System/ })).toHaveTextContent("Active");
    await user.click(within(dialog).getByRole("option", { name: /^Dark/ }));
    await waitFor(() =>
      expect(backend.callsTo("update_setting")[0]?.args).toEqual({
        key: "appearance.theme",
        value: "dark",
      })
    );
    expect(useThemeStore.getState().theme).toBe("dark");
    dialog = await openMenu(user);
    expect(within(dialog).getByRole("option", { name: /^Dark/ })).toHaveTextContent("Active");
  });

  it("toasts when the theme cannot be saved", async () => {
    const { user } = setupMenu({
      update_setting: () => {
        throw "read-only";
      },
    });
    const dialog = await openMenu(user);
    await user.click(within(dialog).getByRole("option", { name: /^Light/ }));
    expect(await screen.findByText("Failed to save theme")).toBeInTheDocument();
    expect(useThemeStore.getState().theme).toBe("system");
  });
});

describe("Layout and Sidebar", () => {
  function setupLayout(route = "/") {
    mockBackend({ get_library_videos: () => [] });
    return renderWithRouter(
      <Layout>
        <p>Page body</p>
      </Layout>,
      { route }
    );
  }

  it("renders the page inside the layout with every nav link", () => {
    setupLayout("/library");
    expect(screen.getByText("Page body")).toBeInTheDocument();
    for (const name of ["Home", "Editor", "Library", "Downloads", "Settings"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("marks nested routes active", () => {
    setupLayout("/editor/project-1");
    expect(screen.getByRole("link", { name: "Editor" })).toHaveAttribute("aria-current", "page");
  });

  it("navigates via links and tray navigate events", async () => {
    const { user } = setupLayout();
    await user.click(screen.getByRole("link", { name: "Downloads" }));
    expect(currentLocation()).toBe("/downloads");
    await act(async () => {});
    await emitBackendEvent("navigate", "/settings");
    expect(currentLocation()).toBe("/settings");
  });

  it("badges the active download count", () => {
    useDownloadStore.setState({ downloads: [downloadFixture()], activeDownloads: 2 });
    setupLayout();
    expect(
      within(screen.getByRole("link", { name: "Downloads" })).getByText("2")
    ).toBeInTheDocument();
  });

  it("collapses to icons with tooltips and expands again", async () => {
    const { user } = setupLayout();
    expect(screen.getByText("Clipy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.queryByText("Clipy")).toBeNull();
    expect(screen.getByRole("main")).toHaveClass("ml-16");
    await user.hover(screen.getByRole("link", { name: "Library" }));
    expect((await screen.findAllByText("Library")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("main")).toHaveClass("ml-64");
  });

  it("picks the logo for the effective theme", () => {
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    const spy = vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.push(cb),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
    setupLayout();
    const logo = () => screen.getByRole("img", { name: "Clipy" });
    expect(logo()).toHaveAttribute("src", "/logo-light.png");
    act(() => listeners.forEach((cb) => cb({ matches: true } as MediaQueryListEvent)));
    expect(logo()).toHaveAttribute("src", "/logo-dark.png");
    act(() => useThemeStore.setState({ theme: "light" }));
    expect(logo()).toHaveAttribute("src", "/logo-light.png");
    act(() => useThemeStore.setState({ theme: "dark" }));
    expect(logo()).toHaveAttribute("src", "/logo-dark.png");
    spy.mockRestore();
  });
});
