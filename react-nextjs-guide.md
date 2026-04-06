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

`nook-files` requires a Google OAuth2 **access token** with the `https://www.googleapis.com/auth/drive.appdata` scope.

### Why `@react-oauth/google` works here — but only with `useGoogleLogin`

You may have seen guidance elsewhere saying not to use `@react-oauth/google` for Drive. That warning applies specifically to the standard `<GoogleLogin>` button and One Tap, which only give you a JWT ID token — proof of who the user is, not permission to access Drive.

`useGoogleLogin` is different. It uses the **implicit OAuth flow**, which lets you specify Drive scopes and returns a real `access_token` you can use directly with `nook-files`.

```bash
npm install @react-oauth/google
```

### Step 1 — Wrap your app with `GoogleOAuthProvider`

`useGoogleLogin` requires this wrapper to be present at the root of your app. Without it, you'll get a context error.

For **Next.js App Router**, add it in a client providers wrapper:

```tsx
// app/providers.tsx
"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
      {children}
    </GoogleOAuthProvider>
  );
}
```

Then use it in your layout:

```tsx
// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

For **Next.js Pages Router**, add it in `_app.tsx`:

```tsx
// pages/_app.tsx
import { GoogleOAuthProvider } from "@react-oauth/google";

export default function App({ Component, pageProps }) {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!}>
      <Component {...pageProps} />
    </GoogleOAuthProvider>
  );
}
```

For **Vite / plain React**, add it in `main.tsx`:

```tsx
import { GoogleOAuthProvider } from "@react-oauth/google";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <App />
  </GoogleOAuthProvider>
);
```

Add your Client ID to your environment file:

```bash
# .env.local (Next.js) or .env (Vite)
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Step 2 — Build the sign-in button

```tsx
"use client";

import { useGoogleLogin } from "@react-oauth/google";

export function LoginButton({ onTokenReceived }: { onTokenReceived: (token: string) => void }) {
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      // tokenResponse.access_token is a real Drive-scoped access token
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

## 3. Creating a DriveFiles Instance

Always create the `DriveFiles` instance with `useMemo`, not directly in the component body. Creating it in the component body means a new instance — and a fresh, empty name→ID cache — gets created on every render, which wastes API calls.

```tsx
"use client";

import { useMemo } from "react";
import { DriveFiles } from "@ashish-um/nook-files";

export function MyComponent({ token }: { token: string }) {
  // ✅ Stable instance — only recreated when the token changes
  const files = useMemo(() => new DriveFiles(token), [token]);

  // Use files.create(), files.read(), etc.
}
```

---

## 4. Safely Displaying Images & Files (Memory Leaks)

When you download a file from Drive via `nook-files`, you receive raw binary data as a `Blob`. To show it in an `<img>` or `<video>` tag, you create a temporary local URL using `URL.createObjectURL(blob)`.

**🚨 Two React rules to follow:**

**Rule 1 — Always revoke the URL on unmount.** If you don't call `URL.revokeObjectURL()` in the cleanup function, the browser holds every generated URL in memory permanently. Over time this causes memory usage to climb until the tab crashes.

**Rule 2 — Guard against setting state on an unmounted component.** The `files.read()` Promise can resolve after the component has already unmounted. Without a guard, this causes a React warning and can lead to stale state bugs.

```tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import { DriveFiles } from "@ashish-um/nook-files";

export function DriveImage({ token, fileName }: { token: string; fileName: string }) {
  const files = useMemo(() => new DriveFiles(token), [token]);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let isMounted = true; // Guard against setting state after unmount

    files.read(fileName).then((blob) => {
      if (!isMounted) return; // Component already unmounted — do nothing
      objectUrl = URL.createObjectURL(blob);
      setSrc(objectUrl);
    });

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl); // Free browser memory
    };
  }, [files, fileName]);

  if (!src) return <p>Loading image...</p>;

  return <img src={src} alt={fileName} style={{ width: 200, borderRadius: 8 }} />;
}
```

---

## 5. Complete Example: Image Uploader with Progress Bar

A fully functional React component that lets users upload an image while tracking the upload percentage using the `onProgress` handler.

```tsx
"use client";

import { useState, useMemo } from "react";
import { DriveFiles } from "@ashish-um/nook-files";

export function ImageUploader({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // ✅ Stable instance — not recreated on every render
  const files = useMemo(() => new DriveFiles(token), [token]);

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setProgress(0);

    const name = `gallery/image-${Date.now()}.png`;

    try {
      await files.create(name, file, {
        onProgress: (p) => {
          // React state automatically re-renders the progress bar
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

      {isUploading && (
        <div style={{ marginTop: 10 }}>
          <div style={{ width: "100%", background: "#e0e0e0", borderRadius: 4 }}>
            <div
              style={{
                width: `${progress}%`,
                background: "#0070f3",
                height: 10,
                borderRadius: 4,
                transition: "width 0.2s",
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

1. ✅ **Client side only** — always add `"use client"` to any component that uses `DriveFiles`
2. ✅ **`GoogleOAuthProvider` at the root** — required for `useGoogleLogin` to work
3. ✅ **Use `useGoogleLogin`, not `<GoogleLogin>`** — only the implicit flow gives you a Drive-scoped access token
4. ✅ **Wrap DriveFiles in `useMemo`** — prevents a new instance (and fresh cache) on every render
5. ✅ **Memory management** — always revoke object URLs in the `useEffect` cleanup
6. ✅ **Unmount guard** — use an `isMounted` flag to prevent setting state after unmount
7. ✅ **Progress bars** — link `setProgress` directly into the `onProgress` callback