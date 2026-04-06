import type { UploadProgress } from "../types.js";

/**
 * Constructs a multipart/related body containing JSON metadata and binary blob data.
 *
 * Unlike nook's string-based multipart body, this uses Uint8Array concatenation
 * to avoid corrupting binary data. The MIME type is read directly from the Blob.
 */
export async function buildBinaryMultipartBody(
  metadata: Record<string, unknown>,
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

  const totalLength =
    metaBytes.length + headerBytes.length + binaryBytes.length + closingBytes.length;
  const body = new Uint8Array(totalLength);

  let offset = 0;
  for (const part of [metaBytes, headerBytes, binaryBytes, closingBytes]) {
    body.set(part, offset);
    offset += part.length;
  }

  return { body, contentType: `multipart/related; boundary=${boundary}` };
}
