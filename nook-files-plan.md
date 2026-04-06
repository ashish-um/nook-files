# nook-files — Implementation Plan
### A companion package to `nook` for storing binary files (images, audio, video) in Google Drive

---

## 1. Background & Problem Statement

### What nook already solves

`nook` (`@ashish-um/nook`) solves per-user structured data storage by using Google Drive's `appDataFolder` as a hidden, app-specific JSON store. It handles notes, configs, journal entries — anything that can be represented as a JSON object — with zero backend and zero cost.

### The gap nook doesn't fill

Real applications don't just store text. A notes app has image attachments. A journal has voice memos. A portfolio app has photos and videos. None of these can be stored as JSON — they are binary files, and `nook` explicitly does not handle them.

The naive solution is to base64-encode binary files and store them as strings inside JSON. This works for tiny files but breaks down quickly — a 2MB image becomes a ~2.7MB string, Drive has to process it as text, and the entire thing must be decoded in memory before you can display anything. It's slow, wasteful, and not how binary files should be handled.

### The right approach

Binary files should be stored as binary files. The Google Drive API supports uploading any file type with its correct MIME type — `image/png`, `audio/mp3`, `video/mp4`, etc. The browser can then download the raw binary and create a local object URL to display it, with no encoding or decoding in the middle.

`nook-files` wraps this binary upload and download flow into the same clean CRUD interface that `nook` provides for JSON — so developers working with both packages deal with one consistent mental model.

### The design boundary

`nook-files` accepts binary data in (`Blob` or `File`) and returns binary data out (`Blob`). It does not convert, encode, compress, or transform data in any way. Converting a canvas to a Blob, or a downloaded Blob to an object URL, is the app's responsibility. This keeps `nook-files` small, predictable, and applicable to any file type without special-casing.

```
Your App                         nook-files                    Google Drive
──────────                       ──────────                    ────────────
file input → File/Blob    →    upload to Drive       →     stored as binary
img.src    ← objectURL    ←    download from Drive   ←     raw binary
```

### Why a separate package and not an extension of nook?

`nook` is intentionally JSON-only. Adding binary support would require a fundamentally different upload path (XHR instead of fetch, for progress tracking), different download handling (`arrayBuffer()` instead of `json()`), different MIME type management, and a different mental model for callers. Bundling all of this into `nook` would bloat the package and muddy its API for users who only need JSON storage.

A separate package keeps both focused, lets them be installed independently, and lets them share the same auth pattern without coupling their internals.

---

## 2. What nook-files Is (and Isn't)

### What it IS

- A TypeScript class that wraps Google Drive REST API calls for binary file storage
- A CRUD interface accepting `Blob` / `File` in and returning `Blob` out
- A companion to `nook` — same token, same `appDataFolder`, same naming conventions
- Framework-agnostic — works in the browser with any JS framework or none
- Auth-agnostic — accepts any valid Google OAuth2 access token, same as `nook`
- Upload-progress-aware — exposes an `onProgress` callback for tracking large uploads

### What it is NOT

- A media converter — it does not encode, decode, compress, or transcode any file
- A CDN — downloaded files are local blobs, not publicly streamable URLs
- A streaming server — video/audio must be fully downloaded before playback (via object URL)
- A replacement for `nook` — JSON data should still go through `nook`
- A multi-user system — each instance is scoped to one user's token

---

## 3. Technology Choices

| Choice | Decision | Reason |
|---|---|---|
| Language | TypeScript | Consistent with `nook`, type safety for Blob/File handling |
| Runtime target | Browser only | OAuth tokens and Blob/File APIs are browser concepts. No Node.js target. |
| Upload API | `XMLHttpRequest` | `fetch` does not support upload progress. XHR's `upload.onprogress` event does. |
| Download API | `fetch` | No progress needed on download for typical file sizes. XHR not needed. |
| Drive upload mode | Multipart (< 5MB) / Resumable (≥ 5MB) | Multipart is simpler. Resumable gives server-confirmed chunk progress for large files. |
| Storage space | `appDataFolder` | Consistent with `nook`. Hidden, app-scoped, no extra scope needed. |
| Module format | ES Module (`export`) | Same as `nook` — works with Vite, Next.js, etc. |
| Build tool | `tsup` | Same as `nook` — zero-config, outputs ESM + CJS + types. |

---

## 4. Repository Structure

```
nook-files/
├── src/
│   ├── index.ts              # Entry point — exports DriveFiles and DriveFilesError
│   ├── DriveFiles.ts         # Core class with all CRUD methods
│   ├── DriveFilesError.ts    # Custom error class with typed error codes
│   ├── types.ts              # TypeScript interfaces and types
│   └── utils/
│       ├── buildMultipartBody.ts   # Constructs multipart upload body for binary data
│       ├── resumableUpload.ts      # Handles chunked resumable upload for large files
│       └── xhrUpload.ts           # XHR wrapper that fires onProgress events
├── tests/
│   ├── DriveFiles.test.ts          # Unit tests with mocked XHR and fetch
│   └── integration/
│       └── real-drive-test.ts      # Real API tests (requires credentials + .env)
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

---

## 5. TypeScript Interfaces

```typescript
// Metadata returned for a binary file stored in Drive
interface DriveFileEntry {
  id: string;           // Drive's internal file ID
  name: string;         // Logical name, e.g. "notes/note-1234/image-1.png"
  mimeType: string;     // MIME type stored at upload time, e.g. "image/png"
  modifiedTime: string; // ISO 8601 timestamp
  size: string;         // File size in bytes (string, per Drive API convention)
}

// Progress object passed to the onProgress callback during upload
interface UploadProgress {
  loaded: number;   // Bytes sent so far
  total: number;    // Total file size in bytes
  percent: number;  // 0–100, derived from loaded/total
}

// Options accepted by create() and update()
interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  // Called periodically as bytes are sent. Note: for multipart uploads this
  // reflects bytes leaving the browser. For resumable uploads it reflects
  // server-confirmed bytes per chunk acknowledgement.
}

// Options when constructing a DriveFiles instance
interface DriveFilesOptions {
  appSpace?: "appDataFolder" | "drive";  // Default: "appDataFolder"
  rootFolderName?: string;               // Only used when appSpace is "drive"
  resumableThreshold?: number;           // File size in bytes above which resumable
                                         // upload is used. Default: 5_000_000 (5MB)
  onTokenExpired?: () => Promise<string>;// Same token refresh pattern as nook
}

// All possible error codes
type DriveFilesErrorCode =
  | "NOT_FOUND"       // File doesn't exist
  | "ALREADY_EXISTS"  // File already exists (thrown by create())
  | "UPLOAD_FAILED"   // XHR or resumable upload failed mid-transfer
  | "AUTH_ERROR"      // Token invalid, expired, or insufficient permissions
  | "API_ERROR";      // Any other Drive API error
```

---

## 6. The DriveFiles Class — Full API Surface

### Constructor

```typescript
const files = new DriveFiles(accessToken: string, options?: DriveFilesOptions)
```

Accepts a Google OAuth2 access token. The same token used for `nook` works here — both packages use the `drive.appdata` scope. Optionally accepts an `onTokenExpired` callback for silent token refresh, identical in design to `nook`.

---

### `setToken(accessToken: string): void`

Replaces the stored token. Call this after a manual token refresh. If `onTokenExpired` is configured, this is handled automatically and rarely needs to be called directly.

---

### `create(name, blob, options?)`

```typescript
create(name: string, blob: Blob | File, options?: UploadOptions): Promise<DriveFileEntry>
```

Uploads a new binary file. Throws `ALREADY_EXISTS` if a file with that name already exists. `name` is a logical path like `"notes/note-1234/image-1.png"`. The MIME type is read from the `Blob` or `File` object automatically — no need to specify it manually.

Internally uses multipart upload for files below `resumableThreshold` and resumable upload for larger files. The caller never needs to know which mode was used.

```typescript
const file = inputElement.files[0];
await files.create("photos/avatar.png", file, {
  onProgress: ({ percent }) => console.log(`${percent}% uploaded`)
});
```

---

### `read(name)`

```typescript
read(name: string): Promise<Blob>
```

Downloads a binary file and returns it as a `Blob`. Throws `NOT_FOUND` if the file doesn't exist. The caller is responsible for converting the `Blob` to whatever the app needs — an object URL, an `ArrayBuffer`, a `File`, etc.

```typescript
const blob = await files.read("photos/avatar.png");
const url = URL.createObjectURL(blob);
imgElement.src = url;
```

---

### `update(name, blob, options?)`

```typescript
update(name: string, blob: Blob | File, options?: UploadOptions): Promise<DriveFileEntry>
```

Replaces the binary content of an existing file. Throws `NOT_FOUND` if the file doesn't exist. Supports the same `onProgress` callback as `create`.

---

### `delete(name)`

```typescript
delete(name: string): Promise<void>
```

Permanently deletes a binary file. Throws `NOT_FOUND` if it doesn't exist.

---

### `list(prefix?)`

```typescript
list(prefix?: string): Promise<DriveFileEntry[]>
```

Returns metadata for all binary files stored by the app, optionally filtered by name prefix. Does not download file content — only metadata (name, size, mimeType, modifiedTime). Use this to build a file browser or to enumerate attachments without downloading them.

```typescript
// All files uploaded by the app
const all = await files.list();

// All attachments for a specific note
const attachments = await files.list("notes/note-1234/");
```

---

## 7. Internal Implementation Details

### 7.1 Name-to-ID Resolution and Cache

Identical to `nook`. The Drive API requires a file ID for all operations, but callers use logical names. `DriveFiles` maintains an in-memory `Map<string, string>` (name → id) that is populated on the first `list` call and reused for subsequent operations. The cache is invalidated on `create` and `delete`.

The only difference from `nook` is that the list call also fetches `mimeType` in addition to `id`, `name`, `modifiedTime`, and `size` — because `DriveFileEntry` exposes the MIME type in its metadata.

---

### 7.2 Upload Strategy — Multipart vs Resumable

The choice of upload mode is made automatically based on file size:

**Multipart upload (< 5MB by default)**

Used for small files. The metadata and binary content are sent in a single XHR request as a multipart body. The `onProgress` callback fires as bytes leave the browser via `xhr.upload.onprogress`. This is the same endpoint `nook` uses internally but with binary content instead of JSON.

```
POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart

--boundary
Content-Type: application/json

{ "name": "photos/avatar.png", "parents": ["appDataFolder"] }

--boundary
Content-Type: image/png

<binary data>
--boundary--
```

**Resumable upload (≥ 5MB by default)**

Used for large files. The upload happens in two stages:

1. **Initiate** — a POST to the Drive API returns a unique upload session URL
2. **Upload in chunks** — the file is split into chunks (recommended: 256KB–5MB each) and sent sequentially to the session URL. After each chunk, Drive responds with how many bytes it has received. This is the only mode where `onProgress` reflects server-confirmed bytes rather than bytes-sent-from-browser.

The `resumableThreshold` option lets apps tune where this switch happens. For an app that primarily handles small profile pictures, you might never need resumable uploads. For an app handling video, you'd lower the threshold.

---

### 7.3 Why XHR for Uploads

`fetch` is the modern standard for HTTP requests, and `nook` uses it for everything. But `fetch` has one critical limitation: there is no way to observe upload progress. The `ReadableStream` body can be observed for downloads but not uploads.

`XMLHttpRequest` exposes an `xhr.upload.onprogress` event that fires as the request body is transmitted. `nook-files` uses XHR specifically for uploads, wrapped in a Promise so the external API stays `async/await`:

```typescript
function xhrUpload(url: string, body: BodyInit, headers: Record<string, string>, onProgress?): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percent: Math.round((event.loaded / event.total) * 100),
          });
        }
      };
    }

    xhr.onload = () => resolve(JSON.parse(xhr.responseText));
    xhr.onerror = () => reject(new DriveFilesError("Upload failed", "UPLOAD_FAILED"));
    xhr.send(body);
  });
}
```

Downloads use `fetch` since there is no progress requirement on download for typical file sizes.

---

### 7.4 Building the Multipart Body for Binary Data

Unlike `nook`, which serializes everything to JSON strings, `nook-files` must construct a multipart body with a binary second part. This requires using a `Uint8Array` boundary approach rather than string concatenation, because string concatenation corrupts binary data.

The utility reads the MIME type directly from the `Blob` or `File`:

```typescript
async function buildBinaryMultipartBody(
  metadata: object,
  blob: Blob
): Promise<{ body: Uint8Array; contentType: string }> {
  const boundary = "nook_files_boundary_" + Date.now();
  const mimeType = blob.type || "application/octet-stream";

  const metaPart = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const binaryHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  const metaBytes = new TextEncoder().encode(metaPart);
  const headerBytes = new TextEncoder().encode(binaryHeader);
  const binaryBytes = new Uint8Array(await blob.arrayBuffer());
  const closingBytes = new TextEncoder().encode(closing);

  const body = new Uint8Array(metaBytes.length + headerBytes.length + binaryBytes.length + closingBytes.length);
  let offset = 0;
  [metaBytes, headerBytes, binaryBytes, closingBytes].forEach((part) => {
    body.set(part, offset);
    offset += part.length;
  });

  return { body, contentType: `multipart/related; boundary=${boundary}` };
}
```

---

### 7.5 Token Refresh

Identical pattern to `nook`. The `onTokenExpired` callback is stored at construction time. The internal `_fetch` helper (used for non-upload calls like list and delete) retries once on 401/403 after calling the callback. For XHR uploads, the same retry logic is wrapped around the `xhrUpload` utility.

---

### 7.6 Custom Error Class

```typescript
class DriveFilesError extends Error {
  code: DriveFilesErrorCode;
  status?: number;

  constructor(message: string, code: DriveFilesErrorCode, status?: number)
}
```

Same design as `DriveError` in `nook`. All errors thrown by `nook-files` are instances of `DriveFilesError` with a typed `code` field so callers can handle them precisely without parsing strings.

---

## 8. OAuth2 Scope Required

Same as `nook`:

```
https://www.googleapis.com/auth/drive.appdata
```

No additional scope is required for binary files in `appDataFolder`. If you switch `appSpace` to `"drive"` for publicly shareable files, you would need `drive.file` instead.

---

## 9. Using nook and nook-files Together

Both packages share the same access token. You instantiate them independently and pass the same token to both:

```typescript
import { DriveCRUD } from "@ashish-um/nook";
import { DriveFiles } from "@ashish-um/nook-files";

const drive = new DriveCRUD(accessToken, { onTokenExpired });
const files = new DriveFiles(accessToken, { onTokenExpired });
```

### Recommended naming convention for attachments

Store binary files under a path that references their parent JSON record:

```
notes/{noteId}/image-1.png
notes/{noteId}/image-2.png
notes/{noteId}/audio-1.mp3
```

The note JSON (stored in `nook`) holds the list of attachment names:

```json
{
  "id": "note-1234",
  "title": "My Note",
  "body": "Some text...",
  "attachments": [
    { "name": "notes/note-1234/image-1.png", "mimeType": "image/png" },
    { "name": "notes/note-1234/audio-1.mp3", "mimeType": "audio/mp3" }
  ]
}
```

### Save ordering — binary first, JSON last

When saving a note with new attachments, always upload the binary files first and save the JSON record last. This ensures the attachment list in the JSON only ever references files that are confirmed to exist in Drive:

```typescript
// 1. Upload all new binary files
const uploaded = await Promise.all(
  newAttachments.map((blob, i) =>
    files.create(`notes/${noteId}/image-${i}.png`, blob)
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

When deleting a note, delete all binary attachments first, then delete the JSON record. Deleting the JSON first and then failing partway through the attachment cleanup leaves orphaned files in Drive with no way to find them:

```typescript
// 1. Delete all binary attachments
await Promise.all(note.attachments.map(a => files.delete(a.name)));

// 2. Delete the note JSON
await drive.delete(`notes/${noteId}.json`);
```

---

## 10. Build & Distribution

Identical configuration to `nook`:

```typescript
// tsup.config.ts
export default {
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
};
```

```json
{
  "name": "@ashish-um/nook-files",
  "version": "1.0.0",
  "description": "Binary file storage in Google Drive — companion to @ashish-um/nook",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "keywords": ["google-drive", "storage", "binary", "files", "upload", "appdata"],
  "license": "MIT"
}
```

---

## 11. Testing Strategy

### Unit Tests (Vitest + mocked XHR and fetch)

XHR is harder to mock than `fetch`. The recommended approach is to create a lightweight XHR mock class that simulates `onprogress` and `onload` events, then stub `global.XMLHttpRequest` with it in tests.

Key test cases:

- `create()` throws `ALREADY_EXISTS` when file exists
- `create()` calls `onProgress` with increasing percent values
- `create()` reaches `percent: 100` before the Promise resolves
- `create()` uses multipart upload for files under `resumableThreshold`
- `create()` uses resumable upload for files over `resumableThreshold`
- `read()` returns a `Blob` with the correct MIME type
- `read()` throws `NOT_FOUND` for missing files
- `update()` throws `NOT_FOUND` for missing files
- `delete()` throws `NOT_FOUND` for missing files
- `list()` returns `DriveFileEntry[]` with correct `mimeType` field
- `list("prefix/")` filters correctly
- MIME type is read from `Blob.type` and passed to Drive correctly
- Binary multipart body is constructed without corruption (compare byte arrays)
- `onTokenExpired` is called on 401, upload retried once, throws on second 401

### Integration Tests (real Drive API)

Same approach as `nook` — use the OAuth playground to get a real token, store in `.env`, run a script that uploads a real image file, downloads it, compares byte-for-byte with the original, and deletes it.

---

## 12. Implementation Steps (in order)

1. **Scaffold the repo** — `npm init`, install `typescript`, `tsup`, `vitest`
2. **Write types** — `types.ts` and `DriveFilesError.ts` first
3. **Build `_fetch` helper** — same as `nook`, for non-upload calls (list, delete, resumable initiation)
4. **Build name-to-ID resolution** — `_listAll()` and `_findByName()` with cache, same as `nook` but includes `mimeType` in fields
5. **Build `buildBinaryMultipartBody()`** — the binary-safe multipart body utility
6. **Build `xhrUpload()`** — XHR wrapper with `onprogress` support, returns a Promise
7. **Build `resumableUpload()`** — chunked upload with session URL initiation and chunk-level progress
8. **Implement CRUD methods** one at a time: `create` → `read` → `update` → `delete` → `list`
9. **Wire upload strategy selection** — auto-switch between multipart and resumable based on file size
10. **Write unit tests** for each method and the XHR mock
11. **Run integration tests** against real Drive with a real image and audio file
12. **Write README** with usage examples showing `nook` + `nook-files` working together
13. **Build and validate** with `tsup`
14. **Publish** as `@ashish-um/nook-files`

---

## 13. Limitations to Be Aware Of

- **Browser only** — `nook-files` depends on `Blob`, `File`, `XMLHttpRequest`, and `URL.createObjectURL`, which are browser APIs. It does not run in Node.js.
- **No streaming playback** — video and audio must be fully downloaded before playback via object URL. Drive is not a streaming server.
- **No public URLs** — files in `appDataFolder` are completely private and cannot be shared or accessed via a public URL.
- **Drive is not a CDN** — load times for large files or many simultaneous downloads will be slower than a purpose-built file hosting service.
- **Progress on multipart is client-side only** — `onProgress` reaching 100% means the browser finished sending, not that Drive finished saving. The resolved Promise confirms Drive acceptance.
- **Orphan risk on partial failure** — if a multi-file upload fails mid-way, successfully uploaded files remain in Drive. Apps must implement cleanup or retry logic.
- **Drive API quotas** — same 10,000 requests per 100 seconds per user as `nook`. Each upload and download counts as one request.
- **Token expiry** — same 1-hour expiry as `nook`. Use `onTokenExpired` to handle silently.
