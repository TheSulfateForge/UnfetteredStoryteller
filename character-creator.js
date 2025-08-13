/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as dom from './dom.js';
import * as ui from './ui.js';
import * as dataManager from './data-manager.js';
import { getPointBuyCost, getClassFeaturesForLevel } from './rpg-helpers.js';
import { gameState } from './state-manager.js';
import * as game from './game.js';
import { startAdventure } from './game-loop.js';
import { initializeChatSession } from './session-manager.js';

// --- STATE & CONSTANTS ---

const STAT_ABBREVIATIONS = {
    strength: 'str',
    dexterity: 'dex',
    constitution: 'con',
    intelligence: 'int',
    wisdom: 'wis',
    charisma: 'cha',
};

export const POINT_BUY_TOTAL = 35;
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

    const fullCharacterDescription = `
        This is the user's primary input for their character. PRIORITIZE THIS TEXT over any conflicting information from the form fields below. If this text contains a full character sheet (stats, skills, level, items, etc.), use it directly to populate the JSON.

        --- USER'S FREE-TEXT DESCRIPTION ---
        Name: ${characterInfo.name}
        Appearance: ${characterInfo.desc}
        Backstory: ${characterInfo.bio}
        --- END OF FREE-TEXT DESCRIPTION ---

        The following are supplementary selections from UI dropdowns. Use these ONLY to fill in details that are MISSING from the free-text description above.
        Race Selection: ${characterInfo.race}
        Class Selection: ${characterInfo.characterClass}
        Background Selection: ${characterInfo.background}
        Alignment Selection: ${characterInfo.alignment}
        Gender Selection: ${characterInfo.gender}
        Ability Scores (from Point Buy): Str ${pointBuyState.scores.strength}, Dex ${pointBuyState.scores.dexterity}, Con ${pointBuyState.scores.constitution}, Int ${pointBuyState.scores.intelligence}, Wis ${pointBuyState.scores.wisdom}, Cha ${pointBuyState.scores.charisma}
    `;

    dom.characterCreationModal.classList.add('hidden');
    dom.storyHooksModal.classList.remove('hidden');
    dom.storyHooksContainer.innerHTML = `<div class="spinner-container"><div class="spinner"></div><span>The Storyteller is crafting your character and adventure... This may take a moment.</span></div>`;

    try {
        const { isMatureEnabled } = gameState.getState();
        const { playerState, storyHooks } = await llmProvider.createCharacterSheet(characterInfo, fullCharacterDescription, isMatureEnabled);

        // Supplement the AI-generated state with app-managed properties
        playerState.turnCount = 0;
        playerState.pregnancy = null;
        playerState.npcStates = {};

        // Ensure arrays exist, even if AI omits them
        playerState.feats = playerState.feats || [];
        playerState.racialTraits = playerState.racialTraits || [];
        playerState.classFeatures = playerState.classFeatures || [];
        
        // Add base traits from rules data to ensure they aren't missed by the AI.
        const baseRacialTraits = raceData.traits
            .map(t => t.name)
            .filter(n => !['Ability Score Increase', 'Age', 'Alignment', 'Size', 'Speed', 'Languages'].includes(n));
        playerState.racialTraits = [...new Set([...playerState.racialTraits, ...baseRacialTraits])];
        
        const baseClassFeatures = getClassFeaturesForLevel(classData, 1);
        backgroundData.benefits?.forEach(b => { if (b.type === 'feature') baseClassFeatures.push(b.name); });
        playerState.classFeatures = [...new Set([...playerState.classFeatures, ...baseClassFeatures])];

        gameState.updateState({ characterInfo, playerState });
        ui.updatePlayerStateUI(playerState, characterInfo);
        
        dom.characterForm.reset();
        resetPointBuy();

        const finalHooks = Array.isArray(storyHooks) ? storyHooks : ((storyHooks).storyHooks || []);
        ui.displayStoryHooks(finalHooks, startAdventure);

        const newCharacterId = Date.now().toString();
        gameState.updateState({ currentCharacterId: newCharacterId });
        const newSave = {
            id: newCharacterId,
            characterInfo,
            playerState,
            chatHistory: [],
            currentModelIndex: llmProvider.getCurrentModelIndex()
        };
        game.addNewSave(newSave);
        
        await initializeChatSession();

    } catch (error) {
        console.error("Failed to generate character sheet:", error);
        ui.addMessage('error', 'The storyteller had trouble creating your character. Please try again or simplify your description.');
        dom.storyHooksModal.classList.add('hidden');
        dom.characterCreationModal.classList.remove('hidden');
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