const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

new client.Gauge({
  name: 'pg_pool_total_count',
  help: 'Total number of clients in the pg pool',
  registers: [register],
  collect() {
    this.set(pool.totalCount);
  },
});

new client.Gauge({
  name: 'pg_pool_idle_count',
  help: 'Number of idle clients in the pg pool',
  registers: [register],
  collect() {
    this.set(pool.idleCount);
  },
});

new client.Gauge({
  name: 'pg_pool_waiting_count',
  help: 'Number of queued requests waiting for a client',
  registers: [register],
  collect() {
    this.set(pool.waitingCount);
  },
});

// RED metrics (Rate, Errors, Duration) for every request except the scrape endpoint itself
app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: 'error', error: 'database unreachable' });
  }
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.get('/users', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, created_at FROM users ORDER BY id',
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/users/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.post('/users', async (req, res) => {
  const { username, email } = req.body;
  if (!username || !email) {
    return res.status(400).json({ error: 'username and email are required' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, email) VALUES ($1, $2) RETURNING id, username, email, created_at',
      [username, email],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`users-service listening on port ${port}`);
});
