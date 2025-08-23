/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { dom } from './dom.js';
import * as config from './config.js';
import * as dataManager from './data-manager.js';
import { getAbilityModifierValue, LEVEL_XP_THRESHOLDS } from './rpg-helpers.js';
import * as characterCreator from './character-creator.js';
import { gameState } from './state-manager.js';
// --- UI HELPER FUNCTIONS ---
function updateCoreStats(playerState, characterInfo) {
    dom.statsCharName.textContent = characterInfo.name;
    dom.statsLocation.textContent = playerState.location;
    dom.statsHealth.textContent = `${playerState.health.current}/${playerState.health.max}`;
    dom.statsMoney.textContent = `${playerState.money.amount} ${playerState.money.currency}`;
    dom.statsExp.textContent = `${playerState.exp} XP`;
}
function updatePregnancyStatus(playerState, characterInfo) {
    let speedPenalty = 0;
    if (characterInfo.gender === 'female' && playerState.pregnancy?.isPregnant) {
        const daysPregnant = Math.floor((playerState.turnCount - playerState.pregnancy.conceptionTurn) / config.TURNS_PER_DAY);
        const weeksPregnant = Math.floor(daysPregnant / 7);
        const conditionValueEl = dom.statsPregnancyStatus.querySelector('#stats-pregnancy-value');
        if (weeksPregnant >= 14 || playerState.pregnancy.knowledgeRevealed) {
            dom.statsPregnancyStatus.classList.remove('hidden');
            if (weeksPregnant >= 28) {
                speedPenalty = 10;
                conditionValueEl.innerHTML = `Pregnant (${weeksPregnant} weeks)<br><span class="penalty">Disadvantage on Str/Dex checks</span>`;
            }
            else {
                conditionValueEl.textContent = `Pregnant (${weeksPregnant} weeks)`;
            }
        }
        else {
            dom.statsPregnancyStatus.classList.add('hidden');
        }
    }
    else {
        dom.statsPregnancyStatus.classList.add('hidden');
    }
    return { speedPenalty };
}
function updateEquipmentAndLists(playerState) {
    dom.equipWeapon.textContent = playerState.equipment.weapon || 'None';
    dom.equipArmor.textContent = playerState.equipment.armor || 'None';
    const createList = (items) => items.length > 0 ? items.map(item => `<li>${item}</li>`).join('') : '<li>(None)</li>';
    dom.statsInventory.innerHTML = createList(playerState.inventory);
    const partyItems = playerState.party.map(member => `<li><strong>${member.name}:</strong> ${member.description}</li>`);
    dom.statsParty.innerHTML = partyItems.length > 0 ? partyItems.join('') : '<li>(None)</li>';
    const questItems = playerState.quests.map(quest => `<li><strong>${quest.name}:</strong> ${quest.description}</li>`);
    dom.statsQuests.innerHTML = questItems.length > 0 ? questItems.join('') : '<li>(None)</li>';
}
function updateCharacterDetails(playerState, characterInfo, speedPenalty) {
    dom.statsLevel.textContent = String(playerState.level);
    dom.statsProficiencyBonus.textContent = `+${playerState.proficiencyBonus}`;
    dom.statsAC.textContent = String(playerState.armorClass);
    dom.statsSpeed.textContent = `${playerState.speed - speedPenalty} ft.`;
    dom.statsRace.textContent = characterInfo.race;
    dom.statsClass.textContent = characterInfo.characterClass;
    dom.statsBackground.textContent = characterInfo.background;
    dom.statsAlignment.textContent = characterInfo.alignment;
}
function updateAbilityScores(playerState) {
    const getAbilityModifierString = (score) => {
        const mod = getAbilityModifierValue(score);
        return mod >= 0 ? `+${mod}` : String(mod);
    };
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
function updateProficiencyLists(playerState) {
    const createList = (items) => items.length > 0 ? items.map(item => `<li>${item}</li>`).join('') : '<li>(None)</li>';
    const createProficiencyList = (proficiencies) => Object.entries(proficiencies)
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `<li class="${value === 'proficient' ? 'proficient' : 'not-proficient'}">${key.replace(/([A-Z])/g, ' $1')}</li>`).join('');
    dom.statsSkills.innerHTML = createProficiencyList(playerState.skills);
    dom.statsSavingThrows.innerHTML = createProficiencyList(playerState.savingThrows);
    dom.statsFeats.innerHTML = createList(playerState.feats);
    dom.statsRacialTraits.innerHTML = createList(playerState.racialTraits);
    dom.statsClassFeatures.innerHTML = createList(playerState.classFeatures);
}
// --- EXPORTED UI FUNCTIONS ---
export function addMessage(sender, content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    let messageHtml = '';
    if (sender === 'dice' && typeof content === 'object' && 'dieValue' in content) {
        const diceContent = content;
        messageElement.classList.add('dice-roll-message');
        const modifierSign = diceContent.modifier >= 0 ? '+' : '-';
        let breakdown = `Rolled ${diceContent.roll} (d${diceContent.dieValue}) ${modifierSign} ${Math.abs(diceContent.modifier)}`;
        if (diceContent.allRolls.length > 1) {
            breakdown = `Rolled ${diceContent.roll} from [${diceContent.allRolls.join(', ')}] (d${diceContent.dieValue}) ${modifierSign} ${Math.abs(diceContent.modifier)}`;
        }
        messageHtml = `<span class="dice-title">${diceContent.description}</span><span class="dice-result">${diceContent.total}</span><span class="dice-breakdown">${breakdown}</span>`;
        if (diceContent.rollModifier === 'ADVANTAGE') {
            messageHtml += `<span class="advantage-notice">Rolled with Advantage</span>`;
        }
        else if (diceContent.rollModifier === 'DISADVANTAGE') {
            messageHtml += `<span class="disadvantage-notice">Rolled with Disadvantage</span>`;
        }
        messageElement.dataset.skillOrAbility = diceContent.skillOrAbility;
        messageElement.dataset.description = diceContent.description;
        if (diceContent.rollModifier && diceContent.rollModifier !== 'NONE') {
            messageElement.dataset.modifier = diceContent.rollModifier;
        }
    }
    else if (sender === 'attack' && typeof content === 'object' && 'totalAttackRoll' in content) {
        const attackContent = content;
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
        }
        else if (attackContent.rollModifier === 'DISADVANTAGE') {
            messageHtml += `<span class="disadvantage-notice">Rolled with Disadvantage</span>`;
        }
    }
    else {
        messageElement.classList.add(`${sender}-message`);
        const textContent = (typeof content === 'string') ? content : '';
        messageHtml = textContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
    }
    messageElement.innerHTML = messageHtml;
    dom.chatLog.appendChild(messageElement);
    scrollToBottom();
    return messageElement;
}
export function addEventMessage(type, details) {
    const messageElement = document.createElement('div');
    messageElement.className = `message event-message ${type}`;
    let iconSvg = '';
    switch (type) {
        case 'item':
            // Icon: Backpack/Bag
            iconSvg = `<svg class="event-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 6h-3V4c0-1.11-.89-2-2-2h-6c-1.11 0-2 .89-2 2v2H4c-1.11 0-2 .89-2 2v11c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zM10 4h4v2h-4V4zm10 15H4V8h16v11z"/></svg>`;
            break;
        case 'xp':
            // Icon: Star/Sparkle
            iconSvg = `<svg class="event-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2L9.19 8.63L2 9.24l5.46 4.73L5.82 21L12 17.27z"/></svg>`;
            break;
        case 'money':
            // Icon: Coin stack
            iconSvg = `<svg class="event-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M15 15H9v-2H7v2H5v2h2v2h2v-2h2v2h2v-2h2v-2h-2v-2zm0-4.5c0-1.38-1.12-2.5-2.5-2.5S10 9.12 10 10.5H8.5c0-2.21 1.79-4 4-4s4 1.79 4 4v.5h-2V10.5zm-5 0c0-1.38-1.12-2.5-2.5-2.5S5 9.12 5 10.5H3.5c0-2.21 1.79-4 4-4s4 1.79 4 4v.5h-2V10.5z"/></svg>`;
            break;
    }
    messageElement.innerHTML = `${iconSvg}<span>${details}</span>`;
    dom.chatLog.appendChild(messageElement);
    scrollToBottom();
}
export function setLoading(isLoading, showSpinner = isLoading) {
    dom.loadingIndicator.classList.toggle('hidden', !showSpinner);
    dom.chatInput.disabled = isLoading;
    dom.chatForm.querySelector('button[type="submit"]').disabled = isLoading;
    dom.micBtn.disabled = isLoading;
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.disabled = isLoading;
    });
}
export function scrollToBottom() {
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}
export function updatePlayerStateUI(playerState, characterInfo) {
    if (!playerState || !characterInfo || !playerState.health)
        return;
    updateCoreStats(playerState, characterInfo);
    const { speedPenalty } = updatePregnancyStatus(playerState, characterInfo);
    updateEquipmentAndLists(playerState);
    updateCharacterDetails(playerState, characterInfo, speedPenalty);
    updateAbilityScores(playerState);
    updateProficiencyLists(playerState);
    // Update spells
    if (playerState.spellsKnown && playerState.spellsKnown.length > 0) {
        dom.statsSpellsKnown.innerHTML = [...playerState.spellsKnown].sort().map(spell => `<li>${spell}</li>`).join('');
    }
    else {
        dom.statsSpellsKnown.innerHTML = '<li>(None)</li>';
    }
    // Check for level up
    if (playerState.level < 20) {
        const currentLevel = playerState.level;
        const currentXp = playerState.exp;
        let highestAttainableLevel = currentLevel;
        // Find the highest level the character can be with their current XP.
        for (let level = currentLevel + 1; level <= 20; level++) {
            const xpNeeded = LEVEL_XP_THRESHOLDS[level - 1];
            if (xpNeeded !== undefined && currentXp >= xpNeeded) {
                highestAttainableLevel = level;
            }
            else {
                break; // Stop when they don't have enough XP for the next level
            }
        }
        const levelsToGain = highestAttainableLevel - currentLevel;
        const canLevelUp = levelsToGain > 0;
        dom.levelUpBtn.classList.toggle('hidden', !canLevelUp);
        if (canLevelUp) {
            if (levelsToGain > 1) {
                dom.levelUpBtn.textContent = `Level Up! (${levelsToGain} levels)`;
            }
            else {
                dom.levelUpBtn.textContent = 'Level Up!';
            }
        }
    }
    else {
        dom.levelUpBtn.classList.add('hidden');
    }
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
    dom.statsSpellsKnown.innerHTML = '<li>(None)</li>';
    dom.levelUpBtn.classList.add('hidden');
}
export function displayStoryHooks(hooks, startAdventureCallback) {
    dom.storyHooksContainer.innerHTML = '';
    if (!hooks || hooks.length === 0) {
        dom.storyHooksContainer.innerHTML = `<p class="error-message">The Storyteller had trouble coming up with ideas. Please try writing your own, or <a href="#" onclick="location.reload()">restarting</a>.</p>`;
        return;
    }
    hooks.forEach((hook) => {
        const card = document.createElement('div');
        card.className = 'story-hook-card';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.innerHTML = `<h4>${hook.title}</h4><p>${hook.description}</p>`;
        card.addEventListener('click', () => startAdventureCallback(hook.description));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ')
                startAdventureCallback(hook.description);
        });
        dom.storyHooksContainer.appendChild(card);
    });
}
export function displaySaveSlots(allSaves) {
    dom.saveSlotsList.innerHTML = ''; // Clear previous list
    if (allSaves.length === 0) {
        dom.saveSlotsList.innerHTML = '<p class="no-saves">No adventures saved yet. Time to start one!</p>';
    }
    else {
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
    characterCreator.resetPointBuy();
    characterCreator.setupInitialPage();
    dom.charNameInput.focus();
}
export function showSettings(settings) {
    dom.providerSelector.value = settings.provider;
    dom.apiKeyInput.value = settings.apiKey || '';
    dom.localLlmUrlInput.value = settings.localUrl || '';
    const isLocal = settings.provider === 'local';
    dom.geminiSettingsSection.classList.toggle('hidden', isLocal);
    dom.localLlmSettingsSection.classList.toggle('hidden', !isLocal);
    dom.settingsModal.classList.remove('hidden');
    if (dom.apiKeyInput.offsetParent !== null) { // Check if it's visible
        dom.apiKeyInput.focus();
    }
}
export function updateRagStatus(status, message) {
    if (!dom.ragStatus || !dom.buildRagBtn)
        return;
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
    const raceUrlMap = new Map();
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
export function createRegenerateButton() {
    const button = document.createElement('button');
    button.className = 'regenerate-btn action-btn';
    button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 0 24 24" width="18px" fill="currentColor"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 6v3l4-4-4-4v3c-4.42 0-8 3.58-8 8 0 1.57.46 3.03 1.24 4.26L6.7 14.8c-.45-.83-.7-1.79-.7-2.8 0-3.31 2.69-6 6-6zm6.76 1.74L17.3 9.2c.44.84.7 1.79.7 2.8 0 3.31-2.69 6-6 6v-3l-4 4 4 4v-3c4.42 0-8 3.58-8-8 0-1.57-.46-3.03-1.24-4.26z"/></svg> Regenerate`;
    return button;
}
/**
 * Renders a list of action choices as interactive buttons for the player.
 * @param {any[]} choices An array of parsed tag objects from the AI's response.
 */
export function displayActionChoices(choices) {
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
        }
        else { // 'roll'
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
 * @param {HTMLElement} dmMessageElement The DM message element to add buttons after.
 */
export function addPostResponseButtons(dmMessageElement) {
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
 * @param {string} text The message to display in the modal.
 * @param {string} title The title for the modal.
 * @returns {Promise<boolean>} A promise that resolves to true if confirmed, false otherwise.
 */
export function showConfirmModal(text, title = 'Confirm Action') {
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
export function updateDebuggerUI(input, output) {
    if (dom.debugInput) {
        dom.debugInput.textContent = input || 'No input captured yet.';
    }
    if (dom.debugOutput) {
        dom.debugOutput.textContent = output || 'No response captured yet.';
    }
}
export function showCharacterSheetModal() {
    const { playerState, characterInfo } = gameState.getState();
    if (!playerState || !characterInfo) {
        console.error('Cannot show character sheet: no character loaded.');
        return;
    }
    dom.csCharName.textContent = characterInfo.name;
    const list = dom.characterSheetList;
    list.innerHTML = ''; // Clear previous list
    let listHtml = '';
    // Stats, Skills, Saves (Not clickable items, but a static view)
    listHtml += `
        <h4>Stats & Skills</h4>
        <ul class="cs-static-section">
            <li>Level: <span>${playerState.level}</span></li>
            <li>AC: <span>${playerState.armorClass}</span></li>
            <li>Speed: <span>${playerState.speed} ft.</span></li>
            <li>Prof. Bonus: <span>+${playerState.proficiencyBonus}</span></li>
        </ul>
        <div class="cs-list-pane-grid">
            ${Object.entries(playerState.abilityScores).map(([ability, score]) => `
                <div class="cs-ability-score-small">
                    <span class="cs-ability-name">${ability.substring(0, 3).toUpperCase()}</span>
                    <span class="cs-ability-value">${score} (${getAbilityModifierValue(score) >= 0 ? '+' : ''}${getAbilityModifierValue(score)})</span>
                </div>
            `).join('')}
        </div>
        <h4>Saving Throws</h4>
        <ul class="stat-grid">
            ${Object.entries(playerState.savingThrows).map(([save, prof]) => `<li class="${prof}">${save.charAt(0).toUpperCase() + save.slice(1)}</li>`).join('')}
        </ul>
        <h4>Skills</h4>
        <ul class="stat-grid">
            ${Object.entries(playerState.skills).map(([skill, prof]) => `<li class="${prof}">${skill.replace(/([A-Z])/g, ' $1')}</li>`).join('')}
        </ul>
    `;
    const renderClickableList = (title, items, dataType) => {
        if (!items || items.length === 0)
            return '';
        return `<h4>${title}</h4><ul>${items.map(item => `<li class="cs-list-item" data-type="${dataType}" data-name="${item}">${item}</li>`).join('')}</ul>`;
    };
    const allEquipment = [...new Set([playerState.equipment.weapon, playerState.equipment.armor, ...playerState.inventory])].filter(i => i && i.toLowerCase() !== 'none' && i.toLowerCase() !== '(empty)');
    listHtml += renderClickableList('Racial Traits', playerState.racialTraits, 'trait');
    listHtml += renderClickableList('Class Features', playerState.classFeatures, 'feature');
    listHtml += renderClickableList('Feats', playerState.feats, 'feat');
    listHtml += renderClickableList('Equipment & Inventory', allEquipment, 'equipment');
    listHtml += renderClickableList('Spells Known', playerState.spellsKnown, 'spell');
    list.innerHTML = listHtml;
    dom.characterSheetModal.classList.remove('hidden');
    dom.characterSheetDetails.innerHTML = '<p class="placeholder-text">Select an item to see its details.</p>';
}
export function displayCharacterSheetDetail(itemElement) {
    const { playerState, characterInfo } = gameState.getState();
    if (!playerState || !characterInfo)
        return;
    const type = itemElement.dataset.type;
    const name = itemElement.dataset.name;
    if (!type || !name)
        return;
    // Update active state in the list
    dom.characterSheetList.querySelectorAll('.cs-list-item.active').forEach(item => item.classList.remove('active'));
    itemElement.classList.add('active');
    const detailsContainer = dom.characterSheetDetails;
    let html = '';
    let itemData = null;
    switch (type) {
        case 'trait':
            const race = dataManager.getRace(characterInfo.race);
            itemData = race?.traits.find(t => t.name === name);
            break;
        case 'feature':
            const charClass = dataManager.getClass(characterInfo.characterClass);
            const background = dataManager.getBackground(characterInfo.background);
            itemData = charClass?.features?.find(f => f.name === name) ||
                charClass?.archetypes?.flatMap(a => a.features || []).find(f => f.name === name) ||
                background?.benefits?.find(b => b.name === name);
            break;
        case 'feat':
            itemData = dataManager.getFeats().find(f => f.name === name);
            break;
        case 'spell':
            const spellSlug = name.toLowerCase().replace(/[\s/]+/g, '-');
            itemData = dataManager.getSpell(spellSlug);
            break;
        case 'equipment':
            const weapons = dataManager.getWeapons();
            const armors = dataManager.getArmor();
            const normalizedName = name.toLowerCase();
            // Find the best match by checking which key is a substring of the item name
            const weaponKey = Object.keys(weapons).find(k => normalizedName.includes(k));
            const armorKey = Object.keys(armors).find(k => normalizedName.includes(k));
            if (weaponKey)
                itemData = weapons[weaponKey];
            else if (armorKey)
                itemData = armors[armorKey];
            if (!itemData)
                itemData = { name: name, desc: 'No detailed information available for this item.' };
            break;
    }
    if (itemData) {
        html = `<h3>${itemData.name}</h3>`;
        // Use 'desc' for most items, 'description' for spells
        const description = itemData.desc || itemData.description || '';
        html += `<p>${description.replace(/\r\n/g, '<br>').replace(/\n/g, '<br>')}</p>`;
        if (itemData.prerequisite)
            html += `<p><strong>Prerequisite:</strong> ${itemData.prerequisite}</p>`;
        if (type === 'spell') {
            html += `<ul>
                <li><strong>Level:</strong> ${itemData.level === 0 ? 'Cantrip' : itemData.level} ${itemData.school}</li>
                <li><strong>Casting Time:</strong> ${itemData.casting_time}</li>
                <li><strong>Range:</strong> ${itemData.range}</li>
                <li><strong>Components:</strong> ${itemData.components}</li>
                <li><strong>Duration:</strong> ${itemData.duration}</li>
            </ul>`;
        }
        if (type === 'equipment' && itemData.damage_dice) { // Weapon
            html += `<ul>
                <li><strong>Damage:</strong> ${itemData.damage_dice} ${itemData.damage_type?.name || 'damage'}</li>
                <li><strong>Properties:</strong> ${itemData.properties?.join(', ') || 'None'}</li>
            </ul>`;
        }
        if (type === 'equipment' && itemData.ac_display) { // Armor
            html += `<ul>
                <li><strong>Armor Class:</strong> ${itemData.ac_display}</li>
                <li><strong>Category:</strong> ${itemData.category}</li>
            </ul>`;
        }
    }
    else {
        html = `<h3>${name}</h3><p>No detailed information found.</p>`;
    }
    detailsContainer.innerHTML = html;
}
export function updateCombatTrackerUI(combatants, isInCombat) {
    if (!dom.combatTracker)
        return;
    if (!isInCombat || !combatants || combatants.length === 0) {
        dom.combatTracker.classList.add('hidden');
        dom.combatTracker.innerHTML = '';
        return;
    }
    dom.combatTracker.classList.remove('hidden');
    let html = '<h4>Combat Order</h4>';
    combatants.forEach(c => {
        const typeClass = c.isPlayer ? 'player' : 'enemy';
        const defeatedClass = c.hp === 0 ? 'defeated' : '';
        html += `
            <div class="combatant-entry ${typeClass} ${defeatedClass}">
                <span class="combatant-name">${c.name} (Init: ${c.initiative})</span>
                <span class="combatant-hp">HP: ${c.hp}/${c.maxHp}</span>
            </div>
        `;
    });
    dom.combatTracker.innerHTML = html;
}
