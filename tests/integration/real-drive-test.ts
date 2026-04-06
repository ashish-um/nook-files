import { DriveFiles } from "../../src/DriveFiles.js";
import { config } from "dotenv";
import fs from "fs";
// @ts-ignore
import XMLHttpRequest from "xhr2";

// Polyfill XHR for Node.js test environment
(global as any).XMLHttpRequest = XMLHttpRequest;

config();

const token = process.env.TEST_GOOGLE_TOKEN;
if (!token) {
  console.error("No TEST_GOOGLE_TOKEN found in .env");
  process.exit(1);
}

// Ensure img.jpg exists for the test
if (!fs.existsSync("img.jpg")) {
  console.error("img.jpg not found in the root directory. Please provide a small image file.");
  process.exit(1);
}

async function run() {
  const files = new DriveFiles(token!);
  const name = `nf-test-${Date.now()}.jpg`;

  console.log(`Testing with default appDataFolder`);

  console.log(`\n--- 1. Read binary file from disk ---`);
  const buffer = fs.readFileSync("img.jpg");
  // In Node.js, we mock a Blob
  const blob = new Blob([buffer], { type: "image/jpeg" });
  console.log(`Read ${buffer.length} bytes for ${name}`);

  console.log(`\n--- 2. create() ${name} ---`);
  const created = await files.create(name, blob, {
    onProgress: (p) => console.log(`  Upload progress: ${p.percent}%`)
  });
  console.log("Created metadata:", created);

  console.log(`\n--- 3. create() identical name (should fail) ---`);
  try {
    await files.create(name, blob);
    console.error("ERROR: create should have thrown ALREADY_EXISTS!");
  } catch (err: any) {
    console.log(`Expected error: code=${err.code}, message=${err.message}`);
  }

  console.log(`\n--- 4. read() ${name} ---`);
  const downloadedBlob = await files.read(name);
  console.log(`Downloaded Blob: size=${downloadedBlob.size}, type=${downloadedBlob.type}`);
  
  if (downloadedBlob.size !== blob.size) {
    console.error("ERROR: Downloaded size does not match uploaded size!");
  } else {
    console.log("Size match OK.");
  }

  console.log(`\n--- 5. update() ${name} ---`);
  const updated = await files.update(name, blob, {
    onProgress: (p) => console.log(`  Update progress: ${p.percent}%`)
  });
  console.log("Updated metadata:", updated);

  console.log(`\n--- 6. list() ---`);
  const list = await files.list(`nf-test-`);
  console.log(`Found ${list.length} test files`);

  console.log(`\n--- 7. delete() ${name} ---`);
  await files.delete(name);
  console.log("Deleted successfully.");

  console.log(`\n--- 8. read() after delete (should fail) ---`);
  try {
    await files.read(name);
    console.error("ERROR: read should have thrown NOT_FOUND!");
  } catch (err: any) {
    console.log(`Expected error: code=${err.code}, message=${err.message}`);
  }

  console.log("\nAll integration tests passed!");
}

run().catch(err => {
  console.error("Test failed with unhandled error:", err);
  process.exit(1);
});
