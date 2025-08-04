/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- CONFIGURATION ---
// User can add more models to this list for fallback. They will be tried in order.
export const AI_TEXT_MODELS = ['gemini-2.5-flash', 'gemma-3-27b-it', 'gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

// This model is specifically for generating embeddings for the RAG knowledge base.
export const AI_EMBEDDING_MODELS = ['text-embedding-004'];

export const IMAGE_MODEL_NAME = 'imagen-3.0-generate-002';
export const TTS_VOICE_LANGUAGE_CODE = 'en-GB';
export const TTS_VOICE_NAME = 'en-GB-Standard-A';
export const SAVE_GAME_KEY = 'unfettered-storyteller-saves';
export const API_KEY_STORAGE_KEY = 'unfettered-storyteller-api-key';
export const PROVIDER_SETTINGS_KEY = 'unfettered-storyteller-provider-settings';
export const PREGNANCY_CHANCE = 0.20; // 20% chance
export const TURNS_PER_DAY = 8; // Number of player actions to equal one in-game day

// --- CONSTANTS ---
// Captures [ROLL|TYPE|DESCRIPTION|MODIFIER] where MODIFIER is optional and might have a trailing pipe.
export const DICE_ROLL_REGEX = /\[ROLL\|([^|\]]+)\|([^|\]]*)(?:\|(ADVANTAGE|DISADVANTAGE|NONE))?\|?\]/g;
// Captures [ATTACK|WEAPON_NAME|TARGET_DESCRIPTION|MODIFIER] where MODIFIER is optional and might have a trailing pipe.
export const ATTACK_ROLL_REGEX = /\[ATTACK\|([^|\]]+)\|([^|\]]*)(?:\|(ADVANTAGE|DISADVANTAGE|NONE))?\|?\]/g;
// Captures [EVENT|TYPE|DETAILS]
export const EVENT_TAG_REGEX = /\[EVENT\|(ITEM|XP|MONEY)\|([^\]]+)\]/g;
// NEW: Captures [NPC_DAMAGE|AMOUNT|TYPE|SOURCE]
export const NPC_DAMAGE_REGEX = /\[NPC_DAMAGE\|(\d+)\|([^|\]]+)\|([^\]]+)\]/g;
// Captures the JSON block from a state update tag, tolerant of missing brackets.
export const STATE_UPDATE_REGEX = /(?:\[?STATE_UPDATE\]?)\s*(\{[\s\S]*?\})\s*(?:\[\/?STATE_UPDATE\])?/ig;
// Captures [PIV_SEX|Male_Name|Female_Name]
export const PIV_SEX_TAG = /\[PIV_SEX\|([^|\]]+)\|([^|\]]+)\]/g;
// Captures [PREGNANCY_REVEALED|Character_Name]
export const PREGNANCY_REVEALED_TAG = /\[PREGNANCY_REVEALED\|([^\]]+)\]/g;