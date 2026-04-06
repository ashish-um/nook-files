# Using nook-files with React & Next.js

`nook-files` is designed to be highly efficient by directly utilizing browser APIs like `XMLHttpRequest`, `Blob`, `File`, and `URL.createObjectURL`. This means **it must run entirely on the client side** and cannot be used in server environments.

Here is a beginner-friendly guide to cleanly integrating `nook-files` in modern React and Next.js applications.

---

## 1. Using Next.js (App Router)
Since this package relies on browser APIs, any component that imports or uses `DriveFiles` **must** be a Client Component. 

Add `"use client"` to the very top of your file to prevent Next.js from attempting to execute it on the server:

```tsx
"use client";

import { DriveFiles } from "@ashish-um/nook-files";
```

---

## 2. Authentication in React

`nook-files` requires a Google OAuth2 **Access Token** with the `https://www.googleapis.com/auth/drive.appdata` scope.

The easiest way to get this in React is using the official `@react-oauth/google` package, but you **must** use the Implicit Flow using `useGoogleLogin` to get an actual access token (standard sign-in buttons just return an ID JWT token, which will not work for Drive APIs).

```bash
npm install @react-oauth/google
```

```tsx
"use client";

import { useGoogleLogin } from "@react-oauth/google";

export function LoginButton({ onTokenReceived }: { onTokenReceived: (token: string) => void }) {
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      // Complete! Pass the access_token to your app's global state or Context
      onTokenReceived(tokenResponse.access_token);
    },
    scope: "https://www.googleapis.com/auth/drive.appdata",
  });

  return (
    <button onClick={() => login()}>
      Sign in with Google
    </button>
  );
}
```

---

## 3. Safely Displaying Images & Files (Memory Leaks)

When you download a file from Drive via `nook-files`, you receive raw Binary data known as a `Blob`. 
To show it in an `<img>` or `<video>` tag, you create a temporary local URL using `URL.createObjectURL(blob)`.

**🚨 Crucial React Rule:** You must clean up the URL when the component unmounts using `URL.revokeObjectURL()`! If you don't do this, your user's browser memory will continuously climb until the browser crashes, because it holds every image it generates in memory permanently.

```tsx
"use client";

import { useEffect, useState } from "react";
import { DriveFiles } from "@ashish-um/nook-files";

export function DriveImage({ files, fileName }: { files: DriveFiles, fileName: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    files.read(fileName).then((blob) => {
      // 1. Generate the URL to display the image
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    });

    // 2. Cleanup function: Revoke the URL when component unmounts
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [files, fileName]);

  if (!src) return <p>Loading image...</p>;

  return <img src={src} alt={fileName} style={{ width: 200, borderRadius: 8 }} />;
}
```

---

## 4. Complete Example: Image Uploader with Progress Bar
Here is a fully functional React component that lets users upload an image while tracking the upload percentage using the `onProgress` handler.

```tsx
"use client";

import { useState } from "react";
import { DriveFiles } from "@ashish-um/nook-files";

export function ImageUploader({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Initialize the class
  const files = new DriveFiles(token);

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setProgress(0);

    const name = `gallery/image-${Date.now()}.png`;

    try {
      await files.create(name, file, {
        onProgress: (p) => {
          // React state automatically updates the progress bar UI
          setProgress(p.percent); 
        },
      });

      alert("Upload complete! File saved as: " + name);
    } catch (err) {
      console.error("Upload failed", err);
      alert("Failed to upload file.");
    } finally {
      setIsUploading(false);
      setFile(null);
    }
  };

  return (
    <div style={{ padding: 20, border: "1px solid #ccc", borderRadius: 8 }}>
      <h3>Upload an Image</h3>
      
      <input 
        type="file" 
        accept="image/*" 
        onChange={(e) => setFile(e.target.files?.[0] || null)} 
      />

      <button 
        onClick={handleUpload} 
        disabled={!file || isUploading}
        style={{ marginLeft: 10 }}
      >
        {isUploading ? "Uploading..." : "Upload"}
      </button>

      {/* Basic Progress Bar UI element */}
      {isUploading && (
        <div style={{ marginTop: 10 }}>
          <div style={{ width: "100%", background: "#e0e0e0", borderRadius: 4 }}>
            <div 
              style={{
                width: `${progress}%`,
                background: "#0070f3",
                height: 10,
                borderRadius: 4,
                transition: "width 0.2s"
              }} 
            />
          </div>
          <p style={{ margin: 0, fontSize: 12 }}>{progress}%</p>
        </div>
      )}
    </div>
  );
}
```

---

## Summary Checklist for React/Next.js
1. ✅ **Client Side Only:** Double check that you're in browser environments (`"use client"`).
2. ✅ **Access Tokens:** Use the implicit OAuth flow so you get an actual `access_token` with the `drive.appdata` scope.
3. ✅ **Memory Management:** Always put `URL.createObjectURL` inside a `useEffect` and revoke it in the cleanup return function.
4. ✅ **Progress Bars:** Link standard React states (`setProgress`) into the `.create(..., { onProgress })` callback for effortless UI updates.
