'use strict';

function createRateLimiter(opts = {}) {
  const windowMs = opts.windowMs ?? 10000;
  const max = opts.max ?? 120;
  const now = opts.now || Date.now;
  const exemptPaths = opts.exemptPaths || ['/health'];

  let windowStart = now();
  let count = 0;

  return function rateLimit(req, res, next) {
    if (exemptPaths.includes(req.path)) {
      return next();
    }
    const t = now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    if (count > max) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (t - windowStart)) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'rate limit exceeded' });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
