/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// This file centralizes all DOM element selections using a lazy-loading pattern
// to prevent race conditions where scripts try to access elements before they exist.
const cache = new Map();
/**
 * Queries the DOM for an element by its ID, caching the result.
 * Throws an error if a required element is not found, providing a clear
 * point of failure instead of subsequent "undefined" errors.
 * @param {string} id The ID of the element to query.
 * @returns {HTMLElement} The found HTMLElement.
 * @template T
 */
function query(id) {
    if (cache.has(id)) {
        return cache.get(id);
    }
    const el = document.getElementById(id);
    // Some elements are intentionally commented out in the HTML for debugging.
    // Return null for those to avoid breaking the app if they are used.
    const commentedOutIds = ['debug-log-btn', 'debugger-panel', 'debug-input', 'debug-output'];
    if (!el) {
        if (commentedOutIds.includes(id)) {
            return null;
        }
        // This will now throw a helpful error if an ID is misspelled or missing
        // from the HTML, instead of a vague "addEventListener of undefined" error later.
        throw new Error(`DOM element with id "${id}" not found.`);
    }
    cache.set(id, el);
    return el;
}
/**
 * A singleton class that provides lazy-loaded access to all DOM elements
 * used by the application. This pattern ensures that elements are only queried
 * when first accessed and are cached for subsequent requests, improving performance
 * and preventing errors from scripts running before the DOM is fully loaded.
 */
class DOMElements {
    // --- Landing Page ---
    get landingPage() { return query('landing-page'); }
    get landingNewBtn() { return query('landing-new-btn'); }
    get landingLoadBtn() { return query('landing-load-btn'); }
    get landingSettingsBtn() { return query('landing-settings-btn'); }
    get landingCreditLine() { return query('landing-credit-line'); }
    get versionDisplay() { return query('version-display'); }
    // --- Main App & Modals ---
    get appElement() { return query('app'); }
    get chatLog() { return query('chat-log'); }
    get chatForm() { return query('chat-form'); }
    get chatInput() { return query('chat-input'); }
    get loadingIndicator() { return query('loading'); }
    get settingsModal() { return query('settings-modal'); }
    get settingsForm() { return query('settings-form'); }
    get providerSelector() { return query('provider-selector'); }
    get geminiSettingsSection() { return query('gemini-settings-section'); }
    get apiKeyInput() { return query('api-key-input'); }
    get localLlmSettingsSection() { return query('local-llm-settings-section'); }
    get localLlmUrlInput() { return query('local-llm-url-input'); }
    get ageGateModal() { return query('age-gate-modal'); }
    get ageGateAcceptBtn() { return query('age-gate-accept'); }
    get ageGateMatureToggle() { return query('age-gate-mature-toggle'); }
    get loadGameModal() { return query('load-game-modal'); }
    get saveSlotsList() { return query('save-slots-list'); }
    get newAdventureBtn() { return query('new-adventure-btn'); }
    get loadGameCancelBtn() { return query('load-game-cancel-btn'); }
    get changeSettingsBtn() { return query('change-settings-btn'); }
    get readAloudToggle() { return query('read-aloud-toggle'); }
    get micBtn() { return query('mic-btn'); }
    get characterCreationModal() { return query('character-creation-modal'); }
    get characterCreationCloseBtn() { return query('character-creation-close-btn'); }
    get characterForm() { return query('character-form'); }
    get charNameInput() { return query('char-name'); }
    get charDescInput() { return query('char-desc'); }
    get charBioInput() { return query('char-bio'); }
    get storyHooksModal() { return query('story-hooks-modal'); }
    get storyHooksContainer() { return query('story-hooks-container'); }
    get customHookForm() { return query('custom-hook-form'); }
    get customHookInput() { return query('custom-hook-input'); }
    get playerStats() { return query('player-stats'); }
    get statsCharName() { return query('stats-char-name'); }
    get statsLocation() { return query('stats-location'); }
    get statsHealth() { return query('stats-health'); }
    get statsMoney() { return query('stats-money'); }
    get statsExp() { return query('stats-exp'); }
    get statsPregnancyStatus() { return query('stats-pregnancy-status'); }
    get equipWeapon() { return query('equip-weapon'); }
    get equipArmor() { return query('equip-armor'); }
    get statsInventory() { return query('stats-inventory'); }
    get statsQuests() { return query('stats-quests'); }
    get statsParty() { return query('stats-party'); }
    get statsLevel() { return query('stats-level'); }
    get statsProficiencyBonus() { return query('stats-proficiency-bonus'); }
    get statsAC() { return query('stats-ac'); }
    get statsSpeed() { return query('stats-speed'); }
    get statsRace() { return query('stats-race'); }
    get statsClass() { return query('stats-class'); }
    get statsBackground() { return query('stats-background'); }
    get statsAlignment() { return query('stats-alignment'); }
    get statsStr() { return query('stats-str'); }
    get statsDex() { return query('stats-dex'); }
    get statsCon() { return query('stats-con'); }
    get statsInt() { return query('stats-int'); }
    get statsWis() { return query('stats-wis'); }
    get statsCha() { return query('stats-cha'); }
    get statsStrMod() { return query('stats-str-mod'); }
    get statsDexMod() { return query('stats-dex-mod'); }
    get statsConMod() { return query('stats-con-mod'); }
    get statsIntMod() { return query('stats-int-mod'); }
    get statsWisMod() { return query('stats-wis-mod'); }
    get statsChaMod() { return query('stats-cha-mod'); }
    get statsSkills() { return query('stats-skills'); }
    get statsSavingThrows() { return query('stats-saving-throws'); }
    get statsFeats() { return query('stats-feats'); }
    get statsRacialTraits() { return query('stats-racial-traits'); }
    get statsClassFeatures() { return query('stats-class-features'); }
    get statsSpellsKnown() { return query('stats-spells-known'); }
    get charRaceInput() { return query('char-race'); }
    get charClassInput() { return query('char-class'); }
    get charBackgroundInput() { return query('char-background'); }
    get charAlignmentInput() { return query('char-alignment'); }
    get charGenderInput() { return query('char-gender'); }
    get legalBtn() { return query('legal-btn'); }
    get legalModal() { return query('legal-modal'); }
    get legalModalCloseBtn() { return query('legal-modal-close-btn'); }
    get ragStatus() { return query('rag-status'); }
    get buildRagBtn() { return query('build-rag-btn'); }
    get pointsRemaining() { return query('points-remaining'); }
    get pointBuyContainer() { return query('point-buy-container'); }
    get confirmModal() { return query('confirm-modal'); }
    get confirmModalTitle() { return query('confirm-modal-title'); }
    get confirmModalText() { return query('confirm-modal-text'); }
    get confirmModalYesBtn() { return query('confirm-modal-yes-btn'); }
    get confirmModalNoBtn() { return query('confirm-modal-no-btn'); }
    get debugInput() { return query('debug-input'); }
    get debugOutput() { return query('debug-output'); }
    get sidebarToggleBtn() { return query('sidebar-toggle-btn'); }
    get appOverlay() { return query('app-overlay'); }
    get updateNotificationBanner() { return query('update-notification'); }
    get updateReloadBtn() { return query('update-reload-btn'); }
    // Character Creation Wizard
    get ccPrevBtn() { return query('cc-prev-btn'); }
    get ccNextBtn() { return query('cc-next-btn'); }
    get ccStepIndicator() { return query('cc-step-indicator'); }
    get ccPagesContainer() { return query('cc-pages-container'); }
    get ccSummaryBox() { return query('cc-summary-box'); }
    // Character Sheet Modal
    get viewCharacterSheetBtn() { return query('view-character-sheet-btn'); }
    get characterSheetModal() { return query('character-sheet-modal'); }
    get characterSheetCloseBtn() { return query('character-sheet-close-btn'); }
    get characterSheetList() { return query('character-sheet-list'); }
    get characterSheetDetails() { return query('character-sheet-details'); }
    get csCharName() { return query('cs-char-name'); }
    // Level Up Modal
    get levelUpBtn() { return query('level-up-btn'); }
    get levelUpModal() { return query('level-up-modal'); }
    get levelUpTitle() { return query('level-up-title'); }
    get levelUpForm() { return query('level-up-form'); }
    get levelUpPagesContainer() { return query('level-up-pages-container'); }
    get levelUpCancelBtn() { return query('level-up-cancel-btn'); }
    get levelUpPrevBtn() { return query('level-up-prev-btn'); }
    get levelUpStepIndicator() { return query('level-up-step-indicator'); }
    get levelUpNextBtn() { return query('level-up-next-btn'); }
}
export const dom = new DOMElements();
