// Printer Master (View/Settings/PrinterForm.aspx): the original page's code-behind, ported (registered in registry.js).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PAGE_INIT } from '../registry.js';

const run = promisify(execFile);

/** AU.FillServerPrinterList: "" then the printers installed on the web server (Windows only). */
async function serverPrinters() {
  if (process.platform !== 'win32') return [];
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Drawing; [System.Drawing.Printing.PrinterSettings]::InstalledPrinters'], { windowsHide: true });
  return stdout.split(/\r?\n/).filter((x) => x.trim() !== '');
}

Object.assign(PAGE_INIT, {
  'View/Settings/PrinterForm.aspx': async (controls) => {
    const ddl = controls.find((c) => c.id === 'DDLDriver');
    if (ddl) ddl.options = [{ value: '', text: '' }, ...(await serverPrinters().catch(() => [])).map((p) => ({ value: p, text: p }))];
  },
});
