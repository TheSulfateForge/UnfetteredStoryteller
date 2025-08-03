/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- DATA INTERFACES ---
export interface Race {
    url: string;
    name: string;
    is_subrace: boolean;
    subrace_of?: string;
    ability_bonuses?: { [key: string]: number };
    traits: { name: string; desc: string; }[];
    skill_proficiencies?: { type: 'granted' | 'choice', choose?: number, from: string[] }[];
    // Other properties...
}
export interface Class {
    name: string;
    slug: string;
    hit_die: number;
    prof_saving_throws: string;
    skill_proficiencies: { type: 'granted' | 'choice', choose: number, from: string[] }[];
    table: string;
}
export interface Background {
    name: string;
    benefits?: {
        name: string;
        desc: string;
        type: string;
    }[];
    skill_proficiencies?: { type: 'granted' | 'choice', choose?: number, from: string[] }[];
    // Other properties...
}
export interface Weapon {
    name: string;
    damage_dice: string;
    is_finesse: boolean;
    properties: string[];
    // Other properties...
}
export interface Armor {
    name: string;
    category: string;
    ac_base: number;
    ac_add_dexmod: boolean;
    ac_cap_dexmod: number | null;
    // Other properties...
}

// --- DATA STORE ---
let races: Race[] = [];
let classes: Class[] = [];
let backgrounds: Background[] = [];
let weapons: Record<string, Weapon> = {}; // Store as object for easier lookup by name
let armor: Record<string, Armor> = {}; // Store as object for easier lookup by name


// --- HELPERS ---

/** Parses the 'Ability Score Increase' trait description to extract bonuses. */
function parseAbilityBonusString(desc: string): { [key: string]: number } {
    const bonuses: { [key: string]: number } = {};
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

/**
 * Finds and returns the data for a specific class by its name.
 * @param className The name of the class to find (e.g., "Rogue").
 * @returns The class data object, or undefined if not found.
 */
export function getClass(className: string): Class | undefined {
    if (!className) return undefined;
    return classes.find(c => c.name.toLowerCase() === className.toLowerCase());
}

/**
 * Finds and returns the data for a specific race by its name.
 * @param raceName The name of the race to find (e.g., "Elf").
 * @returns The race data object, or undefined if not found.
 */
export function getRace(raceName: string): Race | undefined {
    if (!raceName) return undefined;
    return races.find(r => r.name.toLowerCase() === raceName.toLowerCase());
}

/**
 * Finds and returns the data for a specific background by its name.
 * @param backgroundName The name of the background to find.
 * @returns The background data object, or undefined if not found.
 */
export function getBackground(backgroundName: string): Background | undefined {
    if (!backgroundName) return undefined;
    return backgrounds.find(b => b.name.toLowerCase() === backgroundName.toLowerCase());
}


// --- INITIALIZATION ---
/**
 * Fetches all game data from the /data directory and populates the stores.
 * Must be called once at application startup.
 */
export async function init() {
    try {
        const [
            racesRes, classesRes, backgroundsRes, weaponsRes, armorRes
        ] = await Promise.all([
            fetch('/UnfetteredStoryteller/data/races.json'),
            fetch('/UnfetteredStoryteller/data/classes.json'),
            fetch('/UnfetteredStoryteller/data/backgrounds.json'),
            fetch('/UnfetteredStoryteller/data/weapons.json'),
            fetch('/UnfetteredStoryteller/data/armor.json'),
        ]);

        // Note: some Open5e files have the data in a `results` key, others do not.
        const racesData = await racesRes.json();
        races = racesData.results || racesData; 

        // Post-process races to parse and combine ability score bonuses
        const raceUrlMap = new Map<string, Race>();
        races.forEach(r => raceUrlMap.set(r.url, r));

        races.forEach(race => {
            const allBonuses: { [key: string]: number } = {};

            const mergeBonuses = (r: Race) => {
                const asiTrait = r.traits.find(t => t.name === "Ability Score Increase");
                if (asiTrait) {
                    const parsed = parseAbilityBonusString(asiTrait.desc);
                    for (const key in parsed) {
                        allBonuses[key] = (allBonuses[key] || 0) + (parsed[key as keyof typeof parsed] || 0);
                    }
                }
            };

            if (race.is_subrace && race.subrace_of) {
                const parentRace = raceUrlMap.get(race.subrace_of);
                if (parentRace) mergeBonuses(parentRace);
            }
            mergeBonuses(race);
            race.ability_bonuses = allBonuses;
        });
        
        const classesData = await classesRes.json();
        classes = classesData.results || classesData;

        const rawBackgroundsData = await backgroundsRes.json();
        const rawBackgrounds: Background[] = rawBackgroundsData.results || rawBackgroundsData;
        backgrounds = [...new Map(rawBackgrounds.map(item => [item["name"], item])).values()]; // De-duplicate

        const weaponsData = await weaponsRes.json();
        const weaponsArray: Weapon[] = weaponsData.results || weaponsData;
        weaponsArray.forEach(w => { weapons[w.name.toLowerCase()] = w; });
        
        const armorData = await armorRes.json();
        const armorArray: Armor[] = armorData.results || armorData;
        armorArray.forEach(a => { armor[a.name.toLowerCase()] = a; });

        console.log("Game data loaded successfully.");
    } catch (error) {
        console.error("Failed to load game data:", error);
        // In a real-world app, you'd want more robust error handling,
        // maybe show a message to the user.
    }
}
