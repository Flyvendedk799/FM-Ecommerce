const { parse } = require('csv-parse/sync');
const { todayISO } = require('../validate');

const PRODUCT_FIELDS = new Set([
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published',
  'Image Src', 'Image Position', 'Image Alt Text', 'Gift Card', 'SEO Title',
  'SEO Description', 'Google Shopping / Google Product Category',
  'Google Shopping / Gender', 'Google Shopping / Age Group',
  'Google Shopping / MPN', 'Google Shopping / AdWords Grouping',
  'Google Shopping / AdWords Labels', 'Google Shopping / Condition',
  'Google Shopping / Custom Product', 'Google Shopping / Custom Label 0',
  'Google Shopping / Custom Label 1', 'Google Shopping / Custom Label 2',
  'Google Shopping / Custom Label 3', 'Google Shopping / Custom Label 4',
]);

const MONTHS = {
  januar: 1, jan: 1,
  februar: 2, feb: 2,
  marts: 3, mar: 3,
  april: 4, apr: 4,
  maj: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const CATEGORY_STYLE = {
  ledelse: { color: '#2C1A0A', preset: 'ledelse' },
  it: { color: '#0D1A38', preset: 'it' },
  cert: { color: '#1E0E3C', preset: 'cert' },
  sundhed: { color: '#0E2A1C', preset: 'sundhed' },
  amu: { color: '#2E1208', preset: 'amu' },
  salg: { color: '#2E1A0A', preset: 'ledelse' },
};

const WINDOWS_1252_CONTROLS = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};

function normalizeText(value) {
  return String(value == null ? '' : value).replace(/[\u0080-\u009f]/g, ch => (
    WINDOWS_1252_CONTROLS[ch.charCodeAt(0)] || ''
  ));
}

function clean(value, max = 4000) {
  return normalizeText(value).trim().slice(0, max);
}

function normalizeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, normalizeText(value)])
  );
}

function boolish(value) {
  return /^(1|true|yes|ja)$/i.test(String(value || '').trim());
}

function parseMoney(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

function parseInteger(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function isoDate(year, month, day) {
  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

function validDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function normalizeDateText(value) {
  return clean(value, 240)
    .toLowerCase()
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim();
}

function parseSourceDateFromFile(fileName) {
  const m = String(fileName || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return validDate(Number(m[1]), Number(m[2]), Number(m[3])) ? iso : null;
}

function parseDanishDateRange(value, sourceDateIso) {
  const text = normalizeDateText(value);
  if (!text) return null;

  const sourceDate = sourceDateIso || todayISO();
  const baseYear = Number(sourceDate.slice(0, 4)) || new Date().getFullYear();

  let m = text.match(/^(\d{1,2})\.\s*-\s*(\d{1,2})\.\s*([a-zæøå]+)$/i);
  let startDay; let startMonth; let endDay; let endMonth;
  if (m) {
    startDay = Number(m[1]);
    endDay = Number(m[2]);
    startMonth = endMonth = MONTHS[m[3]];
  } else {
    m = text.match(/^(\d{1,2})\.\s*([a-zæøå]+)\s*-\s*(\d{1,2})\.?\s*([a-zæøå]+)$/i);
    if (m) {
      startDay = Number(m[1]);
      startMonth = MONTHS[m[2]];
      endDay = Number(m[3]);
      endMonth = MONTHS[m[4]];
    } else {
      m = text.match(/^(\d{1,2})\.\s*([a-zæøå]+)$/i);
      if (!m) return null;
      startDay = endDay = Number(m[1]);
      startMonth = endMonth = MONTHS[m[2]];
    }
  }
  if (!startMonth || !endMonth) return null;

  let startYear = baseYear;
  if (!validDate(startYear, startMonth, startDay)) return null;
  let start = isoDate(startYear, startMonth, startDay);
  if (start < sourceDate) {
    startYear += 1;
    if (!validDate(startYear, startMonth, startDay)) return null;
    start = isoDate(startYear, startMonth, startDay);
  }

  let endYear = startYear;
  if (endMonth < startMonth || (endMonth === startMonth && endDay < startDay)) endYear += 1;
  if (!validDate(endYear, endMonth, endDay)) return null;
  const end = isoDate(endYear, endMonth, endDay);
  return { start, end, text };
}

function durationFromRange(range, fallback = '') {
  if (!range || !range.start || !range.end) return fallback || 'Efter aftale';
  const start = new Date(range.start + 'T00:00:00Z');
  const end = new Date(range.end + 'T00:00:00Z');
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  if (days === 1) return '1 dag';
  if (days <= 14) return `${days} dage`;
  return 'Forløb';
}

function sanitizeHtml(html) {
  return clean(html, 200000)
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
}

function htmlToText(html, max = 1200) {
  return sanitizeHtml(html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h[1-6]|div)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function supplierAbbr(name) {
  const words = clean(name).split(/\s+/).filter(Boolean);
  const chars = words.length > 1 ? words.map(w => w[0]).join('') : (words[0] || 'U').slice(0, 3);
  return chars.toUpperCase().replace(/[^A-ZÆØÅ0-9]/g, '').slice(0, 4) || 'U';
}

function classifyCategory(row) {
  const hay = [
    row.Title, row.Type, row.Tags, row['Body (HTML)'], row['SEO Title'],
    row['SEO Description'],
  ].map(v => String(v || '').toLowerCase()).join(' ');

  if (/\bamu\b|erhvervsfaglig|veu/.test(hay)) return 'amu';
  if (/certificering|certifikat|foundation|eksamen|itil|prince2|scrum|togaf|isaca|cism|cisa/.test(hay)) return 'cert';
  if (/sundhed|førstehjælp|foerstehjaelp|hlr|hjerte|omsorg|arbejdsmiljø/.test(hay)) return 'sundhed';
  if (/salg|kundeservice|kunde|telefonist|indvending/.test(hay)) return 'salg';
  if (/\bit\b|data|excel|power bi|microsoft|sql|python|cloud|cyber|sikkerhed|software|programmer|digital|arkitekt|ai\b|kunstig intelligens/.test(hay)) return 'it';
  return 'ledelse';
}

function inferFormat(productRow, variants) {
  const hay = [productRow.Type, productRow.Tags, productRow.Title].join(' ').toLowerCase();
  const locations = variants.map(r => clean(r['Option1 Value']).toLowerCase()).filter(Boolean);
  if (/e-learning|elearning|online|webinar/.test(hay) || locations.some(v => /online|zoom|teams|e-learning/.test(v))) {
    return 'Online';
  }
  if (/lukket virksomhedshold|efter aftale/.test(hay) && locations.length === 0) return 'Firmahold';
  return 'Fysisk';
}

function inferLocation(optionValue) {
  const text = clean(optionValue, 500);
  if (!text) return '';
  const lower = text.toLowerCase();
  if (/online|zoom|teams|e-learning|webinar/.test(lower)) return 'Online';
  if (/københavn|kobenhavn|copenhagen|nordhavn|herlev|taastrup|hovedstaden/.test(lower)) return 'København';
  if (/aarhus|århus/.test(lower)) return 'Aarhus';
  if (/odense/.test(lower)) return 'Odense';
  if (/aalborg|ålborg/.test(lower)) return 'Aalborg';
  const m = text.match(/\b\d{4}\s+([A-Za-zÆØÅæøå .'-]+)/);
  return m ? clean(m[1], 80) : text.split(',').pop().trim().slice(0, 80);
}

function productData(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (PRODUCT_FIELDS.has(key)) out[key] = value;
  }
  return out;
}

function variantData(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    if (!PRODUCT_FIELDS.has(key) || /^Option|^Variant|^Cost per item/.test(key)) out[key] = value;
  }
  return out;
}

async function getCategoryMap(tx) {
  const rows = await tx.all('SELECT id, key FROM categories');
  return new Map(rows.map(r => [r.key, r.id]));
}

async function upsertSupplier(tx, name) {
  const supplierName = clean(name, 180) || 'Ukendt udbyder';
  const existing = await tx.get('SELECT id FROM suppliers WHERE LOWER(name)=LOWER(?)', supplierName);
  if (existing) return existing.id;
  const result = await tx.run(`
    INSERT INTO suppliers (name, abbr, status)
    VALUES (?, ?, 'active')
  `, supplierName, supplierAbbr(supplierName));
  return result.lastInsertRowid;
}

function buildCoursePayload(productRow, variants, categories, sourceStamp) {
  const title = clean(productRow.Title, 260) || clean(productRow.Handle, 260);
  const categoryKey = classifyCategory(productRow);
  const style = CATEGORY_STYLE[categoryKey] || CATEGORY_STYLE.ledelse;
  const firstRange = variants
    .map(r => parseDanishDateRange(r['Option2 Value'], sourceStamp.sourceDate))
    .find(Boolean);
  const format = inferFormat(productRow, variants);
  const prices = variants.map(r => parseMoney(r['Variant Price'])).filter(n => n != null && n > 0);
  const price = prices.length ? Math.min(...prices) : (parseMoney(productRow['Variant Price']) || 0);
  const bodyHtml = sanitizeHtml(productRow['Body (HTML)'] || '');
  const description = htmlToText(bodyHtml, 3000);
  const shortDescription = htmlToText(productRow['SEO Description'] || bodyHtml, 260);
  const tags = clean(productRow.Tags, 2000);
  const badge = categoryKey === 'amu' ? 'amu' : categoryKey === 'cert' ? 'cert' : '';
  const included = ['Kursusmaterialer', 'Kursusbevis', 'Support fra udbyderen'];
  const facts = [
    { k: 'Varighed', v: durationFromRange(firstRange, format === 'Firmahold' ? 'Efter aftale' : '') },
    { k: 'Format', v: format },
    { k: 'Type', v: clean(productRow.Type, 80) || 'Kursus' },
    { k: 'Udbyder', v: clean(productRow.Vendor, 80) || 'Ukendt' },
  ];
  const marquee = [title]
    .concat(tags.split(',').map(t => clean(t, 60)).filter(t => t && !/^no-index$/i.test(t)).slice(0, 5));

  return {
    title,
    source: 'shopify_csv',
    source_handle: clean(productRow.Handle, 260),
    product_type: clean(productRow.Type, 120),
    tags,
    published: boolish(productRow.Published) ? 1 : 0,
    body_html: bodyHtml,
    image_src: clean(productRow['Image Src'], 1200),
    image_alt_text: clean(productRow['Image Alt Text'], 260),
    seo_title: clean(productRow['SEO Title'], 260),
    seo_description: clean(productRow['SEO Description'], 500),
    shopify_product_data: JSON.stringify(productData(productRow)),
    last_imported_at: sourceStamp.importedAt,
    supplier_id: null,
    category_id: categories.get(categoryKey) || null,
    price,
    price_label: price ? 'Pris ekskl. moms' : 'Kontakt for pris',
    price_note: price ? 'Importeret leverandørpris ekskl. moms' : 'Kontakt os for pris og muligheder',
    format,
    duration: durationFromRange(firstRange, format === 'Firmahold' ? 'Efter aftale' : ''),
    is_online: format === 'Online' ? 1 : 0,
    rating: 0,
    review_count: 0,
    description,
    short_description: shortDescription || description.slice(0, 220),
    outcomes: JSON.stringify([]),
    curriculum: JSON.stringify([]),
    included: JSON.stringify(included),
    facts: JSON.stringify(facts),
    marquee_items: JSON.stringify(marquee),
    materials: JSON.stringify([]),
    bring_items: JSON.stringify([]),
    preset_type: style.preset,
    badge,
    color: style.color,
    status: boolish(productRow.Published) ? 'active' : 'draft',
  };
}

async function upsertCourse(tx, payload) {
  let existing = null;
  if (payload.source_handle) {
    existing = await tx.get('SELECT id FROM courses WHERE source_handle=?', payload.source_handle);
  }
  if (!existing) {
    existing = await tx.get('SELECT id FROM courses WHERE LOWER(title)=LOWER(?) AND source_handle = ?', payload.title, '');
  }

  if (existing) {
    await tx.run(`
      UPDATE courses SET title=?, source=?, source_handle=?, product_type=?, tags=?, published=?,
        body_html=?, image_src=?, image_alt_text=?, seo_title=?, seo_description=?,
        shopify_product_data=?, last_imported_at=?, supplier_id=?, category_id=?,
        price=?, price_label=?, price_note=?, format=?, duration=?, is_online=?,
        description=?, short_description=?, included=?, facts=?, marquee_items=?,
        preset_type=?, badge=?, color=?, status=?
      WHERE id=?
    `,
      payload.title, payload.source, payload.source_handle, payload.product_type, payload.tags,
      payload.published, payload.body_html, payload.image_src, payload.image_alt_text,
      payload.seo_title, payload.seo_description, payload.shopify_product_data,
      payload.last_imported_at, payload.supplier_id, payload.category_id, payload.price,
      payload.price_label, payload.price_note, payload.format, payload.duration,
      payload.is_online, payload.description, payload.short_description, payload.included,
      payload.facts, payload.marquee_items, payload.preset_type, payload.badge,
      payload.color, payload.status, existing.id);
    return { id: existing.id, created: false };
  }

  const result = await tx.run(`
    INSERT INTO courses (
      title, slug, source, source_handle, product_type, tags, published, body_html,
      image_src, image_alt_text, seo_title, seo_description, shopify_product_data,
      last_imported_at, supplier_id, category_id, price, price_label, price_note,
      format, duration, is_online, rating, review_count, description, short_description,
      outcomes, curriculum, included, facts, marquee_items, materials, bring_items,
      preset_type, badge, color, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    payload.title, payload.source_handle || null, payload.source, payload.source_handle,
    payload.product_type, payload.tags, payload.published, payload.body_html,
    payload.image_src, payload.image_alt_text, payload.seo_title, payload.seo_description,
    payload.shopify_product_data, payload.last_imported_at, payload.supplier_id,
    payload.category_id, payload.price, payload.price_label, payload.price_note,
    payload.format, payload.duration, payload.is_online, payload.rating,
    payload.review_count, payload.description, payload.short_description,
    payload.outcomes, payload.curriculum, payload.included, payload.facts,
    payload.marquee_items, payload.materials, payload.bring_items, payload.preset_type,
    payload.badge, payload.color, payload.status);
  return { id: result.lastInsertRowid, created: true };
}

function buildSessionPayload(row, course, sourceStamp) {
  const dateRange = parseDanishDateRange(row['Option2 Value'], sourceStamp.sourceDate);
  if (!dateRange) return null;
  const optionLocation = clean(row['Option1 Value'], 800);
  const location = inferLocation(optionLocation);
  if (!location) return null;
  const isOnline = /online|zoom|teams|e-learning|webinar/i.test(optionLocation) || course.format === 'Online';
  const variantPrice = parseMoney(row['Variant Price']);
  const inventoryQty = parseInteger(row['Variant Inventory Qty']);
  const dateText = clean(row['Option2 Value'], 240);
  return {
    course_id: course.id,
    date: dateRange.start,
    end_date: dateRange.end !== dateRange.start ? dateRange.end : '',
    date_text: dateText,
    location,
    venue: optionLocation || location,
    format: `${isOnline ? 'Online' : 'Fysisk'} · ${durationFromRange(dateRange, course.duration)}`,
    is_online: isOnline ? 1 : 0,
    seats: inventoryQty != null && inventoryQty > 0 ? inventoryQty : 14,
    is_popular: 0,
    status: 'active',
    source_variant_sku: clean(row['Variant SKU'], 500),
    option1_name: clean(row['Option1 Name'], 120),
    option1_value: optionLocation,
    option2_name: clean(row['Option2 Name'], 120),
    option2_value: dateText,
    option3_name: clean(row['Option3 Name'], 120),
    option3_value: clean(row['Option3 Value'], 500),
    variant_price: variantPrice,
    variant_compare_at_price: parseMoney(row['Variant Compare At Price']),
    variant_inventory_tracker: clean(row['Variant Inventory Tracker'], 120),
    variant_inventory_qty: inventoryQty,
    variant_inventory_policy: clean(row['Variant Inventory Policy'], 120),
    variant_fulfillment_service: clean(row['Variant Fulfillment Service'], 120),
    variant_requires_shipping: boolish(row['Variant Requires Shipping']) ? 1 : 0,
    variant_taxable: boolish(row['Variant Taxable']) ? 1 : 0,
    variant_barcode: clean(row['Variant Barcode'], 240),
    variant_image: clean(row['Variant Image'], 1200),
    variant_grams: parseInteger(row['Variant Grams']),
    variant_weight_unit: clean(row['Variant Weight Unit'], 40),
    variant_tax_code: clean(row['Variant Tax Code'], 120),
    cost_per_item: parseMoney(row['Cost per item']),
    shopify_variant_data: JSON.stringify(variantData(row)),
    last_imported_at: sourceStamp.importedAt,
  };
}

async function findSession(tx, payload) {
  if (payload.source_variant_sku) {
    const bySku = await tx.get('SELECT id FROM sessions WHERE source_variant_sku=?', payload.source_variant_sku);
    if (bySku) return bySku;
  }
  return tx.get(`
    SELECT id FROM sessions
    WHERE course_id=? AND date=? AND location=? AND venue=? AND COALESCE(date_text, '')=?
  `, payload.course_id, payload.date, payload.location, payload.venue, payload.date_text || '');
}

async function upsertSession(tx, payload) {
  const existing = await findSession(tx, payload);
  const params = [
    payload.course_id, payload.date, payload.end_date, payload.date_text, payload.location,
    payload.venue, payload.format, payload.is_online, payload.seats, payload.is_popular,
    payload.status, payload.source_variant_sku, payload.option1_name, payload.option1_value,
    payload.option2_name, payload.option2_value, payload.option3_name, payload.option3_value,
    payload.variant_price, payload.variant_compare_at_price, payload.variant_inventory_tracker,
    payload.variant_inventory_qty, payload.variant_inventory_policy,
    payload.variant_fulfillment_service, payload.variant_requires_shipping,
    payload.variant_taxable, payload.variant_barcode, payload.variant_image,
    payload.variant_grams, payload.variant_weight_unit, payload.variant_tax_code,
    payload.cost_per_item, payload.shopify_variant_data, payload.last_imported_at,
  ];
  if (existing) {
    await tx.run(`
      UPDATE sessions SET course_id=?, date=?, end_date=?, date_text=?, location=?, venue=?,
        format=?, is_online=?, seats=?, is_popular=?, status=?, source_variant_sku=?,
        option1_name=?, option1_value=?, option2_name=?, option2_value=?,
        option3_name=?, option3_value=?, variant_price=?, variant_compare_at_price=?,
        variant_inventory_tracker=?, variant_inventory_qty=?, variant_inventory_policy=?,
        variant_fulfillment_service=?, variant_requires_shipping=?, variant_taxable=?,
        variant_barcode=?, variant_image=?, variant_grams=?, variant_weight_unit=?,
        variant_tax_code=?, cost_per_item=?, shopify_variant_data=?, last_imported_at=?
      WHERE id=?
    `, ...params, existing.id);
    return { id: existing.id, created: false };
  }

  const result = await tx.run(`
    INSERT INTO sessions (
      course_id, date, end_date, date_text, location, venue, format, is_online, seats,
      is_popular, status, source_variant_sku, option1_name, option1_value, option2_name,
      option2_value, option3_name, option3_value, variant_price,
      variant_compare_at_price, variant_inventory_tracker, variant_inventory_qty,
      variant_inventory_policy, variant_fulfillment_service, variant_requires_shipping,
      variant_taxable, variant_barcode, variant_image, variant_grams, variant_weight_unit,
      variant_tax_code, cost_per_item, shopify_variant_data, last_imported_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, ...params);
  return { id: result.lastInsertRowid, created: true };
}

function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const handle = clean(row.Handle, 260);
    if (!handle) continue;
    if (!groups.has(handle)) groups.set(handle, []);
    groups.get(handle).push(row);
  }
  return groups;
}

function bestProductRow(rows) {
  return rows.find(r => clean(r.Title) || clean(r['Body (HTML)']) || clean(r.Vendor)) || rows[0];
}

async function importShopifyCsv(store, csvText, options = {}) {
  const rows = parse(csvText, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }).map(normalizeRow);
  const sourceDate = options.sourceDate || parseSourceDateFromFile(options.fileName) || todayISO();
  const sourceStamp = {
    sourceDate,
    importedAt: new Date().toISOString(),
  };
  const summary = {
    rows: rows.length,
    products_seen: 0,
    courses_created: 0,
    courses_updated: 0,
    sessions_created: 0,
    sessions_updated: 0,
    sessions_skipped: 0,
    expired_sessions: 0,
    suppliers_created_or_reused: 0,
    mode: options.replaceCatalog ? 'replace' : 'merge',
    source_date: sourceDate,
    warnings: [],
  };
  const today = todayISO();

  await store.transaction(async (tx) => {
    if (options.replaceCatalog) {
      await tx.run('DELETE FROM bookings');
      await tx.run('DELETE FROM orders');
      await tx.run('DELETE FROM courses');
      await tx.run('DELETE FROM suppliers');
    }

    const categories = await getCategoryMap(tx);
    const groups = groupRows(rows);
    summary.products_seen = groups.size;

    for (const [handle, group] of groups.entries()) {
      const productRow = bestProductRow(group);
      if (!clean(productRow.Title) && !clean(productRow.Handle)) {
        summary.warnings.push(`Sprang produkt uden titel/handle over: ${handle}`);
        continue;
      }
      const supplierId = await upsertSupplier(tx, productRow.Vendor);
      summary.suppliers_created_or_reused += 1;
      const coursePayload = buildCoursePayload(productRow, group, categories, sourceStamp);
      coursePayload.supplier_id = supplierId;
      const course = await upsertCourse(tx, coursePayload);
      if (course.created) summary.courses_created += 1;
      else summary.courses_updated += 1;

      for (const row of group) {
        const payload = buildSessionPayload(row, { id: course.id, format: coursePayload.format, duration: coursePayload.duration }, sourceStamp);
        if (!payload) {
          summary.sessions_skipped += 1;
          continue;
        }
        if (payload.date < today) summary.expired_sessions += 1;
        const session = await upsertSession(tx, payload);
        if (session.created) summary.sessions_created += 1;
        else summary.sessions_updated += 1;
      }
    }
  });

  return summary;
}

module.exports = {
  importShopifyCsv,
  parseDanishDateRange,
  parseSourceDateFromFile,
  sanitizeHtml,
  htmlToText,
};
