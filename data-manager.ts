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
            fetch('/data/races.json'),
            fetch('/data/classes.json'),
            fetch('/data/backgrounds.json'),
            fetch('/data/weapons.json'),
            fetch('/data/armor.json'),
        ]);

        // Note: some Open5e files have the data in a `results` key, others do not.
        const racesData = await racesRes.json();
        races = racesData.results || racesData; 
        
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
