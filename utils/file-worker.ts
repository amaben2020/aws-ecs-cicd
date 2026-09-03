import { parentPort, workerData } from 'node:worker_threads';
import crypto from 'node:crypto';

// 1. Destructure the file data passed from the main thread
const { buffer, fileName } = workerData;

// Note: Node.js worker_threads automatically clone Buffers efficiently
// into Uint8Arrays when passed via workerData.
const fileUint8Array = new Uint8Array(buffer);

console.log(`[Worker] Started processing ${fileName}...`);

// 2. Simulate Heavy CPU bound work (e.g., parsing, scanning, or processing every byte)
let totalByteSum = 0;
let complexHash = '';

// Loop through the data multiple times to simulate heavy document processing/OCR parsing
for (let pass = 0; pass < 50; pass++) {
  for (let i = 0; i < fileUint8Array.length; i++) {
    totalByteSum += fileUint8Array[i];
  }
  // Simulate computationally expensive processing chunk hashing
  complexHash = crypto
    .createHash('sha256')
    .update(fileUint8Array)
    .digest('hex');
}

// 3. Send back structural metadata generated from the heavy analysis
parentPort?.postMessage({
  processedName: `processed_${fileName}`,
  byteLength: fileUint8Array.length,
  checksum: complexHash,
  calculatedMetric: totalByteSum,
});
