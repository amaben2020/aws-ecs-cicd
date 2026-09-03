// worker.js
import { parentPort, workerData } from 'node:worker_threads';

function expensiveHash(data) {
  let result = 0;
  for (let i = 0; i < 5_000_000_000; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

const result = expensiveHash(workerData);
parentPort.postMessage(result); // send result back to main thread
