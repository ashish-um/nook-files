import { DriveFilesError } from "../DriveFilesError.js";
import type { UploadProgress } from "../types.js";

export interface XhrUploadOptions {
  url: string;
  method: "POST" | "PATCH" | "PUT";
  headers: Record<string, string>;
  body: Blob | ArrayBuffer;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * XHR wrapper that returns a Promise and fires onProgress via xhr.upload.onprogress.
 *
 * fetch() does not support upload progress — this is why nook-files uses XHR
 * specifically for uploads. Downloads still use fetch (no progress needed).
 */
export function xhrUpload<T = unknown>(options: XhrUploadOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, options.url);

    // Set all headers
    for (const [key, value] of Object.entries(options.headers)) {
      xhr.setRequestHeader(key, value);
    }

    // Wire up progress tracking
    if (options.onProgress) {
      const callback = options.onProgress;
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable) {
          callback({
            loaded: event.loaded,
            total: event.total,
            percent: Math.round((event.loaded / event.total) * 100),
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(
            new DriveFilesError(
              "Invalid JSON response from upload",
              "API_ERROR",
              xhr.status
            )
          );
        }
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(
          new DriveFilesError(
            xhr.statusText || "Authentication failed",
            "AUTH_ERROR",
            xhr.status
          )
        );
      } else {
        reject(
          new DriveFilesError(
            xhr.statusText || "Upload failed",
            "UPLOAD_FAILED",
            xhr.status
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(new DriveFilesError("Upload failed: network error", "UPLOAD_FAILED"));
    };

    xhr.send(options.body);
  });
}
