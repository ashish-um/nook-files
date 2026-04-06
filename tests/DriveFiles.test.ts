import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DriveFiles } from "../src/DriveFiles.js";
import { DriveFilesError } from "../src/DriveFilesError.js";

// Simple fetch mock
const originalFetch = global.fetch;

describe("DriveFiles internals (_fetch, _findByName, _listAll)", () => {
  let files: any;

  beforeEach(() => {
    files = new DriveFiles("mock-token");
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("should fetch to list files, mapping cache and filtering by prefix", async () => {
    const mockFiles = [
      { id: "1", name: "docs/a.png", mimeType: "image/png" },
      { id: "2", name: "vids/b.mp4", mimeType: "video/mp4" },
    ];

    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: mockFiles }), { status: 200 })
    );

    const docFiles = await files._listAll("docs/");
    
    // Check fetch query params
    const callArgs = (global.fetch as any).mock.calls[0];
    const url = new URL(callArgs[0]);
    expect(url.searchParams.get("fields")).toContain("mimeType");

    // Check filtering
    expect(docFiles).toHaveLength(1);
    expect(docFiles[0].name).toBe("docs/a.png");

    // Check cache
    expect(files.cache.get("docs/a.png")).toBe("1");
    expect(files.cache.get("vids/b.mp4")).toBe("2");
  });

  it("_findByName should throw NOT_FOUND if file is missing after listAll", async () => {
    (global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [] }), { status: 200 })
    );

    await expect(files._findByName("missing.png")).rejects.toThrowError(
      new DriveFilesError("File not found: missing.png", "NOT_FOUND", 404)
    );
  });
});
