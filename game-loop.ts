/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GenerateContentResponse, Part } from '@google/genai';
import { AttackRollContent, DiceRollContent } from './types';
import { calculateRollModifier, getAbilityModifierValue, getWeaponData, rollDice } from './rpg-helpers';
import * as config from './config';
import * as dom from './dom';
import * as ui from './ui';
import { cleanseResponseText } from './api';
import * as services from './services';
import * as rag from './rag';
import { gameState } from './state-manager';
import { saveCurrentGame, initializeChatSession } from './session-manager';
import { promiseWithTimeout } from './utils';

// --- CORE GAME LOOP ---

export async function sendMessageAndProcessStream(promptForApi: string, promptForHistory: string, targetElement?: HTMLElement) {
    const { isGenerating, characterInfo, playerState, llmProvider } = gameState.getState();
    if (isGenerating || !characterInfo || !playerState || !llmProvider) return;

    if (promptForHistory) {
        const newHistory = [...gameState.getState().chatHistory, { role: 'user', parts: [{ text: promptForHistory }] }];
        gameState.updateState({ chatHistory: newHistory });
    }
   
    ui.setLoading(true);
    gameState.updateState({ isGenerating: true });

    let dmMessageElement = targetElement;
    if (!dmMessageElement) {
        dmMessageElement = ui.addMessage('dm', '');
    }

    try {
        const { chat } = gameState.getState();
        if (!chat) throw new Error("Chat not initialized.");

        const streamPromise = chat.sendMessageStream({ message: promptForApi });
        const streamResult = await promiseWithTimeout(streamPromise, 30000, 'The storyteller took too long to respond. The request timed out.');
        await processStream(streamResult, dmMessageElement);
    } catch (error: any) {
        console.error("API call failed:", error);
        const errorString = (error.message || String(error)).toLowerCase();
        const isQuotaError = (errorString.includes('resource_exhausted') || errorString.includes('429')) && errorString.includes('quota');

        if (isQuotaError && llmProvider) {
            const switched = await llmProvider.useNextModel();
            if (switched) {
                const newModel = llmProvider.getCurrentModel();
                dmMessageElement.innerHTML = `<em>Quota exceeded for the current model. Switching to fallback: ${newModel}. Retrying...</em>`;
                await initializeChatSession();
                // Retry the call. Pass the same dmMessageElement to be updated. Pass empty string for history prompt to avoid duplication.
                await sendMessageAndProcessStream(promptForApi, '', dmMessageElement);
                return; // Exit this failed call; the recursive one takes over.
            } else {
                 dmMessageElement.innerHTML = `API quota exceeded, and no fallback models are available. Please check your plan and billing details.`;
                 dmMessageElement.classList.add('error-message');
            }
        } else {
            dmMessageElement.innerHTML = `There was an error with the AI provider. Please check your Settings and the console for details. Error: ${error.message || error}`;
            dmMessageElement.classList.add('error-message');
        }
        
        // This part is reached on unrecoverable error.
        ui.setLoading(false);
        gameState.updateState({ isGenerating: false });
    }
}

async function processStream(stream: AsyncGenerator<GenerateContentResponse>, dmMessageElement: HTMLElement) {
    let fullResponseText = '';
    let sentenceBuffer = '';

    for await (const chunk of stream) {
        const chunkText = chunk.text;
        if(chunkText === undefined) {
            console.warn("Received undefined text chunk from stream.");
            continue;
        }
        fullResponseText += chunkText;
        sentenceBuffer += chunkText;

        const cleanedTextForDisplay = cleanseResponseText(fullResponseText);
        
        dmMessageElement.innerHTML = cleanedTextForDisplay
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        ui.scrollToBottom();

        let boundaryIndex;
        while ((boundaryIndex = sentenceBuffer.search(/[.!?]\s/)) !== -1) {
            const sentenceToSpeak = sentenceBuffer.substring(0, boundaryIndex + 1);
            sentenceBuffer = sentenceBuffer.substring(boundaryIndex + 2);
            services.tts.queue(cleanseResponseText(sentenceToSpeak));
        }
    }
    
    if (sentenceBuffer.trim()) services.tts.queue(cleanseResponseText(sentenceBuffer.trim()));
    
    const newHistory = [...gameState.getState().chatHistory, { role: 'model', parts: [{ text: fullResponseText }] }];
    gameState.updateState({ chatHistory: newHistory });

    await processTagsAndActions(fullResponseText);
}

async function processTagsAndActions(fullResponseText: string) {
    let stateWasUpdated = false;
    const { isMatureEnabled, playerState, characterInfo } = gameState.getState();

    // --- State Update Logic ---
    const stateMatch = fullResponseText.match(config.STATE_UPDATE_REGEX);
    if (stateMatch && stateMatch[1]) {
        try {
            const parsedStateUpdate = JSON.parse(stateMatch[1]);
            gameState.updatePlayerState(parsedStateUpdate);
            stateWasUpdated = true;
        } catch (e) {
            console.error("Failed to parse player state JSON:", e);
        }
    }
    
    // Handle pregnancy tags if mature content is enabled
    if (isMatureEnabled && playerState && characterInfo) {
        if (config.PIV_SEX_TAG.test(fullResponseText) && characterInfo.gender === 'female' && !playerState.pregnancy?.isPregnant && Math.random() < config.PREGNANCY_CHANCE) {
            const sireMatch = fullResponseText.match(config.PIV_SEX_TAG);
            if (sireMatch) {
                gameState.updatePlayerState({ pregnancy: { isPregnant: true, conceptionTurn: playerState.turnCount, sire: sireMatch[1], knowledgeRevealed: false } });
                ui.addMessage('dm', '<em>A subtle change, a feeling deep within... something is different.</em>');
                stateWasUpdated = true;
            }
        }
        if (config.PREGNANCY_REVEALED_TAG.test(fullResponseText) && playerState.pregnancy && !playerState.pregnancy.knowledgeRevealed) {
            gameState.updatePlayerState({ pregnancy: { ...playerState.pregnancy, knowledgeRevealed: true } });
            stateWasUpdated = true;
        }
    }

    if (stateWasUpdated) {
        ui.updatePlayerStateUI(gameState.getState().playerState!, gameState.getState().characterInfo!);
        saveCurrentGame();
        await initializeChatSession();
    }
    
    document.querySelectorAll('.action-btn-container, .roll-request-container').forEach(c => c.remove());

    const attackMatches = [...fullResponseText.matchAll(config.ATTACK_ROLL_REGEX)];
    const diceMatches = [...fullResponseText.matchAll(config.DICE_ROLL_REGEX)];

    const choices: any[] = [];
    attackMatches.forEach(match => choices.push({ type: 'attack', weaponName: match[1], targetDescription: match[2], modifier: match[3] }));
    diceMatches.forEach(match => choices.push({ type: 'roll', skillOrAbility: match[1], description: match[2], modifier: match[3] }));

    if (choices.length === 1) {
        // This is part of a continuing generation sequence. Do not change the isGenerating state.
        // It will be set to false only when a response with no actions is received.
        const choice = choices[0];
        if (choice.type === 'attack') {
            await handleAttackRollRequest(choice.weaponName, choice.targetDescription, choice.modifier as any);
        } else {
            await handleDiceRollRequest(choice.skillOrAbility, choice.description, choice.modifier as any);
        }
    } else if (choices.length > 1) {
        // Multiple choices are presented. The game is now waiting for player input.
        ui.displayActionChoices(choices);
        ui.setLoading(true, false); // Keep spinner, but allow input via buttons.
        gameState.updateState({ isGenerating: false }); // Set to false to allow choice button clicks to proceed.
    } else {
        // If no tags were found, the turn is purely narrative. The game is now waiting for player input.
        ui.setLoading(false);
        gameState.updateState({ isGenerating: false });
        dom.chatInput.focus();
        const lastDmMessageElement = dom.chatLog.querySelector('.dm-message:last-child');
        if (lastDmMessageElement) {
            ui.addPostResponseButtons(lastDmMessageElement as HTMLElement);
        }
    }
}


export async function handleAttackRollRequest(weaponName: string, description: string, rollModifier?: 'ADVANTAGE' | 'DISADVANTAGE' | 'NONE') {
    const { playerState } = gameState.getState();
    if (!playerState) return;

    const weaponData = getWeaponData(weaponName);
    if (!weaponData) {
        await sendMessageAndProcessStream(`(Attack failed: Weapon '${weaponName}' not found.)`, `(Attack failed: Weapon '${weaponName}' not found.)`);
        return;
    }

    const abilityKey = weaponData.is_finesse && playerState.abilityScores.dexterity > playerState.abilityScores.strength ? 'dexterity' : 'strength';
    const attackBonus = getAbilityModifierValue(playerState.abilityScores[abilityKey]) + playerState.proficiencyBonus;

    let roll1 = Math.floor(Math.random() * 20) + 1, roll2 = Math.floor(Math.random() * 20) + 1;
    let attackRoll = rollModifier === 'ADVANTAGE' ? Math.max(roll1, roll2) : (rollModifier === 'DISADVANTAGE' ? Math.min(roll1, roll2) : roll1);
    
    const isCritical = attackRoll === 20;
    const damageDice = weaponData.damage_dice;
    let damageRoll = rollDice(damageDice).total + (isCritical ? rollDice(damageDice).total : 0);
    const damageBonus = getAbilityModifierValue(playerState.abilityScores[abilityKey]);
    
    const attackContent: AttackRollContent = {
        description: `Attack with ${weaponName} on ${description}`, weaponName, attackRoll, attackBonus,
        totalAttackRoll: attackRoll + attackBonus, damageRoll, damageBonus, totalDamage: Math.max(1, damageRoll + damageBonus),
        damageDice, isCritical, allRolls: (rollModifier === 'ADVANTAGE' || rollModifier === 'DISADVANTAGE') ? [roll1, roll2] : [roll1], rollModifier
    };
    ui.addMessage('attack', attackContent);
    
    const resultMessage = `(Attack with ${weaponName}: rolled ${attackRoll} + ${attackBonus} = ${attackContent.totalAttackRoll}. Damage: ${damageRoll} + ${damageBonus} = ${attackContent.totalDamage}. ${isCritical ? 'Critical Hit!' : ''})`;
    await sendMessageAndProcessStream(resultMessage, resultMessage);
}

export async function handleDiceRollRequest(skillOrAbility: string, description: string, rollModifier?: 'ADVANTAGE' | 'DISADVANTAGE' | 'NONE') {
    const { playerState } = gameState.getState();
    if (!playerState) return;

    const modifier = calculateRollModifier(skillOrAbility, playerState);
    let roll1 = Math.floor(Math.random() * 20) + 1, roll2 = Math.floor(Math.random() * 20) + 1;
    let chosenRoll = rollModifier === 'ADVANTAGE' ? Math.max(roll1, roll2) : (rollModifier === 'DISADVANTAGE' ? Math.min(roll1, roll2) : roll1);

    const diceContent: DiceRollContent = {
        description, roll: chosenRoll, modifier, total: chosenRoll + modifier, dieValue: 20,
        diceString: `d20+${modifier}`, skillOrAbility, allRolls: (rollModifier === 'ADVANTAGE' || rollModifier === 'DISADVANTAGE') ? [roll1, roll2] : [roll1], rollModifier
    };
    ui.addMessage('dice', diceContent);
    
    const resultMessage = `(Dice roll for "${description}" (${skillOrAbility}): rolled ${chosenRoll} + ${modifier} = ${diceContent.total})`;
    await sendMessageAndProcessStream(resultMessage, resultMessage);
}

export async function handleFormSubmit(event: Event) {
    event.preventDefault();
    const userInput = dom.chatInput.value.trim();
    if (!userInput || gameState.getState().isGenerating) return;
    
    services.tts.cancel();
    ui.addMessage('user', userInput);
    dom.chatInput.value = '';
    gameState.updatePlayerState({ turnCount: (gameState.getState().playerState?.turnCount || 0) + 1 });

    let finalPrompt = userInput;
    if (rag.isReady()) {
        const contextChunks = await rag.search(userInput);
        if (contextChunks.length > 0) {
            const contextString = contextChunks.map(c => c.chunk).join('\n---\n');
            finalPrompt = `(Use the following background information...)\n${contextString}\n\nMy action is: ${userInput}`;
        }
    }
    
    await sendMessageAndProcessStream(finalPrompt, userInput);
}

export async function startAdventure(startingHook: string) {
    dom.storyHooksModal.classList.add('hidden');
    dom.customHookForm.reset();
    const initialPrompt = `My adventure begins with this scenario: ${startingHook}`;
    const startingMessageElement = ui.addMessage('dm', '<em>Your adventure begins...</em>');
    
    gameState.updatePlayerState({ turnCount: (gameState.getState().playerState?.turnCount || 0) + 1 });
    await sendMessageAndProcessStream(initialPrompt, initialPrompt, startingMessageElement);
}

export async function handleRerollRequest(button: HTMLButtonElement) {
    if (gameState.getState().isGenerating) return;
    services.tts.cancel();

    const diceMessage = button.closest('.dice-roll-message');
    if (!diceMessage) return;

    const { skillOrAbility, description, modifier } = (diceMessage as HTMLElement).dataset;
    if (!skillOrAbility || !description) return;
    
    const messages = Array.from(dom.chatLog.children);
    const diceIndex = messages.indexOf(diceMessage);

    // Remove the dice roll, the DM response, and this button container
    messages[diceIndex]?.remove();
    messages[diceIndex + 1]?.remove();
    button.parentElement?.remove();

    const currentHistory = gameState.getState().chatHistory;
    // History should be [..., user, model, user, model]. We want to remove the last model and user (the dice roll result).
    const newHistory = currentHistory.slice(0, -2);
    gameState.updateState({ chatHistory: newHistory });

    await handleDiceRollRequest(skillOrAbility, description, modifier as any);
}

export async function handleRegenerateRequest(button: HTMLButtonElement) {
    if (gameState.getState().isGenerating) return;
    services.tts.cancel();

    const dmMessage = button.parentElement?.previousElementSibling;
    if (!dmMessage || !dmMessage.classList.contains('dm-message')) return;

    button.parentElement?.remove();

    const currentHistory = gameState.getState().chatHistory;
    const lastUserContent = currentHistory[currentHistory.length - 2];
    const newHistory = currentHistory.slice(0, -1); // Remove last model response
    gameState.updateState({ chatHistory: newHistory });

    if (!lastUserContent || lastUserContent.role !== 'user') return;

    const userPrompt = (lastUserContent.parts as Part[]).map(p => p.text).join('');
    
    await sendMessageAndProcessStream(userPrompt, userPrompt, dmMessage as HTMLElement);
}