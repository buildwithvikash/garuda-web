// The server log: console, and LOG_FILE when it is set.
import { appendFile } from 'node:fs';
import { config } from './env.js';

/** console, and the log file when LOG_FILE is set (a failed write never breaks a request) */
export function log(level, line) {
  const text = `${new Date().toISOString()} ${level.toUpperCase()} ${line}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(text);
  if (config.logFile) appendFile(config.logFile, `${text}\n`, () => {});
}
