'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createRateLimiter } = require('../server/rate-limit');

function call(limiter, path = '/balance') {
  return new Promise((resolve) => {
    let status = null;
    let body = null;
    let retryAfter = null;
    let passed = false;
    const done = () => resolve({ status, body, retryAfter, passed });
    const req = { path };
    const res = {
      setHeader: (name, value) => {
        if (name === 'Retry-After') {
          retryAfter = value;
        }
      },
      status: (code) => {
        status = code;
        return res;
      },
      json: (payload) => {
        body = payload;
        done();
        return res;
      },
    };
    limiter(req, res, () => {
      passed = true;
      done();
    });
  });
}

test('passes requests under the limit', async () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  for (let i = 0; i < 3; i++) {
    const result = await call(limiter);
    assert.equal(result.passed, true);
  }
});

test('returns 429 with Retry-After over the limit', async () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 3 });
  for (let i = 0; i < 3; i++) {
    await call(limiter);
  }
  const blocked = await call(limiter);
  assert.equal(blocked.passed, false);
  assert.equal(blocked.status, 429);
  assert.deepEqual(blocked.body, { error: 'rate limit exceeded' });
  assert.ok(Number(blocked.retryAfter) >= 1);
});

test('the window resets and lets requests through again', async () => {
  let t = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => t });
  for (let i = 0; i < 4; i++) {
    await call(limiter);
  }
  assert.equal((await call(limiter)).passed, false);

  t = 1000;
  assert.equal((await call(limiter)).passed, true);
});

test('exempt paths are never blocked', async () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, exemptPaths: ['/health'] });
  for (let i = 0; i < 10; i++) {
    const result = await call(limiter, '/health');
    assert.equal(result.passed, true);
  }
});
