// js/ui.js

import { getDisplayName } from "./files.js";

// ─── Screen Toggle ────────────────────────────────────────────────────────────

export function showApp() {
  document.getElementById("auth-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
}

export function showAuthScreen() {
  document.getElementById("auth-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

// ─── File Grid ────────────────────────────────────────────────────────────────

export function renderFileGrid(files, { onPreview, onRename, onDelete }) {
  const grid = document.getElementById("file-grid");
  const empty = document.getElementById("empty-state");

  if (files.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  grid.innerHTML = files.map((file) => {
    const displayName = getDisplayName(file.name);
    const ext = displayName.split(".").pop().toLowerCase();
    const sizeLabel = formatBytes(parseInt(file.size));
    const dateLabel = new Date(file.modifiedTime).toLocaleDateString();
    const icon = getFileIcon(ext, file.mimeType);

    return `
      <div
        class="group bg-white border border-gray-100 rounded-xl p-3 flex flex-col gap-2 hover:border-gray-300 hover:shadow-sm transition cursor-pointer"
        data-name="${file.name}"
      >
        <!-- Thumbnail / Icon -->
        <div
          class="w-full aspect-square rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden preview-trigger"
          data-name="${file.name}"
          data-mime="${file.mimeType}"
        >
          ${icon}
        </div>

        <!-- File info -->
        <div class="min-w-0">
          <p class="text-xs font-medium text-gray-800 truncate" title="${displayName}">${displayName}</p>
          <p class="text-[10px] text-gray-400 mt-0.5">${sizeLabel} · ${dateLabel}</p>
        </div>

        <!-- Actions (visible on hover) -->
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            class="rename-btn flex-1 text-[10px] text-gray-500 hover:text-gray-900 border border-gray-100 hover:border-gray-300 rounded-md py-1 transition"
            data-name="${file.name}"
          >Rename</button>
          <button
            class="delete-btn flex-1 text-[10px] text-red-400 hover:text-red-600 border border-gray-100 hover:border-red-200 rounded-md py-1 transition"
            data-name="${file.name}"
          >Delete</button>
        </div>
      </div>
    `;
  }).join("");

  // Attach event listeners
  grid.querySelectorAll(".preview-trigger").forEach((el) => {
    el.addEventListener("click", () => onPreview(el.dataset.name, el.dataset.mime));
  });
  grid.querySelectorAll(".rename-btn").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); onRename(el.dataset.name); });
  });
  grid.querySelectorAll(".delete-btn").forEach((el) => {
    el.addEventListener("click", (e) => { e.stopPropagation(); onDelete(el.dataset.name); });
  });
}

// ─── Upload Progress ─────────────────────────────────────────────────────────

export function addProgressBar(id, filename) {
  const area = document.getElementById("upload-progress-area");
  area.classList.remove("hidden");

  const bar = document.createElement("div");
  bar.id = `progress-${id}`;
  bar.className = "space-y-1";
  bar.innerHTML = `
    <div class="flex justify-between items-center">
      <span class="text-xs text-gray-600 truncate max-w-xs">${filename}</span>
      <span class="text-xs text-gray-400" id="progress-label-${id}">0%</span>
    </div>
    <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
      <div
        id="progress-fill-${id}"
        class="h-full bg-gray-800 rounded-full progress-animated transition-all duration-150"
        style="width: 0%"
      ></div>
    </div>
  `;
  area.appendChild(bar);
}

export function updateProgressBar(id, percent) {
  const fill = document.getElementById(`progress-fill-${id}`);
  const label = document.getElementById(`progress-label-${id}`);
  if (fill) fill.style.width = `${percent}%`;
  if (label) label.textContent = `${percent}%`;
}

export function removeProgressBar(id) {
  const bar = document.getElementById(`progress-${id}`);
  if (bar) bar.remove();

  const area = document.getElementById("upload-progress-area");
  if (area.children.length === 0) area.classList.add("hidden");
}

// ─── Preview Modal ────────────────────────────────────────────────────────────

export function showPreview(filename, url, mimeType) {
  const modal = document.getElementById("preview-modal");
  const content = document.getElementById("preview-content");
  document.getElementById("preview-filename").textContent = getDisplayName(filename);

  const isImage = mimeType.startsWith("image/");
  const isVideo = mimeType.startsWith("video/");
  const isAudio = mimeType.startsWith("audio/");
  const isPDF   = mimeType === "application/pdf";

  if (isImage) {
    content.innerHTML = `<img src="${url}" class="max-h-[65vh] max-w-full object-contain rounded" />`;
  } else if (isVideo) {
    content.innerHTML = `<video src="${url}" controls class="max-h-[65vh] max-w-full rounded"></video>`;
  } else if (isAudio) {
    content.innerHTML = `<audio src="${url}" controls class="w-full"></audio>`;
  } else if (isPDF) {
    content.innerHTML = `<iframe src="${url}" class="w-full h-[65vh] rounded border border-gray-100"></iframe>`;
  } else {
    content.innerHTML = `
      <div class="text-center text-gray-400 py-8">
        <p class="text-sm">No preview available for this file type.</p>
        <a href="${url}" download class="mt-3 inline-block text-xs text-gray-700 underline">Download file</a>
      </div>
    `;
  }

  modal.classList.remove("hidden");
}

export function closePreview() {
  const modal = document.getElementById("preview-modal");
  const content = document.getElementById("preview-content");
  modal.classList.add("hidden");

  // Revoke any object URL to free memory
  const media = content.querySelector("img, video, audio");
  if (media?.src?.startsWith("blob:")) URL.revokeObjectURL(media.src);
  const iframe = content.querySelector("iframe");
  if (iframe?.src?.startsWith("blob:")) URL.revokeObjectURL(iframe.src);

  content.innerHTML = "";
}

// ─── Rename Modal ─────────────────────────────────────────────────────────────

export function showRenameModal(currentName, onConfirm) {
  const modal = document.getElementById("rename-modal");
  const input = document.getElementById("rename-input");
  const confirmBtn = document.getElementById("rename-confirm-btn");
  const cancelBtn = document.getElementById("rename-cancel-btn");

  input.value = getDisplayName(currentName);
  modal.classList.remove("hidden");
  input.focus();
  input.select();

  const close = () => modal.classList.add("hidden");

  confirmBtn.onclick = () => {
    if (input.value.trim()) {
      onConfirm(input.value.trim());
    }
    close();
  };

  cancelBtn.onclick = close;

  // Close on Enter key
  input.onkeydown = (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      onConfirm(input.value.trim());
      close();
    }
    if (e.key === "Escape") close();
  };
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer = null;

export function showToast(message, duration = 2500) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), duration);
}

// ─── Search Filter ────────────────────────────────────────────────────────────

export function filterGrid(query) {
  const cards = document.querySelectorAll("#file-grid > div");
  const q = query.toLowerCase();
  cards.forEach((card) => {
    const name = card.dataset.name?.toLowerCase() ?? "";
    card.style.display = name.includes(q) ? "" : "none";
  });
}

// ─── Storage Info ─────────────────────────────────────────────────────────────

export function updateStorageInfo(files) {
  const total = files.reduce((sum, f) => sum + parseInt(f.size || "0"), 0);
  document.getElementById("storage-info").textContent = `${files.length} file${files.length !== 1 ? "s" : ""} · ${formatBytes(total)}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function getFileIcon(ext, mimeType) {
  if (mimeType?.startsWith("image/")) {
    return `<svg class="w-10 h-10 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>`;
  }
  if (mimeType?.startsWith("video/")) {
    return `<svg class="w-10 h-10 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.893L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>`;
  }
  if (mimeType?.startsWith("audio/")) {
    return `<svg class="w-10 h-10 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>`;
  }
  if (ext === "pdf") {
    return `<svg class="w-10 h-10 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>`;
  }
  return `<svg class="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>`;
}
