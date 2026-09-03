/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Builds the app's /data/*.json files from the upstream Open5e v2 source data
 * in /data/v2 (Django fixtures: {model, pk, fields}, one folder per book).
 *
 * Why this exists: /data/v2 is normalized (weapon properties, class tables and
 * traits live in separate files joined by string primary keys), while the app
 * expects denormalized, API-shaped records. This performs those joins.
 *
 * It also produces two things the old API data never gave us:
 *   - spelllist.json      derived from each Spell's `classes` array (never stale)
 *   - class-progression.json  per-level spells/cantrips/slots from ClassFeatureItem
 *
 * Requires Node 18+. No dependencies.
 *
 *   node tools/build-data-from-v2.mjs            Dry run: report only
 *   node tools/build-data-from-v2.mjs --write    Write /data (backs up first)
 *   node tools/build-data-from-v2.mjs --write --books=srd-2014
 */
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V2 = path.join(ROOT, 'data', 'v2');
const OUT = path.join(ROOT, 'data');
const BACKUP = path.join(ROOT, 'data-backup');

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const opt = (n) => { const h = argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : null; };
const BOOK_FILTER = (opt('books') || '').split(',').map(s => s.trim()).filter(Boolean);

// --- helpers -----------------------------------------------------------
const titleCase = (s) => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

async function loadAllowedSlugs() {
    const src = await readFile(path.join(ROOT, 'config.js'), 'utf8');
    const m = src.match(/ALLOWED_SOURCE_SLUGS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
    if (!m) throw new Error('ALLOWED_SOURCE_SLUGS not found in config.js');
    return new Set([...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]));
}

/** Finds every book folder: data/v2/<publisher>/<book>/ */
async function findBooks(allowed) {
    const books = [];
    for (const pub of await readdir(V2, { withFileTypes: true })) {
        if (!pub.isDirectory()) continue;
        for (const book of await readdir(path.join(V2, pub.name), { withFileTypes: true })) {
            if (!book.isDirectory()) continue;
            if (BOOK_FILTER.length && !BOOK_FILTER.includes(book.name)) continue;
            if (!allowed.has(book.name)) { console.log(`  skip (not licensed): ${pub.name}/${book.name}`); continue; }
            books.push({ publisher: pub.name, slug: book.name, dir: path.join(V2, pub.name, book.name) });
        }
    }
    return books;
}

/** Loads a fixture file and returns [{pk, ...fields}], or [] if absent. */
async function fixture(dir, file) {
    const p = path.join(dir, file);
    if (!existsSync(p)) return [];
    const raw = JSON.parse(await readFile(p, 'utf8'));
    const rows = Array.isArray(raw) ? raw : (raw.results || []);
    return rows.map(r => (r && r.fields ? { pk: r.pk, ...r.fields } : r));
}

const groupBy = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
        const k = r[key];
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(r);
    }
    return m;
};

// --- per-model builders -------------------------------------------------

/**
 * Known errors in the upstream Open5e v2 weapon property data (verified against
 * SRD 5.1). Applied as an explicit, auditable overlay so we neither inherit the
 * bugs silently nor diverge from upstream invisibly. Each entry notes the issue.
 */
const WEAPON_PROPERTY_CORRECTIONS = {
    'srd_crossbow-heavy': { add: ['ammunition', 'heavy'], note: 'SRD: heavy crossbow is Ammunition + Heavy; both missing upstream' },
    'srd_crossbow-light': { add: ['two-handed'], note: 'SRD: light crossbow is Two-Handed; missing upstream' },
    'srd_whip':           { add: ['finesse'],    note: 'SRD: whip is Finesse; missing upstream' },
    'srd_trident':        { remove: ['two-handed'], note: 'SRD: trident is Versatile, not Two-Handed' },
};
const APPLIED_CORRECTIONS = [];

/** Weapons: join WeaponPropertyAssignment -> boolean flags the app relies on. */
function buildWeapons(weapons, props, assigns, slug) {
    const propName = new Map(props.map(p => [p.pk, String(p.name || '').toLowerCase()]));
    const byWeapon = groupBy(assigns, 'weapon');
    return weapons.map(w => {
        const mine = byWeapon.get(w.pk) || [];
        let named = mine.map(a => ({ name: propName.get(a.property) || '', detail: a.detail }));
        const fix = WEAPON_PROPERTY_CORRECTIONS[w.pk];
        if (fix) {
            if (fix.remove) named = named.filter(p => !fix.remove.some(r => p.name.includes(r)));
            for (const add of fix.add || []) {
                if (!named.some(p => p.name.includes(add))) named.push({ name: add, detail: null });
            }
            APPLIED_CORRECTIONS.push(`${w.name}: ${fix.note}`);
        }
        const has = (n) => named.some(p => p.name.includes(n));
        const detailOf = (n) => named.find(p => p.name.includes(n))?.detail ?? null;
        // Match upstream API behaviour: a weapon is "ranged" only if it needs
        // ammunition. Thrown melee weapons (dagger, javelin) stay melee.
        const isRanged = has('ammunition');
        return {
            name: w.name,
            key: w.pk,
            document: slug,
            damage_dice: w.damage_dice,
            damage_type: w.damage_type,
            is_simple: !!w.is_simple,
            is_martial: !w.is_simple,
            is_melee: !isRanged,
            ranged_attack_possible: isRanged || has('thrown') || Number(w.range || 0) > 0,
            is_improvised: !!w.is_improvised,
            is_two_handed: has('two-handed'),
            is_versatile: has('versatile'),
            versatile_dice: detailOf('versatile'),
            is_finesse: has('finesse'),
            is_light: has('light'),
            is_heavy: has('heavy'),
            is_thrown: has('thrown'),
            is_reach: has('reach'),
            is_net: has('net'),
            is_lance: has('lance'),
            requires_ammunition: has('ammunition'),
            requires_loading: has('loading'),
            range: w.range ?? 0,
            long_range: w.long_range ?? 0,
            range_melee: isRanged ? 0 : 5,
            reach: has('reach') ? 10 : 5,
            distance_unit: w.distance_unit || 'feet',
            properties: named.filter(p => p.name).map(p => p.detail ? `${p.name} (${p.detail})` : p.name),
        };
    });
}

/**
 * Shields live in Item.json (category "shield"), not Armor.json, but the app
 * expects them in the armor table so body-armor lookups can exclude them.
 * The AC bonus only appears in prose, so parse it rather than hardcode.
 */
function buildShields(items, slug) {
    return items.filter(i => String(i.category).toLowerCase() === 'shield').map(i => {
        const m = String(i.desc || '').match(/increases your Armor Class by (\d+)/i);
        const bonus = m ? parseInt(m[1], 10) : (Number(i.armor_class) || 2);
        return {
            name: i.name, key: i.pk, document: slug,
            category: 'shield', ac_display: `+${bonus}`,
            ac_base: bonus, ac_add_dexmod: false, ac_cap_dexmod: null,
            grants_stealth_disadvantage: false, strength_score_required: null,
        };
    });
}

function buildArmor(armor, slug) {
    return armor.map(a => ({
        name: a.name, key: a.pk, document: slug,
        ac_base: a.ac_base,
        ac_add_dexmod: !!a.ac_add_dexmod,
        ac_cap_dexmod: a.ac_cap_dexmod ?? null,
        grants_stealth_disadvantage: !!a.grants_stealth_disadvantage,
        strength_score_required: a.strength_score_required ?? null,
        // The app groups armor by category; infer it from the AC rules.
        category: a.ac_add_dexmod ? (a.ac_cap_dexmod == null ? 'light' : 'medium') : 'heavy',
    }));
}

function buildSpecies(species, traits, slug) {
    const byParent = groupBy(traits, 'parent');
    return species.map(s => ({
        name: s.name, slug: s.pk, key: s.pk, url: s.pk, document: slug, desc: s.desc,
        is_subrace: !!s.subspecies_of,
        subrace_of: s.subspecies_of || null,
        traits: (byParent.get(s.pk) || []).map(t => ({ name: t.name, desc: t.desc, type: t.type })),
    }));
}

/**
 * Converts a v2 markdown equipment block into the single-line, semicolon
 * separated form the character creator's gear parser expects, e.g.
 *   "* (*a*) a greataxe or (*b*) any martial melee weapon"  ->  "(a) a greataxe or (b) any martial melee weapon; ..."
 */
function normalizeEquipmentText(desc) {
    if (!desc) return '';
    return String(desc)
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith('*') && !/^\*\*/.test(l))
        .map(l => l.replace(/^\*\s*/, '').replace(/\(\*([a-z])\*\)/gi, '($1)').trim())
        .filter(Boolean)
        .join('; ');
}

/** Parses the "**Skills:** Choose two from A, B, C" line into the app's choice shape. */
function parseSkillChoices(profDesc) {
    if (!profDesc) return [];
    const m = profDesc.match(/\*\*Skills:\*\*\s*([^\n|]+)/i);
    if (!m) return [];
    const text = m[1].trim();
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    const cm = text.match(/choose\s+(any\s+)?(\w+)/i);
    const choose = cm ? ((words[cm[2].toLowerCase()] ?? parseInt(cm[2], 10)) || 1) : 1;
    const fromPart = text.split(/from/i)[1];
    if (!fromPart) return [{ type: 'choice', choose, from: 'any' }];
    const from = fromPart.replace(/\band\b/gi, ',').split(',')
        .map(s => s.replace(/[.*]/g, '').trim()).filter(Boolean);
    return from.length ? [{ type: 'choice', choose, from }] : [];
}

function pick(desc, label) {
    if (!desc) return 'None';
    const m = desc.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n|]+)`, 'i'));
    return m ? m[1].trim().replace(/\s*\|\s*$/, '') : 'None';
}

function buildClasses(classes, features, items, slug) {
    const byParent = groupBy(features, 'parent');
    const itemsByParent = groupBy(items, 'parent');
    // Level at which each feature is gained, from ClassFeatureItem.
    const featureLevel = (featPk) => {
        const its = itemsByParent.get(featPk) || [];
        const levels = its.map(i => Number(i.level)).filter(Number.isFinite);
        return levels.length ? Math.min(...levels) : null;
    };
    return classes.filter(c => !c.subclass_of).map(c => {
        const feats = byParent.get(c.pk) || [];
        const find = (name) => feats.find(f => String(f.name).toLowerCase() === name)?.desc || '';
        const profDesc = find('proficiencies');
        const saves = (c.saving_throws || []).map(s => String(s).toUpperCase()).sort().join(', ');
        return {
            name: c.name, slug: c.pk, key: c.pk, document: slug,
            hit_die: parseInt(String(c.hit_dice || '').replace(/\D/g, ''), 10) || null,
            caster_type: c.caster_type || 'NONE',
            prof_saving_throws: saves,
            prof_armor: pick(profDesc, 'Armor'),
            prof_weapons: pick(profDesc, 'Weapons'),
            prof_tools: pick(profDesc, 'Tools'),
            skill_proficiencies: parseSkillChoices(profDesc),
            equipment: normalizeEquipmentText(find('equipment')),
            features: feats
                .filter(f => !['proficiencies', 'equipment'].includes(String(f.name).toLowerCase()))
                .map(f => ({ name: f.name, desc: f.desc, level: featureLevel(f.pk) })),
            archetypes: classes.filter(s => s.subclass_of === c.pk).map(s => ({ name: s.name, slug: s.pk })),
        };
    });
}

function buildBackgrounds(backgrounds, benefits, slug) {
    const byParent = groupBy(benefits, 'parent');
    return backgrounds.map(b => ({
        name: b.name, slug: b.pk, key: b.pk, document: slug, desc: b.desc,
        benefits: (byParent.get(b.pk) || []).map(x => ({ name: x.name, desc: x.desc, type: x.type })),
    }));
}

function buildFeats(feats, benefits, slug) {
    const byParent = groupBy(benefits, 'parent');
    return feats.map(f => ({
        name: f.name, slug: f.pk, key: f.pk, document: slug,
        desc: f.desc, prerequisite: f.prerequisite ?? null,
        benefits: (byParent.get(f.pk) || []).map(b => ({ name: b.name, desc: b.desc, type: b.type })),
    }));
}

function buildSpells(spells, slug) {
    return spells.map(s => {
        const comp = [s.verbal && 'V', s.somatic && 'S', s.material && 'M'].filter(Boolean).join(', ');
        return {
            name: s.name, slug: s.pk, key: s.pk, document: slug,
            level: Number(s.level ?? 0),
            school: titleCase(s.school || ''),
            casting_time: s.casting_time,
            range: s.range_text || (s.range != null ? `${s.range} ${s.range_unit || ''}`.trim() : ''),
            duration: s.duration,
            components: comp || 'None',
            material: s.material || '',
            ritual: !!s.ritual,
            concentration: !!s.concentration,
            description: s.desc,
            desc: s.desc,
            higher_level: s.higher_level || '',
            classes: s.classes || [],
            damage_types: s.damage_types || [],
            damage_roll: s.damage_roll || null,
            saving_throw_ability: s.saving_throw_ability || null,
        };
    });
}

/** spelllist.json derived from each spell's `classes` array. */
function buildSpellLists(allSpells) {
    const byClass = new Map();
    for (const s of allSpells) {
        for (const cls of s.classes || []) {
            const name = String(cls).split('_').pop();
            if (!byClass.has(name)) byClass.set(name, new Set());
            byClass.get(name).add(s.slug);
        }
    }
    return [...byClass.entries()].sort().map(([slug, set]) => ({
        slug, name: titleCase(slug), spells: [...set].sort(),
    }));
}

/** class-progression.json: per-level table columns from ClassFeatureItem. */
function buildProgression(classes, features, items) {
    const featById = new Map(features.map(f => [f.pk, f]));
    const out = {};
    for (const it of items) {
        const feat = featById.get(it.parent);
        if (!feat || it.column_value == null) continue;
        const classPk = feat.parent;
        const column = String(feat.name).toLowerCase().replace(/\s+/g, '-');
        const cls = String(classPk).split('_').pop();
        out[cls] = out[cls] || {};
        out[cls][column] = out[cls][column] || {};
        out[cls][column][it.level] = it.column_value;
    }
    // Convert level maps into 1..20 arrays for easy lookup.
    for (const cls of Object.keys(out)) {
        for (const col of Object.keys(out[cls])) {
            const m = out[cls][col];
            out[cls][col] = Array.from({ length: 20 }, (_, i) => m[i + 1] ?? null);
        }
    }
    return out;
}

/**
 * Challenge Rating -> experience award (SRD 5.1 "Experience Points by Challenge
 * Rating"). Upstream leaves experience_points_integer null on every creature,
 * but the game engine needs an XP value to grant combat rewards.
 */
const CR_TO_XP = {
    '0': 10, '0.125': 25, '0.25': 50, '0.5': 100,
    '1': 200, '2': 450, '3': 700, '4': 1100, '5': 1800, '6': 2300, '7': 2900,
    '8': 3900, '9': 5000, '10': 5900, '11': 7200, '12': 8400, '13': 10000,
    '14': 11500, '15': 13000, '16': 15000, '17': 18000, '18': 20000, '19': 22000,
    '20': 25000, '21': 33000, '22': 41000, '23': 50000, '24': 62000, '25': 75000,
    '26': 90000, '27': 105000, '28': 120000, '29': 135000, '30': 155000,
};
function xpForChallengeRating(cr) {
    const n = Number(cr);
    if (!Number.isFinite(n)) return null;
    const key = Number.isInteger(n) ? String(n) : String(n);
    return CR_TO_XP[key] ?? null;
}

/** Creatures: flatten stats and join actions/traits into the chunker's shape. */
function buildCreatures(creatures, actions, traits, slug) {
    const actByParent = groupBy(actions, 'parent');
    const trByParent = groupBy(traits, 'parent');
    const cr = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return v ?? '';
        return Number.isInteger(n) ? String(n) : (n < 1 ? String(n) : String(n));
    };
    const speedOf = (c) => {
        const s = {};
        for (const k of ['walk', 'fly', 'swim', 'climb', 'burrow']) if (Number(c[k]) > 0) s[k] = Number(c[k]);
        if (c.hover) s.hover = true;
        return s;
    };
    const skillsOf = (c) => {
        const out = {};
        for (const [k, v] of Object.entries(c)) {
            if (k.startsWith('skill_bonus_') && v != null) out[k.replace('skill_bonus_', '')] = v;
        }
        return out;
    };
    const sensesOf = (c) => {
        const parts = [];
        for (const [k, label] of [['darkvision_range', 'darkvision'], ['blindsight_range', 'blindsight'],
                                  ['truesight_range', 'truesight'], ['tremorsense_range', 'tremorsense'],
                                  ['telepathy_range', 'telepathy']]) {
            if (Number(c[k]) > 0) parts.push(`${label} ${c[k]} ft.`);
        }
        if (c.passive_perception != null) parts.push(`passive Perception ${c.passive_perception}`);
        return parts.join(', ');
    };
    const nd = (rows) => rows.map(a => ({ name: a.name, desc: a.desc }));
    return creatures.map(c => {
        const acts = actByParent.get(c.pk) || [];
        const isLegendary = (a) => String(a.action_type || '').toLowerCase().includes('legendary');
        return {
            name: c.name, slug: c.pk, key: c.pk, document: slug,
            size: c.size, type: c.type, subtype: c.subcategory || '', alignment: c.alignment,
            armor_class: c.armor_class, armor_desc: c.armor_detail || '',
            hit_points: c.hit_points, hit_dice: c.hit_dice,
            speed: speedOf(c),
            strength: c.ability_score_strength, dexterity: c.ability_score_dexterity,
            constitution: c.ability_score_constitution, intelligence: c.ability_score_intelligence,
            wisdom: c.ability_score_wisdom, charisma: c.ability_score_charisma,
            strength_save: c.saving_throw_strength ?? null, dexterity_save: c.saving_throw_dexterity ?? null,
            constitution_save: c.saving_throw_constitution ?? null, intelligence_save: c.saving_throw_intelligence ?? null,
            wisdom_save: c.saving_throw_wisdom ?? null, charisma_save: c.saving_throw_charisma ?? null,
            skills: skillsOf(c),
            senses: sensesOf(c),
            languages: c.languages_desc || c.languages || '',
            challenge_rating: cr(c.challenge_rating),
            xpValue: c.experience_points_integer ?? xpForChallengeRating(cr(c.challenge_rating)),
            proficiency_bonus: c.proficiency_bonus ?? null,
            damage_immunities: c.damage_immunities_display || '',
            damage_resistances: c.damage_resistances_display || '',
            damage_vulnerabilities: c.damage_vulnerabilities_display || '',
            condition_immunities: c.condition_immunities_display || '',
            environments: c.environments || [],
            special_abilities: nd(trByParent.get(c.pk) || []),
            actions: nd(acts.filter(a => !isLegendary(a))),
            legendary_actions: nd(acts.filter(isLegendary)),
        };
    });
}

function buildMagicItems(items, slug) {
    return items.map(i => ({
        name: i.name, slug: i.pk, key: i.pk, document: slug,
        type: i.category || '', rarity: i.rarity || '',
        requires_attunement: /attunement/i.test(String(i.desc || '')) ? 'requires attunement' : '',
        desc: i.desc || '', cost: i.cost ?? null,
    }));
}

/** Rules become "sections" for the knowledge base. */
function buildSections(rules, rulesets, slug) {
    const setName = new Map(rulesets.map(r => [r.pk, r.name]));
    const out = rulesets.map(r => ({ name: r.name, slug: r.pk, key: r.pk, document: slug, desc: r.desc || '' }));
    out.push(...rules.map(r => ({
        name: setName.get(r.ruleset) ? `${setName.get(r.ruleset)}: ${r.name}` : r.name,
        slug: r.pk, key: r.pk, document: slug, desc: r.desc || '',
    })));
    return out.filter(x => x.desc);
}

function buildPlanes(environments, slug) {
    return environments.map(e => ({
        name: e.name, slug: e.pk, key: e.pk, document: slug, desc: e.desc || '',
        aquatic: !!e.aquatic, interior: !!e.interior, planar: !!e.planar,
    }));
}

// --- write -------------------------------------------------------------
async function save(file, data, report) {
    const rows = Array.isArray(data) ? data : Object.keys(data);
    report.push({ file, count: rows.length });
    if (!WRITE) return;
    if (!Array.isArray(data) && Object.keys(data).length === 0) return;
    if (Array.isArray(data) && data.length === 0) { console.warn(`  !! ${file}: 0 rows, not written`); return; }
    const target = path.join(OUT, file);
    if (existsSync(target)) { await mkdir(BACKUP, { recursive: true }); await copyFile(target, path.join(BACKUP, file)); }
    const text = JSON.stringify(data);
    JSON.parse(text);
    await writeFile(target, text, 'utf8');
}

// --- main --------------------------------------------------------------
async function main() {
    if (!existsSync(V2)) throw new Error(`Missing ${V2}`);
    const allowed = await loadAllowedSlugs();
    const books = await findBooks(allowed);
    console.log(`Books: ${books.length}\n${books.map(b => '  ' + b.publisher + '/' + b.slug).join('\n')}\n`);

    const acc = { weapons: [], armor: [], species: [], classes: [], backgrounds: [], feats: [], spells: [], conditions: [], documents: [], creatures: [], magicitems: [], sections: [], planes: [] };
    const progressionParts = [];

    for (const b of books) {
        const [weapons, wprops, wassign, armor, species, straits,
               classes, cfeat, citem, backgrounds, bbenefit, feats, fbenefit,
               spells, conditions, documents] = await Promise.all([
            fixture(b.dir, 'Weapon.json'), fixture(b.dir, 'WeaponProperty.json'), fixture(b.dir, 'WeaponPropertyAssignment.json'),
            fixture(b.dir, 'Armor.json'), fixture(b.dir, 'Species.json'), fixture(b.dir, 'SpeciesTrait.json'),
            fixture(b.dir, 'CharacterClass.json'), fixture(b.dir, 'ClassFeature.json'), fixture(b.dir, 'ClassFeatureItem.json'),
            fixture(b.dir, 'Background.json'), fixture(b.dir, 'BackgroundBenefit.json'),
            fixture(b.dir, 'Feat.json'), fixture(b.dir, 'FeatBenefit.json'),
            fixture(b.dir, 'Spell.json'), fixture(b.dir, 'ConditionDescription.json'), fixture(b.dir, 'Document.json'),
        ]);
        const items = await fixture(b.dir, 'Item.json');
        const [creatures, cactions, ctraits, magicitems, rules, rulesets, environments] = await Promise.all([
            fixture(b.dir, 'Creature.json'), fixture(b.dir, 'CreatureAction.json'), fixture(b.dir, 'CreatureTrait.json'),
            fixture(b.dir, 'MagicItem.json'), fixture(b.dir, 'Rule.json'), fixture(b.dir, 'RuleSet.json'),
            fixture(b.dir, 'Environment.json'),
        ]);
        acc.creatures.push(...buildCreatures(creatures, cactions, ctraits, b.slug));
        acc.magicitems.push(...buildMagicItems(magicitems, b.slug));
        acc.sections.push(...buildSections(rules, rulesets, b.slug));
        acc.planes.push(...buildPlanes(environments, b.slug));
        acc.weapons.push(...buildWeapons(weapons, wprops, wassign, b.slug));
        acc.armor.push(...buildArmor(armor, b.slug), ...buildShields(items, b.slug));
        acc.species.push(...buildSpecies(species, straits, b.slug));
        acc.classes.push(...buildClasses(classes, cfeat, citem, b.slug));
        acc.backgrounds.push(...buildBackgrounds(backgrounds, bbenefit, b.slug));
        acc.feats.push(...buildFeats(feats, fbenefit, b.slug));
        acc.spells.push(...buildSpells(spells, b.slug));
        acc.conditions.push(...conditions.map(c => ({ ...c, document: b.slug })));
        acc.documents.push(...documents.map(d => ({ ...d, key: d.pk, slug: d.pk })));
        if (classes.length) progressionParts.push(buildProgression(classes, cfeat, citem));
        console.log(`  ${b.slug.padEnd(22)} spells=${String(spells.length).padStart(4)} creatures=${String(creatures.length).padStart(4)} magicitems=${String(magicitems.length).padStart(4)} rules=${String(rules.length).padStart(3)} species=${species.length} classes=${classes.filter(c=>!c.subclass_of).length}`);
    }

    const progression = Object.assign({}, ...progressionParts);
    const report = [];
    await save('weapons.json', acc.weapons, report);
    await save('armor.json', acc.armor, report);
    await save('races.json', acc.species, report);
    await save('classes.json', acc.classes, report);
    await save('backgrounds.json', acc.backgrounds, report);
    await save('feats.json', acc.feats, report);
    await save('conditions.json', acc.conditions, report);
    await save('documents.json', acc.documents, report);
    await save('monsters.json', acc.creatures, report);
    await save('magicitems.json', acc.magicitems, report);
    await save('sections.json', acc.sections, report);
    await save('planes.json', acc.planes, report);
    await save('spelllist.json', buildSpellLists(acc.spells), report);
    await save('class-progression.json', progression, report);
    for (const [file, levels] of [['spells-0-1.json', [0, 1]], ['spells-2-3.json', [2, 3]], ['spells-4-5.json', [4, 5]], ['spells-6-7.json', [6, 7]], ['spells-8-9.json', [8, 9]]]) {
        await save(file, acc.spells.filter(s => levels.includes(s.level)), report);
    }

    if (APPLIED_CORRECTIONS.length) {
        console.log('\n--- upstream data corrections applied ---');
        for (const c of [...new Set(APPLIED_CORRECTIONS)]) console.log('  ' + c);
    }
    console.log('\n--- output ---');
    for (const r of report) console.log(`  ${r.file.padEnd(24)} ${r.count}`);
    console.log(WRITE ? `\nWritten to ${OUT} (backups in ${BACKUP})` : '\nDry run: nothing written. Re-run with --write.');
}

main().catch(e => { console.error('FAILED:', e.message, '\n', e.stack); process.exitCode = 1; });
