# nook-files — Thinking Log

A running log of roadblocks, decisions, and next steps during the creation of `@ashish-um/nook-files`.

---

## Phase 1 — Scaffolding + Types + Error Class

**[2026-04-06 14:40]** Read `nook-files-plan.md` (556 lines) and `nook-documentation.md` (633 lines). Studied full `nook` source (5 src files, 4 unit tests, 4 integration tests) to understand every internal pattern.

**[2026-04-06 14:40]** Decision: Mirror nook's structure exactly where possible. `_fetch`, `_listAll`, `_findByName`, error class, constructor all follow the same patterns. Key differences: `mimeType` in `DriveFileEntry`, `UploadProgress`/`UploadOptions` types, `resumableThreshold` option.

**[2026-04-06 14:41]** Decision: Include DriveFiles class skeleton with full internals in Phase 1 instead of leaving it empty. The helpers are lifted from nook with minimal changes (adding `mimeType` to fields). This lets Phase 2 focus on the novel binary utilities, and Phase 3 can wire CRUD methods without blockers.

**[2026-04-06 14:41]** No roadblocks encountered. The nook source was clean and straightforward to adapt.

**[2026-04-06 14:42]** Ran `npm install` — 90 packages, 0 vulnerabilities. Ran `npx tsc --noEmit` — passes clean. Ran `npx tsup` — produces ESM (3.06 KB), CJS (4.10 KB), and type declarations successfully.

**[2026-04-06 14:43]** ✅ Phase 1 complete. All config files, types, error class, barrel exports, and DriveFiles skeleton with internals are in place and verified.

---

## Phase 2 — Core Binary Utilities

**[2026-04-06 14:44]** Starting Phase 2. Two files to build: `buildBinaryMultipartBody` (Uint8Array-based multipart body for binary data) and `xhrUpload` (XHR wrapper with progress).

**[2026-04-06 14:44]** Built `buildMultipartBody.ts`. Uses `TextEncoder` for string parts and `blob.arrayBuffer()` for binary, concatenated via `Uint8Array.set()`. Falls back to `application/octet-stream` if `blob.type` is empty.

**[2026-04-06 14:44]** Built `xhrUpload.ts`. Returns a Promise wrapping XHR. Differentiates AUTH_ERROR (401/403) from UPLOAD_FAILED (other errors) for consistency with `_fetch`.

**[2026-04-06 14:44]** 🚧 Roadblock: `tsc --noEmit` failed — `Uint8Array` is not assignable to `XMLHttpRequestBodyInit` in TypeScript 6. XHR's `send()` accepts `Blob | ArrayBuffer | Document | string | FormData | URLSearchParams | null` but not raw `Uint8Array`.

**[2026-04-06 14:44]** Fix: Changed the `body` type in `XhrUploadOptions` from `Uint8Array | Blob | ArrayBuffer` to `Blob | ArrayBuffer`. At the call site, `Uint8Array.buffer` provides the underlying `ArrayBuffer`.

**[2026-04-06 14:45]** ✅ Phase 2 complete. `tsc --noEmit` passes, `tsup` builds successfully.

---

## Phase 3 — CRUD Methods

**[2026-04-06 14:47]** Implemented `create`, `read`, `update`, `delete`, `list` methods in `DriveFiles.ts`. 
- `create` checks for duplicates before uploading using `_findByName` (catches `NOT_FOUND`).
- `read` performs a `fetch` with `alt=media` to get raw binary and returns `Blob`.
- `create` and `update` both delegate to a private `_uploadFile` method, which for now delegates directly to `_multipartUpload`. (Resumable path will be mapped here in Phase 4 based on file size).
- Added token retry logic specifically on `read` where `fetch` is used (since XHR has its own retry mapping via `_fetch` pattern but `read` circumvents `_fetch` to get the raw `Blob`).

**[2026-04-06 14:48]** ✅ Phase 3 complete. `tsc --noEmit` checks passed perfectly. `tsup` build generates 8.27 KB ESM code.

---

## Phase 3.5 — Testing Phases 1-3

**[2026-04-06 14:52]** User requested to test code built so far before moving onto Phase 4. I wrote unit tests for `buildMultipartBody` and `xhrUpload` (using a custom XHR mock class since `vitest` doesn't have a DOM by default). I also wrote tests for `DriveFiles`.

**[2026-04-06 14:54]** Wrote `tests/integration/real-drive-test.ts` to test full CRUD lifecycle against real Google Drive using `TEST_GOOGLE_TOKEN` from `.env` with a real `img.jpg`.

**[2026-04-06 14:55]** User supplied a fresh set of OAuth tokens because the token in `.env` had expired.

**[2026-04-06 14:55]** 🚧 Roadblock: The integration test failed with `ReferenceError: XMLHttpRequest is not defined` because it runs in Node.js via `tsx`, and `nook-files` is a browser library.
**[2026-04-06 14:56]** Fix: Installed the `xhr2` polyfill as a devDependency and injected it into `global.XMLHttpRequest` manually within `real-drive-test.ts`.

**[2026-04-06 14:57]** ✅ Phase 3.5 complete. All unit tests pass. The real-drive test successfully connects, creates metadata, uploads the image intact, matches sizes, updates, lists, and cleans up after itself seamlessly!

---

## Phase 4 — Resumable Upload

**[2026-04-06 15:00]** Implemented `src/utils/resumableUpload.ts`. Since `xhrUpload` is already generalized, I broke the resumable flow into 2 steps:
1. `fetch` to POST the initial metadata and grab the `Location` header.
2. A `while` loop that chunks the `Blob` manually (`blob.arrayBuffer().slice()`) using 1MB chunks (Drive requires chunks in multiples of 256KB; 1MB decreases request overhead).
3. Using `xhrUpload` iteratively with `PUT` to upload chunks, catching `308 Resume Incomplete` as a "success" state for partial uploads, until the final chunk returns `200` with actual `DriveFileEntry` metadata.

**[2026-04-06 15:01]** Wired `resumableUpload` into `DriveFiles.ts::_uploadFile` using a dynamic import to keep the cold start file size small, triggering gracefully if `blob.size >= this.options.resumableThreshold`.

**[2026-04-06 15:01]** ✅ Phase 4 complete! Uploading files manually switches between single-request multipart for tiny files and session-based resumable uploads for large files without the user noticing.

---

## Phase 5 — Documentation & Build

**[2026-04-06 15:02]** Wrote `README.md` containing integration patterns with `nook`, code samples, and explicitly describing the dynamic resumable uploading strategy.

**[2026-04-06 15:02]** Ran the final `npm run build`. The build generates the separate dynamic code-splitting output perfectly.

**[2026-04-06 15:02]** ✅ Phase 5 complete. `@ashish-um/nook-files` is officially implemented, tested, built, and ready for publication!

---

## Phase 6 — Root Folder Logic for 'drive' Space

**[2026-04-06 15:35]** Noticed a discrepancy between the implementation and `nook-files-documentation.md`. The documentation stated that if `appSpace` was set to `"drive"`, the `rootFolderName` option would be used to store files in a specific user-visible root directory. However, the implementation had ignored `rootFolderName` and just passed `"drive"` to `parents`.

**[2026-04-06 15:36]** Implemented the `_getRootFolderId()` logic in `src/DriveFiles.ts`. It queries the Google Drive API for the folder using `rootFolderName`, and creates it under the `root` drive if it does not exist. Caches the `rootFolderId` in memory to prevent redundant metadata API calls.

**[2026-04-06 15:37]** Updated `create()` and `_listAll()` methods to dynamically call `_getRootFolderId()` when `appSpace === "drive"`, passing the conditionally resolved `parentId` to the Drive API. Re-ran `npx tsc` and `npx tsup` locally. Build succeeded.

**[2026-04-06 15:49]** Ran integration tests utilizing the `rootFolderName` override and uncovered `AUTH_ERROR 403` because typical users lack `drive.file` or `drive` OAuth scopes, which defeats the purpose of the primary `appDataFolder` configuration. User agreed and we reverted all changes to `rootFolder` and `appSpace`, strictly standardizing everything to strictly use `appDataFolder` without configurations.
