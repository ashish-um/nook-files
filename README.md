# nook-files

> A companion package to `nook` for storing binary files (images, audio, video) in Google Drive's `appDataFolder`.

## 📚 Documentation

- [Official Documentation](./nook-files-documentation.md) — Comprehensive API reference, configuration options, and advanced examples.
- [React & Next.js Guide](./react-nextjs-guide.md) — Beginner-friendly guide on handling OAuth implicit flows, `"use client"`, memory leak prevention, and building UI uploaders.

While `@ashish-um/nook` is perfect for JSON storage, `nook-files` is designed specifically for raw binary data. It uses the same authentication pattern and same `appDataFolder` isolation, but preserves binary integrity and supports granular upload progress tracking for large files.

## Installation

```bash
npm install @ashish-um/nook-files
```

## Quick Start
```typescript
import { DriveFiles } from "@ashish-um/nook-files";

// Initialize with a Google OAuth2 access token
const files = new DriveFiles(accessToken);

// Upload a binary file (e.g., from an <input type="file">)
const imageFile = inputElement.files[0];
const entry = await files.create("notes/note-123/image-1.png", imageFile, {
  onProgress: (progress) => {
    console.log(`Upload progress: ${progress.percent}%`);
  }
});

// Download a binary file as a Blob
const blob = await files.read("notes/note-123/image-1.png");

// Display it in the browser
const url = URL.createObjectURL(blob);
document.querySelector("img").src = url;

// Update the file content
await files.update("notes/note-123/image-1.png", newBlob);

// List files under a prefix path
const attachments = await files.list("notes/note-123/");

// Delete the file
await files.delete("notes/note-123/image-1.png");
```

## Using with `nook`

`nook-files` uses the exact same `DriveCRUDOptions` and token refresh callback structure as `nook`. You can initialize both side-by-side using the same token:

```typescript
import { DriveCRUD } from "@ashish-um/nook";
import { DriveFiles } from "@ashish-um/nook-files";

const options = {
  // Silent token refresh function used by both libraries
  onTokenExpired: async () => await refreshMyAuthToken()
};

const drive = new DriveCRUD(accessToken, options);
const files = new DriveFiles(accessToken, options);
```

### Storing Binary Attachments

The recommended pattern is to store the binary file through `nook-files` **first**, and then store the string reference to its path inside your JSON data through `nook`. 

```typescript
// 1. Upload the image first
const entry = await files.create(`notes/note-123/avatar.png`, imageBlob);

// 2. Save the metadata as a JSON record
await drive.create(`notes/note-123.json`, {
  title: "My Note",
  body: "Some text",
  attachments: [
    { name: entry.name, mimeType: entry.mimeType }
  ]
});
```

*Note: Drive API metadata uses a string for file sizes due to Javascript integer limits on very large files.*

## Advanced: Resumable vs Multipart Uploads

`DriveFiles` automatically chooses the most efficient upload strategy for you based on the blob size:
1. **Multipart Upload**: Single XHR request. Used for files `< 5MB`.
2. **Resumable Upload**: Initial session chunked via iterative PUT requests via XHR. Used for files `>= 5MB`.

You can configure this automatic threshold using options:
```typescript
const files = new DriveFiles(accessToken, {
  resumableThreshold: 10_000_000 // Switch to resumable at 10MB instead
})
```

## Error Handling

All methods throw a `DriveFilesError` with strongly-typed fallback codes:

```typescript
try {
  await files.read("missing.png");
} catch (error) {
  if (error.code === "NOT_FOUND") {
    console.log("File is missing!");
  } else if (error.code === "AUTH_ERROR") {
    console.log("Token expired and no onTokenExpired callback was provided.");
  }
}
```

## License
MIT
