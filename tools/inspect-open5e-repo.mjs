/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Inspects the open5e-api GitHub repo to discover how upstream game data is
 * organised, and can download raw files from it.
 *
 * The API README states it "pulls the data from the /data directory", and the
 * v2 content lives under data/v2 (one folder per book/source). Pulling from the
 * repo avoids hundreds of paginated API calls and any rate limiting.
 *
 * Every run also writes tools/out/open5e-tree.json (a machine-readable manifest)
 * and tools/out/open5e-tree.txt (the printed report) so results are easy to share.
 *
 * Requires Node 18+ (built-in fetch). No dependencies.
 *
 *   node tools/inspect-open5e-repo.mjs                  Summarise data/v2 by book
 *   node tools/inspect-open5e-repo.mjs --files          List every file, not just books
 *   node tools/inspect-open5e-repo.mjs --all            Whole repo tree
 *   node tools/inspect-open5e-repo.mjs --grep=spell     Filter paths
 *   node tools/inspect-open5e-repo.mjs --peek=<path>    Record count + keys + sample
 *   node tools/inspect-open5e-repo.mjs --get=<path> --out=tools/out/x.json
 *   node tools/inspect-open5e-repo.mjs --schema         Try to locate the OpenAPI schema
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const REPO = 'open5e/open5e-api';
const BRANCH = process.env.OPEN5E_BRANCH || 'staging';
const ROOT_PATH = 'data/v2';
const TREE_URL = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
const RAW = (p) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${p}`;
const OUT_DIR = 'tools/out';

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (n) => {
    const hit = argv.find(a => a.startsWith(`--${n}=`));
    return hit ? hit.split('=').slice(1).join('=') : null;
};

const lines = [];
const say = (s = '') => { lines.push(s); console.log(s); };

async function getJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'ufst-tools' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
}
async function getText(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'ufst-tools' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
}
const human = (n) => n == null ? '?' : n < 1024 ? `${n}B` : n < 1048576 ? `${(n / 1024).toFixed(0)}KB` : `${(n / 1048576).toFixed(1)}MB`;

async function saveReport(manifest) {
    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(path.join(OUT_DIR, 'open5e-tree.txt'), lines.join('\n'), 'utf8');
    if (manifest) await writeFile(path.join(OUT_DIR, 'open5e-tree.json'), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`\nSaved report -> ${OUT_DIR}/open5e-tree.txt` + (manifest ? ` and open5e-tree.json` : ''));
}

function describe(json) {
    const rows = Array.isArray(json) ? json : (json.results || null);
    const out = {};
    if (rows && Array.isArray(rows)) {
        out.kind = 'array'; out.count = rows.length;
        out.keys = rows.length ? Object.keys(rows[0]) : [];
        out.sample = rows.length ? rows[0] : null;
        say(`  array of ${rows.length} records`);
        if (rows.length) {
            say(`  keys: ${out.keys.join(', ')}`);
            say(`  first record (truncated):`);
            say('    ' + JSON.stringify(rows[0]).slice(0, 900));
        }
    } else {
        out.kind = 'object'; out.keys = Object.keys(json); out.sample = json;
        say(`  object with keys: ${out.keys.join(', ')}`);
        say('    ' + JSON.stringify(json).slice(0, 900));
    }
    return out;
}

async function main() {
    if (flag('--schema')) {
        const candidates = [
            'https://api.open5e.com/schema/',
            'https://api.open5e.com/v2/schema/',
            'https://api.open5e.com/api/schema/',
            'https://api.open5e.com/openapi-schema.yml',
        ];
        for (const url of candidates) {
            try {
                const text = await getText(url);
                if (text && text.length > 200) {
                    await mkdir(OUT_DIR, { recursive: true });
                    const dest = path.join(OUT_DIR, 'openapi-schema.yml');
                    await writeFile(dest, text, 'utf8');
                    say(`OK  ${url}\n    saved ${human(text.length)} -> ${dest}`);
                    return saveReport(null);
                }
                say(`--  ${url} (empty/short)`);
            } catch (e) { say(`--  ${url} (${e.message})`); }
        }
        say('\nNo schema endpoint responded. Generate one from a local clone:');
        say('  uv run python manage.py spectacular --color --file openapi-schema.yml');
        return saveReport(null);
    }

    const peek = opt('peek');
    if (peek) {
        say(`Fetching ${peek} ...`);
        const text = await getText(RAW(peek));
        say(`  size: ${human(text.length)}`);
        let shape = null;
        try { shape = describe(JSON.parse(text)); }
        catch { say('  (not JSON) first 400 chars:'); say(text.slice(0, 400)); }
        return saveReport({ peeked: peek, size: text.length, shape });
    }

    const get = opt('get');
    if (get) {
        const out = opt('out') || path.join(OUT_DIR, path.basename(get));
        const text = await getText(RAW(get));
        await mkdir(path.dirname(out), { recursive: true });
        await writeFile(out, text, 'utf8');
        console.log(`Saved ${human(text.length)} -> ${out}`);
        return;
    }

    say(`Repo: ${REPO} @ ${BRANCH}`);
    say(`Path: ${flag('--all') ? '(entire repo)' : ROOT_PATH}`);
    say('');
    const tree = await getJson(TREE_URL);
    if (tree.truncated) say('!! GitHub truncated the tree listing; some paths may be missing.\n');
    let files = (tree.tree || []).filter(n => n.type === 'blob');
    if (!flag('--all')) files = files.filter(n => n.path.startsWith(ROOT_PATH + '/'));
    const grep = opt('grep');
    if (grep) files = files.filter(n => n.path.toLowerCase().includes(grep.toLowerCase()));

    if (!files.length) {
        say('No files matched. Try --all, or check the branch (OPEN5E_BRANCH env var).');
        return saveReport({ files: [] });
    }

    // Group by "book" = first path segment under data/v2
    const books = new Map();
    for (const f of files) {
        const rel = f.path.startsWith(ROOT_PATH + '/') ? f.path.slice(ROOT_PATH.length + 1) : f.path;
        const book = rel.includes('/') ? rel.split('/')[0] : '(root)';
        if (!books.has(book)) books.set(book, []);
        books.get(book).push(f);
    }

    let total = 0;
    say(`${books.size} book folder(s), ${files.length} files\n`);
    for (const book of [...books.keys()].sort()) {
        const entries = books.get(book).sort((a, b) => a.path.localeCompare(b.path));
        const bytes = entries.reduce((s, e) => s + (e.size || 0), 0);
        total += bytes;
        say(`${book}/   (${entries.length} files, ${human(bytes)})`);
        if (flag('--files') || entries.length <= 12) {
            for (const e of entries) say(`   ${human(e.size).padStart(8)}  ${e.path.replace(ROOT_PATH + '/', '')}`);
        } else {
            const kinds = [...new Set(entries.map(e => path.posix.basename(e.path)))].slice(0, 12);
            say(`   files: ${kinds.join(', ')}${entries.length > 12 ? ', ...' : ''}`);
        }
    }
    say(`\nTOTAL ${files.length} files, ${human(total)}`);
    say('\nNext: preview one file to see its shape, e.g.');
    const sample = files.find(f => f.path.endsWith('.json'));
    if (sample) say(`  node tools/inspect-open5e-repo.mjs --peek=${sample.path}`);

    await saveReport({
        repo: REPO, branch: BRANCH, root: ROOT_PATH,
        books: [...books.entries()].map(([book, entries]) => ({
            book,
            fileCount: entries.length,
            bytes: entries.reduce((s, e) => s + (e.size || 0), 0),
            files: entries.map(e => ({ path: e.path, size: e.size })),
        })),
    });
}

main().catch(e => { console.error('FAILED:', e.message); process.exitCode = 1; });
