import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Integration Guide §1.3 folder structure verification', () => {
  const baseDir = process.cwd();
  const requiredPaths = [
    'src/index.ts',
    'src/app.ts',
    'src/config/unifiedConfig.ts',
    'src/db/schema.ts',
    'src/middleware/auth.ts',
    'src/middleware/security.ts',
    'src/routes/auth.ts',
    'src/routes/products.ts',
    'src/routes/orders.ts',
    'src/routes/promos.ts',
    'src/routes/analytics.ts',
    'src/services/tokenService.ts',
    'src/services/loginGuard.ts',
  ];

  for (const relPath of requiredPaths) {
    const fullPath = path.resolve(baseDir, relPath);
    assert.ok(fs.existsSync(fullPath), `Required path must exist: ${relPath}`);
  }
});
