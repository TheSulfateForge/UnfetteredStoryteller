/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Refreshes the /data JSON files from the Open5e v2 API.
 *
 * Pulls ONLY the licensed sources listed in ALLOWED_SOURCE_SLUGS in config.js,
 * using server-side filtering (?document__key__in=) so you download just what
 * you are licensed to use instead of scraping the whole site.
 *
 * Requires Node 18+ (uses built-in fetch). No dependencies.
 *
 *   node tools/refresh-open5e.mjs --probe        Discover which endpoints exist
 *   node tools/refresh-open5e.mjs --dry-run      Fetch + report, write nothing
 *   node tools/refresh-open5e.mjs --write        Write into ./data (backs up first)
 *   node tools/refresh-open5e.mjs --write --only=spells,creatures
 */
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const BACKUP_DIR = path.join(ROOT, 'data-backup');
const API = 'https://api.open5e.com/v2';

const PAGE_SIZE = 200;      // API default is 50; larger pages = fewer round trips
const REQUEST_DELAY_MS = 250; // be polite to a free community API
const MAX_RETRIES = 4;

// --- CLI ---------------------------------------------------------------
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getOpt = (name) => {
    const hit = argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
};
const MODE = hasFlag('--probe') ? 'probe' : hasFlag('--write') ? 'write' : 'dry-run';
const ONLY = (getOpt('only') || '').split(',').map(s => s.trim()).filter(Boolean);

/**
 * Datasets to refresh: which API endpoint feeds which local file.
 * `candidates` exists because Open5e v2 renamed several v1 endpoints
 * (monsters -> creatures, races -> species); the first one that responds wins.
 */
const DATASETS = [
    { name: 'documents',  file: 'documents.json',  candidates: ['documents'],            filterBySource: false },
    { name: 'species',    file: 'races.json',      candidates: ['species', 'races'] },
    { name: 'classes',    file: 'classes.json',    candidates: ['classes'] },
    { name: 'backgrounds',file: 'backgrounds.json',candidates: ['backgrounds'] },
    { name: 'feats',      file: 'feats.json',      candidates: ['feats'] },
    { name: 'weapons',    file: 'weapons.json',    candidates: ['weapons'] },
    { name: 'armor',      file: 'armor.json',      candidates: ['armor'] },
    { name: 'conditions', file: 'conditions.json', candidates: ['conditions'] },
    { name: 'spells',     file: null,              candidates: ['spells'] }, // split by level below
    { name: 'creatures',  file: 'monsters.json',   candidates: ['creatures', 'monsters'] },
    { name: 'magicitems', file: 'magicitems.json', candidates: ['magicitems', 'magic-items', 'items'] },
    { name: 'planes',     file: 'planes.json',     candidates: ['planes'] },
    { name: 'sections',   file: 'sections.json',   candidates: ['sections', 'rules'] },
];

// Spell files are split by level to keep each payload small in the browser.
const SPELL_BUCKETS = [
    { file: 'spells-0-1.json', levels: [0, 1] },
    { file: 'spells-2-3.json', levels: [2, 3] },
    { file: 'spells-4-5.json', levels: [4, 5] },
    { file: 'spells-6-7.json', levels: [6, 7] },
    { file: 'spells-8-9.json', levels: [8, 9] },
];

// --- helpers -----------------------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** Reads ALLOWED_SOURCE_SLUGS out of config.js so there is one source of truth. */
async function loadAllowedSlugs() {
    const src = await readFile(path.join(ROOT, 'config.js'), 'utf8');
    const block = src.match(/ALLOWED_SOURCE_SLUGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    if (!block) throw new Error('Could not find ALLOWED_SOURCE_SLUGS in config.js');
    const slugs = [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map(m => m[1]);
    return [...new Set(slugs)];
}

async function fetchJson(url) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, { headers: { Accept: 'application/json' } });
            if (res.status === 404) return { notFound: true };
            if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return { data: await res.json() };
        } catch (err) {
            if (attempt === MAX_RETRIES) throw err;
            const wait = 1000 * Math.pow(2, attempt);
            console.warn(`    retry ${attempt + 1}/${MAX_RETRIES} after ${wait}ms (${err.message})`);
            await sleep(wait);
        }
    }
}

/** Fetches every page of an endpoint, returning a flat array of results. */
async function fetchAll(endpoint, params = {}) {
    const out = [];
    let page = 1;
    for (;;) {
        const qs = new URLSearchParams({ ...params, limit: String(PAGE_SIZE), page: String(page) });
        const { data, notFound } = await fetchJson(`${API}/${endpoint}/?${qs}`);
        if (notFound) break;                       // out-of-range page ends pagination
        const rows = Array.isArray(data) ? data : (data.results || []);
        out.push(...rows);
        const more = !Array.isArray(data) && data.next;
        process.stdout.write(`\r    ${endpoint}: ${out.length} rows`);
        if (!more || rows.length === 0) break;
        page++;
        await sleep(REQUEST_DELAY_MS);
    }
    process.stdout.write('\n');
    return out;
}

/** Finds the first candidate endpoint that responds. */
async function resolveEndpoint(candidates) {
    for (const c of candidates) {
        const { data, notFound } = await fetchJson(`${API}/${c}/?limit=1`);
        if (!notFound && data) return { endpoint: c, count: data.count ?? (Array.isArray(data) ? data.length : null) };
        await sleep(REQUEST_DELAY_MS);
    }
    return null;
}

/** Writes JSON only after validating it, backing up any existing file. */
async function safeWrite(file, rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        console.warn(`    !! refusing to write ${file}: got 0 rows (keeping existing file)`);
        return false;
    }
    const target = path.join(DATA_DIR, file);
    if (existsSync(target)) {
        await mkdir(BACKUP_DIR, { recursive: true });
        await copyFile(target, path.join(BACKUP_DIR, file));
    }
    const text = JSON.stringify(rows, null, 0);
    JSON.parse(text); // validate before touching disk
    await writeFile(target, text, 'utf8');
    return true;
}

function summarize(rows) {
    const counts = new Map();
    for (const r of rows) {
        const raw = r?.document?.key ?? r?.document ?? r?.document__slug ?? '(none)';
        const key = String(raw).replace(/\/+$/, '').split('/').pop();
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}=${v}`).join(' ');
}

// --- main --------------------------------------------------------------
async function main() {
    const allowed = await loadAllowedSlugs();
    console.log(`Mode: ${MODE}`);
    console.log(`Licensed sources (${allowed.length}): ${allowed.join(', ')}\n`);

    if (MODE === 'probe') {
        console.log('Probing endpoints...\n');
        for (const ds of DATASETS) {
            const found = await resolveEndpoint(ds.candidates);
            console.log(found
                ? `  OK    ${ds.name.padEnd(12)} -> /v2/${found.endpoint}/  (total ${found.count ?? '?'})`
                : `  MISS  ${ds.name.padEnd(12)} -> tried: ${ds.candidates.join(', ')}`);
        }
        console.log('\nNote: totals above are unfiltered. Re-run with --dry-run to see licensed-only counts.');
        return;
    }

    const sourceFilter = { document__key__in: allowed.join(',') };
    const report = [];

    for (const ds of DATASETS) {
        if (ONLY.length && !ONLY.includes(ds.name)) continue;
        console.log(`\n${ds.name}`);
        const found = await resolveEndpoint(ds.candidates);
        if (!found) { console.log(`    !! no endpoint found (tried ${ds.candidates.join(', ')})`); continue; }
        console.log(`    endpoint: /v2/${found.endpoint}/`);

        const params = ds.filterBySource === false ? {} : sourceFilter;
        let rows = await fetchAll(found.endpoint, params);

        // Safety net: drop anything outside the allowlist even if the server ignored the filter.
        if (ds.filterBySource !== false) {
            const before = rows.length;
            rows = rows.filter(r => {
                const raw = r?.document?.key ?? r?.document ?? r?.document__slug;
                if (!raw) return true;
                return allowed.includes(String(raw).replace(/\/+$/, '').split('/').pop().toLowerCase());
            });
            if (rows.length !== before) console.log(`    client-side filter removed ${before - rows.length}`);
        }
        console.log(`    sources: ${summarize(rows) || '(none)'}`);

        if (ds.name === 'spells') {
            for (const bucket of SPELL_BUCKETS) {
                const subset = rows.filter(r => bucket.levels.includes(Number(r.level ?? r.level_int)));
                report.push({ file: bucket.file, rows: subset.length });
                if (MODE === 'write') await safeWrite(bucket.file, subset);
                console.log(`    ${bucket.file}: ${subset.length}`);
            }
        } else if (ds.file) {
            report.push({ file: ds.file, rows: rows.length });
            if (MODE === 'write') await safeWrite(ds.file, rows);
        }
    }

    console.log('\n--- summary ---');
    for (const r of report) console.log(`  ${r.file.padEnd(22)} ${r.rows}`);
    if (MODE === 'dry-run') console.log('\nDry run: nothing written. Re-run with --write to apply.');
    else console.log(`\nWritten to ${DATA_DIR}. Previous files backed up in ${BACKUP_DIR}.`);
}

main().catch(err => { console.error('\nFAILED:', err.message); process.exitCode = 1; });
