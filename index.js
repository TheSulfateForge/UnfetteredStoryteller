/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { dom } from './dom.js';
import * as ui from './ui.js';
import * as dataManager from './data-manager.js';
import { hexToString } from './utils.js';
import * as characterCreator from './character-creator.js';
import * as gameLoop from './game-loop.js';
import * as sessionManager from './session-manager.js';
// --- SESSION & GAME LIFECYCLE ---
/**
 * Sets up the main event listeners for the application once it's running.
 * This includes character creation, game actions, and UI interactions.
 */
function setupMainAppEventListeners() {
    dom.characterForm.addEventListener('submit', characterCreator.handleCharacterCreationSubmit);
    dom.customHookForm.addEventListener('submit', characterCreator.handleCustomHookSubmit);
    // Character Creation Wizard Navigation
    dom.ccNextBtn.addEventListener('click', (event) => {
        if (event.target.type === 'button') {
            characterCreator.handleNextPage();
        }
    });
    dom.ccPrevBtn.addEventListener('click', characterCreator.handlePrevPage);
    dom.newAdventureBtn.addEventListener('click', () => {
        dom.loadGameModal.classList.add('hidden');
        let matureEnabled = false;
        try {
            matureEnabled = localStorage.getItem('matureEnabled') === 'true';
        }
        catch (e) {
            console.warn('Could not access localStorage for mature content setting.', e);
        }
        sessionManager.newGame(matureEnabled);
    });
    dom.loadGameCancelBtn.addEventListener('click', () => {
        dom.loadGameModal.classList.add('hidden');
        dom.landingPage.classList.remove('hidden');
    });
    dom.characterCreationCloseBtn.addEventListener('click', () => {
        dom.characterCreationModal.classList.add('hidden');
        dom.appElement.classList.add('hidden');
        dom.landingPage.classList.remove('hidden');
    });
    dom.pointBuyContainer.addEventListener('click', (event) => {
        const target = event.target;
        const button = target.closest('.stat-btn');
        if (!button)
            return;
        const stat = button.dataset.stat;
        const action = button.id.includes('increase') ? 'increase' : 'decrease';
        characterCreator.updateAbilityScore(stat, action);
    });
    dom.chatLog.addEventListener('click', async (event) => {
        const target = event.target;
        const choiceButton = target.closest('.action-choice-btn');
        if (choiceButton) {
            const { actionType, weaponName, targetDescription, skillOrAbility, description, modifier } = choiceButton.dataset;
            choiceButton.parentElement?.remove();
            if (actionType === 'attack') {
                await gameLoop.handleAttackRollRequest(weaponName, targetDescription, modifier);
            }
            else if (actionType === 'roll') {
                await gameLoop.handleDiceRollRequest(skillOrAbility, description, modifier);
            }
            return;
        }
        const actionButton = target.closest('.action-btn');
        if (actionButton) {
            if (actionButton.classList.contains('reroll-btn'))
                await gameLoop.handleRerollRequest(actionButton);
            else if (actionButton.classList.contains('regenerate-btn'))
                await gameLoop.handleRegenerateRequest(actionButton);
        }
    });
    dom.saveSlotsList.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button)
            return;
        const { id } = button.dataset;
        if (!id)
            return;
        if (button.classList.contains('load-btn')) {
            await sessionManager.loadGame(id);
        }
        else if (button.classList.contains('delete-btn')) {
            await sessionManager.deleteGame(id);
        }
    });
    dom.chatForm.addEventListener('submit', gameLoop.handleFormSubmit);
    dom.chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            dom.chatForm.requestSubmit();
        }
    });
    dom.chatInput.addEventListener('input', () => {
        const input = dom.chatInput;
        input.style.height = 'auto';
        input.style.height = `${input.scrollHeight}px`;
    });
    dom.micBtn.addEventListener('click', () => {
        const { speech, tts } = sessionManager.getServices();
        speech.toggle(tts.cancel);
    });
    dom.readAloudToggle.addEventListener('change', () => {
        const isEnabled = dom.readAloudToggle.checked;
        sessionManager.getServices().tts.setEnabled(isEnabled);
        try {
            localStorage.setItem('readAloudEnabled', String(isEnabled));
        }
        catch (e) {
            console.warn('Could not save read-aloud setting to localStorage.', e);
        }
    });
    dom.buildRagBtn.addEventListener('click', sessionManager.handleBuildRag);
    // Accordion handler optimization: Cache the headers to avoid re-querying the DOM on every click.
    const accordionHeaders = dom.playerStats.querySelectorAll('.accordion-header');
    dom.playerStats.addEventListener('click', (event) => {
        const target = event.target;
        const clickedHeader = target.closest('.accordion-header');
        if (!clickedHeader)
            return;
        accordionHeaders.forEach(header => {
            if (header !== clickedHeader) {
                header.classList.remove('active');
                const content = header.nextElementSibling;
                if (content && content.classList.contains('accordion-content')) {
                    content.classList.remove('expanded');
                }
            }
        });
        clickedHeader.classList.toggle('active');
        const content = clickedHeader.nextElementSibling;
        if (content && content.classList.contains('accordion-content')) {
            content.classList.toggle('expanded');
        }
    });
    dom.charRaceInput.addEventListener('change', characterCreator.handleCharacterCoreIdentityChange);
    dom.charClassInput.addEventListener('change', characterCreator.handleCharacterCoreIdentityChange);
    dom.charBackgroundInput.addEventListener('change', characterCreator.handleCharacterCoreIdentityChange);
    dom.ccPagesContainer.addEventListener('change', (event) => {
        const target = event.target;
        if (target.closest('.skill-section')) {
            characterCreator.updateCheckboxStates();
        }
        const spellSelectionPage = target.closest('#spell-selection-page');
        if (spellSelectionPage) {
            if (target.type === 'checkbox') {
                const name = target.name;
                let limit = 0;
                if (name === 'rogueExpertise') {
                    limit = parseInt(spellSelectionPage.dataset.expertiseLimit || '0', 10);
                }
                else if (name === 'cantrip-selection') {
                    limit = parseInt(spellSelectionPage.dataset.cantripLimit || '0', 10);
                }
                else if (name === 'level1-selection') {
                    limit = parseInt(spellSelectionPage.dataset.level1Limit || '0', 10);
                }
                if (limit > 0) {
                    characterCreator.enforceCheckboxLimit(name, limit);
                }
            }
            else if (target.type === 'radio') {
                characterCreator.updateSpecialSelectionsUI();
            }
        }
    });
    dom.ccPagesContainer.addEventListener('click', (event) => {
        const target = event.target;
        if (target.matches('#spell-selection-page label[data-spell-slug]')) {
            characterCreator.displaySpellDetails(target);
        }
    });
    dom.sidebarToggleBtn.addEventListener('click', () => {
        dom.appElement.classList.toggle('sidebar-open');
    });
    dom.appOverlay.addEventListener('click', () => {
        dom.appElement.classList.remove('sidebar-open');
    });
    dom.viewCharacterSheetBtn.addEventListener('click', ui.showCharacterSheetModal);
    dom.characterSheetCloseBtn.addEventListener('click', () => {
        dom.characterSheetModal.classList.add('hidden');
    });
    dom.characterSheetList.addEventListener('click', (event) => {
        const target = event.target;
        const itemElement = target.closest('.cs-list-item');
        if (itemElement) {
            ui.displayCharacterSheetDetail(itemElement);
        }
    });
    // Level Up Listeners
    dom.levelUpBtn.addEventListener('click', characterCreator.startLevelUp);
    dom.levelUpCancelBtn.addEventListener('click', () => { dom.levelUpModal.classList.add('hidden'); });
    dom.levelUpNextBtn.addEventListener('click', characterCreator.handleLevelUpNext);
    dom.levelUpPrevBtn.addEventListener('click', characterCreator.handleLevelUpPrev);
}
/**
 * Sets up a listener for the service worker to handle application updates.
 * Displays a notification banner when a new version is available.
 * @param {ServiceWorkerRegistration} registration The service worker registration object.
 */
function setupServiceWorkerUpdateListener(registration) {
    const showUpdateBanner = () => {
        dom.updateNotificationBanner.classList.remove('hidden');
    };
    const onUpdateButtonClick = () => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
    };
    dom.updateReloadBtn.addEventListener('click', onUpdateButtonClick);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
    if (registration.waiting) {
        showUpdateBanner();
        return;
    }
    registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner();
                }
            });
        }
    });
}
/**
 * The main entry point for the application.
 * Initializes data, sets up listeners, and handles application lifecycle.
 */
async function main() {
    const encodedCopyright = '436f707972696768742028632920323032352054686553756c66617465466f726765';
    dom.landingCreditLine.textContent = hexToString(encodedCopyright);
    try {
        const response = await fetch('./metadata.json');
        if (response.ok) {
            const metadata = await response.json();
            const name = metadata.name || '';
            const versionMatch = name.match(/v\d+\.\d+\.\d+/);
            if (versionMatch && dom.versionDisplay) {
                dom.versionDisplay.textContent = versionMatch[0];
            }
        }
    }
    catch (error) {
        console.error("Could not load version from metadata.json", error);
    }
    const saveOnExit = () => {
        if (document.visibilityState === 'hidden' && sessionManager.isGameInProgress()) {
            console.log('Page is hidden, saving game state...');
            sessionManager.saveCurrentGame();
        }
    };
    document.addEventListener('visibilitychange', saveOnExit);
    window.addEventListener('beforeunload', () => {
        if (sessionManager.isGameInProgress()) {
            sessionManager.saveCurrentGame();
        }
    });
    await dataManager.init();
    ui.populateCreationDropdowns();
    sessionManager.setupInitialEventListeners(setupMainAppEventListeners);
}
document.addEventListener('DOMContentLoaded', async () => {
    if ('serviceWorker' in navigator) {
        try {
            // Correct, simplified registration
            const registration = await navigator.serviceWorker.register('sw.js'); 
            
            console.log('SW registered.', registration);
            setupServiceWorkerUpdateListener(registration);
        }
        catch (err) {
            console.log('SW reg failed: ', err);
        }
    }
    await main();
});
