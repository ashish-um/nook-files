/** Metadata returned for a binary file stored in Drive */
export interface DriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size: string;
}

/** Progress object passed to the onProgress callback during upload */
export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/** Options accepted by create() and update() */
export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
}

/** Options when constructing a DriveFiles instance */
export interface DriveFilesOptions {
  resumableThreshold?: number;
  onTokenExpired?: () => Promise<string>;
}

/** All possible error codes */
export type DriveFilesErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "UPLOAD_FAILED"
  | "AUTH_ERROR"
  | "API_ERROR";
