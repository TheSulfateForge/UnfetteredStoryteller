/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as dom from './dom.js';
import * as ui from './ui.js';
import * as dataManager from './data-manager.js';
import { generateBaseRpgPlayerState, getPointBuyCost, getStartingEquipment, getEquipmentFromBackground, getAbilityModifierValue, calculateArmorClass, getClassFeaturesForLevel } from './rpg-helpers.js';
import { gameState } from './state-manager.js';
import * as game from './game.js';
import { startAdventure } from './game-loop.js';
import { initializeChatSession } from './session-manager.js';
import { toCamelCase } from './utils.js';

// --- STATE & CONSTANTS ---

const STAT_ABBREVIATIONS = {
    strength: 'str',
    dexterity: 'dex',
    constitution: 'con',
    intelligence: 'int',
    wisdom: 'wis',
    charisma: 'cha',
};

export const POINT_BUY_TOTAL = 40;
let pointBuyState = {
    pointsRemaining: POINT_BUY_TOTAL,
    scores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 10,
    }
};

// --- CORE FUNCTIONS ---

/**
 * Redraws the entire skill selection UI based on current dropdown selections.
 */
export function updateSkillSelectionUI() {
    const container = document.getElementById('skill-selection-container');
    if (!container) return;
    container.innerHTML = ''; // Clear for redraw

    const selectedRaceName = dom.charRaceInput.value;
    const selectedClassName = dom.charClassInput.value;
    const selectedBackgroundName = dom.charBackgroundInput.value;

    const grantedSkills = new Set();
    const allSkillChoices = [];

    const sources = [
        { name: selectedRaceName, data: dataManager.getRace(selectedRaceName) },
        { name: selectedBackgroundName, data: dataManager.getBackground(selectedBackgroundName) },
        { name: selectedClassName, data: dataManager.getClass(selectedClassName) }
    ];

    sources.forEach((source, sourceIndex) => {
        source.data?.skill_proficiencies?.forEach((prof) => {
            if (prof.type === 'granted') {
                prof.from.forEach((skillName) => grantedSkills.add(skillName));
            } else if (prof.type === 'choice') {
                allSkillChoices.push({
                    source: source.data.name,
                    choose: prof.choose,
                    from: prof.from,
                    groupName: `skill-choice-group-${sourceIndex}`
                });
            }
        });
    });

    if (grantedSkills.size > 0) {
        let grantedHtml = `<div class="skill-choice-block"><h5>Skills Granted Automatically</h5><div class="skill-choice-grid">`;
        grantedSkills.forEach(skillName => {
            grantedHtml += `<div class="skill-checkbox"><input type="checkbox" id="skill-granted-${skillName}" value="${skillName}" checked disabled><label for="skill-granted-${skillName}">${skillName}</label></div>`;
        });
        grantedHtml += `</div></div>`;
        container.innerHTML += grantedHtml;
    }

    allSkillChoices.forEach((choice) => {
        let choiceHtml = `<div class="skill-choice-block"><h5>${choice.source} Skills (Choose ${choice.choose})</h5><div class="skill-choice-grid">`;
        choice.from.forEach(skillName => {
            choiceHtml += `
                <div class="skill-checkbox">
                    <input type="checkbox" id="${choice.groupName}-${skillName}" name="${choice.groupName}" value="${skillName}">
                    <label for="${choice.groupName}-${skillName}">${skillName}</label>
                </div>
            `;
        });
        choiceHtml += `</div></div>`;
        container.innerHTML += choiceHtml;
    });
    
    updateCheckboxStates();
}

/**
 * Manages the enabled/disabled state of skill checkboxes based on rules.
 */
export function updateCheckboxStates() {
    const container = document.getElementById('skill-selection-container');
    if (!container) return;

    const selectedRaceName = dom.charRaceInput.value;
    const selectedClassName = dom.charClassInput.value;
    const selectedBackgroundName = dom.charBackgroundInput.value;

    const grantedSkills = new Set();
    const allSkillChoices = [];

    const sources = [
        { name: selectedRaceName, data: dataManager.getRace(selectedRaceName) },
        { name: selectedBackgroundName, data: dataManager.getBackground(selectedBackgroundName) },
        { name: selectedClassName, data: dataManager.getClass(selectedClassName) }
    ];

    sources.forEach((source, sourceIndex) => {
        if (!source.data) return;
        source.data.skill_proficiencies?.forEach((prof) => {
            if (prof.type === 'granted') {
                prof.from.forEach((skillName) => grantedSkills.add(skillName));
            } else if (prof.type === 'choice') {
                allSkillChoices.push({ source: source.data.name, choose: prof.choose, from: prof.from, groupName: `skill-choice-group-${sourceIndex}` });
            }
        });
    });

    const allProficientSkills = new Set(grantedSkills);
    container.querySelectorAll('input[type="checkbox"][id^="skill-choice-"]:checked').forEach(cb => {
        allProficientSkills.add(cb.value);
    });

    const allChoiceCheckboxes = Array.from(container.querySelectorAll('input[type="checkbox"][id^="skill-choice-"]'));
    
    allChoiceCheckboxes.forEach(cb => { cb.disabled = false; });

    allSkillChoices.forEach((choice) => {
        const groupCheckboxes = allChoiceCheckboxes.filter(cb => cb.name === choice.groupName);
        const checkedCountInGroup = groupCheckboxes.filter(cb => cb.checked).length;

        if (checkedCountInGroup >= choice.choose) {
            groupCheckboxes.forEach(cb => { if (!cb.checked) cb.disabled = true; });
        }
    });

    allChoiceCheckboxes.forEach(cb => {
        if (!cb.checked && allProficientSkills.has(cb.value)) cb.disabled = true;
    });
}

/** Resets the point-buy system to its default state. */
export function resetPointBuy() {
    pointBuyState = {
        pointsRemaining: POINT_BUY_TOTAL,
        scores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }
    };
    let totalCost = 0;
    for (const score of Object.values(pointBuyState.scores)) {
        totalCost += getPointBuyCost(score);
    }
    pointBuyState.pointsRemaining = POINT_BUY_TOTAL - totalCost;
    updatePointBuyUI();
}

/** Updates the entire point-buy UI based on the current state. */
export function updatePointBuyUI() {
    dom.pointsRemaining.textContent = String(pointBuyState.pointsRemaining);
    for (const [stat, score] of Object.entries(pointBuyState.scores)) {
        const statAbbr = STAT_ABBREVIATIONS[stat];
        document.getElementById(`${stat}-score`).textContent = String(score);
        document.getElementById(`${stat}-cost`).textContent = String(getPointBuyCost(score));
        document.getElementById(`${statAbbr}-decrease`).disabled = (score <= 8);
        document.getElementById(`${statAbbr}-increase`).disabled = (score >= 20);
    }
}

/** Handles increasing or decreasing an ability score. */
export function updateAbilityScore(stat, direction) {
    const currentScore = pointBuyState.scores[stat];
    const newScore = direction === 'increase' ? currentScore + 1 : currentScore - 1;

    if (newScore < 8 || newScore > 20) return;

    const currentCost = getPointBuyCost(currentScore);
    const newCost = getPointBuyCost(newScore);
    const costChange = newCost - currentCost;

    if (direction === 'increase' && pointBuyState.pointsRemaining < costChange) return;

    pointBuyState.scores[stat] = newScore;
    pointBuyState.pointsRemaining -= costChange;
    updatePointBuyUI();
}

/** Handles the final submission of the character creation form. */
export async function handleCharacterCreationSubmit(event) {
    event.preventDefault();
    const { isGenerating, llmProvider } = gameState.getState();
    if (isGenerating || !llmProvider) return;

    const characterInfo = {
        name: dom.charNameInput.value.trim(),
        desc: dom.charDescInput.value.trim(),
        bio: dom.charBioInput.value.trim(),
        race: dom.charRaceInput.value,
        characterClass: dom.charClassInput.value,
        background: dom.charBackgroundInput.value,
        alignment: dom.charAlignmentInput.value.trim(),
        gender: dom.charGenderInput.value
    };

    if (!characterInfo.name || !characterInfo.race || !characterInfo.characterClass || !characterInfo.background || !characterInfo.alignment || !characterInfo.gender) {
        alert("Please fill in all required character details.");
        return;
    }

    const classData = dataManager.getClass(characterInfo.characterClass);
    const raceData = dataManager.getRace(characterInfo.race);
    const backgroundData = dataManager.getBackground(characterInfo.background);

    if (!classData || !raceData || !backgroundData) {
        alert("Error: Could not find rules data for selected options.");
        return;
    }

    const finalState = generateBaseRpgPlayerState(characterInfo);

    // Apply point-buy scores and racial bonuses
    for (const key in finalState.abilityScores) {
        const baseScore = pointBuyState.scores[key];
        finalState.abilityScores[key] = baseScore + (raceData.ability_bonuses?.[key] || 0);
    }

    // Calculate final stats based on rules
    finalState.health.max = (classData.hit_die || 8) + getAbilityModifierValue(finalState.abilityScores.constitution);
    finalState.health.current = finalState.health.max;
    
    const classEquipment = getStartingEquipment(characterInfo.characterClass);
    const backgroundEquipment = getEquipmentFromBackground(backgroundData);
    finalState.equipment = classEquipment.equipment;
    finalState.inventory = [...new Set([...classEquipment.inventory, ...backgroundEquipment])];

    finalState.armorClass = calculateArmorClass(finalState);
    
    (classData.prof_saving_throws || "").toLowerCase().split(', ').forEach(save => {
        if (save in finalState.savingThrows) finalState.savingThrows[save] = 'proficient';
    });

    finalState.racialTraits = raceData.traits.map(t => t.name).filter(n => !['Ability Score Increase', 'Age', 'Alignment', 'Size', 'Speed', 'Languages'].includes(n));
    finalState.classFeatures = getClassFeaturesForLevel(classData, 1);
    backgroundData.benefits?.forEach(b => { if (b.type === 'feature') finalState.classFeatures.push(b.name); });
    
    document.querySelectorAll('#skill-selection-container input[type="checkbox"]:checked').forEach(checkbox => {
        const skillKey = toCamelCase(checkbox.value);
        if (skillKey in finalState.skills) finalState.skills[skillKey] = 'proficient';
    });

    gameState.updateState({ characterInfo, playerState: finalState });
    ui.updatePlayerStateUI(finalState, characterInfo);
    dom.characterCreationModal.classList.add('hidden');
    dom.characterForm.reset();
    resetPointBuy();

    // Call AI for creative story hooks
    dom.storyHooksModal.classList.remove('hidden');
    dom.storyHooksContainer.innerHTML = `<div class="spinner-container"><div class="spinner"></div><span>Generating creative story ideas...</span></div>`;

    try {
        const { isMatureEnabled } = gameState.getState();
        const result = await llmProvider.createStoryHooks(characterInfo, finalState, isMatureEnabled);
        // Defensively handle cases where the model wraps the array in an object.
        const storyHooks = Array.isArray(result) ? result : (result.storyHooks || []);
        ui.displayStoryHooks(storyHooks, startAdventure);
        
        const newCharacterId = Date.now().toString();
        gameState.updateState({ currentCharacterId: newCharacterId });
        const newSave = {
            id: newCharacterId, 
            characterInfo, 
            playerState: finalState,
            chatHistory: [], 
            currentModelIndex: 0 
        };
        game.addNewSave(newSave);
        await initializeChatSession();
    } catch (error) {
        console.error("Failed to generate story hooks:", error);
        ui.addMessage('error', 'The storyteller had trouble coming up with story ideas. You can write your own below to start!');
        ui.displayStoryHooks([], startAdventure);
    }
}

/** Handles the submission of a custom story hook. */
export function handleCustomHookSubmit(event) {
    event.preventDefault();
    const customHook = dom.customHookInput.value.trim();
    if (customHook) {
        startAdventure(customHook);
    }
}
