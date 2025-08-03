/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as dom from './dom';
import * as config from './config';
import * as dataManager from './data-manager';
import { CharacterInfo, PlayerState, SaveSlot, DiceRollContent, AttackRollContent, ProviderSettings, RagStatus } from './types';
import { getAbilityModifierValue } from './rpg-helpers';

// --- UI HELPER FUNCTIONS ---

function updateCoreStats(playerState: PlayerState, characterInfo: CharacterInfo) {
    dom.statsCharName.textContent = characterInfo.name;
    dom.statsLocation.textContent = playerState.location;
    dom.statsHealth.textContent = `${playerState.health.current}/${playerState.health.max}`;
    dom.statsMoney.textContent = `${playerState.money.amount} ${playerState.money.currency}`;
    dom.statsExp.textContent = `${playerState.exp} XP`;
}

function updatePregnancyStatus(playerState: PlayerState, characterInfo: CharacterInfo): { speedPenalty: number } {
    let speedPenalty = 0;
    
    if (characterInfo.gender === 'female' && playerState.pregnancy?.isPregnant) {
        const daysPregnant = Math.floor((playerState.turnCount - playerState.pregnancy.conceptionTurn) / config.TURNS_PER_DAY);
        const weeksPregnant = Math.floor(daysPregnant / 7);
        const conditionValueEl = dom.statsPregnancyStatus.querySelector('#stats-pregnancy-value') as HTMLElement;

        if (weeksPregnant >= 14 || playerState.pregnancy.knowledgeRevealed) {
            dom.statsPregnancyStatus.classList.remove('hidden');
            
            if (weeksPregnant >= 28) {
                speedPenalty = 10;
                conditionValueEl.innerHTML = `Pregnant (${weeksPregnant} weeks)<br><span class="penalty">Disadvantage on Str/Dex checks</span>`;
            } else {
                 conditionValueEl.textContent = `Pregnant (${weeksPregnant} weeks)`;
            }

        } else {
            dom.statsPregnancyStatus.classList.add('hidden');
        }

    } else {
        dom.statsPregnancyStatus.classList.add('hidden');
    }
    
    return { speedPenalty };
}

function updateEquipmentAndLists(playerState: PlayerState) {
    dom.equipWeapon.textContent = playerState.equipment.weapon || 'None';
    dom.equipArmor.textContent = playerState.equipment.armor || 'None';
    const createList = (items: string[]) => items.length > 0 ? items.map(item => `<li>${item}</li>`).join('') : '<li>(None)</li>';
    dom.statsInventory.innerHTML = createList(playerState.inventory);
    dom.statsParty.innerHTML = createList(playerState.party);
    const questItems = playerState.quests.map(quest => `<li><strong>${quest.name}:</strong> ${quest.description}</li>`);
    dom.statsQuests.innerHTML = questItems.length > 0 ? questItems.join('') : '<li>(None)</li>';
}

function updateCharacterDetails(playerState: PlayerState, characterInfo: CharacterInfo, speedPenalty: number) {
    dom.statsLevel.textContent = String(playerState.level);
    dom.statsProficiencyBonus.textContent = `+${playerState.proficiencyBonus}`;
    dom.statsAC.textContent = String(playerState.armorClass);
    dom.statsSpeed.textContent = `${playerState.speed - speedPenalty} ft.`;
    dom.statsRace.textContent = characterInfo.race;
    dom.statsClass.textContent = characterInfo.characterClass;
    dom.statsBackground.textContent = characterInfo.background;
    dom.statsAlignment.textContent = characterInfo.alignment;
}

function updateAbilityScores(playerState: PlayerState) {
    const getAbilityModifierString = (score: number) => { const mod = getAbilityModifierValue(score); return mod >= 0 ? `+${mod}` : String(mod); };

    dom.statsStr.textContent = String(playerState.abilityScores.strength);
    dom.statsDex.textContent = String(playerState.abilityScores.dexterity);
    dom.statsCon.textContent = String(playerState.abilityScores.constitution);
    dom.statsInt.textContent = String(playerState.abilityScores.intelligence);
    dom.statsWis.textContent = String(playerState.abilityScores.wisdom);
    dom.statsCha.textContent = String(playerState.abilityScores.charisma);

    dom.statsStrMod.textContent = getAbilityModifierString(playerState.abilityScores.strength);
    dom.statsDexMod.textContent = getAbilityModifierString(playerState.abilityScores.dexterity);
    dom.statsConMod.textContent = getAbilityModifierString(playerState.abilityScores.constitution);
    dom.statsIntMod.textContent = getAbilityModifierString(playerState.abilityScores.intelligence);
    dom.statsWisMod.textContent = getAbilityModifierString(playerState.abilityScores.wisdom);
    dom.statsChaMod.textContent = getAbilityModifierString(playerState.abilityScores.charisma);
}

function updateProficiencyLists(playerState: PlayerState) {
    const createList = (items: string[]) => items.length > 0 ? items.map(item => `<li>${item}</li>`).join('') : '<li>(None)</li>';
    const createProficiencyList = (proficiencies: Record<string, 'proficient' | 'none'>) => Object.entries(proficiencies)
        .map(([key, value]) => `<li class="${value === 'proficient' ? 'proficient' : 'not-proficient'}">${key.replace(/([A-Z])/g, ' $1')}</li>`).join('');

    dom.statsSkills.innerHTML = createProficiencyList(playerState.skills);
    dom.statsSavingThrows.innerHTML = createProficiencyList(playerState.savingThrows);
    dom.statsFeats.innerHTML = createList(playerState.feats);
    dom.statsRacialTraits.innerHTML = createList(playerState.racialTraits);
    dom.statsClassFeatures.innerHTML = createList(playerState.classFeatures);
}


// --- EXPORTED UI FUNCTIONS ---

export function addMessage(sender: 'dm' | 'user' | 'error' | 'dice' | 'attack', content: string | DiceRollContent | AttackRollContent): HTMLElement {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message');
  let messageHtml = '';

  if (sender === 'dice' && typeof content === 'object' && 'dieValue' in content) {
    const diceContent = content as DiceRollContent;
    messageElement.classList.add('dice-roll-message');
    const modifierSign = diceContent.modifier >= 0 ? '+' : '-';
    
    let breakdown = `Rolled ${diceContent.roll} (d${diceContent.dieValue}) ${modifierSign} ${Math.abs(diceContent.modifier)}`;
    if (diceContent.allRolls.length > 1) {
        breakdown = `Rolled ${diceContent.roll} from [${diceContent.allRolls.join(', ')}] (d${diceContent.dieValue}) ${modifierSign} ${Math.abs(diceContent.modifier)}`;
    }
    
    messageHtml = `<span class="dice-title">${diceContent.description}</span><span class="dice-result">${diceContent.total}</span><span class="dice-breakdown">${breakdown}</span>`;
    
    if (diceContent.rollModifier === 'ADVANTAGE') {
        messageHtml += `<span class="advantage-notice">Rolled with Advantage</span>`;
    } else if (diceContent.rollModifier === 'DISADVANTAGE') {
        messageHtml += `<span class="disadvantage-notice">Rolled with Disadvantage</span>`;
    }

    messageElement.dataset.skillOrAbility = diceContent.skillOrAbility;
    messageElement.dataset.description = diceContent.description;
    if (diceContent.rollModifier && diceContent.rollModifier !== 'NONE') {
        messageElement.dataset.modifier = diceContent.rollModifier;
    }

  } else if (sender === 'attack' && typeof content === 'object' && 'totalAttackRoll' in content) {
    const attackContent = content as AttackRollContent;
    messageElement.classList.add('attack-roll-message');
    const attackBonusSign = attackContent.attackBonus >= 0 ? '+' : '-';
    const damageBonusSign = attackContent.damageBonus >= 0 ? '+' : '-';

    let attackBreakdown = `${attackContent.attackRoll} (d20) ${attackBonusSign} ${Math.abs(attackContent.attackBonus)}`;
    if (attackContent.allRolls.length > 1) {
        attackBreakdown = `${attackContent.attackRoll} from [${attackContent.allRolls.join(', ')}] (d20) ${attackBonusSign} ${Math.abs(attackContent.attackBonus)}`;
    }

    messageHtml = `
        <span class="attack-title">${attackContent.description}</span>
        <div class="attack-results">
            <div class="result-box">
                <span class="result-label">Attack</span>
                <span class="result-value">${attackContent.totalAttackRoll}</span>
                <span class="result-breakdown">${attackBreakdown}</span>
            </div>
            <div class="result-box">
                <span class="result-label">Damage</span>
                <span class="result-value">${attackContent.totalDamage}</span>
                <span class="result-breakdown">${attackContent.damageRoll} (${attackContent.damageDice}) ${damageBonusSign} ${Math.abs(attackContent.damageBonus)}</span>
            </div>
        </div>
    `;
    if (attackContent.isCritical) {
        messageHtml += `<div class="critical-hit">CRITICAL HIT!</div>`;
    }
    if (attackContent.rollModifier === 'ADVANTAGE') {
        messageHtml += `<span class="advantage-notice">Rolled with Advantage</span>`;
    } else if (attackContent.rollModifier === 'DISADVANTAGE') {
        messageHtml += `<span class="disadvantage-notice">Rolled with Disadvantage</span>`;
    }
  } else {
    messageElement.classList.add(`${sender}-message`);
    const textContent = (typeof content === 'string') ? content : '';
    messageHtml = textContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
  }

  messageElement.innerHTML = messageHtml;
  dom.chatLog.appendChild(messageElement);
  scrollToBottom();
  return messageElement;
}

export function setLoading(isLoading: boolean, showSpinner = isLoading): void {
  dom.loadingIndicator.classList.toggle('hidden', !showSpinner);
  dom.chatInput.disabled = isLoading;
  (dom.chatForm.querySelector('button[type="submit"]') as HTMLButtonElement).disabled = isLoading;
  dom.micBtn.disabled = isLoading;
   document.querySelectorAll('.action-btn').forEach(btn => {
        (btn as HTMLButtonElement).disabled = isLoading;
    });
}

export function scrollToBottom(): void { 
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.scrollTop = mainContent.scrollHeight;
    }
}

export function updatePlayerStateUI(playerState: PlayerState, characterInfo: CharacterInfo) {
    if (!playerState || !characterInfo || !playerState.health) return;

    updateCoreStats(playerState, characterInfo);
    const { speedPenalty } = updatePregnancyStatus(playerState, characterInfo);
    updateEquipmentAndLists(playerState);
    updateCharacterDetails(playerState, characterInfo, speedPenalty);
    updateAbilityScores(playerState);
    updateProficiencyLists(playerState);
}

export function clearPlayerStatsUI() {
    dom.statsCharName.textContent = 'Character';
    dom.statsLocation.textContent = 'Unknown';
    dom.statsHealth.textContent = '--/--';
    dom.statsMoney.textContent = '--';
    dom.statsExp.textContent = '--';
    dom.statsPregnancyStatus.classList.add('hidden');
    dom.equipWeapon.textContent = 'None';
    dom.equipArmor.textContent = 'None';
    dom.statsInventory.innerHTML = '<li>(Empty)</li>';
    dom.statsQuests.innerHTML = '<li>(None)</li>';
    dom.statsParty.innerHTML = '<li>(None)</li>';
    dom.statsLevel.textContent = '';
    dom.statsProficiencyBonus.textContent = '';
    dom.statsAC.textContent = '';
    dom.statsSpeed.textContent = '';
    dom.statsRace.textContent = '';
    dom.statsClass.textContent = '';
    dom.statsBackground.textContent = '';
    dom.statsAlignment.textContent = '';
    dom.statsStr.textContent = '';
    dom.statsDex.textContent = '';
    dom.statsCon.textContent = '';
    dom.statsInt.textContent = '';
    dom.statsWis.textContent = '';
    dom.statsCha.textContent = '';
    dom.statsStrMod.textContent = '';
    dom.statsDexMod.textContent = '';
    dom.statsConMod.textContent = '';
    dom.statsIntMod.textContent = '';
    dom.statsWisMod.textContent = '';
    dom.statsChaMod.textContent = '';
    dom.statsSkills.innerHTML = '';
    dom.statsSavingThrows.innerHTML = '';
    dom.statsFeats.innerHTML = '<li>(None)</li>';
    dom.statsRacialTraits.innerHTML = '<li>(None)</li>';
    dom.statsClassFeatures.innerHTML = '<li>(None)</li>';
}

export function displayStoryHooks(hooks: {title: string, description: string}[], startAdventureCallback: (hook: string) => void) {
    dom.storyHooksContainer.innerHTML = '';
    if (!hooks || hooks.length === 0) {
         dom.storyHooksContainer.innerHTML = `<p class="error-message">The Storyteller had trouble coming up with ideas. Please try writing your own, or <a href="#" onclick="location.reload()">restarting</a>.</p>`;
         return;
    }

    hooks.forEach((hook: {title: string, description: string}) => {
        const card = document.createElement('div');
        card.className = 'story-hook-card';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.innerHTML = `<h4>${hook.title}</h4><p>${hook.description}</p>`;
        card.addEventListener('click', () => startAdventureCallback(hook.description));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') startAdventureCallback(hook.description); });
        dom.storyHooksContainer.appendChild(card);
    });
}

export function displaySaveSlots(allSaves: SaveSlot[]) {
    dom.saveSlotsList.innerHTML = ''; // Clear previous list

    if (allSaves.length === 0) {
        dom.saveSlotsList.innerHTML = '<p class="no-saves">No adventures saved yet. Time to start one!</p>';
    } else {
        allSaves.forEach(save => {
            if (!save || !save.characterInfo || !save.playerState) {
                console.warn('Skipping rendering of a malformed save slot:', save);
                return;
            }

            const card = document.createElement('div');
            card.className = 'save-slot-card';
            card.innerHTML = `
                <div class="save-slot-info">
                    <h4>${save.characterInfo.name}</h4>
                    <p>Level ${save.playerState.level} ${save.characterInfo.race} ${save.characterInfo.characterClass}</p>
                </div>
                <div class="save-slot-actions">
                    <button class="load-btn" data-id="${save.id}">Load</button>
                    <button class="delete-btn" data-id="${save.id}">Delete</button>
                </div>
            `;
            dom.saveSlotsList.appendChild(card);
        });
    }

    dom.loadGameModal.classList.remove('hidden');
}

export function showCharacterCreation() {
    dom.characterCreationModal.classList.remove('hidden');
    dom.charNameInput.focus();
}

export function showSettings(settings: ProviderSettings) {
    dom.providerSelector.value = settings.provider;
    dom.apiKeyInput.value = settings.apiKey || '';
    dom.localLlmUrlInput.value = settings.localUrl || '';

    const isLocal = settings.provider === 'local';
    dom.geminiSettingsSection.classList.toggle('hidden', isLocal);
    dom.localLlmSettingsSection.classList.toggle('hidden', !isLocal);

    dom.settingsModal.classList.remove('hidden');
    dom.apiKeyInput.focus();
}

export function updateRagStatus(status: RagStatus, message?: string) {
    if (!dom.ragStatus || !dom.buildRagBtn) return;

    let statusText = '';
    let isButtonDisabled = false;

    switch (status) {
        case 'idle':
            statusText = 'Status: Not built. Click below to build.';
            isButtonDisabled = false;
            break;
        case 'building':
            statusText = `Status: Building... ${message || ''}`;
            isButtonDisabled = true;
            break;
        case 'ready':
            statusText = `Status: Ready. ${message || ''}`;
            isButtonDisabled = false; // Can rebuild
            dom.buildRagBtn.textContent = 'Rebuild Knowledge Base';
            break;
        case 'error':
            statusText = `Status: Error. ${message || 'An unknown error occurred.'}`;
            isButtonDisabled = false;
            break;
        case 'unsupported':
            statusText = 'Status: Unsupported by current AI Provider.';
            isButtonDisabled = true;
            break;
        case 'initializing':
            statusText = 'Status: Initializing...';
            isButtonDisabled = true;
            break;

    }
    
    dom.ragStatus.textContent = statusText;
    dom.buildRagBtn.disabled = isButtonDisabled;
}

export function populateCreationDropdowns() {
    const races = dataManager.getRaces();
    const classes = dataManager.getClasses();
    const backgrounds = dataManager.getBackgrounds();

    // --- Race Dropdown Population ---
    const raceUrlMap = new Map<string, dataManager.Race>();
    races.forEach(r => raceUrlMap.set(r.url, r));

    const raceOptions = races.map(race => {
        let text = race.name;
        if (race.is_subrace && race.subrace_of) {
            const parentRace = raceUrlMap.get(race.subrace_of);
            const parentName = parentRace ? parentRace.name : 'Unknown';
            text = `${parentName} (${race.name})`;
        }
        return { value: race.name, text: text };
    });

    raceOptions.sort((a, b) => a.text.localeCompare(b.text));

    // Clear and rebuild the race dropdown
    dom.charRaceInput.innerHTML = '<option value="" disabled selected>Select a Race...</option>';
    const raceOptgroup = document.createElement('optgroup');
    raceOptgroup.label = "Available Races";
    raceOptions.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.text;
        raceOptgroup.appendChild(option);
    });
    dom.charRaceInput.appendChild(raceOptgroup);

    // --- Class and Background Dropdowns ---
    // Clear existing options to prevent duplication if function is called more than once
    dom.charClassInput.innerHTML = '<option value="" disabled selected>Select a Class...</option>';
    dom.charBackgroundInput.innerHTML = '<option value="" disabled selected>Select a Background...</option>';
    
    classes.forEach(c => {
        const option = document.createElement('option');
        option.value = c.name;
        option.textContent = c.name;
        dom.charClassInput.appendChild(option);
    });

    backgrounds.forEach(b => {
        const option = document.createElement('option');
        option.value = b.name;
        option.textContent = b.name;
        dom.charBackgroundInput.appendChild(option);
    });
}

export function createRegenerateButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'regenerate-btn action-btn';
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0-8 3.58-8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg> Regenerate`;
    return button;
}

/**
 * Renders a list of action choices as interactive buttons for the player.
 * @param choices An array of parsed tag objects from the AI's response.
 */
export function displayActionChoices(choices: any[]) {
    console.log("UI: Rendering action choices:", choices); // For debugging
    
    const container = document.createElement('div');
    container.className = 'roll-request-container';

    choices.forEach(choice => {
        const button = document.createElement('button');
        button.className = 'action-choice-btn';
        
        button.dataset.actionType = choice.type;
        if (choice.type === 'attack') {
            button.textContent = `Attack: ${choice.targetDescription} with ${choice.weaponName}`;
            button.dataset.weaponName = choice.weaponName;
            button.dataset.targetDescription = choice.targetDescription;
        } else { // 'roll'
            button.textContent = `${choice.skillOrAbility}: ${choice.description}`;
            button.dataset.skillOrAbility = choice.skillOrAbility;
            button.dataset.description = choice.description;
        }
        
        if (choice.modifier && choice.modifier !== 'NONE') {
            button.textContent += ` (${choice.modifier})`;
            button.dataset.modifier = choice.modifier;
        }
        container.appendChild(button);
    });

    dom.chatLog.appendChild(container);
    scrollToBottom();
}


/**
 * Adds post-response action buttons (like Regenerate) after a DM message.
 * @param dmMessageElement The DM message element to add buttons after.
 */
export function addPostResponseButtons(dmMessageElement: HTMLElement) {
    // Only add buttons if the preceding message was from the user,
    // to avoid adding buttons after dice rolls etc. which have their own actions.
    const prevSibling = dmMessageElement.previousElementSibling;
    if (prevSibling && prevSibling.classList.contains('user-message')) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'action-btn-container';
        const regenerateButton = createRegenerateButton();
        buttonContainer.appendChild(regenerateButton);
        dmMessageElement.insertAdjacentElement('afterend', buttonContainer);
    }
}


/**
 * Displays a confirmation modal and returns a promise that resolves with the user's choice.
 * @param text The message to display in the modal.
 * @param title The title for the modal.
 * @returns A promise that resolves to true if confirmed, false otherwise.
 */
export function showConfirmModal(text: string, title: string = 'Confirm Action'): Promise<boolean> {
    return new Promise((resolve) => {
        dom.confirmModalTitle.textContent = title;
        dom.confirmModalText.textContent = text;
        dom.confirmModal.classList.remove('hidden');

        const handleYes = () => {
            dom.confirmModal.classList.add('hidden');
            cleanup();
            resolve(true);
        };

        const handleNo = () => {
            dom.confirmModal.classList.add('hidden');
            cleanup();
            resolve(false);
        };

        const cleanup = () => {
            dom.confirmModalYesBtn.removeEventListener('click', handleYes);
            dom.confirmModalNoBtn.removeEventListener('click', handleNo);
        };

        dom.confirmModalYesBtn.addEventListener('click', handleYes, { once: true });
        dom.confirmModalNoBtn.addEventListener('click', handleNo, { once: true });
    });
}

export function updateDebuggerUI(input: string | null, output: string | null) {
    if (dom.debugInput) {
        dom.debugInput.textContent = input || 'No input captured yet.';
    }
    if (dom.debugOutput) {
        dom.debugOutput.textContent = output || 'No response captured yet.';
    }
}