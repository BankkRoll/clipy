import { describe, it, expect, beforeEach } from "vitest";
import { useLibraryStore } from "@/stores/libraryStore";
import { type LibraryVideo } from "@/types/video";

function makeVideo(overrides: Partial<LibraryVideo> = {}): LibraryVideo {
  return {
    id: "id-1",
    videoId: "vid-1",
    title: "Test Video",
    thumbnail: "",
    duration: 100,
    channel: "Channel A",
    filePath: "/path/a.mp4",
    fileSize: 1000,
    format: "mp4",
    resolution: "1080p",
    downloadedAt: "2024-01-01T00:00:00.000Z",
    sourceUrl: "https://youtu.be/vid-1",
    ...overrides,
  };
}

const INITIAL = {
  videos: [],
  isLoading: false,
  searchQuery: "",
  sortField: "downloadedAt" as const,
  sortOrder: "desc" as const,
  selectedIds: [],
};

beforeEach(() => {
  useLibraryStore.setState({ ...INITIAL });
});

describe("initial state", () => {
  it("has expected defaults", () => {
    const s = useLibraryStore.getState();
    expect(s.videos).toEqual([]);
    expect(s.isLoading).toBe(false);
    expect(s.searchQuery).toBe("");
    expect(s.sortField).toBe("downloadedAt");
    expect(s.sortOrder).toBe("desc");
    expect(s.selectedIds).toEqual([]);
  });
});

describe("setVideos", () => {
  it("replaces the videos array", () => {
    const v = [makeVideo(), makeVideo({ id: "id-2" })];
    useLibraryStore.getState().setVideos(v);
    expect(useLibraryStore.getState().videos).toHaveLength(2);
  });
});

describe("addVideo", () => {
  it("prepends the new video", () => {
    useLibraryStore.getState().setVideos([makeVideo({ id: "old" })]);
    useLibraryStore.getState().addVideo(makeVideo({ id: "new" }));
    const ids = useLibraryStore.getState().videos.map((v) => v.id);
    expect(ids).toEqual(["new", "old"]);
  });
});

describe("removeVideo", () => {
  it("removes by id and clears it from selection", () => {
    useLibraryStore.setState({
      videos: [makeVideo({ id: "a" }), makeVideo({ id: "b" })],
      selectedIds: ["a", "b"],
    });
    useLibraryStore.getState().removeVideo("a");
    const s = useLibraryStore.getState();
    expect(s.videos.map((v) => v.id)).toEqual(["b"]);
    expect(s.selectedIds).toEqual(["b"]);
  });

  it("is a no-op when id not present", () => {
    useLibraryStore.setState({ videos: [makeVideo({ id: "a" })] });
    useLibraryStore.getState().removeVideo("zzz");
    expect(useLibraryStore.getState().videos).toHaveLength(1);
  });
});

describe("updateVideo", () => {
  it("merges updates into the matching video", () => {
    useLibraryStore.setState({ videos: [makeVideo({ id: "a", title: "Old" })] });
    useLibraryStore.getState().updateVideo("a", { title: "New", fileSize: 99 });
    const v = useLibraryStore.getState().videos[0]!;
    expect(v.title).toBe("New");
    expect(v.fileSize).toBe(99);
    expect(v.channel).toBe("Channel A");
  });

  it("leaves other videos untouched", () => {
    useLibraryStore.setState({
      videos: [makeVideo({ id: "a", title: "A" }), makeVideo({ id: "b", title: "B" })],
    });
    useLibraryStore.getState().updateVideo("a", { title: "Changed" });
    expect(useLibraryStore.getState().videos[1]!.title).toBe("B");
  });
});

describe("setSearchQuery / setSorting", () => {
  it("sets the search query", () => {
    useLibraryStore.getState().setSearchQuery("hello");
    expect(useLibraryStore.getState().searchQuery).toBe("hello");
  });

  it("sets sort field and order together", () => {
    useLibraryStore.getState().setSorting("title", "asc");
    const s = useLibraryStore.getState();
    expect(s.sortField).toBe("title");
    expect(s.sortOrder).toBe("asc");
  });
});

describe("selection", () => {
  it("toggleSelection adds then removes", () => {
    useLibraryStore.getState().toggleSelection("a");
    expect(useLibraryStore.getState().selectedIds).toEqual(["a"]);
    useLibraryStore.getState().toggleSelection("a");
    expect(useLibraryStore.getState().selectedIds).toEqual([]);
  });

  it("selectAll selects every video id", () => {
    useLibraryStore.setState({
      videos: [makeVideo({ id: "a" }), makeVideo({ id: "b" })],
    });
    useLibraryStore.getState().selectAll();
    expect(useLibraryStore.getState().selectedIds).toEqual(["a", "b"]);
  });

  it("clearSelection empties selection", () => {
    useLibraryStore.setState({ selectedIds: ["a", "b"] });
    useLibraryStore.getState().clearSelection();
    expect(useLibraryStore.getState().selectedIds).toEqual([]);
  });

  it("deleteSelected removes selected videos and clears selection", () => {
    useLibraryStore.setState({
      videos: [makeVideo({ id: "a" }), makeVideo({ id: "b" }), makeVideo({ id: "c" })],
      selectedIds: ["a", "c"],
    });
    useLibraryStore.getState().deleteSelected();
    const s = useLibraryStore.getState();
    expect(s.videos.map((v) => v.id)).toEqual(["b"]);
    expect(s.selectedIds).toEqual([]);
  });
});

describe("getFilteredVideos - search", () => {
  it("returns all videos when query is empty/whitespace", () => {
    useLibraryStore.setState({
      videos: [makeVideo({ id: "a" }), makeVideo({ id: "b" })],
      searchQuery: "   ",
    });
    expect(useLibraryStore.getState().getFilteredVideos()).toHaveLength(2);
  });

  it("matches title case-insensitively", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", title: "Cooking Pasta" }),
        makeVideo({ id: "b", title: "Gaming Stream" }),
      ],
      searchQuery: "PASTA",
    });
    const r = useLibraryStore.getState().getFilteredVideos();
    expect(r.map((v) => v.id)).toEqual(["a"]);
  });

  it("matches channel name", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", title: "X", channel: "Foodie" }),
        makeVideo({ id: "b", title: "Y", channel: "Gamer" }),
      ],
      searchQuery: "gam",
    });
    expect(useLibraryStore.getState().getFilteredVideos().map((v) => v.id)).toEqual(["b"]);
  });
});

describe("getFilteredVideos - sorting", () => {
  it("sorts by title asc", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", title: "Banana" }),
        makeVideo({ id: "b", title: "Apple" }),
      ],
      sortField: "title",
      sortOrder: "asc",
    });
    expect(useLibraryStore.getState().getFilteredVideos().map((v) => v.title)).toEqual([
      "Apple",
      "Banana",
    ]);
  });

  it("sorts by title desc", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", title: "Apple" }),
        makeVideo({ id: "b", title: "Banana" }),
      ],
      sortField: "title",
      sortOrder: "desc",
    });
    expect(useLibraryStore.getState().getFilteredVideos().map((v) => v.title)).toEqual([
      "Banana",
      "Apple",
    ]);
  });

  it("sorts by fileSize asc", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", fileSize: 300 }),
        makeVideo({ id: "b", fileSize: 100 }),
        makeVideo({ id: "c", fileSize: 200 }),
      ],
      sortField: "fileSize",
      sortOrder: "asc",
    });
    expect(useLibraryStore.getState().getFilteredVideos().map((v) => v.fileSize)).toEqual([
      100, 200, 300,
    ]);
  });

  it("sorts by duration desc", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", duration: 10 }),
        makeVideo({ id: "b", duration: 50 }),
      ],
      sortField: "duration",
      sortOrder: "desc",
    });
    expect(useLibraryStore.getState().getFilteredVideos().map((v) => v.duration)).toEqual([
      50, 10,
    ]);
  });

  it("sorts by downloadedAt (date) asc", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", downloadedAt: "2024-03-01T00:00:00.000Z" }),
        makeVideo({ id: "b", downloadedAt: "2024-01-01T00:00:00.000Z" }),
      ],
      sortField: "downloadedAt",
      sortOrder: "asc",
    });
    expect(useLibraryStore.getState().getFilteredVideos().map((v) => v.id)).toEqual(["b", "a"]);
  });

  it("does not mutate the underlying videos array order", () => {
    const videos = [
      makeVideo({ id: "a", title: "Banana" }),
      makeVideo({ id: "b", title: "Apple" }),
    ];
    useLibraryStore.setState({ videos, sortField: "title", sortOrder: "asc" });
    useLibraryStore.getState().getFilteredVideos();
    expect(useLibraryStore.getState().videos.map((v) => v.id)).toEqual(["a", "b"]);
  });

  it("applies search and sort together", () => {
    useLibraryStore.setState({
      videos: [
        makeVideo({ id: "a", title: "Cat Zebra", fileSize: 300 }),
        makeVideo({ id: "b", title: "Cat Apple", fileSize: 100 }),
        makeVideo({ id: "c", title: "Dog", fileSize: 50 }),
      ],
      searchQuery: "cat",
      sortField: "fileSize",
      sortOrder: "asc",
    });
    const r = useLibraryStore.getState().getFilteredVideos();
    expect(r.map((v) => v.id)).toEqual(["b", "a"]);
  });
});
