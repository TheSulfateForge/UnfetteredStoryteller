/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { toCamelCase, escapeRegExp } from './utils.js';
import { DEFAULT_SKILLS } from './rpg-helpers.js';
// --- DATA STORE ---
let races = [];
let classes = [];
let backgrounds = [];
let weapons = {}; // Store as object for easier lookup by name
let armor = {}; // Store as object for easier lookup by name
let spells = new Map();
let spellLists = new Map();
let feats = [];
// --- HELPERS ---
/**
 * Parses the 'Ability Score Increase' trait description to extract bonuses.
 * @param desc The description string of the trait.
 * @returns An object mapping ability scores to their bonus values.
 */
function parseAbilityBonusString(desc) {
    const bonuses = {};
    const abilityScores = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
    if (desc.includes("each increase by 1")) {
        return { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 };
    }
    const regex = /(\w+)\s+score\s+increases\s+by\s+(\d+)/gi;
    let match;
    while ((match = regex.exec(desc)) !== null) {
        const ability = match[1].toLowerCase();
        const value = parseInt(match[2], 10);
        if (abilityScores.includes(ability)) {
            bonuses[ability] = (bonuses[ability] || 0) + value;
        }
    }
    return bonuses;
}
// --- PUBLIC GETTERS ---
export const getRaces = () => races;
export const getClasses = () => classes;
export const getBackgrounds = () => backgrounds;
export const getWeapons = () => weapons;
export const getArmor = () => armor;
export const getFeats = () => feats;
export const getSpell = (slug) => spells.get(slug);
export const getSpellList = (className) => spellLists.get(className.toLowerCase());
/**
 * Finds and returns the data for a specific class by its name.
 * @param className The name of the class to find (e.g., "Rogue").
 * @returns The class data object, or undefined if not found.
 */
export function getClass(className) {
    if (!className)
        return undefined;
    return classes.find(c => c.name.toLowerCase() === className.toLowerCase());
}
/**
 * Finds and returns the data for a specific race by its name.
 * @param raceName The name of the race to find (e.g., "Elf").
 * @returns The race data object, or undefined if not found.
 */
export function getRace(raceName) {
    if (!raceName)
        return undefined;
    return races.find(r => r.name.toLowerCase() === raceName.toLowerCase());
}
/**
 * Finds and returns the data for a specific background by its name.
 * @param backgroundName The name of the background to find.
 * @returns The background data object, or undefined if not found.
 */
export function getBackground(backgroundName) {
    if (!backgroundName)
        return undefined;
    return backgrounds.find(b => b.name.toLowerCase() === backgroundName.toLowerCase());
}
// --- INITIALIZATION ---
/**
 * Fetches all game data from the /data directory and populates the stores.
 * Must be called once at application startup.
 */
export async function init() {
    try {
        const [racesRes, classesRes, backgroundsRes, weaponsRes, armorRes, spellsRes, spellListRes, featsRes] = await Promise.all([
            fetch('./data/races.json'),
            fetch('./data/classes.json'),
            fetch('./data/backgrounds.json'),
            fetch('./data/weapons.json'),
            fetch('./data/armor.json'),
            fetch('./data/spells-0-1.json'),
            fetch('./data/spelllist.json'),
            fetch('./data/feats.json'),
        ]);
        const racesData = await racesRes.json();
        races = racesData.results || racesData;
        const classesData = await classesRes.json();
        classes = classesData.results || classesData;
        const rawBackgroundsData = await backgroundsRes.json();
        const rawBackgrounds = rawBackgroundsData.results || rawBackgroundsData;
        const weaponsData = await weaponsRes.json();
        const weaponsArray = weaponsData.results || weaponsData;
        weaponsArray.forEach(w => { weapons[w.name.toLowerCase()] = w; });
        const armorData = await armorRes.json();
        const armorArray = armorData.results || armorData;
        armorArray.forEach(a => { armor[a.name.toLowerCase()] = a; });
        const spellsData = await spellsRes.json();
        const spellsArray = spellsData.results || spellsData;
        spellsArray.forEach(s => {
            const slug = s.name.toLowerCase().replace(/[\s/]+/g, '-');
            spells.set(slug, s);
        });
        const spellListData = await spellListRes.json();
        const spellListArray = spellListData.results || spellListData;
        spellListArray.forEach(sl => spellLists.set(sl.slug.toLowerCase(), sl));
        const featsData = await featsRes.json();
        feats = featsData.results || featsData;
        // --- Post-process and pre-calculate data for performance ---
        // 1. Process Races
        const raceUrlMap = new Map();
        races.forEach(r => raceUrlMap.set(r.url, r));
        races.forEach(race => {
            // Parse Ability Bonuses
            const allBonuses = {};
            const mergeBonuses = (r) => {
                const asiTrait = r.traits.find(t => t.name === "Ability Score Increase");
                if (asiTrait) {
                    const parsed = parseAbilityBonusString(asiTrait.desc);
                    for (const key in parsed)
                        allBonuses[key] = (allBonuses[key] || 0) + (parsed[key] || 0);
                }
            };
            if (race.is_subrace && race.subrace_of) {
                const parentRace = raceUrlMap.get(race.subrace_of);
                if (parentRace)
                    mergeBonuses(parentRace);
            }
            mergeBonuses(race);
            race.ability_bonuses = allBonuses;
            // Parse Skill Proficiencies
            race.parsed_skill_proficiencies = { granted: [], choices: [] };
            if (race.traits) {
                const allSkillNames = Object.keys(DEFAULT_SKILLS).map(s => s.replace(/([A-Z])/g, ' $1'));
                race.traits.forEach((trait) => {
                    const desc = (trait.desc || '').toLowerCase();
                    if (desc.includes('proficiency in the') || desc.includes('proficiency in two skills')) {
                        if (desc.includes('two skills of your choice')) {
                            race.parsed_skill_proficiencies.choices.push({ choose: 2, from: allSkillNames });
                        }
                        else {
                            allSkillNames.forEach(skillName => {
                                const skillRegex = new RegExp(`\\b${escapeRegExp(skillName.toLowerCase())}\\b`);
                                if (skillRegex.test(desc))
                                    race.parsed_skill_proficiencies.granted.push(toCamelCase(skillName));
                            });
                        }
                    }
                });
            }
        });
        // 2. Process Backgrounds
        rawBackgrounds.forEach(bg => {
            bg.parsed_skill_proficiencies = { granted: [], choices: [] };
            if (bg.benefits) {
                bg.benefits.forEach((benefit) => {
                    if (benefit.type === 'granted' && Array.isArray(benefit.from)) {
                        benefit.from.forEach((skill) => bg.parsed_skill_proficiencies.granted.push(toCamelCase(skill.trim().replace(/\./g, ''))));
                    }
                    else if (benefit.type === 'choose' && Array.isArray(benefit.from)) {
                        bg.parsed_skill_proficiencies.choices.push({ choose: 1, from: benefit.from.map((s) => s.trim().replace(/\./g, '')) });
                    }
                    else if (benefit.type === 'skill_proficiency' && benefit.desc) {
                        if (benefit.desc.toLowerCase().includes('plus your choice of')) {
                            const parts = benefit.desc.split(/plus your choice of/i);
                            parts[0].split(',').forEach(skill => {
                                if (skill.trim())
                                    bg.parsed_skill_proficiencies.granted.push(toCamelCase(skill.trim()));
                            });
                            if (parts[1]) {
                                const numToChooseMatch = parts[1].trim().match(/^(one|two)/i);
                                const numToChoose = numToChooseMatch ? (numToChooseMatch[1].toLowerCase() === 'one' ? 1 : 2) : 1;
                                const choicesText = parts[1].replace(/^(one|two)\s+(from|between|among)/i, '').trim();
                                const choices = choicesText.split(/or|,/g).map(s => s.trim().replace(/\./g, ''));
                                bg.parsed_skill_proficiencies.choices.push({ choose: numToChoose, from: choices });
                            }
                        }
                        else {
                            benefit.desc.split(',').forEach((skill) => { if (skill.trim())
                                bg.parsed_skill_proficiencies.granted.push(toCamelCase(skill.trim())); });
                        }
                    }
                });
            }
        });
        backgrounds = [...new Map(rawBackgrounds.map(item => [item["name"], item])).values()];
        console.log("Game data loaded and processed successfully.");
    }
    catch (error) {
        console.error("Failed to load game data:", error);
    }
}
