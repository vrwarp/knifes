import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The data directory vitest.config.ts points every test at; removed when the run ends.
export default function setup(): () => void {
  const dir = path.join(os.tmpdir(), `s30-vitest-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  return () => fs.rmSync(dir, { recursive: true, force: true });
}
