/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// This file centralizes all DOM element selections.
// This makes it easy to find and update element IDs if the HTML changes.

// --- Landing Page ---
export const landingPage = document.getElementById('landing-page');
export const landingNewBtn = document.getElementById('landing-new-btn');
export const landingLoadBtn = document.getElementById('landing-load-btn');
export const landingSettingsBtn = document.getElementById('landing-settings-btn');
export const landingCreditLine = document.getElementById('landing-credit-line');
export const versionDisplay = document.getElementById('version-display');


// --- Main App & Modals ---
export const appElement = document.getElementById('app');
export const chatLog = document.getElementById('chat-log');
export const chatForm = document.getElementById('chat-form');
export const chatInput = document.getElementById('chat-input');
export const loadingIndicator = document.getElementById('loading');
export const settingsModal = document.getElementById('settings-modal');
export const settingsForm = document.getElementById('settings-form');
export const providerSelector = document.getElementById('provider-selector');
export const geminiSettingsSection = document.getElementById('gemini-settings-section');
export const apiKeyInput = document.getElementById('api-key-input');
export const localLlmSettingsSection = document.getElementById('local-llm-settings-section');
export const localLlmUrlInput = document.getElementById('local-llm-url-input');
export const ageGateModal = document.getElementById('age-gate-modal');
export const ageGateAcceptBtn = document.getElementById('age-gate-accept');
export const ageGateMatureToggle = document.getElementById('age-gate-mature-toggle');
export const loadGameModal = document.getElementById('load-game-modal');
export const saveSlotsList = document.getElementById('save-slots-list');
export const newAdventureBtn = document.getElementById('new-adventure-btn');
export const loadGameCancelBtn = document.getElementById('load-game-cancel-btn');
export const characterCreationCancelBtn = document.getElementById('character-creation-cancel-btn');
export const changeSettingsBtn = document.getElementById('change-settings-btn');
export const readAloudToggle = document.getElementById('read-aloud-toggle');
export const micBtn = document.getElementById('mic-btn');
export const characterCreationModal = document.getElementById('character-creation-modal');
export const characterForm = document.getElementById('character-form');
export const charNameInput = document.getElementById('char-name');
export const charDescInput = document.getElementById('char-desc');
export const charBioInput = document.getElementById('char-bio');
export const storyHooksModal = document.getElementById('story-hooks-modal');
export const storyHooksContainer = document.getElementById('story-hooks-container');
export const customHookForm = document.getElementById('custom-hook-form');
export const customHookInput = document.getElementById('custom-hook-input');
export const playerStats = document.getElementById('player-stats');
export const statsCharName = document.getElementById('stats-char-name');
export const statsLocation = document.getElementById('stats-location');
export const statsHealth = document.getElementById('stats-health');
export const statsMoney = document.getElementById('stats-money');
export const statsExp = document.getElementById('stats-exp');
export const statsPregnancyStatus = document.getElementById('stats-pregnancy-status');
export const equipWeapon = document.getElementById('equip-weapon');
export const equipArmor = document.getElementById('equip-armor');
export const statsInventory = document.getElementById('stats-inventory');
export const statsQuests = document.getElementById('stats-quests');
export const statsParty = document.getElementById('stats-party');
export const statsLevel = document.getElementById('stats-level');
export const statsProficiencyBonus = document.getElementById('stats-proficiency-bonus');
export const statsAC = document.getElementById('stats-ac');
export const statsSpeed = document.getElementById('stats-speed');
export const statsRace = document.getElementById('stats-race');
export const statsClass = document.getElementById('stats-class');
export const statsBackground = document.getElementById('stats-background');
export const statsAlignment = document.getElementById('stats-alignment');
export const statsStr = document.getElementById('stats-str');
export const statsDex = document.getElementById('stats-dex');
export const statsCon = document.getElementById('stats-con');
export const statsInt = document.getElementById('stats-int');
export const statsWis = document.getElementById('stats-wis');
export const statsCha = document.getElementById('stats-cha');
export const statsStrMod = document.getElementById('stats-str-mod');
export const statsDexMod = document.getElementById('stats-dex-mod');
export const statsConMod = document.getElementById('stats-con-mod');
export const statsIntMod = document.getElementById('stats-int-mod');
export const statsWisMod = document.getElementById('stats-wis-mod');
export const statsChaMod = document.getElementById('stats-cha-mod');
export const statsSkills = document.getElementById('stats-skills');
export const statsSavingThrows = document.getElementById('stats-saving-throws');
export const statsFeats = document.getElementById('stats-feats');
export const statsRacialTraits = document.getElementById('stats-racial-traits');
export const statsClassFeatures = document.getElementById('stats-class-features');
export const charRaceInput = document.getElementById('char-race');
export const charClassInput = document.getElementById('char-class');
export const charBackgroundInput = document.getElementById('char-background');
export const charAlignmentInput = document.getElementById('char-alignment');
export const charGenderInput = document.getElementById('char-gender');
export const legalBtn = document.getElementById('legal-btn');
export const legalModal = document.getElementById('legal-modal');
export const legalModalCloseBtn = document.getElementById('legal-modal-close-btn');
export const ragStatus = document.getElementById('rag-status');
export const buildRagBtn = document.getElementById('build-rag-btn');
export const pointsRemaining = document.getElementById('points-remaining');
export const pointBuyContainer = document.getElementById('point-buy-container');
export const confirmModal = document.getElementById('confirm-modal');
export const confirmModalTitle = document.getElementById('confirm-modal-title');
export const confirmModalText = document.getElementById('confirm-modal-text');
export const confirmModalYesBtn = document.getElementById('confirm-modal-yes-btn');
export const confirmModalNoBtn = document.getElementById('confirm-modal-no-btn');
export const debugLogBtn = document.getElementById('debug-log-btn');
export const debuggerPanel = document.getElementById('debugger-panel');
export const debugInput = document.getElementById('debug-input');
export const debugOutput = document.getElementById('debug-output');