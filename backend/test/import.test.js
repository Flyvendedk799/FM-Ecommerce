/* ============================================================
   Shopify CSV import: course upsert by handle and date/variant
   merge behavior for future supplier batches.
   ============================================================ */
'use strict';
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_TOKEN = 'test-token';

const test = require('node:test');
const assert = require('node:assert');
const app = require('../app');
const { ADMIN, boot, makeClient, jsonReq } = require('../test-helpers');

let server, base;
const j = makeClient(() => base);

test.before(() => { ({ server, base } = boot(app)); });
test.after(() => server.close());

const HEADER = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
  'Option1 Name', 'Option1 Value', 'Option2 Name', 'Option2 Value',
  'Variant SKU', 'Variant Price', 'Image Src', 'SEO Description',
].join(',');

function csvEscape(value) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function row(values) {
  return [
    values.handle,
    values.title,
    values.body,
    values.vendor,
    values.type,
    values.tags,
    values.published,
    'Lokation',
    values.location,
    'Tidspunkt',
    values.dateText,
    values.sku,
    values.price,
    values.image,
    values.seo,
  ].map(csvEscape).join(',');
}

function csv(rows) {
  return [HEADER].concat(rows.map(row)).join('\n');
}

test('Shopify CSV import merges existing courses and only adds new dates', async () => {
  const firstCsv = csv([
    {
      handle: 'test-excel-kursus',
      title: 'Excel \u0096 kursus fra leverandør',
      body: '<h3>Om kurset</h3><p>Lær Excel med praksis.</p>',
      vendor: 'CSV Supplier',
      type: 'Kursus',
      tags: 'Kursus, IT og data',
      published: 'true',
      location: 'Teknologisk Institut Kongsvang Allé 29, 8000 Aarhus C',
      dateText: '1. - 2. juli',
      sku: 'test-excel-aarhus-juli',
      price: '4900',
      image: 'https://example.com/excel.jpg',
      seo: 'Kort SEO tekst',
    },
    {
      handle: 'test-excel-kursus',
      title: '',
      body: '',
      vendor: '',
      type: '',
      tags: '',
      published: '',
      location: 'Teknologisk Institut Gregersensvej, 2630 Taastrup',
      dateText: '10. juli',
      sku: 'test-excel-taastrup-juli',
      price: '4900',
      image: '',
      seo: '',
    },
  ]);

  const first = await j('/api/courses/import/shopify-csv', jsonReq('POST', {
    csv: firstCsv,
    source_date: '2030-06-01',
  }, true));
  assert.strictEqual(first.status, 201);
  assert.strictEqual(first.body.summary.courses_created, 1);
  assert.strictEqual(first.body.summary.sessions_created, 2);

  const courses = await j('/api/courses?q=test-excel-kursus');
  assert.strictEqual(courses.status, 200);
  assert.strictEqual(courses.body.length, 1);
  assert.strictEqual(courses.body[0].source_handle, 'test-excel-kursus');
  assert.strictEqual(courses.body[0].title, 'Excel – kursus fra leverandør');
  assert.strictEqual(courses.body[0].image_src, 'https://example.com/excel.jpg');

  const secondCsv = csv([
    {
      handle: 'test-excel-kursus',
      title: 'Excel \u0096 kursus fra leverandør',
      body: '<h3>Om kurset</h3><p>Lær Excel med praksis.</p>',
      vendor: 'CSV Supplier',
      type: 'Kursus',
      tags: 'Kursus, IT og data',
      published: 'true',
      location: 'Teknologisk Institut Kongsvang Allé 29, 8000 Aarhus C',
      dateText: '1. - 2. juli',
      sku: 'test-excel-aarhus-juli',
      price: '4900',
      image: 'https://example.com/excel.jpg',
      seo: 'Kort SEO tekst',
    },
    {
      handle: 'test-excel-kursus',
      title: '',
      body: '',
      vendor: '',
      type: '',
      tags: '',
      published: '',
      location: 'Teknologisk Institut Gregersensvej, 2630 Taastrup',
      dateText: '10. juli',
      sku: 'test-excel-taastrup-juli',
      price: '4900',
      image: '',
      seo: '',
    },
    {
      handle: 'test-excel-kursus',
      title: '',
      body: '',
      vendor: '',
      type: '',
      tags: '',
      published: '',
      location: 'Online via Teams',
      dateText: '15. august',
      sku: 'test-excel-online-august',
      price: '4500',
      image: '',
      seo: '',
    },
  ]);

  const second = await j('/api/courses/import/shopify-csv', jsonReq('POST', {
    csv: secondCsv,
    source_date: '2030-06-01',
  }, true));
  assert.strictEqual(second.status, 201);
  assert.strictEqual(second.body.summary.courses_created, 0);
  assert.strictEqual(second.body.summary.courses_updated, 1);
  assert.strictEqual(second.body.summary.sessions_created, 1);
  assert.strictEqual(second.body.summary.sessions_updated, 2);

  const sessions = await j('/api/sessions?course_id=' + courses.body[0].id);
  assert.strictEqual(sessions.status, 200);
  assert.strictEqual(sessions.body.length, 3);
  assert.deepStrictEqual(
    sessions.body.map(s => s.source_variant_sku).sort(),
    ['test-excel-aarhus-juli', 'test-excel-online-august', 'test-excel-taastrup-juli']
  );
  assert.strictEqual(sessions.body.find(s => s.source_variant_sku === 'test-excel-online-august').variant_price, 4500);
});
