import { copyFileSync, mkdirSync, constants } from 'node:fs';
const root = new URL('../', import.meta.url);
mkdirSync(new URL('.openai/', root), { recursive: true });
try {
  copyFileSync(new URL('config/hosting.local.example.json', root), new URL('.openai/hosting.json', root), constants.COPYFILE_EXCL);
  console.log('Created local-only .openai/hosting.json. Existing deployment settings are never overwritten.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing .openai/hosting.json retained.');
}
