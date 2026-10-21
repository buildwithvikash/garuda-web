// npm run dev: API (server, --watch) and Vite (client) side by side on any OS; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const kids = ['server', 'client'].map((ws) => spawn('npm', ['run', 'dev', '-w', ws], { stdio: 'inherit', shell: true }));
const stop = () => kids.forEach((k) => k.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
kids.forEach((k) => k.on('exit', (code) => code && (stop(), process.exit(code))));
