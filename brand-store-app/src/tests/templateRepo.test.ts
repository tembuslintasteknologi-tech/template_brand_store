import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Template repository structure and metadata check', () => {
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.strictEqual(pkg.name, 'brand-store-api');
  assert.ok(pkg.devDependencies['tsx'], 'tsx must be present');
  assert.ok(pkg.devDependencies['typescript'], 'typescript must be present');
  assert.ok(pkg.dependencies['hono'], 'hono must be present');
});
