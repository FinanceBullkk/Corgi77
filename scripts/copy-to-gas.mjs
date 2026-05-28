import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'dist/index.html');
const dst = resolve(root, 'gas/index.html');

if (!existsSync(src)) {
  console.error('[copy-to-gas] dist/index.html không tồn tại. Chạy `npm run build` trước.');
  process.exit(1);
}

mkdirSync(dirname(dst), { recursive: true });
copyFileSync(src, dst);
console.log(`[copy-to-gas] Đã copy ${src} → ${dst}`);
