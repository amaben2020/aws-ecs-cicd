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

app.get('/orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, user_id, item, quantity, status, created_at FROM orders ORDER BY id',
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/orders/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, user_id, item, quantity, status, created_at FROM orders WHERE id = $1',
      [req.params.id],
    );
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.post('/orders', async (req, res) => {
  const { user_id, item, quantity } = req.body;
  if (!user_id || !item) {
    return res.status(400).json({ error: 'user_id and item are required' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO orders (user_id, item, quantity) VALUES ($1, $2, $3) RETURNING id, user_id, item, quantity, status, created_at',
      [user_id, item, quantity || 1],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`orders-service listening on port ${port}`);
});
