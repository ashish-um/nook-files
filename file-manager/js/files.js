// js/files.js

import { DriveFiles } from "../nook-files/index.js";

const PREFIX = "filemanager/";  // All files are namespaced under this prefix

let driveFiles = null;

// Called by app.js after sign-in with the access token
export function initFiles(token, onTokenExpired) {
  driveFiles = new DriveFiles(token, {
    onTokenExpired,
    resumableThreshold: 5_000_000, // 5MB — files above this use resumable upload
  });
}

// Upload a single File/Blob. Returns DriveFileEntry on success.
// onProgress is passed through to DriveFiles for the progress bar.
export async function uploadFile(file, onProgress) {
  const name = `${PREFIX}${Date.now()}-${file.name}`;
  return driveFiles.create(name, file, { onProgress });
}

// List all files uploaded by this app
export async function listFiles() {
  return driveFiles.list(PREFIX);
}

// Download a file and return a blob URL for display
export async function getFileURL(name) {
  const blob = await driveFiles.read(name);
  return URL.createObjectURL(blob);
}

// Rename — Drive doesn't support renaming directly.
// The strategy: read the binary, create under new name, delete the old one.
export async function renameFile(oldName, newDisplayName) {
  const blob = await driveFiles.read(oldName);

  // Preserve the timestamp prefix, replace only the display portion
  const timestamp = oldName.replace(PREFIX, "").split("-")[0];
  const newName = `${PREFIX}${timestamp}-${newDisplayName}`;

  await driveFiles.create(newName, blob);
  await driveFiles.delete(oldName);
  return newName;
}

// Delete a file permanently
export async function deleteFile(name) {
  return driveFiles.delete(name);
}

// Extract the human-readable display name from the internal Drive name
// "filemanager/1712345678-avatar.png" → "avatar.png"
export function getDisplayName(name) {
  return name.replace(PREFIX, "").replace(/^\d+-/, "");
}
