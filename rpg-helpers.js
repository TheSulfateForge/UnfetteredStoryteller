/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as dataManager from './data-manager.js';
const SKILL_TO_ABILITY_MAP = {
    acrobatics: 'dexterity', animalHandling: 'wisdom', arcana: 'intelligence',
    athletics: 'strength', culture: 'intelligence', deception: 'charisma', engineering: 'intelligence',
    history: 'intelligence', insight: 'wisdom', intimidation: 'charisma', investigation: 'intelligence',
    medicine: 'wisdom', nature: 'intelligence', perception: 'wisdom',
    performance: 'charisma', persuasion: 'charisma', religion: 'intelligence',
    sleightOfHand: 'dexterity', stealth: 'dexterity', survival: 'wisdom',
    strength: 'strength', dexterity: 'dexterity', constitution: 'constitution',
    intelligence: 'intelligence', wisdom: 'wisdom', charisma: 'charisma'
};
export const DEFAULT_SKILLS = {
    acrobatics: 'none', animalHandling: 'none', arcana: 'none', athletics: 'none',
    culture: 'none', deception: 'none', engineering: 'none', history: 'none', insight: 'none',
    intimidation: 'none', investigation: 'none', medicine: 'none', nature: 'none',
    perception: 'none', performance: 'none', persuasion: 'none', religion: 'none',
    sleightOfHand: 'none', stealth: 'none', survival: 'none',
};
export const DEFAULT_SAVING_THROWS = {
    strength: 'none', dexterity: 'none', constitution: 'none',
    intelligence: 'none', wisdom: 'none', charisma: 'none',
};
/**
 * An array containing the total experience points required to reach a specific level.
 * The value at index `i` represents the total XP needed to reach level `i + 1`.
 * e.g., LEVEL_XP_THRESHOLDS[1] is 300, the XP needed to reach Level 2.
 */
export const LEVEL_XP_THRESHOLDS = [
    0,
    300,
    900,
    2700,
    6500,
    14000,
    23000,
    34000,
    48000,
    64000,
    85000,
    100000,
    120000,
    140000,
    165000,
    195000,
    225000,
    265000,
    305000,
    355000, // Level 20
];
/**
 * Calculates the point-buy cost for a single ability score.
 * @param {number} score The ability score value (from 8 to 20).
 * @returns {number} The number of points required for that score.
 */
export function getPointBuyCost(score) {
    switch (score) {
        case 8: return -2;
        case 9: return -1;
        case 10: return 0;
        case 11: return 1;
        case 12: return 2;
        case 13: return 3;
        case 14: return 5;
        case 15: return 7;
        case 16: return 10;
        case 17: return 13;
        case 18: return 17;
        case 19: return 22;
        case 20: return 28;
        default: return 0; // Scores outside range
    }
}
export function getAbilityModifierValue(score) {
    return Math.floor((score - 10) / 2);
}
export function calculateProficiencyBonus(level) {
    return Math.ceil(1 + (level / 4));
}
export function rollDice(diceNotation) {
    if (typeof diceNotation === 'string' && diceNotation.includes('d')) {
        const [countPart, sidesPart] = diceNotation.trim().toLowerCase().split('d');
        // An omitted count means a single die: "d20" is "1d20". Previously this
        // parsed to NaN, so the loop below never ran and the roll was ALWAYS 0 —
        // silently breaking every NPC attack, NPC skill check and initiative roll.
        const numDice = countPart.trim() === '' ? 1 : parseInt(countPart, 10);
        const numSides = parseInt(sidesPart, 10);
        if (!Number.isFinite(numDice) || !Number.isFinite(numSides) || numDice < 1 || numSides < 1) {
            console.warn(`rollDice: could not parse dice notation "${diceNotation}".`);
            return { rolls: [0], total: 0 };
        }
        let total = 0;
        const rolls = [];
        for (let i = 0; i < numDice; i++) {
            const roll = Math.floor(Math.random() * numSides) + 1;
            rolls.push(roll);
            total += roll;
        }
        return { rolls, total };
    }
    else {
        const constantDamage = parseInt(diceNotation, 10);
        if (!isNaN(constantDamage)) {
            return { rolls: [constantDamage], total: constantDamage };
        }
    }
    return { rolls: [0], total: 0 };
}
export function getWeaponData(weaponName) {
    const weapons = dataManager.getWeapons();
    if (!weaponName || !weapons)
        return null;
    const normalizedName = weaponName.toLowerCase().replace(/\+\d+\s*/, '').trim();
    const weaponKeys = Object.keys(weapons);
    const matchingWeaponKey = weaponKeys
        .filter(key => normalizedName.includes(key))
        .sort((a, b) => b.length - a.length)[0];
    return matchingWeaponKey ? weapons[matchingWeaponKey] : null;
}
export function calculateArmorClass(playerState) {
    const armors = dataManager.getArmor();
    if (!armors)
        return 10 + getAbilityModifierValue(playerState.abilityScores.dexterity);
    const equippedArmorName = playerState.equipment.armor?.toLowerCase() || 'none';
    // More robust shield detection using a regex for the whole word "shield".
    const shieldRegex = /\bshield\b/;
    const ownsShield = playerState.inventory.some(i => shieldRegex.test(i.toLowerCase())) ||
        shieldRegex.test(equippedArmorName);
    // A two-handed weapon occupies both hands, so a carried shield grants no AC
    // while it is wielded (SRD "Two-Handed" weapon property).
    const equippedWeaponData = getWeaponData(playerState.equipment.weapon);
    const usingTwoHandedWeapon = equippedWeaponData?.is_two_handed === true;
    const isWearingShield = ownsShield && !usingTwoHandedWeapon;
    // For lookup, remove the shield part from the armor string.
    const armorNameToLookUp = equippedArmorName.replace(/,?\s*(with a\s*)?shield/g, '').trim();
    let baseAc = 10;
    const dexMod = getAbilityModifierValue(playerState.abilityScores.dexterity);
    // Find armor in the lookup table using the cleaned name
    const armorKeys = Object.keys(armors);
    const matchingArmorKey = armorKeys
        .filter(key => armorNameToLookUp.includes(key) && armors[key].category !== 'shield')
        .sort((a, b) => b.length - a.length)[0];
    const armorData = matchingArmorKey ? armors[matchingArmorKey] : null;
    if (armorData) {
        baseAc = armorData.ac_base;
        if (armorData.ac_add_dexmod) {
            const dexBonus = armorData.ac_cap_dexmod !== null ? Math.min(dexMod, armorData.ac_cap_dexmod) : dexMod;
            baseAc += dexBonus;
        }
    }
    else {
        // Unarmored
        baseAc = 10 + dexMod;
    }
    if (isWearingShield) {
        baseAc += 2;
    }
    return baseAc;
}
/**
 * Normalises a skill name to its state key. The AI writes skills in prose
 * ("Sleight of Hand", "animal handling"), while state and the ability map use
 * camelCase, so both sides are compared with punctuation and case removed.
 * @param {string} name
 * @returns {string|undefined} The matching camelCase key, if any.
 */
export function resolveSkillKey(name) {
    const flat = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!flat)
        return undefined;
    return Object.keys(SKILL_TO_ABILITY_MAP).find(key => key.toLowerCase() === flat);
}
export function calculateRollModifier(skillOrAbility, playerState) {
    const skillKey = resolveSkillKey(skillOrAbility);
    const abilityKey = skillKey ? SKILL_TO_ABILITY_MAP[skillKey] : undefined;
    if (!abilityKey)
        return 0;
    const abilityScore = playerState.abilityScores[abilityKey];
    const abilityModifier = getAbilityModifierValue(abilityScore);
    let proficiencyBonus = 0;
    const skillProficiency = playerState.skills?.[skillKey];
    if (skillProficiency === 'expert') {
        // Expertise doubles the proficiency bonus for that skill.
        proficiencyBonus = playerState.proficiencyBonus * 2;
    }
    else if (skillProficiency === 'proficient') {
        proficiencyBonus = playerState.proficiencyBonus;
    }
    else if (skillKey === abilityKey && playerState.savingThrows?.[abilityKey] === 'proficient') {
        // Only a roll named for the ability itself (a saving throw) picks up
        // save proficiency. It used to leak into every skill of that ability -
        // an Intelligence save proficiency was adding the bonus to Arcana,
        // History and Investigation checks the character wasn't trained in.
        proficiencyBonus = playerState.proficiencyBonus;
    }
    return abilityModifier + proficiencyBonus;
}
