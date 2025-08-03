/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GeminiAPIProvider } from './gemini-provider.js';
import { LocalLLMProvider } from './local-llm-provider.js';
import * as config from './config.js';


/**
 * A factory function that creates and returns an instance of an LLM provider
 * based on the user's saved settings.
 *
 * @param settings The user's current provider settings.
 * @returns An instance of a class that implements the LLMProvider interface.
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
 */
export function cleanseResponseText(text) {
    return text
        .replace(config.STATE_UPDATE_REGEX, '')
        .replace(config.DICE_ROLL_REGEX, '')
        .replace(config.ATTACK_ROLL_REGEX, '')
        .replace(config.PIV_SEX_TAG, '')
        .replace(config.PREGNANCY_REVEALED_TAG, '')
        .trim();
}
