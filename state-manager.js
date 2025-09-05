/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// --- UTILITY ---
/**
 * Recursively and immutably merges properties of a source object into a target object.
 * This is used for updating nested objects in the state, like `playerState`.
 * @param {any} target The target object to merge into.
 * @param {any} source The source object to merge from.
 * @returns {any} A new object with the merged properties.
 */
export function deepMerge(target, source) {
    const output = { ...target };
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            const targetValue = output[key];
            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue) && targetValue && typeof targetValue === 'object' && !Array.isArray(targetValue)) {
                output[key] = deepMerge(targetValue, sourceValue);
            }
            else {
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
    isInCombat: false,
    combatants: [],
    worldState: {},
};
/**
 * Manages the global state of the application using a singleton pattern.
 * Provides methods for getting and updating state in an immutable fashion.
 */
class _GameStateManager {
    state;
    constructor() {
        this.state = { ...initialState };
    }
    /**
     * Returns a read-only snapshot of the current application state.
     * @returns {Readonly<import("./types.js").GameState>} The current `GameState`.
     */
    getState() {
        return this.state;
    }
    /**
     * Updates the top-level state by merging the provided partial state.
     * This is an immutable operation that creates a new state object.
     * @param {Partial<import("./types.js").GameState>} newState A partial `GameState` object containing the properties to update.
     */
    updateState(newState) {
        this.state = { ...this.state, ...newState };
    }
    /**
     * Specifically updates the nested `playerState` object using an immutable deep merge.
     * This ensures that nested properties within the player state are updated correctly
     * without mutating the original state.
     * @param {Partial<import("./types.js").PlayerState>} playerStateUpdate A partial `PlayerState` object.
     */
    updatePlayerState(playerStateUpdate) {
        if (this.state.playerState) {
            this.updateState({ playerState: deepMerge(this.state.playerState, playerStateUpdate) });
        }
        else {
            this.updateState({ playerState: playerStateUpdate });
        }
    }
    /**
     * Resets the application state to its initial values, effectively preparing for a new game.
     * It preserves the existing `llmProvider` instance to avoid re-initialization.
     */
    resetForNewGame() {
        const provider = this.state.llmProvider; // Preserve the provider
        this.state = {
            ...initialState,
            llmProvider: provider // Restore the provider
        };
    }
}
/**
 * The singleton instance of the GameStateManager.
 */
export const gameState = new _GameStateManager();
