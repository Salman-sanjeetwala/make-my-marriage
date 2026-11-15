import assert from 'node:assert/strict';

const webOrigin = process.env.SMOKE_WEB_ORIGIN ?? 'http://localhost:4200';
const apiOrigin = process.env.SMOKE_API_ORIGIN ?? 'http://127.0.0.1:3000';

for (const origin of [apiOrigin, webOrigin]) {
  const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `Health failed at ${origin}`);
  assert.deepEqual(await response.json(), { data: { status: 'ok' } });
  const missing = await fetch(`${origin}/api/not-a-route`, { signal: AbortSignal.timeout(10000) });
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type'), /application\/json/);
  console.log(`PASS health and API 404: ${origin}`);
}

const page = await fetch(webOrigin, { signal: AbortSignal.timeout(10000) });
assert.equal(page.status, 200);
assert.match(await page.text(), /<mmm-root>/);
console.log('PASS Angular document and development proxy');
