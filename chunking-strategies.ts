
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This module contains the logic for converting different types of RPG
// JSON objects into clean, searchable text chunks for the RAG system.

// --- HELPER FUNCTIONS ---

/** A simple sanitizer to remove markdown/HTML for cleaner text. */
function sanitize(text: any): string {
    if (!text) return '';
    return String(text).replace(/<[^>]*>/g, '').replace(/[\*_]/g, '').trim();
}

/** Joins an array of strings with a given separator, returning an empty string if the array is empty. */
function joinIfArray(arr: any, separator = ', '): string {
    if (Array.isArray(arr) && arr.length > 0) {
        return arr.join(separator);
    }
    return '';
}

/** Formats a list of objects with name and desc properties. */
function formatNameDescList(list: any[] | undefined): string {
    if (!list || list.length === 0) return '';
    return list.map((a: any) => `- ${a.name}: ${sanitize(a.desc)}`).join('\n');
}

// --- STRATEGY FUNCTIONS ---

function createSpellChunk(item: any): string {
    let chunk = `Type: Spell\nName: ${item.name}\n`;
    if (item.level_text) chunk += `Level: ${item.level_text}\n`;
    if (item.school) chunk += `School: ${item.school}\n`;
    if (item.casting_time) chunk += `Casting Time: ${item.casting_time}\n`;
    if (item.range) chunk += `Range: ${item.range}\n`;
    if (item.duration) chunk += `Duration: ${item.duration}\n`;
    if (item.components) chunk += `Components: ${item.components}\n`;
    if (item.desc) chunk += `Description: ${sanitize(item.desc)}\n`;
    if (item.higher_level) chunk += `At Higher Levels: ${sanitize(item.higher_level)}\n`;
    if (item.classes) chunk += `Classes: ${item.classes}\n`;
    return chunk;
}

function createMonsterChunk(item: any): string {
    let chunk = `Type: Monster\nName: ${item.name}\n`;
    if (item.desc) chunk += `Description: ${sanitize(item.desc)}\n`;
    if (item.size) chunk += `Size: ${item.size}\n`;
    if (item.type) chunk += `Creature Type: ${item.type}\n`;
    if (item.alignment) chunk += `Alignment: ${item.alignment}\n`;
    if (item.armor_class) chunk += `AC: ${item.armor_class}\n`;
    if (item.hit_points) chunk += `HP: ${item.hit_points} (${item.hit_dice})\n`;
    if (item.speed) chunk += `Speed: ${JSON.stringify(item.speed)}\n`;
    if (item.strength) chunk += `Stats: STR ${item.strength}, DEX ${item.dexterity}, CON ${item.constitution}, INT ${item.intelligence}, WIS ${item.wisdom}, CHA ${item.charisma}\n`;
    if (item.skills && Object.keys(item.skills).length > 0) chunk += `Skills: ${JSON.stringify(item.skills)}\n`;
    if (item.senses) chunk += `Senses: ${item.senses}\n`;
    if (item.languages) chunk += `Languages: ${item.languages}\n`;
    if (item.challenge_rating) chunk += `CR: ${item.challenge_rating}\n`;
    const abilities = formatNameDescList(item.special_abilities);
    if (abilities) chunk += `Abilities:\n${abilities}\n`;
    const actions = formatNameDescList(item.actions);
    if (actions) chunk += `Actions:\n${actions}\n`;
    const legendary = formatNameDescList(item.legendary_actions);
    if (legendary) chunk += `Legendary Actions:\n${legendary}\n`;
    return chunk;
}

function createBackgroundChunk(item: any): string {
    let chunk = `Type: Background\nName: ${item.name}\n`;
    if (item.desc) chunk += `Description: ${sanitize(item.desc)}\n`;
    const benefits = formatNameDescList(item.benefits);
    if (benefits) chunk += `Benefits:\n${benefits}\n`;
    return chunk;
}

function createFeatChunk(item: any): string {
    let chunk = `Type: Feat\nName: ${item.name}\n`;
    if (item.prerequisite) chunk += `Prerequisite: ${item.prerequisite}\n`;
    if (item.desc) chunk += `Description: ${sanitize(item.desc)}\n`;
    return chunk;
}

function createConditionChunk(item: any): string {
    return `Type: Condition\nName: ${item.name}\nDescription: ${sanitize(item.desc)}\n`;
}

function createRaceChunk(item: any): string {
    let chunk = `Type: Race\nName: ${item.name}\n`;
    if (item.desc) chunk += `Description: ${sanitize(item.desc)}\n`;
    const traits = formatNameDescList(item.traits);
    if (traits) chunk += `Traits:\n${traits}\n`;
    return chunk;
}

function createClassChunk(item: any): string {
    let chunk = `Type: Class\nName: ${item.name}\n`;
    if(item.hit_dice) chunk += `Hit Dice: ${item.hit_dice}\n`;
    if(item.prof_armor) chunk += `Armor Proficiencies: ${item.prof_armor}\n`;
    if(item.prof_weapons) chunk += `Weapon Proficiencies: ${item.prof_weapons}\n`;
    if(item.prof_tools) chunk += `Tool Proficiencies: ${item.prof_tools}\n`;
    if(item.prof_saving_throws) chunk += `Saving Throw Proficiencies: ${item.prof_saving_throws}\n`;
    if(item.prof_skills) chunk += `Skill Proficiencies: ${item.prof_skills}\n`;
    if (item.archetypes) {
        const archetypesText = item.archetypes.map((a: any) => `\n---\nSubclass: ${a.name}\n${sanitize(a.desc)}\n---\n`).join('');
        chunk += `\nSubclasses:\n${archetypesText}`;
    }
    return chunk;
}

function createMagicItemChunk(item: any): string {
    let chunk = `Type: Magic Item\nName: ${item.name}\n`;
    if (item.type) chunk += `Item Type: ${item.type}\n`;
    if (item.rarity) chunk += `Rarity: ${item.rarity}\n`;
    if (item.requires_attunement) chunk += `Requires Attunement: ${item.requires_attunement}\n`;
    if (item.desc) chunk += `Description: ${sanitize(item.desc)}\n`;
    return chunk;
}

function createWeaponChunk(item: any): string {
    let chunk = `Type: Weapon\nName: ${item.name}\n`;
    if (item.category) chunk += `Category: ${item.category}\n`;
    if (item.damage_dice) chunk += `Damage: ${item.damage_dice}\n`;
    const properties = joinIfArray(item.properties);
    if (properties) chunk += `Properties: ${properties}\n`;
    return chunk;
}

function createArmorChunk(item: any): string {
    let chunk = `Type: Armor\nName: ${item.name}\n`;
    if (item.category) chunk += `Category: ${item.category}\n`;
    if (item.ac_display) chunk += `AC: ${item.ac_display}\n`;
    return chunk;
}

function createPlaneOrSectionChunk(item: any): string {
    return `Type: Lore\nTopic: ${item.name}\nContent: ${sanitize(item.desc)}\n`;
}

function createSpellListChunk(item: any): string {
    return `Type: Spell List\nClass: ${item.name}\nSpells: ${joinIfArray(item.spells)}`;
}

const STRATEGIES: Record<string, (item: any) => string> = {
    spells: createSpellChunk,
    monsters: createMonsterChunk,
    backgrounds: createBackgroundChunk,
    feats: createFeatChunk,
    conditions: createConditionChunk,
    races: createRaceChunk,
    classes: createClassChunk,
    magicitems: createMagicItemChunk,
    weapons: createWeaponChunk,
    armor: createArmorChunk,
    planes: createPlaneOrSectionChunk,
    sections: createPlaneOrSectionChunk,
    spelllist: createSpellListChunk
};

/** Converts a structured data object into a text chunk for embedding using a strategy pattern. */
export function createChunk(item: any, type: string): string {
    const strategy = STRATEGIES[type];
    if (strategy) {
        return strategy(item);
    }
    // A simple fallback for any data types not explicitly handled.
    console.warn(`No chunking strategy found for type: ${type}. Using fallback.`);
    let chunk = `Type: ${type}\nName: ${item.name || item.slug}\n`;
    if (item.desc) chunk += `Description: ${sanitize(item.desc)}\n`;
    return chunk;
}