/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { SAVE_GAME_KEY, API_KEY_STORAGE_KEY, PROVIDER_SETTINGS_KEY } from "./config.js";
// This file handles the game's lifecycle and persistence (saving/loading).
/**
 * Retrieves the current provider settings from localStorage.
 * Falls back to default settings if none are found or if parsing fails.
 * Also handles migration from a legacy API key storage.
 * @returns The current provider settings.
 */
export function getProviderSettings() {
    const defaults = {
        provider: 'gemini',
        apiKey: null,
        localUrl: 'http://127.0.0.1:11434/v1/chat/completions',
    };
    try {
        const settingsString = localStorage.getItem(PROVIDER_SETTINGS_KEY);
        if (settingsString) {
            try {
                return JSON.parse(settingsString);
            }
            catch (e) {
                console.error("Could not parse provider settings, returning default.", e);
            }
        }
        const legacyApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
        if (legacyApiKey) {
            return { ...defaults, apiKey: legacyApiKey };
        }
    }
    catch (error) {
        console.warn("Could not access localStorage. Features like saving will be unavailable.", error);
    }
    return defaults;
}
/**
 * Saves the provider settings to localStorage.
 * @param {import("./types.js").ProviderSettings} settings The provider settings object to save.
 */
export function saveProviderSettings(settings) {
    try {
        localStorage.setItem(PROVIDER_SETTINGS_KEY, JSON.stringify(settings));
        // For backward compatibility and single-key access where needed.
        if (settings.apiKey) {
            localStorage.setItem(API_KEY_STORAGE_KEY, settings.apiKey);
        }
        else {
            localStorage.removeItem(API_KEY_STORAGE_KEY);
        }
    }
    catch (error) {
        console.error("Could not save provider settings to localStorage.", error);
        alert("Your settings could not be saved. Your browser might be blocking storage access or be out of space.");
    }
}
/**
 * Retrieves all saved game slots from localStorage.
 * Includes validation to filter out any corrupted or malformed save data.
 * @returns {import("./types.js").SaveSlot[]} An array of valid SaveSlot objects.
 */
export function getSaves() {
    try {
        const savedData = localStorage.getItem(SAVE_GAME_KEY);
        if (!savedData)
            return [];
        try {
            const saves = JSON.parse(savedData);
            if (!Array.isArray(saves)) {
                console.warn('Saved data in localStorage is not an array. Clearing it.');
                try {
                    localStorage.removeItem(SAVE_GAME_KEY);
                }
                catch (e) {
                    console.error('Failed to remove corrupted save data from localStorage.', e);
                }
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
        }
        catch (error) {
            console.error("Error parsing saved games from localStorage. It might be corrupted. Clearing it.", error);
            try {
                localStorage.removeItem(SAVE_GAME_KEY);
            }
            catch (e) {
                console.error('Failed to remove corrupted save data from localStorage.', e);
            }
            return [];
        }
    }
    catch (storageError) {
        console.warn("Could not access localStorage to get saves.", storageError);
        return [];
    }
}
/**
 * Adds a brand new save slot to localStorage.
 * Used only after initial character creation.
 * @param {import("./types.js").SaveSlot} newSave The complete SaveSlot object for the new game.
 */
export function addNewSave(newSave) {
    try {
        const allSaves = getSaves();
        allSaves.push(newSave);
        localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(allSaves));
    }
    catch (error) {
        console.error("Failed to add new save to localStorage.", error);
        alert("Failed to save your new game. Your browser might be blocking storage access.");
    }
}
/**
 * Updates an existing save slot with the latest game state.
 * @param {string} characterId The ID of the save slot to update.
 * @param {Omit<import("./types.js").SaveSlot, 'id'>} currentSaveData The latest game data to save.
 */
export function updateSave(characterId, currentSaveData) {
    try {
        const allSaves = getSaves();
        const saveIndex = allSaves.findIndex(save => save.id === characterId);
        if (saveIndex > -1) {
            allSaves[saveIndex] = { ...allSaves[saveIndex], ...currentSaveData };
            localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(allSaves));
        }
        else {
            // This case should ideally not happen after character creation, but is a safeguard.
            console.warn("Attempted to update a save slot that doesn't exist. Creating a new one.", characterId);
            addNewSave({ id: characterId, ...currentSaveData });
        }
    }
    catch (error) {
        console.error("Failed to update save in localStorage.", error);
    }
}
/**
 * Deletes a save slot from localStorage.
 * @param {string} characterId The ID of the save slot to delete.
 */
export function deleteSave(characterId) {
    try {
        const allSaves = getSaves();
        const updatedSaves = allSaves.filter(save => save.id !== characterId);
        localStorage.setItem(SAVE_GAME_KEY, JSON.stringify(updatedSaves));
    }
    catch (error) {
        console.error("Failed to delete save from localStorage.", error);
        alert("Failed to delete the save file. Your browser might be blocking storage access.");
    }
}
