/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as dom from './dom.js';
import * as ui from './ui.js';
import * as dataManager from './data-manager.js';
import { hexToString } from './utils.js';

import * as characterCreator from './character-creator.js';
import * as gameLoop from './game-loop.js';
import * as sessionManager from './session-manager.js';
import * as game from './game.js';


// --- SESSION & GAME LIFECYCLE ---

function setupMainAppEventListeners() {
    dom.characterForm.addEventListener('submit', characterCreator.handleCharacterCreationSubmit);
    dom.customHookForm.addEventListener('submit', characterCreator.handleCustomHookSubmit);

    dom.newAdventureBtn.addEventListener('click', () => {
        dom.loadGameModal.classList.add('hidden');
        sessionManager.newGame(localStorage.getItem('matureEnabled') === 'true');
    });

    dom.loadGameCancelBtn.addEventListener('click', () => {
        dom.loadGameModal.classList.add('hidden');
        dom.landingPage.classList.remove('hidden');
    });

    dom.characterCreationCancelBtn.addEventListener('click', () => {
        dom.characterCreationModal.classList.add('hidden');
        dom.appElement.classList.add('hidden');
        dom.landingPage.classList.remove('hidden');
    });

    dom.pointBuyContainer.addEventListener('click', (event) => {
        const target = event.target;
        const button = target.closest('.stat-btn');
        if (!button) return;

        const stat = button.dataset.stat;
        const action = button.id.includes('increase') ? 'increase' : 'decrease';
        
        characterCreator.updateAbilityScore(stat, action);
    });

    dom.chatLog.addEventListener('click', async (event) => {
        const target = event.target;

        // --- NEW CHOICE-HANDLING LOGIC ---
        const choiceButton = target.closest('.action-choice-btn');
        if (choiceButton) {
            const { actionType, weaponName, targetDescription, skillOrAbility, description, modifier } = choiceButton.dataset;

            choiceButton.parentElement?.remove(); // Remove the button container

            if (actionType === 'attack') {
                await gameLoop.handleAttackRollRequest(weaponName, targetDescription, modifier);
            } else if (actionType === 'roll') {
                await gameLoop.handleDiceRollRequest(skillOrAbility, description, modifier);
            }
            return; // Stop further processing
        }
        // --- END OF NEW LOGIC ---

        const actionButton = target.closest('.action-btn');
        if (actionButton) {
            if (actionButton.classList.contains('reroll-btn')) await gameLoop.handleRerollRequest(actionButton);
            else if (actionButton.classList.contains('regenerate-btn')) await gameLoop.handleRegenerateRequest(actionButton);
        }
    });

    // NEW: Event delegation for save slots
    dom.saveSlotsList.addEventListener('click', async (event) => {
        const button = event.target.closest('button');
        if (!button) return;

        const { id } = button.dataset;
        if (!id) return;

        if (button.classList.contains('load-btn')) {
            await sessionManager.loadGame(id);
        } else if (button.classList.contains('delete-btn')) {
            await sessionManager.deleteGame(id);
        }
    });

    dom.chatForm.addEventListener('submit', gameLoop.handleFormSubmit);

    // Handle Enter key for textarea submission
    dom.chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            dom.chatForm.requestSubmit();
        }
    });

    dom.micBtn.addEventListener('click', () => {
        const { speech, tts } = sessionManager.getServices();
        speech.toggle(tts.cancel);
    });

    dom.readAloudToggle.addEventListener('change', () => {
        const isEnabled = dom.readAloudToggle.checked;
        sessionManager.getServices().tts.setEnabled(isEnabled);
        localStorage.setItem('readAloudEnabled', String(isEnabled));
    });

    /* dom.debugLogBtn.addEventListener('click', () => {
        dom.debuggerPanel.classList.toggle('hidden');
        ui.scrollToBottom();
    }); */

    dom.buildRagBtn.addEventListener('click', sessionManager.handleBuildRag);

    // Accordion logic for player stats sidebar
    dom.playerStats.addEventListener('click', (event) => {
        const target = event.target;
        const clickedHeader = target.closest('.accordion-header');
        
        if (!clickedHeader) return;

        const allHeaders = dom.playerStats.querySelectorAll('.accordion-header');
        
        // Close other sections
        allHeaders.forEach(header => {
            if (header !== clickedHeader) {
                header.classList.remove('active');
                const content = header.nextElementSibling;
                if (content && content.classList.contains('accordion-content')) {
                    content.classList.remove('expanded');
                }
            }
        });

        // Toggle the clicked section
        clickedHeader.classList.toggle('active');
        const content = clickedHeader.nextElementSibling;
        if (content && content.classList.contains('accordion-content')) {
            content.classList.toggle('expanded');
        }
    });

    // Dropdown changes trigger a full UI redraw.
    dom.charRaceInput.addEventListener('change', characterCreator.updateSkillSelectionUI);
    dom.charClassInput.addEventListener('change', characterCreator.updateSkillSelectionUI);
    dom.charBackgroundInput.addEventListener('change', characterCreator.updateSkillSelectionUI);

    // Use a single, delegated event listener for all skill checkboxes that calls the state management function.
    const skillSelectionContainer = document.getElementById('skill-selection-container');
    if (skillSelectionContainer) {
        skillSelectionContainer.addEventListener('change', (event) => {
            const target = event.target;
            if (target && target.type === 'checkbox' && target.id.startsWith('skill-choice-')) {
                characterCreator.updateCheckboxStates();
            }
        });
    }

    // Sidebar toggle logic for mobile
    dom.sidebarToggleBtn.addEventListener('click', () => {
        dom.appElement.classList.toggle('sidebar-open');
    });

    dom.appOverlay.addEventListener('click', () => {
        dom.appElement.classList.remove('sidebar-open');
    });
}


async function main() {
    const encodedCopyright = '436f707972696768742028632920323032352054686553756c66617465466f726765';
    dom.landingCreditLine.textContent = hexToString(encodedCopyright);

    // Fetch and display version from metadata.json
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
    } catch (error) {
        console.error("Could not load version from metadata.json", error);
    }

    await dataManager.init();
    ui.populateCreationDropdowns();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js').then(reg => console.log('SW registered.', reg), err => console.log('SW reg failed: ', err));
        });
    }

    sessionManager.setupInitialEventListeners(setupMainAppEventListeners);
}

main();