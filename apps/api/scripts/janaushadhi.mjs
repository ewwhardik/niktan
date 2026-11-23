#!/usr/bin/env node
// Converts the official Jan Aushadhi "Product & MRP List" CSV (janaushadhi.gov.in → Product
// Portfolio → Product MRP List → Download Files → CSV) into src/data/janaushadhi.json.
// Usage: node scripts/janaushadhi.mjs ~/Downloads/<file>.csv
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const file = process.argv[2];
if (!file) { console.error('Usage: node scripts/janaushadhi.mjs <product-list.csv>'); process.exit(1); }

/** RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. */
function parse(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const rows = parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const headerAt = rows.findIndex((r) => r.some((c) => norm(c).includes('genericname')));
if (headerAt < 0) { console.error('No "Generic Name" column found.'); process.exit(1); }
const header = rows[headerAt].map(norm);
const col = (...names) => header.findIndex((h) => names.some((n) => h.includes(n)));
const idx = { code: col('drugcode', 'code'), name: col('genericname'), unit: col('unitsize', 'unit'), mrp: col('mrp', 'price'), group: col('groupname', 'group', 'category') };
if (idx.name < 0 || idx.mrp < 0) { console.error('Missing Generic Name or MRP column:', rows[headerAt]); process.exit(1); }

const out = [];
for (const r of rows.slice(headerAt + 1)) {
  const name = (r[idx.name] ?? '').replace(/\s+/g, ' ').trim();
  const mrp = Number(String(r[idx.mrp] ?? '').replace(/[^0-9.]/g, ''));
  if (!name || !Number.isFinite(mrp) || mrp <= 0) continue;
  out.push([String(r[idx.code] ?? '').trim(), name, String(r[idx.unit] ?? '').trim(), Math.round(mrp * 100) / 100, String(r[idx.group] ?? '').trim()]);
}
const target = fileURLToPath(new URL('../src/data/janaushadhi.json', import.meta.url));
writeFileSync(target, JSON.stringify(out));
console.log(`Wrote ${out.length} products to ${target}`);
