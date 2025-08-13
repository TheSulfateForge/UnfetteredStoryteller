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
    if (diceNotation.includes('d')) {
        const [numDice, numSides] = diceNotation.split('d').map(s => parseInt(s, 10));
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
    const isWearingShield = playerState.inventory.some(i => shieldRegex.test(i.toLowerCase())) ||
        shieldRegex.test(equippedArmorName);
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
export function calculateRollModifier(skillOrAbility, playerState) {
    const cleanSkillOrAbility = skillOrAbility.toLowerCase().replace(/\s/g, '');
    const abilityKey = SKILL_TO_ABILITY_MAP[cleanSkillOrAbility];
    if (!abilityKey)
        return 0;
    const abilityScore = playerState.abilityScores[abilityKey];
    const abilityModifier = getAbilityModifierValue(abilityScore);
    let proficiencyBonus = 0;
    if (Object.keys(playerState.skills).includes(cleanSkillOrAbility) && playerState.skills[cleanSkillOrAbility] === 'proficient') {
        proficiencyBonus = playerState.proficiencyBonus;
    }
    else if (Object.keys(playerState.savingThrows).includes(abilityKey) && playerState.savingThrows[abilityKey] === 'proficient') {
        proficiencyBonus = playerState.proficiencyBonus;
    }
    return abilityModifier + proficiencyBonus;
}
