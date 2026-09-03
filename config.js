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
export const AI_TEXT_MODELS = ['gemini-3.1-flash-lite', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
/**
 * A list of AI embedding models for the RAG knowledge base.
 * The application will try them in order if the previous one fails.
 */
export const AI_EMBEDDING_MODELS = ['gemini-embedding-001'];
/**
 * Open5e document slugs this app is licensed to use: SRD 5.1 (a.k.a. SRD-2014)
 * plus the freely/openly licensed third-party sources selected on open5e.com.
 * Content whose `document` is not in this list is ignored at load time.
 * Note: SRD 5.2 / "srd-2024" is deliberately NOT included.
 */
export const ALLOWED_SOURCE_SLUGS = new Set([
    // Wizards of the Coast - SRD 5.1 only
    'srd', 'srd-2014', 'wotc-srd',
    // EN Publishing (Level Up: Advanced 5e).
    // NOTE: content files use different slugs than documents.json keys —
    // 'a5e' and 'menagerie' appear in magicitems/monsters, so both forms listed.
    'a5e-ag', 'a5e-ddg', 'a5e-gpg', 'a5e-mm', 'mmenag', 'a5e', 'menagerie',
    // Kobold Press ('blackflag' is the Black Flag SRD slug used in monsters.json)
    'bfrd', 'blackflag', 'ccdx', 'cc', 'deepm', 'deepmx', 'kp',
    'tob', 'tob-2023', 'tob2', 'tob3', 'toh', 'vom', 'wz',
    // Open5e
    'open5e', 'open5e-2024', 'open5e-e',
    // Somanyrobots
    'spells-that-dont-suck',
    // Green Ronin / Darrington Press
    'tdcs', 'taldorei',
]);
/**
 * Returns true if a document key/slug (as used in documents.json) is licensed.
 * @param {string|undefined} key
 * @returns {boolean}
 */
export function isAllowedDocumentKey(key) {
    if (!key)
        return false;
    return ALLOWED_SOURCE_SLUGS.has(String(key).replace(/\/+$/, '').split('/').pop().toLowerCase());
}
/**
 * Returns true if a data entry may be used, based on its source document.
 * Entries with no document field (e.g. classes.json) are always allowed.
 * @param {object} entry A raw data entry from the /data JSON files.
 * @returns {boolean}
 */
export function isAllowedSource(entry) {
    if (!entry || typeof entry !== 'object')
        return false;
    const raw = entry.document ?? entry.document__slug ?? entry.document_slug;
    if (!raw)
        return true; // No provenance recorded (e.g. classes) - keep it.
    const slug = String(raw).replace(/\/+$/, '').split('/').pop().toLowerCase();
    return ALLOWED_SOURCE_SLUGS.has(slug);
}
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
export const DICE_ROLL_REGEX = /\[ROLL\|([^|\]]+)\|([^|\]]*)(?:\|([^\]]*))?\]/g;
/**
 * Regex to parse an attack roll request tag from the AI's response.
 * Captures: [ATTACK|WEAPON_NAME|TARGET_DESCRIPTION|MODIFIER?]
 * Example: [ATTACK|Longsword|the goblin|NONE]
 */
export const ATTACK_ROLL_REGEX = /\[ATTACK\|([^|\]]+)\|([^|\]]*)(?:\|([^\]]*))?\]/g;
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