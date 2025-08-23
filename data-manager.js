/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { toCamelCase, escapeRegExp } from './utils.js';
import { DEFAULT_SKILLS } from './rpg-helpers.js';
import { createChunk } from './chunking-strategies.js';
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
/**
 * Searches through all loaded game data to find an entity whose name is mentioned in the given text.
 * It prioritizes longer matches to avoid partial matches (e.g., "Shield" over "Shield of Faith").
 * @param text The text to search within.
 * @returns The found entity's name and a formatted text chunk, or null if no entity is found.
 */
export function findEntityInText(text) {
    const allEntities = [];
    // Collate all entities from different data stores
    races.forEach(r => allEntities.push({ name: r.name, data: r, type: 'races' }));
    classes.forEach(c => allEntities.push({ name: c.name, data: c, type: 'classes' }));
    backgrounds.forEach(b => allEntities.push({ name: b.name, data: b, type: 'backgrounds' }));
    feats.forEach(f => allEntities.push({ name: f.name, data: f, type: 'feats' }));
    // Spells are in a Map, iterate over values
    for (const spell of spells.values()) {
        allEntities.push({ name: spell.name, data: spell, type: 'spells' });
    }
    // Weapons and Armor are in Records, iterate over values
    Object.values(weapons).forEach(w => allEntities.push({ name: w.name, data: w, type: 'weapons' }));
    Object.values(armor).forEach(a => allEntities.push({ name: a.name, data: a, type: 'armor' }));
    // Sort by name length descending to match longer names first
    allEntities.sort((a, b) => b.name.length - a.name.length);
    const lowerText = text.toLowerCase();
    for (const entity of allEntities) {
        // Use a regex with word boundaries to avoid partial matches
        const entityRegex = new RegExp(`\\b${escapeRegExp(entity.name.toLowerCase())}\\b`);
        if (entityRegex.test(lowerText)) {
            return {
                name: entity.name,
                chunk: createChunk(entity.data, entity.type)
            };
        }
    }
    return null;
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
                        const skills = benefit.from.flatMap(s => s.split(/, | or /i)).map(sk => sk.trim().replace(/\./g, ''));
                        bg.parsed_skill_proficiencies.choices.push({ choose: 1, from: skills });
                    }
                    else if (benefit.type === 'skill_proficiency' && benefit.desc) {
                        let desc = benefit.desc.trim().replace(/\.$/, ''); // clean trailing period
                        const choiceRegex = /plus (your choice of )?(one|two)( between| from among)?/i;
                        const choiceMatch = desc.match(choiceRegex);
                        if (choiceMatch) {
                            const grantedPart = desc.substring(0, choiceMatch.index).trim().replace(/,$/, '').trim();
                            const choicePart = desc.substring(choiceMatch.index + choiceMatch[0].length).trim();
                            const numToChoose = (choiceMatch[2] && choiceMatch[2].toLowerCase() === 'two') ? 2 : 1;
                            // Process granted skills
                            if (grantedPart) {
                                grantedPart.split(/, | and /i).forEach(skill => {
                                    if (skill)
                                        bg.parsed_skill_proficiencies.granted.push(toCamelCase(skill));
                                });
                            }
                            // Process choice part
                            const choices = choicePart.split(/ or |,/i).map(s => s.trim()).filter(Boolean);
                            bg.parsed_skill_proficiencies.choices.push({ choose: numToChoose, from: choices });
                        }
                        else {
                            // No "choice" keyword, so all skills are granted
                            desc.split(/, | and /i).forEach(skill => {
                                const cleanedSkill = skill.trim();
                                if (cleanedSkill) {
                                    bg.parsed_skill_proficiencies.granted.push(toCamelCase(cleanedSkill));
                                }
                            });
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