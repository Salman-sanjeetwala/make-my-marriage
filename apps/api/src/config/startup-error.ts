import { ConfigurationError } from './environment.js';

export function startupErrorMessage(error: unknown): string {
  if (error instanceof ConfigurationError) return error.message;

  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  switch (code) {
    case 'EADDRINUSE':
      return 'EADDRINUSE: API port is already in use. Stop the other server or change PORT.';
    case 'EACCES':
    case 'EPERM':
      return `${code}: Permission denied. Check local environment-file and listening-port permissions.`;
    case 'ENOENT':
      return 'ENOENT: A startup file is missing. Check the local environment file and build output.';
    default:
      // Unknown error messages, paths, and stacks may contain secrets.
      return 'Unexpected startup error. Check server configuration and build output.';
  }
}
