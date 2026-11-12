/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';

it('generates a directly addressable legal page with the built app shell and specific metadata', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bzead-delete-account-'));
  try {
    await writeFile(path.join(dir, 'index.html'), [
      '<meta name="description" content="Shop products from the BZEAD marketplace in the United Kingdom." />',
      '<title>BZEAD UK - United Kingdom Marketplace</title>',
      '<div id="root"></div><script src="/assets/app.js"></script>',
    ].join('\n'));
    execFileSync(process.execPath, ['scripts/generate-delete-account-page.mjs', dir]);
    const html = await readFile(path.join(dir, 'deleteaccount', 'index.html'), 'utf8');
    expect(html).toContain('<title>Delete Account Policy - BZEAD UK</title>');
    expect(html).toContain('Learn how to request deletion');
    expect(html).toContain('<div id="root"></div><script src="/assets/app.js"></script>');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('fails rather than generating incorrect metadata when the app shell changes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bzead-delete-account-'));
  try {
    await writeFile(path.join(dir, 'index.html'), '<div id="root"></div>');
    expect(() => execFileSync(process.execPath, ['scripts/generate-delete-account-page.mjs', dir], { stdio: 'pipe' }))
      .toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
