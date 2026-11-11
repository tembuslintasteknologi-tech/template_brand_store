import test from 'node:test';
import assert from 'node:assert';
import {
  PRODUCT_IMPORT_COLUMNS,
  buildProductImportTemplate,
  normalizeImportRow,
  parseCsv,
  parseProductImport,
  validateImportRow,
} from '../services/catalog/bulkService.js';

test('parseCsv handles plain rows with CRLF and LF', () => {
  assert.deepStrictEqual(parseCsv('a,b\r\nc,d\r\n'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
  assert.deepStrictEqual(parseCsv('a,b\nc,d'), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('parseCsv keeps commas inside quoted fields', () => {
  assert.deepStrictEqual(parseCsv('"Kaos, Lengan Panjang",89000\n'), [['Kaos, Lengan Panjang', '89000']]);
});

test('parseCsv unescapes doubled quotes', () => {
  assert.deepStrictEqual(parseCsv('"Produk ""Premium""",1\n'), [['Produk "Premium"', '1']]);
});

test('parseCsv drops empty lines and strips the BOM', () => {
  const rows = parseCsv('\uFEFFtitle,slug\n\nKaos,kaos\n\n');
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0][0], 'title');
});

test('parseCsv preserves newlines inside quoted fields', () => {
  const rows = parseCsv('"baris satu\nbaris dua",x\n');
  assert.strictEqual(rows[0][0], 'baris satu\nbaris dua');
});

test('buildProductImportTemplate starts with the documented header', () => {
  const template = buildProductImportTemplate();
  const [header] = template.split('\r\n');
  assert.strictEqual(header, PRODUCT_IMPORT_COLUMNS.join(','));
  assert.ok(template.split('\r\n').length >= 2);
});

test('validateImportRow accepts a complete row', () => {
  const result = validateImportRow(
    {
      title: 'Kaos Katun Combed',
      slug: 'kaos-katun-combed',
      basePrice: '89000',
      stock: '25',
      status: 'published',
    },
    0
  );
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

test('validateImportRow reports every broken field with its row number', () => {
  const result = validateImportRow(
    { title: 'Ka', slug: 'Kaos Combed', basePrice: '-1', stock: '2.5', status: 'live' },
    2
  );
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.errors.length, 5);
  assert.ok(result.errors.every((error) => error.startsWith('baris 4:')));
});

test('validateImportRow rejects an over-long metaDescription', () => {
  const result = validateImportRow(
    {
      title: 'Kaos Katun',
      slug: 'kaos-katun',
      basePrice: '89000',
      stock: '1',
      status: 'draft',
      metaDescription: 'x'.repeat(401),
    },
    0
  );
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('metaDescription')));
});

test('normalizeImportRow converts types and splits images on pipe', () => {
  const row = normalizeImportRow({
    title: ' Kaos ',
    slug: 'kaos',
    basePrice: '89000',
    compareAtPrice: '120000',
    stock: '7',
    status: 'published',
    images: 'https://a/1.jpg | https://a/2.jpg',
  });
  assert.strictEqual(row.title, 'Kaos');
  assert.strictEqual(row.basePrice, 89000);
  assert.strictEqual(row.compareAtPrice, 120000);
  assert.strictEqual(row.stock, 7);
  assert.deepStrictEqual(row.images, ['https://a/1.jpg', 'https://a/2.jpg']);
});

test('parseProductImport reports missing required header columns', () => {
  const parsed = parseProductImport('title,slug\nKaos,kaos\n');
  assert.deepStrictEqual(parsed.rows, []);
  assert.ok(parsed.headerErrors.some((error) => error.includes('basePrice')));
  assert.ok(parsed.headerErrors.some((error) => error.includes('stock')));
});

test('parseProductImport maps cells to header keys and collects row errors', () => {
  const parsed = parseProductImport(
    'title,slug,basePrice,stock,status\nKaos,kaos,89000,10,published\nX,Kaos Salah,-5,abc,zzz\n'
  );
  assert.strictEqual(parsed.headerErrors.length, 0);
  assert.strictEqual(parsed.rows.length, 2);
  assert.strictEqual(parsed.rows[0].errors.length, 0);
  assert.strictEqual(parsed.rows[0].raw.title, 'Kaos');
  assert.ok(parsed.rows[1].errors.length >= 3);
  assert.strictEqual(parsed.errors.length, parsed.rows[1].errors.length);
});

test('parseProductImport flags an empty file', () => {
  const parsed = parseProductImport('   ');
  assert.strictEqual(parsed.rows.length, 0);
  assert.deepStrictEqual(parsed.headerErrors, ['File kosong']);
});
