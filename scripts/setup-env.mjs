import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const template = await readFile(new URL('.env.example', root), 'utf8');
try {
  await writeFile(new URL('.env', root), template.replace('replace-with-a-random-secret', randomBytes(48).toString('hex')), {
    flag: 'wx', mode: 0o600,
  });
  console.log('Created .env with a private generated JWT secret.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Keeping the existing .env configuration.');
}
await mkdir(new URL('storage/uploads/', root), { recursive: true });
console.log('Configuration files are ready. Set MONGODB_URI in .env to your Atlas connection string before running db:check, seed or dev.');
