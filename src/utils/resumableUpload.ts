import { DriveFilesError } from "../DriveFilesError.js";
import type { DriveFileEntry, UploadOptions } from "../types.js";
import { xhrUpload } from "./xhrUpload.js";

// Google Drive API requires chunks to be multiples of 256KB
const CHUNK_SIZE = 256 * 1024; // 256KB by default. Can be larger but must be a multiple.
// Let's use 1MB chunks to upload faster
const UPLOAD_CHUNK_SIZE = CHUNK_SIZE * 4;

export interface ResumableUploadOptions extends UploadOptions {
  fileName: string | undefined; // For update it might be undefined if we don't change it, though DriveFiles passes name always
  method: "POST" | "PATCH";
  metadata: Record<string, unknown>;
  blob: Blob | File;
  token: string;
  fileId?: string;
}

/**
 * Uploads a file to Google Drive using the Resumable Upload protocol.
 * Used automatically for files larger than `resumableThreshold`.
 */
export async function resumableUpload(
  options: ResumableUploadOptions
): Promise<DriveFileEntry> {
  const { method, metadata, blob, token, fileId, onProgress } = options;
  const mimeType = blob.type || "application/octet-stream";
  const size = blob.size;

  // 1. Initiate the upload session
  const baseUrl = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}`
    : "https://www.googleapis.com/upload/drive/v3/files";
  const initUrl = `${baseUrl}?uploadType=resumable&fields=id,name,mimeType,modifiedTime,size`;

  const initHeaders = new Headers();
  initHeaders.set("Authorization", `Bearer ${token}`);
  initHeaders.set("Content-Type", "application/json");
  initHeaders.set("X-Upload-Content-Type", mimeType);
  initHeaders.set("X-Upload-Content-Length", size.toString());

  const initRes = await fetch(initUrl, {
    method,
    headers: initHeaders,
    body: JSON.stringify(metadata),
  });

  if (!initRes.ok) {
    if (initRes.status === 401 || initRes.status === 403) {
      // Return 401 directly to DriveFiles to trigger retry logic
      throw new DriveFilesError(initRes.statusText, "AUTH_ERROR", initRes.status);
    }
    throw new DriveFilesError(
      `Failed to initiate resumable upload session: ${initRes.statusText}`,
      "API_ERROR",
      initRes.status
    );
  }

  // The session URL is returned in the Location header
  const sessionUrl = initRes.headers.get("Location");
  if (!sessionUrl) {
    throw new DriveFilesError("No Location header returned from resumable upload initiation", "API_ERROR");
  }

  // 2. Upload the file in chunks
  let start = 0;
  let finalResult: DriveFileEntry | null = null;
  const blobBuffer = await blob.arrayBuffer();

  while (start < size) {
    const end = Math.min(start + UPLOAD_CHUNK_SIZE, size);
    const isFinalChunk = end === size;
    
    const chunk = blobBuffer.slice(start, end);
    const contentRange = `bytes ${start}-${end - 1}/${size}`;

    // We use xhrUpload for chunks to capture the sub-chunk progress
    // Wait, since we are chunking manually, we can just fire the progress event ourselves
    // after each successful chunk, or we can use xhrUpload to get real-time granular progress
    // within the chunk as well. We'll use xhrUpload.

    let chunkResult: any;

    try {
      chunkResult = await xhrUpload({
        url: sessionUrl,
        method: "PUT",
        headers: {
          "Content-Range": contentRange,
        },
        body: chunk,
        onProgress: (chunkProgress) => {
          if (onProgress) {
            // Calculate absolute progress across the entire file
            const totalLoaded = start + chunkProgress.loaded;
            onProgress({
              loaded: totalLoaded,
              total: size,
              percent: Math.round((totalLoaded / size) * 100),
            });
          }
        },
      });
      
      if (isFinalChunk) {
        // The final chunk returns the actual Drive file metadata
        finalResult = chunkResult as DriveFileEntry;
      }
    } catch (err: any) {
      // 308 Resume Incomplete is technically a failure state for XHR, but for Drive it means success-for-chunk
      if (err instanceof DriveFilesError && err.status === 308) {
        // Expected for non-final chunks. Keep going.
      } else {
        throw err; // Real error
      }
    }

    start = end;
  }

  if (!finalResult) {
    throw new DriveFilesError("Upload finished but no file metadata was returned", "UPLOAD_FAILED");
  }

  return finalResult;
}
