const express = require('express');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const register = new client.Registry();
client.collectDefaultMetrics({ register });

app.get('/health', (req, res) => res.json({ status: 'ok' }));

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

const port = process.env.PORT || 5002;
app.listen(port, () => {
  console.log(`orders-service listening on port ${port}`);
});
