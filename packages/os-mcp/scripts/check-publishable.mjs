// Refuses to publish while @tkawen/os-sdk (or any dependency) points at a local path.
// Before the first publish: publish @tkawen/os-sdk, then set "@tkawen/os-sdk": "^0.1.0".
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const local = Object.entries(pkg.dependencies ?? {}).filter(([, v]) => /^(file|link|workspace):/.test(String(v)));
if (local.length) {
  console.error(`Refusing to publish: local dependencies ${local.map(([k, v]) => `${k}@${v}`).join(', ')}.`);
  process.exit(1);
}
