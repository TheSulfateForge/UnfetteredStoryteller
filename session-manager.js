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
    let savedReadAloudEnabled = false;
    let ageConfirmed = false;
    try {
        savedMatureEnabled = localStorage.getItem('matureEnabled') === 'true';
        savedReadAloudEnabled = localStorage.getItem('readAloudEnabled') === 'true';
        ageConfirmed = localStorage.getItem('ageConfirmed') === 'true';
    }
    catch (e) {
        console.warn("Could not access localStorage. Settings will not be persisted.", e);
        // Proceed with defaults
    }
    gameState.updateState({ isMatureEnabled: savedMatureEnabled });
    dom.ageGateMatureToggle.checked = savedMatureEnabled;
    services.tts.init(savedReadAloudEnabled, providerSettings);
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
        let savedReadAloudEnabled = false;
        try {
            savedReadAloudEnabled = localStorage.getItem('readAloudEnabled') === 'true';
        }
        catch (e) {
            console.warn("Could not access localStorage to read settings.", e);
        }
        services.tts.init(savedReadAloudEnabled, providerSettings);
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
                    await rag.init(llmProvider, ui.updateRagStatus);
                }
            }
            catch (error) {
                console.warn("Could not auto-initialize provider on page load.", error);
            }
        }
    })();
    dom.landingNewBtn.addEventListener('click', () => proceedToAdventure('new', setupMainAppEventListeners));
    dom.landingLoadBtn.addEventListener('click', () => proceedToAdventure('load', setupMainAppEventListeners));
    dom.landingSettingsBtn.addEventListener('click', () => ui.showSettings(game.getProviderSettings()));
    dom.changeSettingsBtn.addEventListener('click', () => ui.showSettings(game.getProviderSettings()));
    dom.settingsForm.addEventListener('submit', handleSettingsSave);
    dom.providerSelector.addEventListener('change', () => {
        const providerType = dom.providerSelector.value;
        const isLocal = providerType === 'local';
        dom.geminiSettingsSection.classList.toggle('hidden', isLocal);
        dom.localLlmSettingsSection.classList.toggle('hidden', !isLocal);
        if (providerType === 'local') {
            ui.updateRagStatus('unsupported');
        }
        else {
            ui.updateRagStatus(rag.getStatus());
        }
    });
    dom.legalBtn.addEventListener('click', () => dom.legalModal.classList.remove('hidden'));
    dom.legalModalCloseBtn.addEventListener('click', () => dom.legalModal.classList.add('hidden'));
    dom.legalModal.addEventListener('click', (e) => {
        if (e.target === dom.legalModal)
            dom.legalModal.classList.add('hidden');
    });
}
export async function handleBuildRag() {
    const llmProvider = gameState.getState().llmProvider;
    if (llmProvider)
        await rag.buildStore();
    else
        ui.updateRagStatus('error', 'AI Provider not initialized.');
}
export function getServices() {
    return { speech: services.speech, tts: services.tts };
}
export async function initializeChatSession() {
    const { llmProvider, isMatureEnabled, characterInfo, playerState, chatHistory } = gameState.getState();
    if (!llmProvider || !characterInfo || !playerState) {
        throw new Error("Cannot initialize chat: core state missing.");
    }
    services.tts.cancel();
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
    services.tts.cancel();
    gameState.resetForNewGame();
    gameState.updateState({ isMatureEnabled: isMature });
    dom.chatLog.innerHTML = '';
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
