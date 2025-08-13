/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// This module contains the logic for converting different types of RPG
// JSON objects into clean, searchable text chunks for the RAG system.
// --- HELPER FUNCTIONS ---
/**
 * A simple sanitizer to remove markdown and pseudo-HTML for cleaner text.
 * @param {any} text The input text, which can be of any type but is expected to be a string.
 * @returns {string} A sanitized string.
 */
function sanitize(text) {
    if (!text)
        return '';
    return String(text).replace(/<[^>]*>/g, '').replace(/[\*_]/g, '').trim();
}
/**
 * Joins an array of strings with a given separator, returning an empty string if the array is empty or invalid.
 * @param {any} arr The array to join.
 * @param {string} separator The separator to use between elements. Defaults to ', '.
 * @returns {string} A joined string.
 */
function joinIfArray(arr, separator = ', ') {
    if (Array.isArray(arr) && arr.length > 0) {
        return arr.join(separator);
    }
    return '';
}
/**
 * Formats a list of objects that have 'name' and 'desc' properties into a human-readable string.
 * @param {any[] | undefined} list An array of objects, each expected to have 'name' and 'desc' properties.
 * @returns {string} A formatted string with each item on a new line, or an empty string if the list is invalid.
 */
function formatNameDescList(list) {
    if (!list || list.length === 0)
        return '';
    return list.map((a) => `- ${a.name}: ${sanitize(a.desc)}`).join('\n');
}
// --- STRATEGY FUNCTIONS ---
/**
 * Creates a text chunk for a spell.
 * @param {any} item The spell data object.
 * @returns {string} A formatted string chunk.
 */
function createSpellChunk(item) {
    let chunk = `Type: Spell\nName: ${item.name}\n`;
    if (item.level !== undefined) {
        const levelText = item.level === 0 ? "Cantrip" : `Level ${item.level}`;
        chunk += `Level: ${levelText}\n`;
    }
    if (item.school)
        chunk += `School: ${item.school}\n`;
    if (item.casting_time)
        chunk += `Casting Time: ${item.casting_time}\n`;
    if (item.range)
        chunk += `Range: ${item.range}\n`;
    if (item.duration)
        chunk += `Duration: ${item.duration}\n`;
    if (item.components)
        chunk += `Components: ${item.components}\n`;
    if (item.description)
        chunk += `Description: ${sanitize(item.description)}\n`;
    return chunk;
}
/**
 * Creates a text chunk for a monster.
 * @param {any} item The monster data object.
 * @returns {string} A formatted string chunk.
 */
function createMonsterChunk(item) {
    let chunk = `Type: Monster\nName: ${item.name}\n`;
    if (item.desc)
        chunk += `Description: ${sanitize(item.desc)}\n`;
    if (item.size)
        chunk += `Size: ${item.size}\n`;
    if (item.type)
        chunk += `Creature Type: ${item.type}\n`;
    if (item.alignment)
        chunk += `Alignment: ${item.alignment}\n`;
    if (item.armor_class)
        chunk += `AC: ${item.armor_class}\n`;
    if (item.hit_points)
        chunk += `HP: ${item.hit_points} (${item.hit_dice})\n`;
    if (item.speed)
        chunk += `Speed: ${JSON.stringify(item.speed)}\n`;
    if (item.strength)
        chunk += `Stats: STR ${item.strength}, DEX ${item.dexterity}, CON ${item.constitution}, INT ${item.intelligence}, WIS ${item.wisdom}, CHA ${item.charisma}\n`;
    if (item.skills && Object.keys(item.skills).length > 0)
        chunk += `Skills: ${JSON.stringify(item.skills)}\n`;
    if (item.senses)
        chunk += `Senses: ${item.senses}\n`;
    if (item.languages)
        chunk += `Languages: ${item.languages}\n`;
    if (item.challenge_rating)
        chunk += `CR: ${item.challenge_rating}\n`;
    const abilities = formatNameDescList(item.special_abilities);
    if (abilities)
        chunk += `Abilities:\n${abilities}\n`;
    const actions = formatNameDescList(item.actions);
    if (actions)
        chunk += `Actions:\n${actions}\n`;
    const legendary = formatNameDescList(item.legendary_actions);
    if (legendary)
        chunk += `Legendary Actions:\n${legendary}\n`;
    return chunk;
}
/**
 * Creates a text chunk for a character background.
 * @param {any} item The background data object.
 * @returns {string} A formatted string chunk.
 */
function createBackgroundChunk(item) {
    let chunk = `Type: Background\nName: ${item.name}\n`;
    if (item.desc)
        chunk += `Description: ${sanitize(item.desc)}\n`;
    const benefits = formatNameDescList(item.benefits);
    if (benefits)
        chunk += `Benefits:\n${benefits}\n`;
    return chunk;
}
/**
 * Creates a text chunk for a feat.
 * @param {any} item The feat data object.
 * @returns {string} A formatted string chunk.
 */
function createFeatChunk(item) {
    let chunk = `Type: Feat\nName: ${item.name}\n`;
    if (item.prerequisite)
        chunk += `Prerequisite: ${item.prerequisite}\n`;
    if (item.desc)
        chunk += `Description: ${sanitize(item.desc)}\n`;
    return chunk;
}
/**
 * Creates a text chunk for a game condition.
 * @param {any} item The condition data object.
 * @returns {string} A formatted string chunk.
 */
function createConditionChunk(item) {
    return `Type: Condition\nName: ${item.name}\nDescription: ${sanitize(item.desc)}\n`;
}
/**
 * Creates a text chunk for a character race.
 * @param {any} item The race data object.
 * @returns {string} A formatted string chunk.
 */
function createRaceChunk(item) {
    let chunk = `Type: Race\nName: ${item.name}\n`;
    if (item.desc)
        chunk += `Description: ${sanitize(item.desc)}\n`;
    const traits = formatNameDescList(item.traits);
    if (traits)
        chunk += `Traits:\n${traits}\n`;
    return chunk;
}
/**
 * Creates a text chunk for a character class.
 * @param {any} item The class data object.
 * @returns {string} A formatted string chunk.
 */
function createClassChunk(item) {
    let chunk = `Type: Class\nName: ${item.name}\n`;
    if (item.hit_dice)
        chunk += `Hit Dice: ${item.hit_dice}\n`;
    if (item.prof_armor)
        chunk += `Armor Proficiencies: ${item.prof_armor}\n`;
    if (item.prof_weapons)
        chunk += `Weapon Proficiencies: ${item.prof_weapons}\n`;
    if (item.prof_tools)
        chunk += `Tool Proficiencies: ${item.prof_tools}\n`;
    if (item.prof_saving_throws)
        chunk += `Saving Throw Proficiencies: ${item.prof_saving_throws}\n`;
    if (item.prof_skills)
        chunk += `Skill Proficiencies: ${item.prof_skills}\n`;
    if (item.archetypes) {
        const archetypesText = item.archetypes.map((a) => `\n---\nSubclass: ${a.name}\n${sanitize(a.desc)}\n---\n`).join('');
        chunk += `\nSubclasses:\n${archetypesText}`;
    }
    return chunk;
}
/**
 * Creates a text chunk for a magic item.
 * @param {any} item The magic item data object.
 * @returns {string} A formatted string chunk.
 */
function createMagicItemChunk(item) {
    let chunk = `Type: Magic Item\nName: ${item.name}\n`;
    if (item.type)
        chunk += `Item Type: ${item.type}\n`;
    if (item.rarity)
        chunk += `Rarity: ${item.rarity}\n`;
    if (item.requires_attunement)
        chunk += `Requires Attunement: ${item.requires_attunement}\n`;
    if (item.desc)
        chunk += `Description: ${sanitize(item.desc)}\n`;
    return chunk;
}
/**
 * Creates a text chunk for a weapon.
 * @param {any} item The weapon data object.
 * @returns {string} A formatted string chunk.
 */
function createWeaponChunk(item) {
    let chunk = `Type: Weapon\nName: ${item.name}\n`;
    if (item.category)
        chunk += `Category: ${item.category}\n`;
    if (item.damage_dice)
        chunk += `Damage: ${item.damage_dice}\n`;
    const properties = joinIfArray(item.properties);
    if (properties)
        chunk += `Properties: ${properties}\n`;
    return chunk;
}
/**
 * Creates a text chunk for a piece of armor.
 * @param {any} item The armor data object.
 * @returns {string} A formatted string chunk.
 */
function createArmorChunk(item) {
    let chunk = `Type: Armor\nName: ${item.name}\n`;
    if (item.category)
        chunk += `Category: ${item.category}\n`;
    if (item.ac_display)
        chunk += `AC: ${item.ac_display}\n`;
    return chunk;
}
/**
 * Creates a generic text chunk for a plane or lore section.
 * @param {any} item The plane or section data object.
 * @returns {string} A formatted string chunk.
 */
function createPlaneOrSectionChunk(item) {
    return `Type: Lore\nTopic: ${item.name}\nContent: ${sanitize(item.desc)}\n`;
}
/**
 * Creates a text chunk for a class spell list.
 * @param {any} item The spell list data object.
 * @returns {string} A formatted string chunk.
 */
function createSpellListChunk(item) {
    return `Type: Spell List\nClass: ${item.name}\nSpells: ${joinIfArray(item.spells)}`;
}
/**
 * Creates a text chunk for a custom lore entry.
 * @param {any} item The lore data object.
 * @returns {string} A formatted string chunk.
 */
function createLoreChunk(item) {
    let chunk = `Type: Custom Lore\n`;
    if (item.name)
        chunk += `Topic: ${item.name}\n`;
    if (item.type)
        chunk += `Category: ${item.type}\n`;
    if (item.desc)
        chunk += `Content: ${sanitize(item.desc)}\n`;
    return chunk;
}
/**
 * A mapping of data types to their corresponding chunking functions.
 */
const STRATEGIES = {
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
    spelllist: createSpellListChunk,
    documents: createPlaneOrSectionChunk,
    lore: createLoreChunk,
};
/**
 * Converts a structured data object into a text chunk for embedding using a strategy pattern.
 * @param {any} item The data object to convert.
 * @param {string} type The type of the data object (e.g., 'spells', 'monsters').
 * @returns {string} A formatted string chunk ready for embedding.
 */
export function createChunk(item, type) {
    const strategy = STRATEGIES[type];
    if (strategy) {
        return strategy(item);
    }
    // A simple fallback for any data types not explicitly handled.
    console.warn(`No chunking strategy found for type: ${type}. Using fallback.`);
    let chunk = `Type: ${type}\nName: ${item.name || item.slug}\n`;
    if (item.desc)
        chunk += `Description: ${sanitize(item.desc)}\n`;
    return chunk;
}
