/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// --- CONFIGURATION ---
/**
 * A list of AI text generation models to be used by the Gemini provider.
 * The application will try them in order, falling back to the next one upon encountering
 * specific API errors like resource exhaustion.
 */
export const AI_TEXT_MODELS = ['gemini-2.5-flash', 'gemma-3-27b-it', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
/**
 * A list of AI embedding models for the RAG knowledge base.
 * The application will try them in order if the previous one fails.
 */
export const AI_EMBEDDING_MODELS = ['text-embedding-004'];
/** The key used for storing save game data in localStorage. */
export const SAVE_GAME_KEY = 'unfettered-storyteller-saves';
/** A legacy key used for storing the API key in localStorage (for backward compatibility). */
export const API_KEY_STORAGE_KEY = 'unfettered-storyteller-api-key';
/** The primary key for storing all provider settings (provider type, API key, local URL) in localStorage. */
export const PROVIDER_SETTINGS_KEY = 'unfettered-storyteller-provider-settings';
/** The base probability of conception after a relevant in-game event. */
export const PREGNANCY_CHANCE = 0.20; // 20% chance
/** The number of player actions that are considered equivalent to one in-game day for tracking time-based effects. */
export const TURNS_PER_DAY = 8;
// --- CONSTANTS ---
/**
 * Regex to parse a structured game action from the AI's response.
 * Captures: [GAME_ACTION|TYPE|{JSON_PAYLOAD}]
 * Example: [GAME_ACTION|START_COMBAT|[{"name": "Goblin", "hp": 7}]]
 */
export const GAME_ACTION_REGEX = /\[GAME_ACTION\|(.*?)\|(.*?)\]/g;
/**
 * Regex to parse a dice roll request tag from the AI's response.
 * Captures: [ROLL|SKILL_or_ABILITY|DESCRIPTION|MODIFIER?]
 * Example: [ROLL|Stealth|Sneak past the guard|ADVANTAGE]
 */
export const DICE_ROLL_REGEX = /\[ROLL\|([^|\]]+)\|([^|\]]*)(?:\|(ADVANTAGE|DISADVANTAGE|NONE))?\|?\]/g;
/**
 * Regex to parse an attack roll request tag from the AI's response.
 * Captures: [ATTACK|WEAPON_NAME|TARGET_DESCRIPTION|MODIFIER?]
 * Example: [ATTACK|Longsword|the goblin|NONE]
 */
export const ATTACK_ROLL_REGEX = /\[ATTACK\|([^|\]]+)\|([^|\]]*)(?:\|(ADVANTAGE|DISADVANTAGE|NONE))?\|?\]/g;
/**
 * Regex to parse a tag indicating a specific mature-content event.
 * Captures: [PIV_SEX|Male_Name|Female_Name]
 */
export const PIV_SEX_TAG = /\[PIV_SEX\|([^|\]]+)\|([^|\]]+)\]/g;
/**
 * Regex to parse a tag indicating the character has become aware of a pregnancy.
 * Captures: [PREGNANCY_REVEALED|Character_Name]
 */
export const PREGNANCY_REVEALED_TAG = /\[PREGNANCY_REVEALED\|([^\]]+)\]/g;