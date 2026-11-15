import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApplication } from '../dist/application.js';
import { readEnvironment } from '../dist/config/environment.js';

let app;
let origin;

before(async () => {
  app = await createApplication();
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
});

after(async () => {
  await app?.close();
});

test('health works without service credentials and returns the API envelope', async () => {
  const response = await fetch(`${origin}/api/health`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { data: { status: 'ok' } });
});

test('unknown API routes return JSON 404 rather than frontend HTML', async () => {
  const response = await fetch(`${origin}/api/not-a-route`);
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
});

test('configuration defaults need no credentials and reject invalid values safely', () => {
  assert.deepEqual(readEnvironment({}), { NODE_ENV: 'development', PORT: 3000 });
  assert.equal(readEnvironment({ PORT: '3100' }).PORT, 3100);
  for (const PORT of ['', '0', '65536', '3.5', 'secret-value']) {
    assert.throws(() => readEnvironment({ PORT }), {
      message: 'Invalid server configuration: PORT',
    });
  }
  assert.throws(() => readEnvironment({ NODE_ENV: 'invalid' }), /NODE_ENV/);
});
