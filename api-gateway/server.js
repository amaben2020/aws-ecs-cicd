const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const client = require('prom-client');

const app = express();
app.use(helmet());

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  // Buckets must bracket the latency you actually serve, with the most
  // resolution where your traffic and SLOs live. These start at 0.5ms because
  // p50 here is ~1.5ms; the old set started at 10ms, so 99.96% of requests fell
  // into the first bucket and histogram_quantile could only interpolate,
  // reporting a fabricated p50 of exactly 5ms and p95 of exactly 9.5ms.
  // 0.1 and 0.5 are exact boundaries so latency SLOs at 100ms/500ms can be
  // computed without interpolation error. Cost: one time series per bucket per
  // label combination.
  buckets: [
    0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025,
    0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
  ],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// RED metrics for every request except the scrape endpoint itself.
// req.baseUrl reflects the mounted proxy path ('/users', '/orders') once routing
// has happened, keeping the route label low-cardinality instead of per-id paths.
app.use((req, res, next) => {
  if (req.path === '/metrics') return next();
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = req.baseUrl || req.path;
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

function requireApiKey(req, res, next) {
  const key = req.get('x-api-key');
  if (!key || key !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
}
app.use(requireApiKey);

// Express strips the mount path ('/users', '/orders') from req.url before the proxy
// sees it, so without pathRewrite every proxied request would hit the backend's '/'.
// req.originalUrl still has the full path, so use that as the forwarded path.
app.use(
  '/users',
  createProxyMiddleware({
    target: process.env.USERS_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path, req) => req.originalUrl,
  }),
);

app.use(
  '/orders',
  createProxyMiddleware({
    target: process.env.ORDERS_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path, req) => req.originalUrl,
  }),
);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`api-gateway listening on port ${port}`);
});
