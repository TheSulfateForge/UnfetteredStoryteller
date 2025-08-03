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
    } else {
        const constantDamage = parseInt(diceNotation, 10);
        if (!isNaN(constantDamage)) {
            return { rolls: [constantDamage], total: constantDamage };
        }
    }
    return { rolls: [0], total: 0 };
}

export function getWeaponData(weaponName) {
    const weapons = dataManager.getWeapons();
    if (!weaponName || !weapons) return null;
    const normalizedName = weaponName.toLowerCase().replace(/\+\d+\s*/, '').trim();
    const weaponKeys = Object.keys(weapons);
    const matchingWeaponKey = weaponKeys
        .filter(key => normalizedName.includes(key))
        .sort((a, b) => b.length - a.length)[0];

    return matchingWeaponKey ? weapons[matchingWeaponKey] : null;
}

export function calculateArmorClass(playerState) {
    const armors = dataManager.getArmor();
    if (!armors) return 10 + getAbilityModifierValue(playerState.abilityScores.dexterity);

    const equippedArmorName = playerState.equipment.armor?.toLowerCase() || 'none';
    const isWearingShield = playerState.inventory.some(i => i.toLowerCase().includes('shield')) || equippedArmorName.includes('shield');
    
    let baseAc = 10;
    const dexMod = getAbilityModifierValue(playerState.abilityScores.dexterity);

    const armorKeys = Object.keys(armors);
    const matchingArmorKey = armorKeys
        .filter(key => equippedArmorName.includes(key) && armors[key].category !== 'shield')
        .sort((a, b) => b.length - a.length)[0];
    const armorData = matchingArmorKey ? armors[matchingArmorKey] : null;

    if (armorData) {
        baseAc = armorData.ac_base;
        if (armorData.ac_add_dexmod) {
            const dexBonus = armorData.ac_cap_dexmod !== null ? Math.min(dexMod, armorData.ac_cap_dexmod) : dexMod;
            baseAc += dexBonus;
        }
    } else {
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
    if (!abilityKey) return 0;

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

export function generateBaseRpgPlayerState(charInfo) {
    const level = 1;
    const proficiencyBonus = calculateProficiencyBonus(level);
    const abilityScores = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };

    const maxHealth = 8 + getAbilityModifierValue(abilityScores.constitution); // A reasonable default

    const baseState = {
        name: charInfo.name,
        backstory: charInfo.bio,
        appearanceDescription: charInfo.desc,
        alignment: charInfo.alignment,
        health: { current: maxHealth, max: maxHealth },
        location: "A Bustling City",
        money: { amount: 10, currency: "gp" },
        inventory: ["Explorer's Pack"],
        equipment: { weapon: "Dagger", armor: "Leather Armor" },
        party: [], quests: [], exp: 0, level: level, proficiencyBonus: proficiencyBonus,
        armorClass: 11 + getAbilityModifierValue(abilityScores.dexterity),
        speed: 30,
        abilityScores: abilityScores,
        skills: { ...DEFAULT_SKILLS },
        savingThrows: { ...DEFAULT_SAVING_THROWS },
        feats: [],
        racialTraits: [],
        classFeatures: [],
        turnCount: 0,
        pregnancy: null,
        npcStates: {},
    };
    
    return baseState;
}

/**
 * Parses the class data table string to find features for a specific level.
 * @param {dataManager.Class} classData The class data object.
 * @param {number} level The level to get features for.
 * @returns {string[]} An array of feature names.
 */
export function getClassFeaturesForLevel(classData, level) {
    if (!classData.table) return [];

    const lines = classData.table.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'));
    if (lines.length < 3) return []; // Header, separator, at least one data row

    const headerCells = lines[0].split('|').map(h => h.trim().toLowerCase());
    const featuresIndex = headerCells.indexOf('features');

    if (featuresIndex === -1) return []; // 'Features' column not found

    const levelText = level === 1 ? '1st' : level === 2 ? '2nd' : level === 3 ? '3rd' : `${level}th`;
    
    const levelLine = lines.find(line => {
        const firstCol = line.split('|')[1]?.trim().toLowerCase();
        return firstCol === levelText;
    });

    if (!levelLine) return [];

    const columns = levelLine.split('|').map(c => c.trim());
    if (columns.length > featuresIndex) {
        const featuresText = columns[featuresIndex];
        return featuresText
            .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // remove markdown links
            .split(',')
            .map(f => f.trim())
            .filter(f => f && f !== '-');
    }
    
    return [];
}

/**
 * Returns a default set of starting equipment based on character class.
 * @param {string} characterClass The character's class name.
 * @returns An object with equipment and inventory arrays.
 */
export function getStartingEquipment(characterClass) {
    // Based on SRD equipment choices. We'll pick the first option for simplicity.
    switch (characterClass.toLowerCase()) {
        case 'barbarian':
            return { equipment: { weapon: 'Greataxe', armor: 'No armor' }, inventory: ["Explorer's Pack", "Four javelins"] };
        case 'bard':
            return { equipment: { weapon: 'Rapier', armor: 'Leather Armor' }, inventory: ["Diplomat's Pack", "Lute", "Dagger"] };
        case 'cleric':
            return { equipment: { weapon: 'Mace', armor: 'Scale Mail' }, inventory: ["Priest's Pack", "Shield", "Holy symbol"] };
        case 'druid':
            return { equipment: { weapon: 'Scimitar', armor: 'Leather Armor' }, inventory: ["Explorer's Pack", "Druidic focus", "Shield"] };
        case 'fighter':
            return { equipment: { weapon: 'Longsword', armor: 'Chain Mail' }, inventory: ["Explorer's Pack", "Shield", "Light crossbow", "20 bolts"] };
        case 'monk':
            return { equipment: { weapon: 'Shortsword', armor: 'No armor' }, inventory: ["Explorer's Pack", "10 darts"] };
        case 'paladin':
            return { equipment: { weapon: 'Longsword', armor: 'Chain Mail' }, inventory: ["Priest's Pack", "Shield", "Five javelins", "Holy symbol"] };
        case 'ranger':
            return { equipment: { weapon: 'Longbow', armor: 'Scale Mail' }, inventory: ["Explorer's Pack", "Two shortswords", "Quiver with 20 arrows"] };
        case 'rogue':
            return { equipment: { weapon: 'Rapier', armor: 'Leather Armor' }, inventory: ["Burglar's Pack", "Two daggers", "Thieves' tools"] };
        case 'sorcerer':
            return { equipment: { weapon: 'Light crossbow', armor: 'No armor' }, inventory: ["Explorer's Pack", "Component pouch", "Two daggers", "20 bolts"] };
        case 'warlock':
            return { equipment: { weapon: 'Light crossbow', armor: 'Leather Armor' }, inventory: ["Scholar's Pack", "Component pouch", "Two daggers", "20 bolts"] };
        case 'wizard':
            return { equipment: { weapon: 'Quarterstaff', armor: 'No armor' }, inventory: ["Scholar's Pack", "Spellbook", "Component pouch"] };
        default:
            return { equipment: { weapon: 'Dagger', armor: 'Leather Armor' }, inventory: ["Explorer's Pack"] };
    }
}

/**
 * Parses the equipment description from background data into a list of items.
 * @param {dataManager.Background} backgroundData The background data object.
 * @returns {string[]} An array of item names.
 */
export function getEquipmentFromBackground(backgroundData) {
    const equipmentBenefit = backgroundData.benefits?.find(b => b.type === 'equipment');
    if (!equipmentBenefit || !equipmentBenefit.desc) return [];
    
    return equipmentBenefit.desc
        .replace(/\([^)]*\)/g, '') // remove parentheticals like (a gift to you...)
        .replace(/, and /g, ',')
        .replace(/\./g, '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}
