import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { xhrUpload } from "../src/utils/xhrUpload.js";
import { DriveFilesError } from "../src/DriveFilesError.js";

// Keep track of the latest mock to control it from tests
let lastXHRMock: XHRMock | null = null;

class XHRMock {
  public method: string = "";
  public url: string = "";
  public headers: Record<string, string> = {};
  public body: any = null;
  public status: number = 200;
  public statusText: string = "OK";
  public responseText: string = "";

  public upload = {
    onprogress: null as ((ev: any) => void) | null,
  };

  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;

  constructor() {
    lastXHRMock = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }

  send(body: any) {
    this.body = body;
  }
}

describe("xhrUpload", () => {
  let originalXHR: any;

  beforeEach(() => {
    originalXHR = global.XMLHttpRequest;
    (global as any).XMLHttpRequest = XHRMock;
    lastXHRMock = null;
  });

  afterEach(() => {
    (global as any).XMLHttpRequest = originalXHR;
  });

  it("should send correct method, url, headers, and body, and resolve JSON on success", async () => {
    const promise = xhrUpload({
      url: "https://example.com/upload",
      method: "POST",
      headers: { "X-Test": "Hello" },
      body: new Uint8Array([1, 2, 3]).buffer,
    });

    expect(lastXHRMock).not.toBeNull();
    const xhr = lastXHRMock!;

    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("https://example.com/upload");
    expect(xhr.headers["X-Test"]).toBe("Hello");
    expect(xhr.body).toBeInstanceOf(ArrayBuffer);

    xhr.status = 200;
    xhr.responseText = '{"id":"xyz"}';
    xhr.onload!();

    const result = await promise;
    expect(result).toEqual({ id: "xyz" });
  });

  it("should fire onProgress callback", async () => {
    const onProgress = vi.fn();
    
    xhrUpload({
      url: "https://example.com/upload",
      method: "POST",
      headers: {},
      body: new ArrayBuffer(10),
      onProgress,
    });

    const xhr = lastXHRMock!;
    
    // Simulate progress
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 50, total: 100 });
    
    expect(onProgress).toHaveBeenCalledWith({
      loaded: 50,
      total: 100,
      percent: 50,
    });
  });

  it("should throw AUTH_ERROR on 401", async () => {
    const promise = xhrUpload({
      url: "https://example.com",
      method: "POST",
      headers: {},
      body: new ArrayBuffer(0),
    });

    const xhr = lastXHRMock!;
    xhr.status = 401;
    xhr.statusText = "Unauthorized";
    xhr.onload!();

    await expect(promise).rejects.toThrowError(
      new DriveFilesError("Unauthorized", "AUTH_ERROR", 401)
    );
  });

  it("should throw UPLOAD_FAILED on 500", async () => {
    const promise = xhrUpload({
      url: "https://example.com",
      method: "POST",
      headers: {},
      body: new ArrayBuffer(0),
    });

    const xhr = lastXHRMock!;
    xhr.status = 500;
    xhr.statusText = "Server Error";
    xhr.onload!();

    await expect(promise).rejects.toThrowError(
      new DriveFilesError("Server Error", "UPLOAD_FAILED", 500)
    );
  });
});
