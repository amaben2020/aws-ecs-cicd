import express from 'express';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { db } from './db/index.ts';
import { documents, follows, posts, users } from './db/schema/schema.ts';
import { desc, eq, inArray } from 'drizzle-orm';
import { expensiveHash } from './utils/long-running.ts';
import helmet from 'helmet';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// deliberately expensive: exponential-time recursive fib, blocks the event loop
function fib(n: number): number {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

// instantiate express
const app = express();

app.use((req, res, next) => {
  //@ts-ignore
  req.userId = 4;
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com', // allow scripts from this CDN
          "'unsafe-inline'", // only if you truly need inline <script> — avoid if possible
        ],
        styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://api.myservice.com'], // for fetch/XHR/WebSocket calls
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);

app.get('/users', async (req, res) => {
  try {
    // // 1. Insert (Create)
    // await db
    //   .insert(users)
    //   .values({ name: 'Alice', email: 'alice2@example.com' });

    // 2. Select (Read)
    const allUsers = await db.select().from(users);

    return res.json({
      allUsers,
    });
  } catch (error) {
    console.log(error);
  }
});

app.post('/users', async (req, res) => {
  try {
    // 1. Insert (Create)
    const user = await db
      .insert(users)
      .values({ username: 'Alice', email: 'alice@example.com' })
      .returning();

    return res.json({
      message: user,
    });
  } catch (error) {
    console.log(error);
  }
});

app.post('/follows/:id', async (req, res) => {
  const userToFollow = Number(req.params.id);
  //@ts-ignore
  const currentUserId = req?.userId || 1; // assume auth middleware sets this

  if (!currentUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (currentUserId === userToFollow) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }

  try {
    const followUser = await db.insert(follows).values({
      followerId: currentUserId, // the person doing the following
      followedId: userToFollow, // the person being followed
    });
    return res.status(201).json(followUser);
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: 'Failed to follow user' });
  }
});

app.get('/feed', async (req, res) => {
  try {
    //@ts-ignore
    const pageSize = Number(req.query.pageSize) || 5;
    //@ts-ignore
    const page = Number(req.query.page) || 1;

    if (page < 1) {
      throw new Error('Page  cannot be 0 you start reading from page 1');
    }
    console.log(page, pageSize);
    const followsIds = await db
      .select({ id: follows.followedId })
      .from(follows)
      //@ts-ignore
      .where(eq(follows.followerId, req.userId));

    const followsUsersIds = followsIds.map((elem) => elem.id);

    if (!followsUsersIds.length) {
      return res.status(200).json({ feed: [] });
    }

    // todo: cache request with TTL strategy

    const userFeed = await db
      .select({
        postId: posts.id,
        content: posts.content,
        imageUrl: posts.imageUrl,
        createdAt: posts.createdAt,
        authorId: users.id,
        authorUsername: users.username,
      })
      .from(posts)
      .leftJoin(users, eq(users.id, posts.userId))
      .where(inArray(posts.userId, followsUsersIds))
      .orderBy(desc(posts.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return res.status(200).json({
      feed: userFeed,
    });
  } catch (error) {
    console.log(error);

    return res.status(500).json({ message: 'Failed to load feed' });
  }
});
// cheap route to prove whether the event loop is free to respond
app.get('/ping', (req, res) => {
  res.json({ pid: process.pid, time: Date.now() });
});

// runs the heavy computation directly on the main thread — blocks the event loop
app.get('/blocking', (req, res) => {
  const n = Number(req.query.n) || 40;
  const start = Date.now();
  const result = fib(n);
  res.json({
    result,
    ms: Date.now() - start,
    pid: process.pid,
    mode: 'blocking',
  });
});

// offloads the same computation to a worker_threads Worker — event loop stays free
app.get('/worker-offload', (req, res) => {
  const n = Number(req.query.n) || 40;
  const start = Date.now();
  const worker = new Worker(path.join(__dirname, 'workers/fib-worker.ts'), {
    workerData: { n },
    execArgv: ['--import', 'tsx'],
  });
  worker.once('message', (result) => {
    res.json({
      result,
      ms: Date.now() - start,
      pid: process.pid,
      mode: 'worker-offload',
    });
  });
  worker.once('error', (err: Error) => {
    res.status(500).json({ error: err.message });
  });
});

// before WITHOUT WORKER THREAD:  synchronous
// app.get('/hash', (req, res) => {
//   const result = expensiveHash(req.query.data);
//   res.json({ result });
// });

function runWorker(data: any) {
  console.log('DATA ===>', data);
  return new Promise((resolve, reject) => {
    // point to the worker code filepath
    const worker = new Worker(path.resolve(__dirname, 'utils/worker.js'), {
      workerData: data,
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with code ${code}`));
    });
  });
}

// MULTER AND PDF UPLOAD SECTION

// Configure multer to store files in memory as a Buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

interface FileWorkerResult {
  fileName: string;
  size: number;
  sha256: string;
  threadId: number;
}

// The Offloader Function
function processFileInWorker(
  fileBuffer: Buffer,
  fileName: string,
): Promise<FileWorkerResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.resolve(__dirname, 'workers/file-worker.ts'),
      {
        workerData: {
          buffer: fileBuffer,
          fileName: fileName,
        },
        execArgv: ['--import', 'tsx'], // Crucial for parsing TypeScript inside the worker
      },
    );

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with code ${code}`));
    });
  });
}

// 🚀 REAL-WORLD WORKER ROUTE: Heavy File Processing
app.post('/upload-document', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a file.' });
    }

    console.log(
      `[Main] Received ${req.file.originalname} (${req.file.size} bytes). Offloading to worker...`,
    );
    const startTime = Date.now();

    // Pass the file buffer to the worker thread — CPU-heavy hashing happens off the main thread
    const result = await processFileInWorker(
      req.file.buffer,
      req.file.originalname,
    );

    // DB write happens back on the main thread: it's I/O-bound (network round trip to Neon),
    // not CPU-bound, so there's nothing to gain from doing it inside the worker — and the
    // worker doesn't have access to `db` anyway, since threads don't share memory/connections.
    const [saved] = await db
      .insert(documents)
      .values({
        fileName: result.fileName,
        mimeType: req.file.mimetype,
        size: result.size,
        sha256: result.sha256,
        data: req.file.buffer,
      })
      .returning({ id: documents.id, createdAt: documents.createdAt });

    return res.json({
      message: 'File processed and stored',
      durationMs: Date.now() - startTime,
      workerResult: result,
      document: saved,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

///

app.get('/hash', async (req, res) => {
  const result = await runWorker(req.query.data);
  res.json({ result });
});

const server = app.listen(5500, () => {
  console.log('yeah');
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');

  server.close(() => {
    console.log('HTTP server closed — no more requests being accepted');
    // close DB connections, Redis clients, etc. here
    process.exit(0);
  });

  // safety net: force-exit if graceful shutdown takes too long
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});
