import { parentPort, workerData, threadId } from 'node:worker_threads';
import { createHash } from 'node:crypto';

const { buffer, fileName } = workerData;
const data = Buffer.from(buffer);

// simulate real document processing (OCR / virus scan / thumbnailing) being CPU-heavy —
// a single sha256 of a small file is sub-millisecond and proves nothing on its own
let hash = '';
const rounds = 500_000;
for (let i = 0; i < rounds; i++) {
  hash = createHash('sha256').update(data).update(hash).digest('hex');
}

parentPort?.postMessage({
  fileName,
  size: data.length,
  sha256: hash,
  threadId, // nonzero here proves this ran off the main thread (main thread's threadId is 0)
});
