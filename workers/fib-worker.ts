import { parentPort, workerData } from 'node:worker_threads';

function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

const result = fib(workerData.n);
parentPort?.postMessage(result);
