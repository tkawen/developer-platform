// Refuses to publish while @tkawen/os-sdk (or any dependency) points at a local path.
// Publish @tkawen/os-sdk first, then keep "@tkawen/os-sdk" on a registry range (currently "^0.2.0").
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const local = Object.entries(pkg.dependencies ?? {}).filter(([, v]) => /^(file|link|workspace):/.test(String(v)));
if (local.length) {
  console.error(`Refusing to publish: local dependencies ${local.map(([k, v]) => `${k}@${v}`).join(', ')}.`);
  process.exit(1);
}
