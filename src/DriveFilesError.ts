import type { DriveFilesErrorCode } from "./types.js";

export class DriveFilesError extends Error {
  code: DriveFilesErrorCode;
  status?: number;

  constructor(message: string, code: DriveFilesErrorCode, status?: number) {
    super(message);
    this.name = "DriveFilesError";
    this.code = code;
    this.status = status;

    // Must be explicitly set to maintain prototype chain correctly
    // when extending built-ins in target < ES6
    Object.setPrototypeOf(this, DriveFilesError.prototype);
  }
}
