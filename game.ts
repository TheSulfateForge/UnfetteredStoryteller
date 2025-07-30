/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SaveSlot, ProviderSettings } from "./types";
import { SAVE_GAME_KEY, API_KEY_STORAGE_KEY, PROVIDER_SETTINGS_KEY } from "./config";

// This file handles the game's lifecycle and persistence (saving/loading).

export function getProviderSettings(): ProviderSettings {
    const settingsString = localStorage.getItem(PROVIDER_SETTINGS_KEY);
    if (settingsString) {
        try {
            return JSON.parse(settingsString);
        } catch (e) {
            console.error("Could not parse provider settings, returning default.", e);
        }
    }
    // Default settings
    return {
        provider: 'gemini',
        apiKey: localStorage.getItem(API_KEY_STORAGE_KEY), // Check for legacy key
        localUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    };
}

export function saveProviderSettings(settings: ProviderSettings) {
    localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(settings));
    // For backward compatibility and single-key access where needed.
    if(settings.apiKey) {
        localStorage.setItem(API_KEY_STORAGE_KEY, settings.apiKey);
    } else {
        localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
}


export function getSaves(): SaveSlot[] {
    const savedData = localStorage.getItem(SAVE_GAME_KEY);
    if (!savedData) return [];

    try {
        const saves = JSON.parse(savedData);
        if (!Array.isArray(saves)) {
            console.warn('Saved data in localStorage is not an array. Clearing it.');
            localStorage.removeItem(SAVE_GAME_KEY);
            return [];
        }
        // Filter out any malformed saves that might crash the UI
        return saves.filter(save => {
            const isValid = save &&
                   typeof save === 'object' &&
                   save.characterInfo &&
                   typeof save.characterInfo.name === 'string' &&
                   save.playerState &&
                   typeof save.playerState.level === 'number';
            if (!isValid) {
                console.warn('Found and filtered an invalid save slot:', save);
            }
            return isValid;
        });
    } catch (error) {
        console.error("Error parsing saved games from localStorage. It might be corrupted. Clearing it.", error);
        localStorage.removeItem(SAVE_GAME_KEY);
        return [];
    }
}

/**
 * Adds a brand new save slot. Used only after character creation.
 */
export function addNewSave(newSave: SaveSlot): void {
    const allSaves = getSaves();
    allSaves.push(newSave);
    localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(allSaves));
}

/**
 * Updates an existing save slot with the latest game state.
 */
export function updateSave(characterId: string, currentSaveData: Omit<SaveSlot, 'id'>): void {
    const allSaves = getSaves();
    const saveIndex = allSaves.findIndex(save => save.id === characterId);

    if (saveIndex > -1) {
        allSaves[saveIndex] = { ...allSaves[saveIndex], ...currentSaveData };
        localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(allSaves));
    } else {
        // This case should ideally not happen after character creation, but is a safeguard.
        console.warn("Attempted to update a save slot that doesn't exist. Creating a new one.", characterId);
        addNewSave({ id: characterId, ...currentSaveData });
    }
}

/**
 * Deletes a save slot and returns true if successful.
 */
export function deleteSave(characterId: string): boolean {
    const allSaves = getSaves();
    const saveToDelete = allSaves.find(s => s.id === characterId);
    if (!saveToDelete) return false;

    const confirmed = confirm(`Are you sure you want to permanently delete the adventure for "${saveToDelete.characterInfo.name}"?`);
    if (confirmed) {
        const updatedSaves = allSaves.filter(save => save.id !== characterId);
        localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(updatedSaves));
        return true;
    }
    return false;
}