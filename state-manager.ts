/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content } from '@google/genai';
import { PlayerState, CharacterInfo } from './types';
import { LLMProvider, LLMChat } from './llm-provider';

// --- INTERFACES ---

export interface GameState {
    llmProvider: LLMProvider | null;
    chat: LLMChat | null;
    characterInfo: CharacterInfo | null;
    playerState: PlayerState | null;
    chatHistory: Content[];
    isGenerating: boolean;
    isMatureEnabled: boolean;
    currentCharacterId: string | null;
}

// --- UTILITY ---

/**
 * Recursively merges properties of a source object into a target object.
 * @param target The target object to merge into.
 * @param source The source object to merge from.
 * @returns The merged target object.
 */
function deepMerge(target: any, source: any) {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const sourceValue = source[key];
            if (sourceValue && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
                if (!target[key]) {
                    Object.assign(target, { [key]: {} });
                }
                deepMerge(target[key], sourceValue);
            } else {
                Object.assign(target, { [key]: sourceValue });
            }
        }
    }
    return target;
}


// --- STATE MANAGER SINGLETON ---

const initialState: GameState = {
    llmProvider: null,
    chat: null,
    characterInfo: null,
    playerState: null,
    chatHistory: [],
    isGenerating: false,
    isMatureEnabled: false,
    currentCharacterId: null,
};

class _GameStateManager {
    private state: GameState;

    constructor() {
        this.state = { ...initialState };
    }

    /**
     * Returns a snapshot of the current state.
     */
    public getState(): Readonly<GameState> {
        return this.state;
    }

    /**
     * Updates the state by merging the provided partial state.
     * @param newState A partial GameState object.
     */
    public updateState(newState: Partial<GameState>): void {
        this.state = { ...this.state, ...newState };
    }
    
    /**
     * Specifically updates the playerState using a deep merge to handle nested objects.
     * @param playerStateUpdate A partial PlayerState object.
     */
    public updatePlayerState(playerStateUpdate: Partial<PlayerState>): void {
        if (this.state.playerState) {
            deepMerge(this.state.playerState, playerStateUpdate);
        } else {
            this.updateState({ playerState: playerStateUpdate as PlayerState });
        }
    }

    /**
     * Resets the state to its initial values, preparing for a new game.
     * Keeps the llmProvider instance if it exists.
     */
    public resetForNewGame(): void {
        const provider = this.state.llmProvider; // Preserve the provider
        this.state = { 
            ...initialState,
            llmProvider: provider // Restore the provider
        };
    }
}

export const gameState = new _GameStateManager();
