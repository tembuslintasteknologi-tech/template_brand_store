import test from 'node:test';
import assert from 'node:assert';
import {
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  buildPageSeo,
  buildProductSeo,
  clampText,
  seoWarnings,
  slugify,
  stripHtml,
} from '../services/catalog/seoService.js';

test('slugify lowercases, strips accents and collapses separators', () => {
  assert.strictEqual(slugify('Kaos Katun Combed!'), 'kaos-katun-combed');
  assert.strictEqual(slugify('Café Crème 50%'), 'cafe-creme-50');
  assert.strictEqual(slugify('  --Sudah--Rapi--  '), 'sudah-rapi');
  assert.strictEqual(slugify(''), '');
});

test('clampText normalises whitespace and appends an ellipsis when cut', () => {
  assert.strictEqual(clampText('  kaos   katun  ', 20), 'kaos katun');
  assert.strictEqual(clampText('hello world', 5), 'hell…');
  assert.strictEqual(clampText(null, 10), '');
  assert.strictEqual(clampText('a'.repeat(200), 10).length, 10);
});

test('clampText prefers a word boundary when one is close enough', () => {
  const input = 'Beli kaos katun combed premium untuk kerja harian';
  const output = clampText(input, 30);
  assert.ok(output.endsWith('…'));
  assert.ok(output.length <= 30);
  assert.ok(!output.includes('premi…'));
});

test('stripHtml removes tags and keeps the words', () => {
  assert.strictEqual(stripHtml('<p>Halo <b>dunia</b></p>'), 'Halo dunia');
  assert.strictEqual(stripHtml(null), '');
});

test('buildProductSeo derives meta tags from a plain product', () => {
  const seo = buildProductSeo({
    title: 'Kaos Katun Combed',
    slug: 'kaos-katun-combed',
    description: '<p>Bahan adem 30s untuk kerja harian.</p>',
    basePrice: '89000',
    images: [],
  });

  assert.strictEqual(seo.metaTitle, 'Kaos Katun Combed | TEMBUS');
  assert.strictEqual(seo.metaDescription, 'Bahan adem 30s untuk kerja harian.');
  assert.strictEqual(seo.canonicalPath, '/products/kaos-katun-combed');
  assert.strictEqual(seo.canonicalUrl, 'https://tembus.id/products/kaos-katun-combed');
  assert.strictEqual(seo.jsonLd['@type'], 'Product');
  assert.strictEqual(seo.jsonLd.name, 'Kaos Katun Combed');
  assert.ok(seo.warnings.includes('belum ada gambar produk untuk rich result'));
});

test('buildProductSeo honours explicit meta tags and images', () => {
  const seo = buildProductSeo(
    {
      title: 'Kaos Katun Combed',
      slug: 'kaos-katun-combed',
      metaTitle: 'Kaos Combed Premium',
      metaDescription: 'Kaos adem, jahitan rapi, harga bersahabat.',
      basePrice: 89000,
      images: ['https://cdn.tembus.id/kaos.jpg'],
    },
    { siteUrl: 'https://shop.tembus.id/', siteName: 'TEMBUS' }
  );

  assert.strictEqual(seo.metaTitle, 'Kaos Combed Premium');
  assert.strictEqual(seo.metaDescription, 'Kaos adem, jahitan rapi, harga bersahabat.');
  assert.deepStrictEqual(seo.jsonLd.image, ['https://cdn.tembus.id/kaos.jpg']);
  assert.strictEqual(seo.canonicalUrl, 'https://shop.tembus.id/products/kaos-katun-combed');
  assert.ok(!seo.warnings.includes('belum ada gambar produk untuk rich result'));
});

test('buildProductSeo truncates long titles and descriptions to the SEO limits', () => {
  const seo = buildProductSeo({
    title: 'Kaos Katun Combed Premium Lengan Panjang Warna Navy Ukuran Jumbo',
    slug: 'kaos-jumbo',
    description: 'Deskripsi '.repeat(40),
    basePrice: 89000,
  });

  assert.ok(seo.metaTitle.length <= META_TITLE_MAX);
  assert.ok(seo.metaDescription.length <= META_DESCRIPTION_MAX);
});

test('buildPageSeo emits WebPage structured data', () => {
  const seo = buildPageSeo({
    title: 'Cara Mengembalikan Barang',
    slug: 'retur',
    content: '<p>Ajukan retur dari halaman pesanan.</p>',
  });

  assert.strictEqual(seo.canonicalPath, '/pages/retur');
  assert.strictEqual(seo.jsonLd['@type'], 'WebPage');
  assert.strictEqual(seo.metaTitle, 'Cara Mengembalikan Barang | TEMBUS');
});

test('seoWarnings flags empty and boundary-length fields', () => {
  const warnings = seoWarnings({
    metaTitle: 'a'.repeat(META_TITLE_MAX),
    metaDescription: '',
    hasImage: false,
  });

  assert.ok(warnings.some((warning) => warning.includes('metaTitle mendekati batas')));
  assert.ok(warnings.includes('metaDescription kosong'));
  assert.ok(warnings.includes('belum ada gambar produk untuk rich result'));
});
