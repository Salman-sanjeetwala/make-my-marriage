import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ConfigurationError } from '../dist/config/environment.js';
import { startupErrorMessage } from '../dist/config/startup-error.js';

const run = promisify(execFile);
const entry = fileURLToPath(new URL('../dist/main.js', import.meta.url));

test('invalid configuration exits with a field-specific diagnostic and no secret values', async () => {
  await assert.rejects(
    run(process.execPath, [entry], {
      env: { ...process.env, PORT: 'private-port-value', NODE_ENV: 'private-mode-value' },
      timeout: 10000,
    }),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /Invalid server configuration: NODE_ENV, PORT/);
      assert.doesNotMatch(error.stderr, /private-port-value|private-mode-value/);
      return true;
    },
  );
});

test('an occupied port exits with EADDRINUSE and an actionable diagnostic', async () => {
  const occupied = createServer();
  await new Promise((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(0, '127.0.0.1', resolve);
  });
  try {
    await assert.rejects(
      run(process.execPath, [entry], {
        env: { ...process.env, PORT: String(occupied.address().port), NODE_ENV: 'test' },
        timeout: 10000,
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /EADDRINUSE: API port is already in use/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve, reject) =>
      occupied.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('startup diagnostics retain safe fields and known codes without echoing arbitrary errors', () => {
  assert.match(startupErrorMessage(new ConfigurationError(['PORT'])), /configuration: PORT/);
  for (const code of ['EADDRINUSE', 'EACCES', 'EPERM', 'ENOENT']) {
    const message = startupErrorMessage(Object.assign(new Error('secret-value'), { code }));
    assert.ok(message.includes(code));
    assert.ok(!message.includes('secret-value'));
  }
  for (const error of [new Error('secret-value'), { code: 'secret-value' }, 'secret-value', null]) {
    assert.equal(
      startupErrorMessage(error),
      'Unexpected startup error. Check server configuration and build output.',
    );
  }
});
