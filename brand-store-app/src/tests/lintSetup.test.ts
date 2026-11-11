import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('ESLint and Prettier setup check', () => {
  const baseDir = process.cwd();
  assert.ok(fs.existsSync(path.resolve(baseDir, '.prettierrc')), '.prettierrc must exist');
  assert.ok(
    fs.existsSync(path.resolve(baseDir, 'eslint.config.js')),
    'eslint.config.js must exist'
  );

  const pkg = JSON.parse(fs.readFileSync(path.resolve(baseDir, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies['eslint'], 'eslint devDependency must be present');
  assert.ok(
    fs.existsSync(path.resolve(baseDir, '.git/hooks')) ||
      fs.existsSync(path.resolve(baseDir, '../.git/hooks')),
    'git hooks dir must exist'
  );
});
