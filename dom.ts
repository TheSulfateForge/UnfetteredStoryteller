/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This file centralizes all DOM element selections.
// This makes it easy to find and update element IDs if the HTML changes.

// --- Landing Page ---
export const landingPage = document.getElementById('landing-page') as HTMLElement;
export const landingNewBtn = document.getElementById('landing-new-btn') as HTMLButtonElement;
export const landingLoadBtn = document.getElementById('landing-load-btn') as HTMLButtonElement;
export const landingSettingsBtn = document.getElementById('landing-settings-btn') as HTMLButtonElement;
export const landingCreditLine = document.getElementById('landing-credit-line') as HTMLElement;


// --- Main App & Modals ---
export const appElement = document.getElementById('app') as HTMLElement;
export const chatLog = document.getElementById('chat-log') as HTMLElement;
export const chatForm = document.getElementById('chat-form') as HTMLFormElement;
export const chatInput = document.getElementById('chat-input') as HTMLInputElement;
export const loadingIndicator = document.getElementById('loading') as HTMLElement;
export const settingsModal = document.getElementById('settings-modal') as HTMLElement;
export const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
export const providerSelector = document.getElementById('provider-selector') as HTMLSelectElement;
export const geminiSettingsSection = document.getElementById('gemini-settings-section') as HTMLElement;
export const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
export const localLlmSettingsSection = document.getElementById('local-llm-settings-section') as HTMLElement;
export const localLlmUrlInput = document.getElementById('local-llm-url-input') as HTMLInputElement;
export const ageGateModal = document.getElementById('age-gate-modal') as HTMLElement;
export const ageGateAcceptBtn = document.getElementById('age-gate-accept') as HTMLButtonElement;
export const ageGateMatureToggle = document.getElementById('age-gate-mature-toggle') as HTMLInputElement;
export const loadGameModal = document.getElementById('load-game-modal') as HTMLElement;
export const saveSlotsList = document.getElementById('save-slots-list') as HTMLElement;
export const newAdventureBtn = document.getElementById('new-adventure-btn') as HTMLButtonElement;
export const loadGameCancelBtn = document.getElementById('load-game-cancel-btn') as HTMLButtonElement;
export const characterCreationCancelBtn = document.getElementById('character-creation-cancel-btn') as HTMLButtonElement;
export const changeSettingsBtn = document.getElementById('change-settings-btn') as HTMLButtonElement;
export const readAloudToggle = document.getElementById('read-aloud-toggle') as HTMLInputElement;
export const micBtn = document.getElementById('mic-btn') as HTMLButtonElement;
export const characterCreationModal = document.getElementById('character-creation-modal') as HTMLElement;
export const characterForm = document.getElementById('character-form') as HTMLFormElement;
export const charNameInput = document.getElementById('char-name') as HTMLInputElement;
export const charDescInput = document.getElementById('char-desc') as HTMLTextAreaElement;
export const charBioInput = document.getElementById('char-bio') as HTMLTextAreaElement;
export const storyHooksModal = document.getElementById('story-hooks-modal') as HTMLElement;
export const storyHooksContainer = document.getElementById('story-hooks-container') as HTMLElement;
export const customHookForm = document.getElementById('custom-hook-form') as HTMLFormElement;
export const customHookInput = document.getElementById('custom-hook-input') as HTMLTextAreaElement;
export const playerStats = document.getElementById('player-stats') as HTMLElement;
export const statsCharName = document.getElementById('stats-char-name') as HTMLElement;
export const statsLocation = document.getElementById('stats-location') as HTMLElement;
export const statsHealth = document.getElementById('stats-health') as HTMLElement;
export const statsMoney = document.getElementById('stats-money') as HTMLElement;
export const statsExp = document.getElementById('stats-exp') as HTMLElement;
export const statsPregnancyStatus = document.getElementById('stats-pregnancy-status') as HTMLElement;
export const equipWeapon = document.getElementById('equip-weapon') as HTMLElement;
export const equipArmor = document.getElementById('equip-armor') as HTMLElement;
export const statsInventory = document.getElementById('stats-inventory') as HTMLElement;
export const statsQuests = document.getElementById('stats-quests') as HTMLElement;
export const statsParty = document.getElementById('stats-party') as HTMLElement;
export const statsLevel = document.getElementById('stats-level') as HTMLElement;
export const statsProficiencyBonus = document.getElementById('stats-proficiency-bonus') as HTMLElement;
export const statsAC = document.getElementById('stats-ac') as HTMLElement;
export const statsSpeed = document.getElementById('stats-speed') as HTMLElement;
export const statsRace = document.getElementById('stats-race') as HTMLElement;
export const statsClass = document.getElementById('stats-class') as HTMLElement;
export const statsBackground = document.getElementById('stats-background') as HTMLElement;
export const statsAlignment = document.getElementById('stats-alignment') as HTMLElement;
export const statsStr = document.getElementById('stats-str') as HTMLElement;
export const statsDex = document.getElementById('stats-dex') as HTMLElement;
export const statsCon = document.getElementById('stats-con') as HTMLElement;
export const statsInt = document.getElementById('stats-int') as HTMLElement;
export const statsWis = document.getElementById('stats-wis') as HTMLElement;
export const statsCha = document.getElementById('stats-cha') as HTMLElement;
export const statsStrMod = document.getElementById('stats-str-mod') as HTMLElement;
export const statsDexMod = document.getElementById('stats-dex-mod') as HTMLElement;
export const statsConMod = document.getElementById('stats-con-mod') as HTMLElement;
export const statsIntMod = document.getElementById('stats-int-mod') as HTMLElement;
export const statsWisMod = document.getElementById('stats-wis-mod') as HTMLElement;
export const statsChaMod = document.getElementById('stats-cha-mod') as HTMLElement;
export const statsSkills = document.getElementById('stats-skills') as HTMLElement;
export const statsSavingThrows = document.getElementById('stats-saving-throws') as HTMLElement;
export const statsFeats = document.getElementById('stats-feats') as HTMLElement;
export const statsRacialTraits = document.getElementById('stats-racial-traits') as HTMLElement;
export const statsClassFeatures = document.getElementById('stats-class-features') as HTMLElement;
export const charRaceInput = document.getElementById('char-race') as HTMLSelectElement;
export const charClassInput = document.getElementById('char-class') as HTMLSelectElement;
export const charBackgroundInput = document.getElementById('char-background') as HTMLSelectElement;
export const charAlignmentInput = document.getElementById('char-alignment') as HTMLSelectElement;
export const charGenderInput = document.getElementById('char-gender') as HTMLSelectElement;
export const legalBtn = document.getElementById('legal-btn') as HTMLButtonElement;
export const legalModal = document.getElementById('legal-modal') as HTMLElement;
export const legalModalCloseBtn = document.getElementById('legal-modal-close-btn') as HTMLButtonElement;
export const ragStatus = document.getElementById('rag-status') as HTMLElement;
export const buildRagBtn = document.getElementById('build-rag-btn') as HTMLButtonElement;
export const pointsRemaining = document.getElementById('points-remaining') as HTMLSpanElement;
export const pointBuyContainer = document.getElementById('point-buy-container') as HTMLElement;