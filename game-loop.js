/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { calculateRollModifier, getAbilityModifierValue, getWeaponData, rollDice } from './rpg-helpers.js';
import * as config from './config.js';
import { dom } from './dom.js';
import * as ui from './ui.js';
import { cleanseResponseText } from './api.js';
import * as rag from './rag.js';
import { gameState, deepMerge } from './state-manager.js';
import { saveCurrentGame, initializeChatSession } from './session-manager.js';
import { promiseWithTimeout } from './utils.js';
import * as game from './game.js';
import * as dataManager from './data-manager.js';
/**
 * Intelligently finds and parses a JSON payload from within a GAME_ACTION tag.
 * This is more robust than a simple regex, as it balances brackets to handle
 * JSON arrays or objects in the payload.
 * @param {string} text The raw text captured by the regex.
 * @returns {any} The parsed JSON object or null if parsing fails.
 */
function parseGameActionPayload(text) {
    let jsonString = text.trim();
    const firstBrace = jsonString.indexOf('{');
    const firstBracket = jsonString.indexOf('[');
    let startIndex = -1;
    let openChar = '';
    let closeChar = '';
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIndex = firstBrace;
        openChar = '{';
        closeChar = '}';
    }
    else if (firstBracket !== -1) {
        startIndex = firstBracket;
        openChar = '[';
        closeChar = ']';
    }
    else {
        return null; // No JSON found
    }
    let balance = 0;
    let inString = false;
    for (let i = startIndex; i < jsonString.length; i++) {
        const char = jsonString[i];
        if (inString) {
            if (char === '\\') {
                i++; // Skip the escaped character
            }
            else if (char === '"') {
                inString = false;
            }
        }
        else {
            if (char === '"') {
                inString = true;
            }
            else if (char === openChar) {
                balance++;
            }
            else if (char === closeChar) {
                balance--;
            }
        }
        if (balance === 0) {
            const potentialJson = jsonString.substring(startIndex, i + 1);
            try {
                return JSON.parse(potentialJson);
            }
            catch (e) {
                console.error("Final JSON parsing failed despite balanced brackets:", e);
                return null;
            }
        }
    }
    return null; // Unbalanced JSON
}
// --- NEW: GAME ACTION PROCESSOR ---
async function processGameActions(matches) {
    const { playerState, characterInfo, combatants, isInCombat, worldState } = gameState.getState();
    if (!playerState || !characterInfo)
        return false;
    let stateUpdate = {
        playerState: JSON.parse(JSON.stringify(playerState)), // Deep copy
        combatants: JSON.parse(JSON.stringify(combatants)),
        isInCombat,
        worldState: JSON.parse(JSON.stringify(worldState)),
    };
    let stateWasUpdated = false;
    for (const match of matches) {
        try {
            const type = match[1];
            const payload = parseGameActionPayload(match[2]);
            if (!payload) {
                console.error("Failed to parse valid JSON payload from action:", match[0]);
                continue; // Skip this malformed action
            }
            switch (type) {
                case 'START_COMBAT':
                    stateUpdate.isInCombat = true;
                    const playerInitiative = rollDice('d20').total + getAbilityModifierValue(playerState.abilityScores.dexterity);
                    const allCombatants = [{ id: 'player', name: characterInfo.name, hp: playerState.health.current, maxHp: playerState.health.max, initiative: playerInitiative, isPlayer: true }];
                    payload.forEach((enemy, index) => {
                        allCombatants.push({
                            id: `${enemy.name.toLowerCase().replace(/\s/g, '-')}-${index}`,
                            name: enemy.name,
                            hp: enemy.hp,
                            maxHp: enemy.hp,
                            initiative: rollDice('d20').total,
                            isPlayer: false,
                            xpValue: enemy.xpValue || 0
                        });
                    });
                    stateUpdate.combatants = allCombatants.sort((a, b) => b.initiative - a.initiative);
                    ui.addMessage('dm', `<em>Combat has begun! Initiative order: ${stateUpdate.combatants.map(c => c.name).join(', ')}.</em>`);
                    stateWasUpdated = true;
                    break;
                case 'NPC_ATTACK_INTENT':
                    await handleNpcAttackIntent(payload);
                    break;
                case 'NPC_SKILL_INTENT':
                    await handleNpcSkillIntent(payload);
                    break;
                case 'ENEMY_DEFEATED':
                    const defeatedNpc = stateUpdate.combatants.find(c => c.name === payload.name && c.hp > 0);
                    if (defeatedNpc) {
                        defeatedNpc.hp = 0;
                        if (defeatedNpc.xpValue) {
                            stateUpdate.playerState.exp = (stateUpdate.playerState.exp || 0) + defeatedNpc.xpValue;
                            ui.addEventMessage('xp', `Gained ${defeatedNpc.xpValue} XP for defeating ${defeatedNpc.name}.`);
                        }
                        stateWasUpdated = true;
                    }
                    const allEnemiesDefeated = stateUpdate.combatants.every(c => c.isPlayer || c.hp === 0);
                    if (allEnemiesDefeated && stateUpdate.isInCombat) {
                        stateUpdate.isInCombat = false;
                        stateUpdate.combatants = [];
                        ui.addMessage('dm', '<em>Combat has ended.</em>');
                    }
                    break;
                case 'GAIN_REWARD':
                    if (payload.xp) {
                        stateUpdate.playerState.exp = (stateUpdate.playerState.exp || 0) + payload.xp;
                        ui.addEventMessage('xp', `You gained ${payload.xp} XP.`);
                    }
                    if (payload.money) {
                        stateUpdate.playerState.money.amount = (stateUpdate.playerState.money.amount || 0) + payload.money;
                        const action = payload.money > 0 ? 'found' : 'lost';
                        ui.addEventMessage('money', `You ${action} ${Math.abs(payload.money)} ${playerState.money.currency}.`);
                    }
                    stateWasUpdated = true;
                    break;
                case 'UPDATE_WORLD_STATE':
                    stateUpdate.worldState = deepMerge(stateUpdate.worldState, payload);
                    stateWasUpdated = true;
                    break;
                case 'UPDATE_NPC_STATE':
                    const npcName = payload.name;
                    if (npcName) {
                        stateUpdate.worldState[npcName] = deepMerge(stateUpdate.worldState[npcName] || {}, payload);
                        stateWasUpdated = true;
                    }
                    break;
                case 'APPLY_CONDITION':
                    if (!stateUpdate.playerState.conditions)
                        stateUpdate.playerState.conditions = [];
                    // Remove existing condition with same name before adding new one
                    stateUpdate.playerState.conditions = stateUpdate.playerState.conditions.filter(c => c.name !== payload.name);
                    stateUpdate.playerState.conditions.push(payload);
                    stateWasUpdated = true;
                    break;
                case 'REMOVE_CONDITION':
                    if (stateUpdate.playerState.conditions) {
                        stateUpdate.playerState.conditions = stateUpdate.playerState.conditions.filter(c => c.name !== payload.name);
                        stateWasUpdated = true;
                    }
                    break;
            }
        }
        catch (e) {
            console.error("Failed to process game action:", match[0], e);
        }
    }
    if (stateWasUpdated) {
        gameState.updateState(stateUpdate);
    }
    return stateWasUpdated;
}
/**
 * Determines the correct unarmed strike damage die based on class and level.
 * @param {import('./types.js').PlayerState} playerState The player's current state.
 * @param {import('./types.js').CharacterInfo} characterInfo The character's static info.
 * @returns {string} The dice notation for the unarmed strike (e.g., '1d6' or '1').
 */
function getUnarmedStrikeDice(playerState, characterInfo) {
    if (characterInfo.characterClass.toLowerCase() === 'monk') {
        if (playerState.level < 5)
            return '1d4';
        if (playerState.level < 11)
            return '1d6';
        if (playerState.level < 17)
            return '1d8';
        return '1d10';
    }
    // Add other checks here for feats like Tavern Brawler if implemented
    return '1'; // Default unarmed strike damage
}
// --- CORE GAME LOOP ---
export async function sendMessageAndProcessStream(promptForApi, targetElement) {
    const { isGenerating, characterInfo, playerState, llmProvider, chatHistory } = gameState.getState();
    if (isGenerating || !characterInfo || !playerState || !llmProvider) {
        return;
    }
    const systemInstruction = llmProvider.getSystemInstructionContent(characterInfo, playerState, gameState.getState().isMatureEnabled);
    let fullInputForDebugger = `--- SYSTEM PROMPT ---\n${systemInstruction}\n\n--- CHAT HISTORY & CURRENT PROMPT ---`;
    chatHistory.forEach(msg => {
        const text = msg.parts.map(p => p.text).join('');
        fullInputForDebugger += `\n${msg.role}: ${text}`;
    });
    fullInputForDebugger += `\nuser: ${promptForApi}`;
    const providerType = game.getProviderSettings().provider;
    if (providerType === 'local') {
        fullInputForDebugger = `(This is a reconstruction of the data sent to a local OpenAI-compatible API. The actual payload is a JSON object with this content.)\n\n` + fullInputForDebugger;
    }
    ui.logToDebugger('input', 'Sent to AI', fullInputForDebugger);
    ui.setLoading(true);
    gameState.updateState({ isGenerating: true });
    let dmMessageElement = targetElement;
    if (!dmMessageElement) {
        dmMessageElement = ui.addMessage('dm', '');
    }
    try {
        const { chat } = gameState.getState();
        if (!chat)
            throw new Error("Chat not initialized.");
        const streamPromise = chat.sendMessageStream({ message: promptForApi });
        const streamResult = await promiseWithTimeout(streamPromise, 30000, 'The storyteller took too long to respond. The request timed out.');
        let fullResponseText = '';
        for await (const chunk of streamResult) {
            const chunkText = chunk.text;
            if (chunkText === undefined || chunkText === null)
                continue;
            fullResponseText += chunkText;
            const cleanedTextForDisplay = cleanseResponseText(fullResponseText);
            dmMessageElement.innerHTML = cleanedTextForDisplay
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
            ui.scrollToBottom();
        }
        ui.logToDebugger('output', 'Received from AI', fullResponseText);
        const newHistory = [...gameState.getState().chatHistory, { role: 'model', parts: [{ text: fullResponseText }] }];
        gameState.updateState({ chatHistory: newHistory });
        await processTagsAndActions(fullResponseText);
    }
    catch (error) {
        console.error("API call failed:", error);
        ui.logToDebugger('error', 'API Error', error.message || String(error));
        const errorString = (error.message || String(error)).toLowerCase();
        const isQuotaError = (errorString.includes('resource_exhausted') || errorString.includes('429'));
        if (isQuotaError && llmProvider) {
            const oldModel = llmProvider.getCurrentModel();
            const switched = await llmProvider.useNextModel();
            if (switched) {
                const newModel = llmProvider.getCurrentModel();
                dmMessageElement.innerHTML = `<em>API limit reached for ${oldModel}. Switching to fallback: ${newModel}. Retrying...</em>`;
                await initializeChatSession();
                gameState.updateState({ isGenerating: false });
                await sendMessageAndProcessStream(promptForApi, dmMessageElement);
                return;
            }
            else {
                dmMessageElement.innerHTML = `API limit reached, and no fallback models are available. Please check your plan and billing details.`;
                dmMessageElement.classList.add('error-message');
            }
        }
        else {
            dmMessageElement.innerHTML = `There was an error with the AI provider. Please check your Settings and the console for details. Error: ${error.message || error}`;
            dmMessageElement.classList.add('error-message');
        }
        ui.setLoading(false);
        gameState.updateState({ isGenerating: false });
    }
}
async function processTagsAndActions(fullResponseText) {
    const gameActionMatches = [...fullResponseText.matchAll(config.GAME_ACTION_REGEX)];
    let stateWasUpdatedByAction = false;
    if (gameActionMatches.length > 0) {
        stateWasUpdatedByAction = await processGameActions(gameActionMatches);
    }
    let stateWasUpdatedByNarrative = false;
    const { isMatureEnabled, playerState, characterInfo } = gameState.getState();
    if (isMatureEnabled && playerState && characterInfo) {
        if (config.PIV_SEX_TAG.test(fullResponseText) && characterInfo.gender === 'female' && !playerState.pregnancy?.isPregnant && Math.random() < config.PREGNANCY_CHANCE) {
            const sireMatch = fullResponseText.match(config.PIV_SEX_TAG);
            if (sireMatch) {
                gameState.updatePlayerState({ pregnancy: { isPregnant: true, conceptionTurn: playerState.turnCount, sire: sireMatch[1], knowledgeRevealed: false } });
                ui.addMessage('dm', '<em>A subtle change, a feeling deep within... something is different.</em>');
                stateWasUpdatedByNarrative = true;
            }
        }
        if (config.PREGNANCY_REVEALED_TAG.test(fullResponseText) && playerState.pregnancy && !playerState.pregnancy.knowledgeRevealed) {
            gameState.updatePlayerState({ pregnancy: { ...playerState.pregnancy, knowledgeRevealed: true } });
            stateWasUpdatedByNarrative = true;
        }
    }
    if (stateWasUpdatedByAction || stateWasUpdatedByNarrative) {
        const finalState = gameState.getState();
        ui.updatePlayerStateUI(finalState.playerState, finalState.characterInfo);
        ui.updateCombatTrackerUI(finalState.combatants, finalState.isInCombat);
        saveCurrentGame();
        await initializeChatSession();
    }
    else {
        const { combatants, isInCombat } = gameState.getState();
        ui.updateCombatTrackerUI(combatants, isInCombat);
    }
    document.querySelectorAll('.action-btn-container, .roll-request-container').forEach(c => c.remove());
    const attackMatches = [...fullResponseText.matchAll(config.ATTACK_ROLL_REGEX)];
    const diceMatches = [...fullResponseText.matchAll(config.DICE_ROLL_REGEX)];
    const choices = [];
    attackMatches.forEach(match => choices.push({ type: 'attack', weaponName: match[1], targetDescription: match[2], modifier: match[3] }));
    diceMatches.forEach(match => choices.push({ type: 'roll', skillOrAbility: match[1], description: match[2], modifier: match[3] }));
    if (choices.length === 1) {
        const choice = choices[0];
        if (choice.type === 'attack') {
            await handleAttackRollRequest(choice.weaponName, choice.targetDescription, choice.modifier);
        }
        else {
            await handleDiceRollRequest(choice.skillOrAbility, choice.description, choice.modifier);
        }
    }
    else if (choices.length > 1) {
        ui.displayActionChoices(choices);
        ui.setLoading(true, false);
        gameState.updateState({ isGenerating: false });
    }
    else {
        ui.setLoading(false);
        gameState.updateState({ isGenerating: false });
        dom.chatInput.focus();
        const lastDmMessageElement = dom.chatLog.querySelector('.dm-message:last-child');
        if (lastDmMessageElement)
            ui.addPostResponseButtons(lastDmMessageElement);
    }
}
export async function handleAttackRollRequest(weaponName, description, rollModifier) {
    const { playerState, characterInfo, chatHistory } = gameState.getState();
    if (!playerState || !characterInfo)
        return;
    let effectiveWeaponName = weaponName;
    const equippedWeapon = playerState.equipment.weapon;
    const hasWeaponInInventory = playerState.inventory.some(item => item.toLowerCase() === weaponName.toLowerCase());
    const isEquipped = equippedWeapon?.toLowerCase() === weaponName.toLowerCase();
    if (!hasWeaponInInventory && !isEquipped) {
        console.warn(`AI requested attack with unowned weapon: '${weaponName}'. Defaulting to equipped weapon: '${equippedWeapon}'.`);
        ui.addMessage('dm', `<em>(You don't have a ${weaponName}. You use your ${equippedWeapon} instead.)</em>`);
        effectiveWeaponName = equippedWeapon;
    }
    gameState.updatePlayerState({ turnCount: playerState.turnCount + 1 });
    let weaponData;
    const normalizedWeaponName = effectiveWeaponName.toLowerCase();
    const isUnarmed = ['unarmed', 'kick', 'punch', 'headbutt', 'stomp', 'slap'].some(term => normalizedWeaponName.includes(term));
    if (isUnarmed) {
        weaponData = {
            name: 'Unarmed Strike',
            damage_dice: getUnarmedStrikeDice(playerState, characterInfo),
            is_finesse: false,
            properties: ['Melee'],
            category: 'Simple Melee',
        };
    }
    else {
        weaponData = getWeaponData(effectiveWeaponName);
    }
    if (!weaponData) {
        console.warn(`Could not find base weapon data for '${effectiveWeaponName}'. Using default stats.`);
        ui.addMessage('dm', `<em>(No standard stats found for "${effectiveWeaponName}". Using default magic weapon stats (1d8 damage) to proceed.)</em>`);
        weaponData = { name: effectiveWeaponName, damage_dice: '1d8', is_finesse: false, properties: ['Magical'], category: 'Martial Melee' };
    }
    // Monks can use Dexterity for their unarmed strikes.
    const canUseFinesse = (weaponData.is_finesse || (isUnarmed && characterInfo.characterClass.toLowerCase() === 'monk'));
    const abilityKey = canUseFinesse && playerState.abilityScores.dexterity > playerState.abilityScores.strength ? 'dexterity' : 'strength';
    const attackBonus = getAbilityModifierValue(playerState.abilityScores[abilityKey]) + playerState.proficiencyBonus;
    let finalModifier = rollModifier;
    if (playerState.conditions?.some(c => c.name === 'Poisoned')) {
        finalModifier = 'DISADVANTAGE';
    }
    let roll1 = Math.floor(Math.random() * 20) + 1, roll2 = Math.floor(Math.random() * 20) + 1;
    let attackRoll = finalModifier === 'ADVANTAGE' ? Math.max(roll1, roll2) : (finalModifier === 'DISADVANTAGE' ? Math.min(roll1, roll2) : roll1);
    const isCritical = attackRoll === 20;
    const damageDice = weaponData.damage_dice;
    let damageRoll = rollDice(damageDice).total + (isCritical ? rollDice(damageDice).total : 0);
    const damageBonus = getAbilityModifierValue(playerState.abilityScores[abilityKey]);
    const attackContent = { description: `Attack with ${effectiveWeaponName} on ${description}`, weaponName: effectiveWeaponName, attackRoll, attackBonus, totalAttackRoll: attackRoll + attackBonus, damageRoll, damageBonus, totalDamage: Math.max(1, damageRoll + damageBonus), damageDice, isCritical, allRolls: (finalModifier && finalModifier !== 'NONE') ? [roll1, roll2] : [roll1], rollModifier: finalModifier };
    ui.addMessage('attack', attackContent);
    ui.logToDebugger('event', 'Player Attack Roll', JSON.stringify(attackContent, null, 2));
    const { isInCombat, combatants } = gameState.getState();
    if (isInCombat) {
        const targetName = description.toLowerCase();
        const targetNpc = combatants.find(c => !c.isPlayer && c.hp > 0 && c.name.toLowerCase().includes(targetName));
        if (targetNpc) {
            const newHp = Math.max(0, targetNpc.hp - attackContent.totalDamage);
            targetNpc.hp = newHp;
            gameState.updateState({ combatants: [...combatants] });
            ui.updateCombatTrackerUI(combatants, isInCombat);
        }
    }
    const historyPrompt = `Action: Attacked ${description} with ${effectiveWeaponName} (Attack Roll: ${attackContent.totalAttackRoll}, Damage: ${attackContent.totalDamage})`;
    const apiPrompt = `The attack roll against "${description}" with the ${effectiveWeaponName} is ${attackContent.totalAttackRoll}, dealing ${attackContent.totalDamage} damage. ${attackContent.isCritical ? 'It was a critical hit. ' : ''}Narrate the outcome. If this defeats the target, you MUST include the [GAME_ACTION|ENEMY_DEFEATED|{"name": "${description}"}] tag.`;
    const newHistory = [...chatHistory, { role: 'user', parts: [{ text: historyPrompt }] }];
    gameState.updateState({ chatHistory: newHistory, isGenerating: false });
    saveCurrentGame();
    await sendMessageAndProcessStream(apiPrompt);
}
async function handleNpcAttackIntent(intent) {
    const { playerState, combatants, chatHistory } = gameState.getState();
    if (!playerState || !combatants)
        return;
    const attacker = combatants.find(c => c.name === intent.attackerName && c.hp > 0);
    if (!attacker) {
        console.warn(`Could not find attacker "${intent.attackerName}" in combatants list.`);
        return;
    }
    const weaponData = getWeaponData(intent.weaponName);
    if (!weaponData) {
        console.warn(`NPC Attacker '${attacker.name}' tried to use unknown weapon '${intent.weaponName}'.`);
        return;
    }
    const attackBonus = 4;
    const damageBonus = 2;
    const attackRoll = rollDice('d20').total;
    const isCritical = attackRoll === 20;
    const damageDice = weaponData.damage_dice;
    let damageRoll = rollDice(damageDice).total + (isCritical ? rollDice(damageDice).total : 0);
    const attackContent = {
        description: `${attacker.name} attacks with ${intent.weaponName}`,
        weaponName: intent.weaponName,
        attackRoll: attackRoll,
        attackBonus: attackBonus,
        totalAttackRoll: attackRoll + attackBonus,
        damageRoll: damageRoll,
        damageBonus: damageBonus,
        totalDamage: Math.max(1, damageRoll + damageBonus),
        damageDice: damageDice,
        isCritical: isCritical,
        allRolls: [attackRoll],
        rollModifier: 'NONE'
    };
    ui.addMessage('attack', attackContent);
    ui.logToDebugger('event', 'NPC Attack Roll', JSON.stringify(attackContent, null, 2));
    let damageApplied = 0;
    if (attackContent.totalAttackRoll >= playerState.armorClass) {
        damageApplied = attackContent.totalDamage;
        const newHp = Math.max(0, playerState.health.current - damageApplied);
        gameState.updatePlayerState({ health: { ...playerState.health, current: newHp } });
        ui.updatePlayerStateUI(gameState.getState().playerState, gameState.getState().characterInfo);
        if (newHp === 0)
            ui.addMessage('dm', '<em>You have been defeated!</em>');
    }
    const apiPrompt = `My enemy, "${attacker.name}", attacked me with its ${intent.weaponName}. The attack roll was ${attackContent.totalAttackRoll} and it dealt ${damageApplied} damage. Narrate the outcome of this attack.`;
    const newHistory = [...chatHistory, { role: 'user', parts: [{ text: `(System: NPC attack resolved. Result: ${damageApplied} damage.)` }] }];
    gameState.updateState({ chatHistory: newHistory, isGenerating: false });
    saveCurrentGame();
    await sendMessageAndProcessStream(apiPrompt);
}
async function handleNpcSkillIntent(intent) {
    const { combatants, chatHistory } = gameState.getState();
    const npc = combatants.find(c => c.name === intent.npcName && c.hp > 0);
    const npcName = npc ? npc.name : intent.npcName;
    const modifier = 2;
    const roll = rollDice('d20').total;
    const total = roll + modifier;
    const diceContent = {
        description: `${npcName} attempts ${intent.description}`,
        roll: roll,
        modifier: modifier,
        total: total,
        dieValue: 20,
        diceString: `d20+${modifier}`,
        skillOrAbility: intent.skill,
        allRolls: [roll]
    };
    ui.addMessage('dice', diceContent);
    ui.logToDebugger('event', 'NPC Skill Check', JSON.stringify(diceContent, null, 2));
    const apiPrompt = `The character "${npcName}" just attempted to use the ${intent.skill} skill for the purpose of "${intent.description}". The result of their roll was ${total}. Narrate the outcome of this attempt.`;
    const newHistory = [...chatHistory, { role: 'user', parts: [{ text: `(System: NPC skill check resolved. Result: ${total}.)` }] }];
    gameState.updateState({ chatHistory: newHistory, isGenerating: false });
    saveCurrentGame();
    await sendMessageAndProcessStream(apiPrompt);
}
export async function handleDiceRollRequest(skillOrAbility, description, rollModifier) {
    const { playerState, chatHistory } = gameState.getState();
    if (!playerState)
        return;
    let finalModifier = rollModifier;
    if (playerState.conditions?.some(c => c.name === 'Poisoned')) {
        finalModifier = 'DISADVANTAGE';
    }
    gameState.updatePlayerState({ turnCount: playerState.turnCount + 1 });
    const modifier = calculateRollModifier(skillOrAbility, playerState);
    let roll1 = Math.floor(Math.random() * 20) + 1, roll2 = Math.floor(Math.random() * 20) + 1;
    let chosenRoll = finalModifier === 'ADVANTAGE' ? Math.max(roll1, roll2) : (finalModifier === 'DISADVANTAGE' ? Math.min(roll1, roll2) : roll1);
    const diceContent = { description, roll: chosenRoll, modifier, total: chosenRoll + modifier, dieValue: 20, diceString: `d20+${modifier}`, skillOrAbility, allRolls: (finalModifier && finalModifier !== 'NONE') ? [roll1, roll2] : [roll1], rollModifier: finalModifier };
    ui.addMessage('dice', diceContent);
    ui.logToDebugger('event', 'Player Skill Check', JSON.stringify(diceContent, null, 2));
    const historyPrompt = `Action: ${description} (Result: ${diceContent.total})`;
    const apiPrompt = `The ${skillOrAbility} check for my character's attempt to "${description}" resulted in a total of ${diceContent.total}. Narrate the outcome.`;
    const newHistory = [...chatHistory, { role: 'user', parts: [{ text: historyPrompt }] }];
    gameState.updateState({ chatHistory: newHistory, isGenerating: false });
    saveCurrentGame();
    await sendMessageAndProcessStream(apiPrompt);
}
export async function handleFormSubmit(event) {
    event.preventDefault();
    const userInput = dom.chatInput.value.trim();
    if (!userInput || gameState.getState().isGenerating)
        return;
    ui.addMessage('user', userInput);
    dom.chatInput.value = '';
    const { playerState, chatHistory } = gameState.getState();
    const newTurnCount = (playerState?.turnCount || 0) + 1;
    const newHistory = [...chatHistory, { role: 'user', parts: [{ text: userInput }] }];
    gameState.updatePlayerState({ turnCount: newTurnCount });
    gameState.updateState({ chatHistory: newHistory });
    saveCurrentGame();
    let finalPrompt = userInput;
    let contextString = '';
    const knownEntity = dataManager.findEntityInText(userInput);
    if (knownEntity) {
        contextString += `RULEBOOK ENTRY FOR "${knownEntity.name}":\n${knownEntity.chunk}\n\n`;
    }
    if (rag.isReady()) {
        const contextChunks = await rag.search(userInput);
        if (contextChunks.length > 0) {
            contextString += contextChunks.map(c => c.chunk).join('\n---\n');
        }
    }
    if (contextString) {
        finalPrompt = `(Use the following background information...)\n${contextString}\n\nMy action is: ${userInput}`;
    }
    await sendMessageAndProcessStream(finalPrompt);
}
export async function startAdventure(startingHook) {
    dom.appElement.classList.remove('hidden');
    dom.storyHooksModal.classList.add('hidden');
    dom.customHookForm.reset();
    const initialPrompt = `My adventure begins with this scenario: ${startingHook}`;
    const startingMessageElement = ui.addMessage('dm', '<em>Your adventure begins...</em>');
    const { playerState, chatHistory } = gameState.getState();
    const newTurnCount = (playerState?.turnCount || 0) + 1;
    const newHistory = [...chatHistory, { role: 'user', parts: [{ text: initialPrompt }] }];
    gameState.updatePlayerState({ turnCount: newTurnCount });
    gameState.updateState({ chatHistory: newHistory });
    saveCurrentGame();
    await sendMessageAndProcessStream(initialPrompt, startingMessageElement);
}
export async function handleRerollRequest(button) {
    if (gameState.getState().isGenerating)
        return;
    const diceMessage = button.closest('.dice-roll-message');
    if (!diceMessage)
        return;
    const { skillOrAbility, description, modifier } = diceMessage.dataset;
    if (!skillOrAbility || !description)
        return;
    const messages = Array.from(dom.chatLog.children);
    const diceIndex = messages.indexOf(diceMessage);
    messages[diceIndex]?.remove();
    messages[diceIndex + 1]?.remove();
    button.parentElement?.remove();
    const currentHistory = gameState.getState().chatHistory;
    const newHistory = currentHistory.slice(0, -2);
    gameState.updateState({ chatHistory: newHistory });
    await handleDiceRollRequest(skillOrAbility, description, modifier);
}
export async function handleRegenerateRequest(button) {
    if (gameState.getState().isGenerating)
        return;
    const dmMessage = button.parentElement?.previousElementSibling;
    if (!dmMessage || !dmMessage.classList.contains('dm-message'))
        return;
    button.parentElement?.remove();
    const currentHistory = gameState.getState().chatHistory;
    const lastUserContent = currentHistory[currentHistory.length - 2];
    const newHistory = currentHistory.slice(0, -1);
    gameState.updateState({ chatHistory: newHistory });
    if (!lastUserContent || lastUserContent.role !== 'user')
        return;
    const userPrompt = lastUserContent.parts.map(p => p.text).join('');
    await sendMessageAndProcessStream(userPrompt, dmMessage);
}