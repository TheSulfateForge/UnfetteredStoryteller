/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Local copies of the @google/genai string enums.
 *
 * These exist so the application's startup module graph has NO dependency on a
 * CDN. Previously rpg-data.js and gemini-provider.js imported these from
 * '@google/genai' at module scope, which meant index.js could not execute at all
 * unless esm.sh was reachable - a single CDN failure left every button in the
 * app inert. The SDK defines these as plain string enums, so the literal values
 * below are equivalent and are what the REST API expects.
 */
export const Type = {
    STRING: 'STRING',
    NUMBER: 'NUMBER',
    INTEGER: 'INTEGER',
    BOOLEAN: 'BOOLEAN',
    ARRAY: 'ARRAY',
    OBJECT: 'OBJECT',
};

export const HarmCategory = {
    HARM_CATEGORY_DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    HARM_CATEGORY_HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
    HARM_CATEGORY_HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
    HARM_CATEGORY_SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    HARM_CATEGORY_CIVIC_INTEGRITY: 'HARM_CATEGORY_CIVIC_INTEGRITY',
};

export const HarmBlockThreshold = {
    BLOCK_NONE: 'BLOCK_NONE',
    BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH',
    BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
    BLOCK_LOW_AND_ABOVE: 'BLOCK_LOW_AND_ABOVE',
    OFF: 'OFF',
};
