const cors = require('cors');

function buildCorsOptions(config) {
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const error = new Error('CORS origin is not allowed');
      error.statusCode = 403;
      return callback(error);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Request-Id'],
    maxAge: 600,
  };
}

function securityHeaders(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
}

function requestId(req, res, next) {
  const inbound = req.get('X-Request-Id');
  req.requestId = inbound && inbound.length <= 80
    ? inbound
    : `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

function createRateLimiter(config) {
  const windowMs = config.rateLimitWindowMs;
  const maxRequests = config.rateLimitMaxRequests;
  const buckets = new Map();

  return function rateLimiter(req, res, next) {
    if (maxRequests === 0 || ['/health', '/readiness', '/sse'].includes(req.path)) return next();

    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${ip}:${req.path}`;
    const current = buckets.get(key);
    const bucket = current && current.resetAt > now
      ? current
      : { count: 0, resetAt: now + windowMs };

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        success: false,
        error: '请求过于频繁，请稍后再试',
        code: 'RATE_LIMITED',
        retryAfter,
        requestId: req.requestId,
      });
    }

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - bucket.count)));

    if (buckets.size > 10000) {
      for (const [bucketKey, value] of buckets.entries()) {
        if (value.resetAt <= now) buckets.delete(bucketKey);
      }
    }

    return next();
  };
}

function applySecurity(app, config) {
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(securityHeaders);
  app.use(cors(buildCorsOptions(config)));
  app.use('/api', createRateLimiter(config));
}

module.exports = {
  applySecurity,
  buildCorsOptions,
  createRateLimiter,
  securityHeaders,
};
