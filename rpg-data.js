/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Type } from '@google/genai';
// This file defines the JSON schema for the PlayerState object,
// which is used to instruct the Gemini API on the expected format
// for character sheet generation.
/**
 * JSON schema for a character's ability scores.
 */
const abilityScoresSchema = {
    type: Type.OBJECT,
    description: "The character's core ability scores.",
    properties: {
        strength: { type: Type.INTEGER, description: "Strength score." },
        dexterity: { type: Type.INTEGER, description: "Dexterity score." },
        constitution: { type: Type.INTEGER, description: "Constitution score." },
        intelligence: { type: Type.INTEGER, description: "Intelligence score." },
        wisdom: { type: Type.INTEGER, description: "Wisdom score." },
        charisma: { type: Type.INTEGER, description: "Charisma score." },
    },
    required: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
};
/**
 * JSON schema for a character's skill proficiencies.
 */
const skillsSchema = {
    type: Type.OBJECT,
    description: "The character's skill proficiencies. For each skill, the value must be either 'proficient' or 'none'.",
    properties: {
        acrobatics: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        animalHandling: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        arcana: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        athletics: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        deception: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        history: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        insight: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        intimidation: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        investigation: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        medicine: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        nature: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        perception: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        performance: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        persuasion: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        religion: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        sleightOfHand: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        stealth: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        survival: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
    },
};
/**
 * JSON schema for a character's saving throw proficiencies.
 */
const savingThrowsSchema = {
    type: Type.OBJECT,
    description: "The character's saving throw proficiencies. For each saving throw, the value must be either 'proficient' or 'none'.",
    properties: {
        strength: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        dexterity: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        constitution: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        intelligence: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        wisdom: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
        charisma: { type: Type.STRING, description: "Must be 'proficient' or 'none'." },
    },
};
/**
 * The complete JSON schema for the PlayerState object, used to guide the AI's
 * output during character sheet generation.
 */
export const playerStateSchema = {
    type: Type.OBJECT,
    description: "A complete representation of a TTRPG player character's state. Do not include turnCount, pregnancy, or npcStates properties, as these are handled by the application.",
    properties: {
        name: { type: Type.STRING, description: "The character's name, potentially embellished by the AI." },
        backstory: { type: Type.STRING, description: "The character's backstory, potentially embellished by the AI." },
        appearanceDescription: { type: Type.STRING, description: "A description of the character's appearance, potentially embellished by the AI." },
        alignment: { type: Type.STRING, description: "The character's alignment (e.g., 'Chaotic Good')." },
        health: {
            type: Type.OBJECT,
            properties: {
                current: { type: Type.INTEGER },
                max: { type: Type.INTEGER }
            },
            required: ['current', 'max']
        },
        location: { type: Type.STRING },
        money: {
            type: Type.OBJECT,
            properties: {
                amount: { type: Type.INTEGER },
                currency: { type: Type.STRING }
            },
            required: ['amount', 'currency']
        },
        inventory: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
        equipment: {
            type: Type.OBJECT,
            properties: {
                weapon: { type: Type.STRING },
                armor: { type: Type.STRING }
            },
            required: ['weapon', 'armor']
        },
        party: {
            type: Type.ARRAY,
            description: "List of current party members, each with a name and a short description.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING, description: "The party member's name." },
                    description: { type: Type.STRING, description: "A short description of the party member, including their class or role." }
                },
                required: ['name', 'description']
            }
        },
        quests: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ['name', 'description']
            }
        },
        exp: { type: Type.INTEGER },
        level: { type: Type.INTEGER },
        proficiencyBonus: { type: Type.INTEGER },
        armorClass: { type: Type.INTEGER },
        speed: { type: Type.INTEGER },
        abilityScores: abilityScoresSchema,
        skills: skillsSchema,
        savingThrows: savingThrowsSchema,
        feats: {
            type: Type.ARRAY,
            description: "A list of feat names derived from the character description.",
            items: { type: Type.STRING }
        },
        racialTraits: {
            type: Type.ARRAY,
            description: "A list of key racial traits derived from the character description.",
            items: { type: Type.STRING }
        },
        classFeatures: {
            type: Type.ARRAY,
            description: "A list of key class features derived from the character description.",
            items: { type: Type.STRING }
        },
        spellsKnown: {
            type: Type.ARRAY,
            description: "An optional list of spell names the character knows. Only include if the character is a spellcaster.",
            items: { type: Type.STRING }
        },
        conditions: {
            type: Type.ARRAY,
            description: "An optional list of conditions currently affecting the character.",
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    duration: { type: Type.INTEGER }
                },
                required: ['name', 'duration']
            }
        }
    },
    required: [
        "name", "backstory", "appearanceDescription", "alignment",
        "health", "location", "money", "inventory", "equipment", "party",
        "quests", "exp", "level", "proficiencyBonus", "armorClass", "speed",
        "abilityScores", "skills", "savingThrows"
    ]
};