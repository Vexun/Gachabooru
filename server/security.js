'use strict';

const DEFAULT_HOST = '127.0.0.1';

// Only hostname[:port] is safe to reflect into the CSP. Reject everything
// else (newlines, semicolons, spaces) so the Host header cannot inject
// directives.
const HOST_PATTERN = /^[a-zA-Z0-9.-]+(:\d+)?$/;

function sanitizeHost(raw) {
  const host = String(raw || '').trim();
  return HOST_PATTERN.test(host) ? host : DEFAULT_HOST;
}

function securityHeaders() {
  return (req, res, next) => {
    const host = sanitizeHost(req.headers && req.headers.host);
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

module.exports = { securityHeaders, sanitizeHost };
