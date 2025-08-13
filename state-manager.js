/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import './types.js';
import './llm-provider.js';

// --- UTILITY ---

/**
 * Recursively and immutably merges properties of a source object into a target object.
 * @param target The target object to merge into.
 * @param source The source object to merge from.
 * @returns A new object with the merged properties.
 */
function deepMerge(target, source) {
    const output = { ...target };

    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = output[key];
            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) && targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
                output[key] = deepMerge(targetValue, sourceValue);
            } else {
                output[key] = sourceValue;
            }
        }
    }
    return output;
}


// --- STATE MANAGER SINGLETON ---

const initialState = {
    llmProvider: null,
    chat: null,
    characterInfo: null,
    playerState: null,
    chatHistory: [],
    isGenerating: false,
    isMatureEnabled: false,
    currentCharacterId: null,
    lastApiInput: null,
    lastApiResponse: null,
};

class _GameStateManager {
    state;

    constructor() {
        this.state = { ...initialState };
    }

    /**
     * Returns a snapshot of the current state.
     */
    getState() {
        return this.state;
    }

    /**
     * Updates the state by merging the provided partial state.
     * @param newState A partial GameState object.
     */
    updateState(newState) {
        this.state = { ...this.state, ...newState };
    }
    
    /**
     * Specifically updates the playerState using an immutable deep merge to handle nested objects.
     * @param playerStateUpdate A partial PlayerState object.
     */
    updatePlayerState(playerStateUpdate) {
        if (this.state.playerState) {
            this.updateState({ playerState: deepMerge(this.state.playerState, playerStateUpdate) });
        } else {
            this.updateState({ playerState: playerStateUpdate });
        }
    }

    /**
     * Resets the state to its initial values, preparing for a new game.
     * Keeps the llmProvider instance if it exists.
     */
    resetForNewGame() {
        const provider = this.state.llmProvider; // Preserve the provider
        this.state = { 
            ...initialState,
            llmProvider: provider // Restore the provider
        };
    }
}

export const gameState = new _GameStateManager();