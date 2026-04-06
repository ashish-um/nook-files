import { describe, it, expect } from "vitest";
import { buildBinaryMultipartBody } from "../src/utils/buildMultipartBody.js";

describe("buildBinaryMultipartBody", () => {
  it("should construct a valid Uint8Array multipart body and assign correct mime types", async () => {
    const metadata = { name: "test.png", parents: ["appDataFolder"] };
    const blobContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const blob = new Blob([blobContent], { type: "image/png" });

    const { body, contentType } = await buildBinaryMultipartBody(metadata, blob);

    expect(contentType).toMatch(/^multipart\/related; boundary=nook_files_boundary_\d+$/);

    // Convert body back to string to check headers
    const textDecoder = new TextDecoder();
    const bodyStr = textDecoder.decode(body);

    const boundary = contentType.split("=")[1];
    
    // Check metadata part
    expect(bodyStr).toContain(`--${boundary}\r\nContent-Type: application/json\r\n\r\n`);
    expect(bodyStr).toContain(JSON.stringify(metadata));

    // Check optional mime type extraction
    expect(bodyStr).toContain(`--${boundary}\r\nContent-Type: image/png\r\n\r\n`);
    
    // Check closing boundary
    expect(bodyStr).toContain(`\r\n--${boundary}--`);

    // Verify blob data was set properly in the array (checking buffer size is usually sufficient to prove it didn't just serialize to '[object Blob]')
    expect(body.length).toBeGreaterThan(bodyStr.indexOf("image/png") + blobContent.length);
  });

  it("should fallback to application/octet-stream if blob type is empty", async () => {
    const metadata = { name: "raw.dat" };
    const blob = new Blob([new Uint8Array([0x01, 0x02])]); // No type

    const { body, contentType } = await buildBinaryMultipartBody(metadata, blob);
    const bodyStr = new TextDecoder().decode(body);
    const boundary = contentType.split("=")[1];

    expect(bodyStr).toContain(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`);
  });
});
