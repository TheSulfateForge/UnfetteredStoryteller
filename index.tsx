/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import * as dom from './dom';
import * as ui from './ui';
import * as dataManager from './data-manager';
import { hexToString } from './utils';

import * as characterCreator from './character-creator';
import * as gameLoop from './game-loop';
import * as sessionManager from './session-manager';
import * as game from './game';


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
        const target = event.target as HTMLElement;
        const button = target.closest('.stat-btn') as HTMLButtonElement;
        if (!button) return;

        const stat = button.dataset.stat as keyof import('./types').AbilityScores;
        const action = button.id.includes('increase') ? 'increase' : 'decrease';
        
        characterCreator.updateAbilityScore(stat, action);
    });

    dom.chatLog.addEventListener('click', async (event) => {
        const target = event.target as HTMLElement;

        // --- NEW CHOICE-HANDLING LOGIC ---
        const choiceButton = target.closest('.action-choice-btn');
        if (choiceButton) {
            const { actionType, weaponName, targetDescription, skillOrAbility, description, modifier } = (choiceButton as HTMLButtonElement).dataset;

            choiceButton.parentElement?.remove(); // Remove the button container

            if (actionType === 'attack') {
                await gameLoop.handleAttackRollRequest(weaponName!, targetDescription!, modifier as any);
            } else if (actionType === 'roll') {
                await gameLoop.handleDiceRollRequest(skillOrAbility!, description!, modifier as any);
            }
            return; // Stop further processing
        }
        // --- END OF NEW LOGIC ---

        const actionButton = target.closest('.action-btn');
        if (actionButton) {
            if (actionButton.classList.contains('reroll-btn')) await gameLoop.handleRerollRequest(actionButton as HTMLButtonElement);
            else if (actionButton.classList.contains('regenerate-btn')) await gameLoop.handleRegenerateRequest(actionButton as HTMLButtonElement);
        }
    });

    // NEW: Event delegation for save slots
    dom.saveSlotsList.addEventListener('click', async (event) => {
        const button = (event.target as HTMLElement).closest('button');
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
        const target = event.target as HTMLElement;
        const clickedHeader = target.closest('.accordion-header');
        
        if (!clickedHeader) return;

        const allHeaders = dom.playerStats.querySelectorAll('.accordion-header');
        
        // Close other sections
        allHeaders.forEach(header => {
            if (header !== clickedHeader) {
                header.classList.remove('active');
                const content = header.nextElementSibling as HTMLElement;
                if (content && content.classList.contains('accordion-content')) {
                    content.classList.remove('expanded');
                }
            }
        });

        // Toggle the clicked section
        clickedHeader.classList.toggle('active');
        const content = clickedHeader.nextElementSibling as HTMLElement;
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
            const target = event.target as HTMLInputElement;
            if (target && target.type === 'checkbox' && target.id.startsWith('skill-choice-')) {
                characterCreator.updateCheckboxStates();
            }
        });
    }
}


async function main() {
    const encodedCopyright = '436f707972696768742028632920323032352054686553756c66617465466f726765';
    dom.landingCreditLine.textContent = hexToString(encodedCopyright);

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