// js/app.js

import { initAuth, signIn, signOut, makeRefreshCallback, onReady, onSignOut } from "./auth.js";
import { initFiles, uploadFile, listFiles, getFileURL, renameFile, deleteFile } from "./files.js";
import {
  showApp, showAuthScreen,
  renderFileGrid, updateStorageInfo,
  addProgressBar, updateProgressBar, removeProgressBar,
  showPreview, closePreview,
  showRenameModal,
  showToast,
  filterGrid,
} from "./ui.js";

// ─── State ────────────────────────────────────────────────────────────────────

let allFiles = [];  // Full file list, used for filtering without re-fetching

// ─── Auth Lifecycle ───────────────────────────────────────────────────────────

onReady(async (token) => {
  initFiles(token, makeRefreshCallback());
  showApp();
  await refreshFileList();
});

onSignOut(() => {
  allFiles = [];
  showAuthScreen();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

await initAuth();

document.getElementById("sign-in-btn").addEventListener("click", signIn);
document.getElementById("sign-out-btn").addEventListener("click", signOut);

// ─── Upload ───────────────────────────────────────────────────────────────────

document.getElementById("upload-btn").addEventListener("click", () => {
  document.getElementById("file-input").click();
});

document.getElementById("file-input").addEventListener("change", async (e) => {
  const selectedFiles = Array.from(e.target.files);
  if (!selectedFiles.length) return;

  // Upload all selected files in parallel
  await Promise.all(selectedFiles.map(async (file) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addProgressBar(id, file.name);

    try {
      await uploadFile(file, ({ percent }) => updateProgressBar(id, percent));
      removeProgressBar(id);
      showToast(`${file.name} uploaded`);
    } catch (err) {
      removeProgressBar(id);
      showToast(`Failed to upload ${file.name}`);
      console.error(err);
    }
  }));

  // Reset input so the same file can be re-uploaded if needed
  e.target.value = "";
  await refreshFileList();
});

// Drag and drop support
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  const droppedFiles = Array.from(e.dataTransfer.files);
  if (!droppedFiles.length) return;

  // Simulate a file-input change event by dispatching the same handler logic
  await Promise.all(droppedFiles.map(async (file) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    addProgressBar(id, file.name);

    try {
      await uploadFile(file, ({ percent }) => updateProgressBar(id, percent));
      removeProgressBar(id);
      showToast(`${file.name} uploaded`);
    } catch (err) {
      removeProgressBar(id);
      showToast(`Failed to upload ${file.name}`);
    }
  }));

  await refreshFileList();
});

// ─── File Grid ────────────────────────────────────────────────────────────────

async function refreshFileList() {
  allFiles = await listFiles();
  // Sort newest first
  allFiles.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
  renderFileGrid(allFiles, { onPreview: handlePreview, onRename: handleRename, onDelete: handleDelete });
  updateStorageInfo(allFiles);
}

// ─── Preview ──────────────────────────────────────────────────────────────────

async function handlePreview(name, mimeType) {
  try {
    const url = await getFileURL(name);
    showPreview(name, url, mimeType);
  } catch (err) {
    showToast("Could not load preview");
  }
}

document.getElementById("preview-close-btn").addEventListener("click", closePreview);
document.getElementById("preview-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closePreview(); // Close on backdrop click
});

// ─── Rename ───────────────────────────────────────────────────────────────────

function handleRename(name) {
  showRenameModal(name, async (newDisplayName) => {
    try {
      await renameFile(name, newDisplayName);
      showToast("File renamed");
      await refreshFileList();
    } catch (err) {
      showToast("Rename failed");
      console.error(err);
    }
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function handleDelete(name) {
  if (!confirm("Delete this file? This cannot be undone.")) return;
  try {
    await deleteFile(name);
    showToast("File deleted");
    await refreshFileList();
  } catch (err) {
    showToast("Delete failed");
    console.error(err);
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

document.getElementById("search-input").addEventListener("input", (e) => {
  filterGrid(e.target.value);
});
