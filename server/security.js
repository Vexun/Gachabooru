'use strict';

function securityHeaders() {
  return (req, res, next) => {
    const host = req.headers.host || '127.0.0.1';
    const csp = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' https://cdn.donmai.us",
      `connect-src 'self' ws://${host}`,
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; ');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  };
}

module.exports = { securityHeaders };
