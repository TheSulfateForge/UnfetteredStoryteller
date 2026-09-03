/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies that a copy of the app is internally consistent BEFORE you load it
 * in a browser. Catches the failure mode where some files are updated and
 * others are not, e.g.:
 *
 *   Uncaught SyntaxError: The requested module './utils.js'
 *   does not provide an export named 'normalizeRollModifier'
 *
 * A single mismatch like that is fatal: the ES module graph fails to resolve, so
 * nothing runs and every button in the app becomes unresponsive.
 *
 *   node tools/verify-integrity.mjs            Check this folder
 *   node tools/verify-integrity.mjs <path>     Check the folder you deploy/serve
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));

function exportsOf(src) {
    const set = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) set.add(m[1]);
    for (const m of src.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) set.add(m[1]);
    for (const m of src.matchAll(/^export\s+class\s+([A-Za-z0-9_$]+)/gm)) set.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
        m[1].split(',').forEach(x => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) set.add(n); });
    }
    if (/^export\s+default/m.test(src)) set.add('default');
    return set;
}

const problems = [];
if (!fs.existsSync(ROOT)) { console.error(`No such folder: ${ROOT}`); process.exit(1); }
const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
const exportMap = new Map();
for (const f of jsFiles) exportMap.set(f, exportsOf(fs.readFileSync(path.join(ROOT, f), 'utf8')));

for (const f of jsFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const check = (spec, names) => {
        if (!spec.startsWith('.')) return; // bare specifier -> import map / CDN
        const target = spec.replace(/^\.\//, '');
        if (!fs.existsSync(path.join(ROOT, target))) {
            problems.push(`${f}: imports "${spec}" but that file does not exist`);
            return;
        }
        const available = exportMap.get(target);
        if (!available) return;
        for (const n of names) {
            if (n && !available.has(n)) {
                problems.push(`${f}: imports { ${n} } from "${spec}", but ${target} does not export it  <-- STALE FILE`);
            }
        }
    };
    for (const m of src.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g)) {
        check(m[2], m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean));
    }
    for (const m of src.matchAll(/import\s+\*\s+as\s+[A-Za-z0-9_$]+\s+from\s+['"]([^'"]+)['"]/g)) check(m[1], []);
    for (const m of src.matchAll(/import\s+['"]([^'"]+)['"]/g)) check(m[1], []);
}

// Anything index.html references locally should exist too.
const htmlPath = path.join(ROOT, 'index.html');
if (fs.existsSync(htmlPath)) {
    const html = fs.readFileSync(htmlPath, 'utf8');
    for (const m of html.matchAll(/(?:src|href)=["'](\.?\/[^"']+)["']/g)) {
        const rel = m[1].replace(/^\.?\//, '');
        if (/^https?:/.test(m[1])) continue;
        if (!fs.existsSync(path.join(ROOT, rel))) problems.push(`index.html references "${m[1]}" which does not exist (404)`);
    }
}

// Files the service worker pre-caches must exist.
const swPath = path.join(ROOT, 'sw.js');
if (fs.existsSync(swPath)) {
    const sw = fs.readFileSync(swPath, 'utf8');
    for (const m of sw.matchAll(/'(\.\/[^']+)'/g)) {
        const rel = m[1].replace('./', '');
        if (!rel || rel.endsWith('/')) continue;
        if (!fs.existsSync(path.join(ROOT, rel))) problems.push(`sw.js pre-caches "${m[1]}" which does not exist`);
    }
}

console.log(`Checked ${jsFiles.length} modules in ${ROOT}\n`);
if (problems.length === 0) {
    console.log('OK - no missing files or stale imports. Safe to load in a browser.');
} else {
    console.log(`FOUND ${problems.length} PROBLEM(S):\n`);
    problems.forEach(p => console.log('  - ' + p));
    process.exitCode = 1;
}
