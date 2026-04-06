# nook-files

> Binary file storage in Google Drive — images, audio, video, and more. Per-user, no backend, no cost.

`@ashish-um/nook-files` is the companion package to [`@ashish-um/nook`](https://www.npmjs.com/package/@ashish-um/nook). While `nook` handles structured JSON data, `nook-files` handles binary files — images, audio, video, PDFs, and any other file type. Files are stored directly in the user's own Google Drive, so your app never touches a database or a file server.

---

## Table of Contents

- [How it works](#how-it-works)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [Constructor](#constructor)
- [Methods](#methods)
  - [create](#createname-blob-options)
  - [read](#readname)
  - [update](#updatename-blob-options)
  - [delete](#deletename)
  - [list](#listprefix)
  - [setToken](#settokenaccesstoken)
- [Upload progress](#upload-progress)
- [Error handling](#error-handling)
- [Token refresh](#token-refresh)
- [TypeScript types](#typescript-types)
- [Using nook and nook-files together](#using-nook-and-nook-files-together)
- [Limitations](#limitations)
- [Examples](#examples)

---

## How it works

`nook-files` accepts a `Blob` or `File` object and uploads it to the user's Google Drive `appDataFolder` — a hidden, app-specific storage space that only your app can access. To display a file, you download it as a `Blob` and create a temporary local URL with `URL.createObjectURL()`.

```
Your App                      nook-files               User's Drive
────────                      ──────────               ────────────
File / Blob          →     upload to Drive   →      stored as binary
URL.createObjectURL  ←    download as Blob   ←      raw binary data
```

`nook-files` never encodes, decodes, compresses, or transforms your files. It moves raw bytes in and out of Drive. Converting a file picker selection into a `Blob`, or turning a downloaded `Blob` into something displayable, is your app's job — not the package's.

### Why keep conversion outside the package?

Because conversion is context-dependent. An image might come from a file picker, a canvas, or a camera API. Each source gives you the data in a different form. `nook-files` doesn't know which one you're using — and shouldn't need to. It just handles the Drive layer.

### Browser only

`nook-files` uses `XMLHttpRequest`, `Blob`, `File`, and `URL.createObjectURL` — all browser APIs. It does not run in Node.js. If you're building a server-side application, you'll need a different approach.

---

## Installation

```bash
npm install @ashish-um/nook-files
```

---

## Quick Start

```typescript
import { DriveFiles } from "@ashish-um/nook-files";

// Create an instance with a Google OAuth2 access token
const files = new DriveFiles(accessToken);

// Upload a file from a file input
const file = inputElement.files[0];
await files.create("photos/avatar.png", file);

// Download and display it
const blob = await files.read("photos/avatar.png");
const url = URL.createObjectURL(blob);
imgElement.src = url;

// Update (replace) the file
const newFile = inputElement.files[0];
await files.update("photos/avatar.png", newFile);

// List all uploaded files
const allFiles = await files.list("photos/");

// Delete it
await files.delete("photos/avatar.png");
```

---

## Authentication

`nook-files` is **auth-agnostic** — it only needs a valid Google OAuth2 access token. It does not handle sign-in flows or token refresh on its own.

If you're already using `@ashish-um/nook`, the **same token and the same OAuth scope** work for `nook-files`. You don't need any additional permissions.

### Required OAuth2 scope

```
https://www.googleapis.com/auth/drive.appdata
```

### Getting a token

Use **Google Identity Services (GIS)** directly. Do not use `@react-oauth/google` — it only gives you an ID token, not a Drive access token.

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

```javascript
const tokenClient = google.accounts.oauth2.initTokenClient({
  client_id: "YOUR_CLIENT_ID.apps.googleusercontent.com",
  scope: "https://www.googleapis.com/auth/drive.appdata",
  callback: (response) => {
    const files = new DriveFiles(response.access_token);
  },
});

tokenClient.requestAccessToken({ prompt: "select_account" });
```

---

## Constructor

```typescript
new DriveFiles(accessToken: string, options?: DriveFilesOptions)
```

### Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `accessToken` | `string` | ✅ | A valid Google OAuth2 access token |
| `options` | `DriveFilesOptions` | ❌ | Optional configuration |

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `resumableThreshold` | `number` | `5000000` | File size in bytes above which resumable upload is used instead of multipart. Default is 5MB. |
| `onTokenExpired` | `() => Promise<string>` | `undefined` | Callback invoked when the token expires (401/403). Should return a fresh token. See [Token refresh](#token-refresh). |

### Examples

```typescript
// Minimal
const files = new DriveFiles(accessToken);

// With token refresh and custom resumable threshold (2MB)
const files = new DriveFiles(accessToken, {
  resumableThreshold: 2_000_000,
  onTokenExpired: async () => {
    const newToken = await myApp.refreshToken();
    return newToken;
  },
});
```

---

## Methods

### `create(name, blob, options?)`

Uploads a new binary file. Throws if a file with the same name already exists.

```typescript
create(name: string, blob: Blob | File, options?: UploadOptions): Promise<DriveFileEntry>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | Logical filename, e.g. `"photos/avatar.png"`. Used as the identifier for all future operations. |
| `blob` | `Blob \| File` | The binary data to upload. MIME type is read from the Blob/File automatically. |
| `options` | `UploadOptions` | Optional. Pass `onProgress` for upload progress tracking. |

**Returns:** `DriveFileEntry` metadata for the newly created file.

**Throws:** `DriveFilesError` with code `ALREADY_EXISTS` if a file with that name already exists.

**Upload mode:** Files below `resumableThreshold` (default 5MB) use multipart upload. Files at or above the threshold use resumable upload with server-confirmed chunk progress.

```typescript
// Upload from a file input — no conversion needed, File is already a Blob
const file = inputElement.files[0];
await files.create("photos/avatar.png", file);

// Upload with progress tracking
await files.create("videos/intro.mp4", file, {
  onProgress: ({ percent, loaded, total }) => {
    console.log(`${percent}% — ${loaded} of ${total} bytes`);
  },
});

// Upload a Blob created from canvas
const canvas = document.getElementById("myCanvas");
const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
await files.create("drawings/sketch.png", blob);
```

---

### `read(name)`

Downloads a binary file and returns it as a `Blob`.

```typescript
read(name: string): Promise<Blob>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | The logical filename used when the file was created. |

**Returns:** A `Blob` containing the raw binary data of the file.

**Throws:** `DriveFilesError` with code `NOT_FOUND` if the file doesn't exist.

The `Blob` has the correct MIME type set (e.g. `image/png`), so you can use it directly with `URL.createObjectURL()`.

```typescript
// Display an image
const blob = await files.read("photos/avatar.png");
const url = URL.createObjectURL(blob);
imgElement.src = url;

// Play audio
const blob = await files.read("audio/recording.mp3");
const url = URL.createObjectURL(blob);
audioElement.src = url;

// Play video
const blob = await files.read("videos/intro.mp4");
const url = URL.createObjectURL(blob);
videoElement.src = url;

// Always revoke object URLs when you're done with them to free browser memory
URL.revokeObjectURL(url);
```

> **Memory tip:** `URL.createObjectURL()` holds a reference to the binary data in browser memory until you call `URL.revokeObjectURL()`. Always revoke URLs when the file is no longer displayed — especially for video and audio files, which can be large.

---

### `update(name, blob, options?)`

Replaces the binary content of an existing file. Throws if the file doesn't exist.

```typescript
update(name: string, blob: Blob | File, options?: UploadOptions): Promise<DriveFileEntry>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | The logical filename of the file to update. |
| `blob` | `Blob \| File` | New binary content. Completely replaces the existing file. |
| `options` | `UploadOptions` | Optional. Pass `onProgress` for upload progress tracking. |

**Returns:** Updated `DriveFileEntry` metadata.

**Throws:** `DriveFilesError` with code `NOT_FOUND` if the file doesn't exist.

```typescript
const newFile = inputElement.files[0];
await files.update("photos/avatar.png", newFile);

// With progress
await files.update("photos/avatar.png", newFile, {
  onProgress: ({ percent }) => progressBar.style.width = `${percent}%`,
});
```

---

### `delete(name)`

Permanently deletes a file.

```typescript
delete(name: string): Promise<void>
```

| Parameter | Type | Description |
|---|---|---|
| `name` | `string` | The logical filename of the file to delete. |

**Throws:** `DriveFilesError` with code `NOT_FOUND` if the file doesn't exist.

```typescript
await files.delete("photos/avatar.png");

// Safe delete — handle NOT_FOUND gracefully
try {
  await files.delete("photos/maybe-exists.png");
} catch (err) {
  if (err instanceof DriveFilesError && err.code === "NOT_FOUND") {
    // Already gone — that's fine
  } else {
    throw err;
  }
}
```

---

### `list(prefix?)`

Returns metadata for all files stored by your app. Does not download file content.

```typescript
list(prefix?: string): Promise<DriveFileEntry[]>
```

| Parameter | Type | Description |
|---|---|---|
| `prefix` | `string` *(optional)* | If provided, only files whose name starts with this string are returned. |

**Returns:** Array of `DriveFileEntry` objects with metadata only — name, size, mimeType, modifiedTime. No binary data.

```typescript
// List everything
const all = await files.list();

// List only photos
const photos = await files.list("photos/");

// List only a specific note's attachments
const attachments = await files.list("notes/note-1234/");

// Sort by newest first
const sorted = photos.sort(
  (a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
);
```

Use prefixes to organise files by feature or by parent record:

```
photos/                      → profile pictures, gallery images
audio/                       → voice memos, music
notes/note-1234/image-1.png  → attachments scoped to a specific note
```

---

### `setToken(accessToken)`

Replaces the stored access token. Use this after manually refreshing a token.

```typescript
setToken(accessToken: string): void
```

```typescript
const newToken = await myAuth.refresh();
files.setToken(newToken);
```

> If you configured `onTokenExpired`, token refresh happens automatically and you rarely need to call `setToken` directly.

---

## Upload Progress

`create()` and `update()` both accept an optional `onProgress` callback. It receives an `UploadProgress` object as bytes are sent.

```typescript
interface UploadProgress {
  loaded: number;   // Bytes sent so far
  total: number;    // Total file size in bytes
  percent: number;  // 0 to 100
}
```

```typescript
await files.create("videos/intro.mp4", videoFile, {
  onProgress: ({ loaded, total, percent }) => {
    progressBar.style.width = `${percent}%`;
    label.textContent = `${percent}% (${formatBytes(loaded)} of ${formatBytes(total)})`;
  },
});
```

### How progress works under the hood

`nook-files` uses `XMLHttpRequest` for uploads — not `fetch` — because `fetch` has no mechanism for observing upload progress. XHR's `xhr.upload.onprogress` event fires as bytes leave the browser.

For files **below the `resumableThreshold`** (default 5MB), progress reflects bytes sent from the browser. Reaching 100% means the browser finished sending — not that Drive finished saving. The resolved Promise is what confirms Drive accepted the file.

For files **above the `resumableThreshold`**, a resumable upload is used. The file is split into 1MB chunks and sent one at a time. Drive acknowledges each chunk, so progress here reflects bytes confirmed by Google's servers — more accurate for large files on slow connections.

This switch between upload modes is automatic. The `onProgress` callback works the same way in both cases.

---

## Error Handling

All errors thrown by `nook-files` are instances of `DriveFilesError`, which extends the native `Error` class.

```typescript
import { DriveFiles, DriveFilesError } from "@ashish-um/nook-files";
```

### `DriveFilesError` properties

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable error description |
| `code` | `DriveFilesErrorCode` | Machine-readable error type |
| `status` | `number \| undefined` | HTTP status code from the Drive API, if applicable |

### Error codes

| Code | When it's thrown |
|---|---|
| `NOT_FOUND` | `read()`, `update()`, or `delete()` called on a file that doesn't exist |
| `ALREADY_EXISTS` | `create()` called with a name that already exists |
| `UPLOAD_FAILED` | The XHR upload failed mid-transfer (network error, timeout, etc.) |
| `AUTH_ERROR` | Token is invalid, expired with no refresh callback, or lacks permissions |
| `API_ERROR` | Any other unexpected error from the Drive API |

### Handling errors

```typescript
import { DriveFiles, DriveFilesError } from "@ashish-um/nook-files";

try {
  const blob = await files.read("photos/missing.png");
} catch (err) {
  if (err instanceof DriveFilesError) {
    switch (err.code) {
      case "NOT_FOUND":
        console.log("File doesn't exist");
        break;
      case "UPLOAD_FAILED":
        console.log("Upload failed — check your connection");
        break;
      case "AUTH_ERROR":
        console.log("Please sign in again");
        break;
      default:
        console.error("Drive error:", err.message);
    }
  } else {
    throw err;
  }
}
```

---

## Token Refresh

Google OAuth2 access tokens expire after **1 hour**. When `nook-files` receives a 401 or 403, it calls your `onTokenExpired` callback, gets a fresh token, updates itself, and retries the original request once — all without the caller noticing.

```typescript
const files = new DriveFiles(initialToken, {
  onTokenExpired: async () => {
    const newToken = await myApp.refreshToken();
    return newToken;
  },
});
```

If the retry also fails, `nook-files` throws a `DriveFilesError` with code `AUTH_ERROR`.

### With Google Identity Services

```javascript
const files = new DriveFiles(initialToken, {
  onTokenExpired: () =>
    new Promise((resolve, reject) => {
      google.accounts.oauth2.initTokenClient({
        client_id: "YOUR_CLIENT_ID.apps.googleusercontent.com",
        scope: "https://www.googleapis.com/auth/drive.appdata",
        callback: (resp) => {
          if (resp.error) return reject(new Error(resp.error));
          resolve(resp.access_token);
        },
      }).requestAccessToken({ prompt: "" }); // silent — no popup
    }),
});
```

---

## TypeScript Types

All types are exported from the package root.

```typescript
import {
  DriveFiles,
  DriveFilesError,
  DriveFileEntry,
  DriveFilesOptions,
  DriveFilesErrorCode,
  UploadProgress,
  UploadOptions,
} from "@ashish-um/nook-files";
```

### `DriveFileEntry`

Returned by `create()`, `update()`, and `list()`.

```typescript
interface DriveFileEntry {
  id: string;           // Drive's internal file ID
  name: string;         // Logical name you gave the file
  mimeType: string;     // MIME type, e.g. "image/png", "audio/mp3"
  modifiedTime: string; // ISO 8601 timestamp of last modification
  size: string;         // File size in bytes (string, per Drive API convention)
}
```

### `UploadProgress`

Passed to the `onProgress` callback during upload.

```typescript
interface UploadProgress {
  loaded: number;   // Bytes sent so far
  total: number;    // Total file size in bytes
  percent: number;  // 0–100
}
```

### `UploadOptions`

Accepted by `create()` and `update()`.

```typescript
interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
}
```

### `DriveFilesOptions`

```typescript
interface DriveFilesOptions {
  resumableThreshold?: number;
  onTokenExpired?: () => Promise<string>;
}
```

### `DriveFilesErrorCode`

```typescript
type DriveFilesErrorCode =
  | "NOT_FOUND"
  | "ALREADY_EXISTS"
  | "UPLOAD_FAILED"
  | "AUTH_ERROR"
  | "API_ERROR";
```

---

## Using nook and nook-files Together

`nook` and `nook-files` are designed to work side by side. Both use the same OAuth token and the same `appDataFolder`. The typical pattern is:

- `nook` stores the structured metadata (note content, timestamps, attachment list)
- `nook-files` stores the binary attachments (images, audio, etc.)
- The `nook` JSON record holds the names of the binary files as references

```typescript
import { DriveCRUD } from "@ashish-um/nook";
import { DriveFiles } from "@ashish-um/nook-files";

const drive = new DriveCRUD(accessToken, { onTokenExpired });
const files = new DriveFiles(accessToken, { onTokenExpired });
```

### Save ordering — binary first, JSON last

Always upload binary files before saving the JSON record. This ensures the attachment list only ever references files that are confirmed to exist.

```typescript
// 1. Upload all images first
const uploaded = await Promise.all(
  imageFiles.map((file, i) =>
    files.create(`notes/${noteId}/image-${i}.png`, file)
  )
);

// 2. Save the note JSON with the confirmed attachment list
await drive.update(`notes/${noteId}.json`, {
  ...note,
  attachments: uploaded.map(f => ({ name: f.name, mimeType: f.mimeType })),
  updatedAt: new Date().toISOString(),
});
```

### Delete ordering — binary first, JSON last

Delete all binary files before deleting the JSON record. Deleting the JSON first risks leaving orphaned binary files in Drive with no way to find or clean them up.

```typescript
// 1. Delete all attachments
await Promise.all(note.attachments.map(a => files.delete(a.name)));

// 2. Delete the note itself
await drive.delete(`notes/${noteId}.json`);
```

---

## Limitations

**Browser only.** `nook-files` depends on browser APIs (`XMLHttpRequest`, `Blob`, `File`, `URL.createObjectURL`). It does not run in Node.js.

**No streaming playback.** Files must be fully downloaded before playback via object URL. Drive is not a streaming server — it doesn't support HTTP range requests reliably. For video, this means the entire file downloads before the player starts.

**No public URLs.** Files in `appDataFolder` are completely private. They cannot be shared with other users or accessed via a public URL.

**Drive is not a CDN.** Load times for large files or many simultaneous downloads will be slower than a purpose-built file hosting service. For small files (images under ~1MB), performance is generally fine.

**Progress at 100% ≠ file saved.** For multipart uploads, `onProgress` reaching 100% means the browser finished sending. The resolved Promise confirms Drive accepted the file.

**Orphan risk on partial failure.** If you're uploading multiple files and one fails, successfully uploaded files remain in Drive. Your app should handle cleanup or retry logic.

**No querying.** You can't filter by file content or metadata beyond the name prefix. Use descriptive, structured names to make `list()` useful.

**Token expiry.** Access tokens expire after 1 hour. Use `onTokenExpired` to handle this silently.

---

## Examples

### Image gallery

```typescript
const files = new DriveFiles(token);

// Upload photos from a file input
async function uploadPhotos(inputElement) {
  const selected = Array.from(inputElement.files);
  await Promise.all(selected.map(async (file) => {
    await files.create(`gallery/${Date.now()}-${file.name}`, file, {
      onProgress: ({ percent }) => console.log(`Uploading: ${percent}%`),
    });
  }));
}

// Render all photos
async function renderGallery() {
  const photos = await files.list("gallery/");
  for (const photo of photos) {
    const blob = await files.read(photo.name);
    const url = URL.createObjectURL(blob);
    const img = document.createElement("img");
    img.src = url;
    img.onload = () => URL.revokeObjectURL(url); // free memory after render
    document.getElementById("gallery").appendChild(img);
  }
}
```

---

### Voice memos

```typescript
const files = new DriveFiles(token);

// Save a recorded audio blob from MediaRecorder
async function saveMemo(audioBlob) {
  const name = `memos/${new Date().toISOString()}.webm`;
  await files.create(name, audioBlob);
  return name;
}

// Play a memo
async function playMemo(name) {
  const blob = await files.read(name);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play();
  audio.onended = () => URL.revokeObjectURL(url);
}

// List all memos
const memos = await files.list("memos/");
```

---

### File manager with rename

Drive doesn't support renaming files directly. The pattern is: read the binary, create under the new name, delete the old one.

```typescript
const files = new DriveFiles(token);

async function renameFile(oldName, newName) {
  const blob = await files.read(oldName);  // Download
  await files.create(newName, blob);        // Re-upload under new name
  await files.delete(oldName);             // Remove old entry
  return newName;
}
```

---

### Notes app with image attachments (using both packages)

```typescript
import { DriveCRUD, DriveError } from "@ashish-um/nook";
import { DriveFiles } from "@ashish-um/nook-files";

const drive = new DriveCRUD(token, { onTokenExpired });
const files = new DriveFiles(token, { onTokenExpired });

async function saveNote(noteId, title, body, newImages = []) {
  // Upload new images first
  const uploaded = await Promise.all(
    newImages.map((img, i) =>
      files.create(`notes/${noteId}/image-${Date.now()}-${i}.png`, img)
    )
  );

  // Read existing note to preserve old attachments
  let existing = { attachments: [] };
  try { existing = await drive.read(`notes/${noteId}.json`); } catch (_) {}

  // Save the note JSON with the updated attachment list
  await drive.update(`notes/${noteId}.json`, {
    title,
    body,
    attachments: [
      ...existing.attachments,
      ...uploaded.map(f => ({ name: f.name, mimeType: f.mimeType })),
    ],
    updatedAt: new Date().toISOString(),
  });
}

async function loadNoteWithImages(noteId) {
  const note = await drive.read(`notes/${noteId}.json`);

  // Load all attachment blobs in parallel
  const imageURLs = await Promise.all(
    note.attachments
      .filter(a => a.mimeType.startsWith("image/"))
      .map(async (a) => {
        const blob = await files.read(a.name);
        return URL.createObjectURL(blob);
      })
  );

  return { note, imageURLs };
}
```
