import { DriveFilesError } from "./DriveFilesError.js";
import type { DriveFilesOptions, DriveFileEntry, UploadOptions } from "./types.js";
import { buildBinaryMultipartBody } from "./utils/buildMultipartBody.js";
import { xhrUpload } from "./utils/xhrUpload.js";

export class DriveFiles {
  private token: string;
  private options: Required<Pick<DriveFilesOptions, "resumableThreshold">> &
    Omit<DriveFilesOptions, "resumableThreshold">;
  public cache = new Map<string, string>();

  constructor(token: string, options: DriveFilesOptions = {}) {
    this.token = token;
    this.options = {
      resumableThreshold: 5_000_000,
      ...options,
    };
  }



  public setToken(token: string): void {
    this.token = token;
  }

  // ── Public CRUD methods ───────────────────────────────────────────

  public async create(
    name: string,
    blob: Blob | File,
    options?: UploadOptions
  ): Promise<DriveFileEntry> {
    // Check for duplicates
    try {
      await this._findByName(name);
      throw new DriveFilesError(`File already exists: ${name}`, "ALREADY_EXISTS");
    } catch (e: any) {
      if (e.code === "ALREADY_EXISTS") throw e;
      if (e.code !== "NOT_FOUND") throw e;
    }

    const metadata = { name, parents: ["appDataFolder"] };

    return this._uploadFile("POST", undefined, metadata, blob, options);
  }

  public async read(name: string): Promise<Blob> {
    const id = await this._findByName(name);
    const url = `https://www.googleapis.com/drive/v3/files/${id}?alt=media`;

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${this.token}`);

    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (
        (res.status === 401 || res.status === 403) &&
        this.options.onTokenExpired
      ) {
        // Retry once with refreshed token
        const newToken = await this.options.onTokenExpired();
        this.setToken(newToken);
        return this.read(name);
      }

      switch (res.status) {
        case 401:
        case 403:
          throw new DriveFilesError(res.statusText, "AUTH_ERROR", res.status);
        case 404:
          throw new DriveFilesError(`File not found: ${name}`, "NOT_FOUND", res.status);
        default:
          throw new DriveFilesError(res.statusText, "API_ERROR", res.status);
      }
    }

    return await res.blob();
  }

  public async update(
    name: string,
    blob: Blob | File,
    options?: UploadOptions
  ): Promise<DriveFileEntry> {
    const id = await this._findByName(name);
    const metadata = { name };

    return this._uploadFile("PATCH", id, metadata, blob, options);
  }

  public async delete(name: string): Promise<void> {
    const id = await this._findByName(name);
    const url = `https://www.googleapis.com/drive/v3/files/${id}`;
    await this._fetch(url, { method: "DELETE" });
    this.cache.delete(name);
  }

  public async list(prefix?: string): Promise<DriveFileEntry[]> {
    return this._listAll(prefix);
  }

  // ── Upload helper ─────────────────────────────────────────────────

  private async _uploadFile(
    method: "POST" | "PATCH",
    fileId: string | undefined,
    metadata: Record<string, unknown>,
    blob: Blob | File,
    options?: UploadOptions
  ): Promise<DriveFileEntry> {
    if (blob.size >= this.options.resumableThreshold) {
      const { resumableUpload } = await import("./utils/resumableUpload.js");
      return resumableUpload({
        fileName: metadata.name as string,
        method,
        metadata,
        blob,
        token: this.token,
        fileId,
        onProgress: options?.onProgress,
      });
    }

    return this._multipartUpload(method, fileId, metadata, blob, options);
  }

  private async _multipartUpload(
    method: "POST" | "PATCH",
    fileId: string | undefined,
    metadata: Record<string, unknown>,
    blob: Blob | File,
    options?: UploadOptions
  ): Promise<DriveFileEntry> {
    const { body, contentType } = await buildBinaryMultipartBody(metadata, blob);

    const baseUrl = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}`
      : "https://www.googleapis.com/upload/drive/v3/files";
    const url = `${baseUrl}?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size`;

    const file = await xhrUpload<DriveFileEntry>({
      url,
      method,
      headers: {
        "Content-Type": contentType,
        Authorization: `Bearer ${this.token}`,
      },
      body: body.buffer as ArrayBuffer,
      onProgress: options?.onProgress,
    });

    if (!file) {
      throw new DriveFilesError("Failed to upload file", "API_ERROR");
    }

    this.cache.set(file.name, file.id);
    return file;
  }

  protected async _fetch<T = unknown>(
    url: string,
    options: RequestInit = {},
    _isRetry = false
  ): Promise<T | null> {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${this.token}`);

    const res = await fetch(url, { ...options, headers });

    if (res.status === 204) {
      return null;
    }

    if (!res.ok) {
      // On 401/403: attempt refresh once if callback exists
      if (
        (res.status === 401 || res.status === 403) &&
        !_isRetry &&
        this.options.onTokenExpired
      ) {
        const newToken = await this.options.onTokenExpired();
        this.setToken(newToken);
        return this._fetch<T>(url, options, true);
      }

      let message = res.statusText;
      try {
        const errorData = await res.json();
        if (errorData.error && errorData.error.message) {
          message = errorData.error.message;
        }
      } catch {
        // Use generic status text if no JSON error body
      }

      switch (res.status) {
        case 401:
        case 403:
          throw new DriveFilesError(message, "AUTH_ERROR", res.status);
        case 404:
          throw new DriveFilesError(message, "NOT_FOUND", res.status);
        default:
          throw new DriveFilesError(message, "API_ERROR", res.status);
      }
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new DriveFilesError("Invalid JSON response", "API_ERROR", res.status);
    }
  }

  protected async _listAll(prefix?: string): Promise<DriveFileEntry[]> {
    const params = new URLSearchParams({
      fields: "files(id,name,mimeType,modifiedTime,size)",
      pageSize: "1000",
    });

    params.append("spaces", "appDataFolder");

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const data = await this._fetch<{ files: DriveFileEntry[] }>(url);
    const files = data?.files || [];

    this.cache.clear();
    for (const file of files) {
      if (file.name && file.id) {
        this.cache.set(file.name, file.id);
      }
    }

    if (prefix) {
      return files.filter((f) => f.name && f.name.startsWith(prefix));
    }
    return files;
  }

  protected async _findByName(name: string): Promise<string> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    await this._listAll();

    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }

    throw new DriveFilesError(`File not found: ${name}`, "NOT_FOUND", 404);
  }
}
