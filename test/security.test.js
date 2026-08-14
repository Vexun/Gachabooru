'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { securityHeaders, sanitizeHost } = require('../server/security');

function runMiddleware(headers) {
  const headersSet = {};
  const res = {
    setHeader(name, value) {
      headersSet[name] = value;
    },
  };
  let nextCalled = false;
  securityHeaders()({ headers }, res, () => {
    nextCalled = true;
  });
  return { headersSet, nextCalled };
}

test('reflects a valid host with port into the connect-src directive', () => {
  const { headersSet } = runMiddleware({ host: '127.0.0.1:3000' });
  assert.match(headersSet['Content-Security-Policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1:3000/);
});

test('reflects a valid hostname with port', () => {
  const { headersSet } = runMiddleware({ host: 'localhost:3000' });
  assert.match(headersSet['Content-Security-Policy'], /connect-src 'self' ws:\/\/localhost:3000/);
});

test('falls back to the default host when the Host header is missing', () => {
  const { headersSet } = runMiddleware({});
  assert.match(headersSet['Content-Security-Policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1/);
});

test('rejects a host that tries to inject CSP directives', () => {
  const { headersSet } = runMiddleware({ host: "evil.com; script-src 'unsafe-inline'" });
  assert.match(headersSet['Content-Security-Policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1/);
  assert.doesNotMatch(headersSet['Content-Security-Policy'], /unsafe-inline/);
});

test('rejects whitespace and empty hosts', () => {
  const spaced = runMiddleware({ host: '127.0.0.1:3000 ' }).headersSet;
  assert.match(spaced['Content-Security-Policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1/);

  const empty = runMiddleware({ host: '   ' }).headersSet;
  assert.match(empty['Content-Security-Policy'], /connect-src 'self' ws:\/\/127\.0\.0\.1/);
});

test('sets the companion security headers and calls next', () => {
  const { headersSet, nextCalled } = runMiddleware({ host: '127.0.0.1:3000' });
  assert.equal(headersSet['X-Content-Type-Options'], 'nosniff');
  assert.equal(headersSet['Referrer-Policy'], 'no-referrer');
  assert.equal(nextCalled, true);
});

test('sanitizeHost falls back to the default for invalid input', () => {
  assert.equal(sanitizeHost(undefined), '127.0.0.1');
  assert.equal(sanitizeHost(null), '127.0.0.1');
  assert.equal(sanitizeHost(''), '127.0.0.1');
  assert.equal(sanitizeHost('evil.com; x'), '127.0.0.1');
  assert.equal(sanitizeHost('a b'), '127.0.0.1');
  assert.equal(sanitizeHost('127.0.0.1:3000'), '127.0.0.1:3000');
});
