/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as services from './services.js';
import { dom } from './dom.js';
import * as ui from './ui.js';
import * as game from './game.js';
import * as rag from './rag.js';
import { gameState } from './state-manager.js';
import { cleanseResponseText, createLlmProvider } from './api.js';
import { resetPointBuy } from './character-creator.js';
// --- MODULE STATE ---
let mainAppListenersSetup = false;
// --- HELPERS ---
function isPlayerStateValid(state) {
    if (!state || typeof state !== 'object')
        return false;
    const has = (prop) => Object.prototype.hasOwnProperty.call(state, prop);
    return has('level') && typeof state.level === 'number' &&
        has('health') && typeof state.health === 'object' &&
        has('abilityScores') && has('skills') && has('savingThrows');
}
async function proceedToAdventure(action, setupMainAppEventListeners) {
    const providerSettings = game.getProviderSettings();
    if (!gameState.getState().llmProvider) {
        if (providerSettings.provider === 'gemini' && !providerSettings.apiKey) {
            ui.showSettings(providerSettings);
            return;
        }
        if (providerSettings.provider === 'local' && !providerSettings.localUrl) {
            ui.showSettings(providerSettings);
            return;
        }
        try {
            const llmProvider = createLlmProvider(providerSettings);
            gameState.updateState({ llmProvider });
            await rag.init(llmProvider, ui.updateRagStatus);
        }
        catch (error) {
            console.error("Failed to initialize LLM Provider", error);
            alert(`There was an error initializing the AI provider. Please check your configuration in Settings. Error: ${error}`);
            ui.showSettings(providerSettings);
            return;
        }
    }
    let savedMatureEnabled = false;
    let ageConfirmed = false;
    try {
        savedMatureEnabled = localStorage.getItem('matureEnabled') === 'true';
        ageConfirmed = localStorage.getItem('ageConfirmed') === 'true';
    }
    catch (e) {
        console.warn("Could not access localStorage. Settings will not be persisted.", e);
        // Proceed with defaults
    }
    gameState.updateState({ isMatureEnabled: savedMatureEnabled });
    dom.ageGateMatureToggle.checked = savedMatureEnabled;
    services.speech.init((transcript) => { dom.chatInput.value = transcript; }, (error) => { ui.addMessage('error', `Mic error: ${error}`); });
    const startAction = () => {
        if (!mainAppListenersSetup) {
            setupMainAppEventListeners();
            mainAppListenersSetup = true;
        }
        dom.landingPage.classList.add('hidden');
        if (action === 'new') {
            newGame(savedMatureEnabled);
        }
        else if (action === 'load') {
            const allSaves = game.getSaves();
            ui.displaySaveSlots(allSaves);
        }
    };
    if (!ageConfirmed) {
        dom.ageGateModal.classList.remove('hidden');
        dom.ageGateAcceptBtn.addEventListener('click', () => {
            const isMatureChosen = dom.ageGateMatureToggle.checked;
            try {
                localStorage.setItem('ageConfirmed', 'true');
                localStorage.setItem('matureEnabled', String(isMatureChosen));
            }
            catch (e) {
                console.warn("Could not save age confirmation to localStorage.", e);
            }
            dom.ageGateModal.classList.add('hidden');
            startAction();
        }, { once: true });
    }
    else {
        startAction();
    }
}
function handleSettingsSave(e) {
    e.preventDefault();
    const provider = dom.providerSelector.value;
    const apiKey = dom.apiKeyInput.value.trim();
    const localUrl = dom.localLlmUrlInput.value.trim();
    const providerSettings = { provider, apiKey, localUrl };
    game.saveProviderSettings(providerSettings);
    dom.settingsModal.classList.add('hidden');
    try {
        const llmProvider = createLlmProvider(providerSettings);
        gameState.updateState({ llmProvider });
        rag.init(llmProvider, ui.updateRagStatus);
    }
    catch (error) {
        alert(`Settings saved, but there was an error initializing the provider: ${error.message}`);
    }
}
// --- PUBLIC API ---
export function isGameInProgress() {
    const { currentCharacterId, playerState } = gameState.getState();
    return !!currentCharacterId && !!playerState;
}
export function setupInitialEventListeners(setupMainAppEventListeners) {
    (async () => {
        const providerSettings = game.getProviderSettings();
        if ((providerSettings.provider === 'gemini' && providerSettings.apiKey) || (providerSettings.provider === 'local' && providerSettings.localUrl)) {
            try {
                if (!gameState.getState().llmProvider) {
                    const llmProvider = createLlmProvider(providerSettings);
                    gameState.updateState({ llmProvider });
                }
            }
            catch (error) {
                console.warn("Could not auto-initialize provider on page load.", error);
            }
        }
        // Embeddings are generated locally, so the knowledge base works even with
        // no AI provider configured. Always initialize it so the Build button is live.
        await rag.init(gameState.getState().llmProvider || null, ui.updateRagStatus);
    })();
    dom.landingNewBtn.addEventListener('click', () => proceedToAdventure('new', setupMainAppEventListeners));
    dom.landingLoadBtn.addEventListener('click', () => proceedToAdventure('load', setupMainAppEventListeners));
    dom.landingSettingsBtn.addEventListener('click', () => ui.showSettings(game.getProviderSettings()));
    dom.changeSettingsBtn.addEventListener('click', () => ui.showSettings(game.getProviderSettings()));
    dom.settingsForm.addEventListener('submit', handleSettingsSave);
    dom.buildRagBtn.addEventListener('click', handleBuildRag);
    dom.saveSlotsList.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button)
            return;
        const { id } = button.dataset;
        if (!id)
            return;
        if (button.classList.contains('load-btn')) {
            await loadGame(id);
        }
        else if (button.classList.contains('export-btn')) {
            exportGame(id);
        }
        else if (button.classList.contains('delete-btn')) {
            await deleteGame(id);
        }
    });
    dom.importSaveBtn.addEventListener('click', () => dom.importSaveInput.click());
    dom.importSaveInput.addEventListener('change', async (event) => {
        const input = event.target;
        const file = input.files && input.files[0];
        await importGame(file);
        // Reset so selecting the same file again still fires a change event.
        input.value = '';
    });
    dom.providerSelector.addEventListener('change', () => {
        const providerType = dom.providerSelector.value;
        const isLocal = providerType === 'local';
        dom.geminiSettingsSection.classList.toggle('hidden', isLocal);
        dom.localLlmSettingsSection.classList.toggle('hidden', !isLocal);
        // Embeddings are generated locally now, so the knowledge base works with
        // either provider — always reflect the real RAG status.
        ui.updateRagStatus(rag.getStatus());
    });
    dom.legalBtn.addEventListener('click', () => dom.legalModal.classList.remove('hidden'));
    dom.legalModalCloseBtn.addEventListener('click', () => dom.legalModal.classList.add('hidden'));
    dom.legalModal.addEventListener('click', (e) => {
        if (e.target === dom.legalModal)
            dom.legalModal.classList.add('hidden');
    });
}
export async function handleBuildRag() {
    // Embeddings are generated locally in the browser, so no AI provider or API
    // key is required to build the knowledge base.
    await rag.buildStore();
}
export function getServices() {
    return { speech: services.speech };
}
export async function initializeChatSession() {
    const { llmProvider, isMatureEnabled, characterInfo, playerState, chatHistory } = gameState.getState();
    if (!llmProvider || !characterInfo || !playerState) {
        throw new Error("Cannot initialize chat: core state missing.");
    }
    try {
        const chat = await llmProvider.createChatSession(characterInfo, playerState, isMatureEnabled, chatHistory);
        gameState.updateState({ chat });
    }
    catch (error) {
        console.error("Failed to create chat session:", error);
        ui.addMessage('error', `Failed to initialize the Storyteller. Please check your AI Provider settings. Error: ${error.message}`);
        throw error;
    }
}
export function newGame(isMature) {
    gameState.resetForNewGame();
    gameState.updateState({ isMatureEnabled: isMature });
    dom.chatLog.innerHTML = '';
    ui.releasePin();
    ui.clearPlayerStatsUI();
    if (!gameState.getState().llmProvider) {
        ui.addMessage('error', 'AI provider is not initialized. Please configure it in Settings.');
        return;
    }
    resetPointBuy();
    ui.showCharacterCreation();
}
export function saveCurrentGame() {
    const { playerState, characterInfo, currentCharacterId, chatHistory, llmProvider } = gameState.getState();
    if (!playerState || !characterInfo || !currentCharacterId || !llmProvider)
        return;
    game.updateSave(currentCharacterId, {
        playerState,
        characterInfo,
        chatHistory,
        currentModelIndex: llmProvider.getCurrentModelIndex()
    });
}
export async function loadGame(characterId) {
    const saveSlot = game.getSaves().find(save => save.id === characterId);
    if (!saveSlot) {
        ui.addMessage('error', 'Could not find the selected save file.');
        return;
    }
    if (!isPlayerStateValid(saveSlot.playerState) || !saveSlot.characterInfo) {
        alert(`The save file for "${saveSlot.characterInfo?.name || 'Unknown'}" appears corrupted.`);
        return;
    }
    const { llmProvider } = gameState.getState();
    if (llmProvider) {
        llmProvider.setCurrentModelIndex(saveSlot.currentModelIndex || 0);
    }
    gameState.updateState({
        currentCharacterId: saveSlot.id,
        isMatureEnabled: localStorage.getItem('matureEnabled') === 'true',
        characterInfo: saveSlot.characterInfo,
        playerState: saveSlot.playerState,
        chatHistory: saveSlot.chatHistory,
    });
    try {
        await initializeChatSession();
    }
    catch (e) {
        return;
    }
    ui.updatePlayerStateUI(saveSlot.playerState, saveSlot.characterInfo);
    dom.chatLog.innerHTML = '';
    // The pinned element belongs to the chat log we just cleared.
    ui.releasePin();
    const recentHistory = saveSlot.chatHistory.slice(-3);
    recentHistory.forEach(message => {
        const text = message.parts.map(p => p.text).join('');
        const sender = message.role === 'user' ? 'user' : 'dm';
        ui.addMessage(sender, cleanseResponseText(text));
    });
    ui.scrollToBottom();
    dom.loadGameModal.classList.add('hidden');
    dom.landingPage.classList.add('hidden');
    dom.appElement.classList.remove('hidden');
}
/**
 * Downloads a single save as a JSON file so it can be backed up or moved
 * between devices/browsers (saves otherwise live only in localStorage).
 * @param {string} characterId The id of the save to export.
 */
export function exportGame(characterId) {
    const save = game.getSaves().find(s => s.id === characterId);
    if (!save || !save.characterInfo) {
        // Use alert(): the Load dialog can be open before the chat log exists on screen.
        alert('Could not find that save to export.');
        return;
    }
    try {
        const payload = {
            format: 'unfettered-storyteller-save',
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            save
        };
        const safeName = (save.characterInfo.name || 'character')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .toLowerCase() || 'character';
        const datePart = new Date().toISOString().slice(0, 10);
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `ufst-save-${safeName}-${datePart}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Revoke on the next tick so the download has begun.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        ui.logToDebugger('event', 'Save exported', `Character: ${save.characterInfo.name}\nFile: ${link.download}\nSize: ${blob.size} bytes\n\nIf no file appeared, check your browser's download settings/blocked downloads.`);
    }
    catch (error) {
        console.error('Failed to export save:', error);
        alert(`Could not export that save: ${error.message || error}`);
    }
}
/**
 * Imports a save from a JSON file previously produced by exportGame().
 * If no save with that id exists it is simply added; if one does, the user is
 * asked whether to overwrite it or keep both.
 * @param {File} file The user-selected .json file.
 */
export async function importGame(file) {
    if (!file)
        return;
    try {
        const text = await file.text();
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            alert('That file is not valid JSON, so it could not be imported.');
            return;
        }
        // Accept both the wrapped export format and a bare save object.
        const incoming = parsed && parsed.save ? parsed.save : parsed;
        if (!incoming || typeof incoming !== 'object' || !incoming.characterInfo || !isPlayerStateValid(incoming.playerState)) {
            alert('That file does not look like an Unfettered Storyteller save.');
            return;
        }
        // Normalize the shape so a partial/older file still loads cleanly.
        const save = {
            id: incoming.id ? String(incoming.id) : Date.now().toString(),
            characterInfo: incoming.characterInfo,
            playerState: incoming.playerState,
            chatHistory: Array.isArray(incoming.chatHistory) ? incoming.chatHistory : [],
            currentModelIndex: typeof incoming.currentModelIndex === 'number' ? incoming.currentModelIndex : 0,
        };
        const name = save.characterInfo.name || 'Unnamed';
        const existing = game.getSaves().find(s => s.id === save.id);
        if (existing) {
            const existingName = existing.characterInfo?.name || 'an existing adventure';
            const overwrite = await ui.showConfirmModal(`A save with this id already exists ("${existingName}"). Overwrite it with the imported "${name}"? Choosing No will import as a separate copy.`, 'Save Already Exists');
            if (overwrite) {
                const { id, ...rest } = save;
                game.updateSave(id, rest);
            }
            else {
                save.id = Date.now().toString();
                game.addNewSave(save);
            }
        }
        else {
            game.addNewSave(save);
        }
        ui.displaySaveSlots(game.getSaves());
    }
    catch (error) {
        console.error('Failed to import save:', error);
        alert(`Could not import that save: ${error.message || error}`);
    }
}
export async function deleteGame(characterId) {
    const allSaves = game.getSaves();
    const saveToDelete = allSaves.find(s => s.id === characterId);
    if (!saveToDelete || !saveToDelete.characterInfo)
        return;
    const confirmed = await ui.showConfirmModal(`Are you sure you want to permanently delete the adventure for "${saveToDelete.characterInfo.name}"?`, 'Delete Adventure');
    if (confirmed) {
        game.deleteSave(characterId);
        ui.displaySaveSlots(game.getSaves());
    }
}
