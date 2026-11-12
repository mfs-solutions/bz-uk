#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist-buyer');
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const title = '<title>BZEAD UK - United Kingdom Marketplace</title>';
const description = 'Shop products from the BZEAD marketplace in the United Kingdom.';
if (!html.includes(title) || !html.includes(description)) {
  throw new Error('Built app shell is missing the expected title or description');
}
const page = html
  .replace(title, '<title>Delete Account Policy - BZEAD UK</title>')
  .replace(
    description,
    'Learn how to request deletion of your BZEAD account and personal data.',
  );
const destination = path.join(dist, 'deleteaccount');
await mkdir(destination, { recursive: true });
await writeFile(path.join(destination, 'index.html'), page, 'utf8');
console.log('[legal-page] Generated deleteaccount/index.html');
