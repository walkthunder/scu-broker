export class TestError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.meta = meta;
  }
}

export function assert(cond, message, meta) {
  if (!cond) throw new TestError(message, meta);
}

export function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new TestError(message || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`, {
      actual,
      expected,
    });
  }
}

export function assertOk(res, message) {
  assert(res.json?.code === 0, message || `API error: ${res.json?.message || res.status}`, {
    status: res.status,
    body: res.json,
  });
}

export function assertFail(res, message) {
  assert(res.json?.code !== 0 || !res.ok, message || 'expected failure', { body: res.json });
}
