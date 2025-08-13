/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeminiAPIProvider } from './gemini-provider.js';
import { LocalLLMProvider } from './local-llm-provider.js';
import * as config from './config.js';
/**
 * Creates and returns an instance of an LLM provider based on settings.
 * This factory function allows the application to flexibly switch between
 * different AI backends (e.g., Google's Gemini or a self-hosted model).
 *
 * @param {import("./types.js").ProviderSettings} settings The user's current provider settings.
 * @returns {import("./llm-provider.js").LLMProvider} An instance of a class that implements the LLMProvider interface.
 * @throws An error if the required settings for the selected provider (e.g., API key or URL) are missing.
 */
export function createLlmProvider(settings) {
    if (settings.provider === 'local') {
        if (!settings.localUrl) {
            throw new Error("Cannot create Local LLM provider: URL is not set.");
        }
        return new LocalLLMProvider(settings.localUrl);
    }
    // Default to Gemini
    if (!settings.apiKey) {
        throw new Error("Cannot create Gemini provider: API key is not set.");
    }
    return new GeminiAPIProvider(settings.apiKey);
}
/**
 * Cleans response text of game-specific tags for display or sending to other models.
 * This is crucial for separating narrative content from game mechanic instructions.
 *
 * @param {string} text The raw response text from the AI.
 * @returns {string} The text with all known game-specific tags removed.
 */
export function cleanseResponseText(text) {
    return text
        .replace(config.STATE_UPDATE_REGEX, '')
        .replace(config.DICE_ROLL_REGEX, '')
        .replace(config.ATTACK_ROLL_REGEX, '')
        .replace(config.EVENT_TAG_REGEX, '')
        .replace(config.NPC_DAMAGE_REGEX, '')
        .replace(config.PIV_SEX_TAG, '')
        .replace(config.PREGNANCY_REVEALED_TAG, '')
        .trim();
}
