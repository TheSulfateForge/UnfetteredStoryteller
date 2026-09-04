/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { dom } from './dom.js';
import * as ui from './ui.js';
import * as dataManager from './data-manager.js';
import { getPointBuyCost, DEFAULT_SKILLS, getAbilityModifierValue, DEFAULT_SAVING_THROWS, calculateProficiencyBonus, calculateArmorClass, resolveSkillKey, rollDice } from './rpg-helpers.js';
import { gameState } from './state-manager.js';
import * as game from './game.js';
import { startAdventure } from './game-loop.js';
import { initializeChatSession, saveCurrentGame } from './session-manager.js';
import { toCamelCase } from './utils.js';
// Type guards to help TypeScript narrow the union type
function isRaceData(data) {
    return 'is_subrace' in data;
}
function isClassData(data) {
    return 'hit_die' in data;
}
function isBackgroundData(data) {
    return 'benefits' in data;
}
// --- STATE & CONSTANTS ---
const STAT_ABBREVIATIONS = {
    strength: 'str',
    dexterity: 'dex',
    constitution: 'con',
    intelligence: 'int',
    wisdom: 'wis',
    charisma: 'cha',
};
/**
 * Boilerplate racial trait entries that shouldn't be listed as features.
 * Anchored to the WHOLE name on purpose: a bare substring test also matched
 * real traits like "Damage Resistance" and "Savage Attacks" (both contain
 * "age"), silently dropping them from characters.
 */
const BOILERPLATE_TRAIT_REGEX = /^(ability score increase|age|alignment|size|speed|languages?)$/i;
const SPELLCASTING_CLASSES = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard', 'paladin', 'ranger']);
export const POINT_BUY_TOTAL = 35;
let pointBuyState = {
    pointsRemaining: POINT_BUY_TOTAL,
    scores: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 10,
    }
};
let currentPage = 1;
const totalPages = 6;
let levelUpState = null;
// --- HELPERS ---
/**
 * Extracts a short, clean blurb from a long description.
 * @param {string} desc The full description text.
 * @returns {string} A concise summary.
 */
function createBlurb(desc) {
    if (!desc)
        return 'No description available.';
    const sanitized = desc
        .replace(/###?\s*.*?\n/g, '') // Remove sub-headings
        .replace(/[\*_#]/g, '')
        .replace(/\r\n/g, '\n') // Normalize line endings
        .replace(/\n/g, '<br>') // Convert newlines to <br> for HTML
        .trim();
    return sanitized;
}
// --- WIZARD NAVIGATION ---
/**
 * Navigates to a specific page in the character creation wizard.
 * @param {number} page The page number to display.
 */
function navigateToPage(page) {
    currentPage = page;
    dom.ccPagesContainer.querySelectorAll('.cc-page').forEach(p => p.classList.remove('active'));
    const activePage = dom.ccPagesContainer.querySelector(`.cc-page[data-page="${currentPage}"]`);
    if (activePage)
        activePage.classList.add('active');
    dom.ccStepIndicator.querySelectorAll('.step-dot').forEach(dot => {
        const dotElement = dot;
        dotElement.classList.toggle('active', parseInt(dotElement.dataset.step) === currentPage);
    });
    dom.ccPrevBtn.classList.toggle('hidden', currentPage === 1);
    dom.ccNextBtn.disabled = false;
    dom.ccNextBtn.type = (currentPage === totalPages) ? 'submit' : 'button';
    dom.ccNextBtn.textContent = (currentPage === totalPages) ? 'Create Character' : 'Next >';
    if (page === 3)
        updateSkillSelectionUI();
    else if (page === 4)
        updateSpecialSelectionsUI();
    else if (page === 5)
        updateGearSelectionUI();
}
/**
 * Validates the current page before proceeding.
 * @param {number} page The page number to validate.
 * @returns {boolean} True if the page is valid, false otherwise.
 */
function validatePage(page) {
    switch (page) {
        case 1:
            if (!dom.charRaceInput.value || !dom.charClassInput.value || !dom.charBackgroundInput.value) {
                alert('Please select a Race, Class, and Background to continue.');
                return false;
            }
            return true;
        case 2:
            if (pointBuyState.pointsRemaining < 0) {
                alert(`You have spent too many points on ability scores. Please adjust them.`);
                return false;
            }
            return true;
        case 3: {
            const skillContainer = document.getElementById('skill-selection-container');
            if (!skillContainer)
                return true;
            const errors = [];
            const choiceBlocks = skillContainer.querySelectorAll('.skill-choice-block');
            choiceBlocks.forEach(block => {
                const choiceHeaders = block.querySelectorAll('p.skill-choice-header');
                choiceHeaders.forEach(header => {
                    const checkboxes = Array.from(header.nextElementSibling?.querySelectorAll('input[type="checkbox"][name]') ?? []);
                    if (checkboxes.length === 0)
                        return;
                    const numUserSelected = checkboxes.filter(cb => cb.checked && !cb.hasAttribute('data-externally-disabled')).length;
                    const chooseMatch = header.textContent?.match(/Choose (\d+)/);
                    const limit = chooseMatch ? parseInt(chooseMatch[1], 10) : 0;
                    if (numUserSelected !== limit) {
                        const sourceName = block.querySelector('h5')?.textContent?.replace('Skills from ', '') || 'a source';
                        errors.push(`Please select exactly ${limit} skill(s) for ${sourceName}. You have selected ${numUserSelected}.`);
                    }
                });
            });
            if (errors.length > 0) {
                alert(errors.join('\n'));
                return false;
            }
            if (!dom.charAlignmentInput.value || !dom.charGenderInput.value) {
                alert('Please select an Alignment and Gender.');
                return false;
            }
            return true;
        }
        case 4: {
            const page4 = document.getElementById('spell-selection-page');
            if (!page4)
                return true;
            const errors = [];
            if (dom.charRaceInput.value.toLowerCase() === 'dragonborn') {
                const ancestrySelected = page4.querySelector('input[name="draconicAncestry"]:checked');
                if (!ancestrySelected) {
                    errors.push('Please select your Draconic Ancestry.');
                }
            }
            const expertiseCheckboxes = page4.querySelectorAll('input[name="rogueExpertise"]');
            if (expertiseCheckboxes.length > 0) {
                const limit = parseInt(page4.dataset.expertiseLimit || '0', 10);
                const numSelected = Array.from(expertiseCheckboxes).filter(cb => cb.checked).length;
                if (numSelected !== limit) {
                    errors.push(`Please select exactly ${limit} skills for Expertise. You have selected ${numSelected}.`);
                }
            }
            const cantripLimit = parseInt(page4.dataset.cantripLimit || '0', 10);
            const level1Limit = parseInt(page4.dataset.level1Limit || '0', 10);
            // Only enforce a limit when options were actually rendered. If a spell
            // list failed to resolve, the grid is empty and demanding selections
            // would leave the player permanently stuck on this page.
            const cantripBoxes = page4.querySelectorAll('input[name="cantrip-selection"]').length;
            const level1Boxes = page4.querySelectorAll('input[name="level1-selection"]').length;
            const selectedCantrips = page4.querySelectorAll('input[name="cantrip-selection"]:checked').length;
            const selectedLevel1 = page4.querySelectorAll('input[name="level1-selection"]:checked').length;
            if (cantripLimit > 0 && cantripBoxes > 0 && selectedCantrips !== cantripLimit) {
                errors.push(`Please select exactly ${cantripLimit} cantrip(s). You have selected ${selectedCantrips}.`);
            }
            if (level1Limit > 0 && level1Boxes > 0 && selectedLevel1 !== level1Limit) {
                errors.push(`Please select exactly ${level1Limit} 1st-level spell(s). You have selected ${selectedLevel1}.`);
            }
            if ((cantripLimit > 0 && cantripBoxes === 0) || (level1Limit > 0 && level1Boxes === 0)) {
                console.warn('Spell selection expected but no spells were rendered; check that spelllist.json ids match the spell data.');
            }
            if (errors.length > 0) {
                alert(errors.join('\n'));
                return false;
            }
            return true;
        }
        case 5: {
            const gearPage = document.getElementById('gear-selection-page');
            if (!gearPage)
                return true;
            const errors = [];
            gearPage.querySelectorAll('.gear-choice-block').forEach((block, i) => {
                if (!block.querySelector('input[type="radio"]:checked')) {
                    errors.push(`Please choose an option for equipment choice #${i + 1}.`);
                }
            });
            gearPage.querySelectorAll('.gear-select').forEach(sel => {
                if (!sel.disabled && !sel.value) {
                    errors.push('Please resolve all "any weapon / instrument" equipment selections.');
                }
            });
            if (errors.length > 0) {
                alert([...new Set(errors)].join('\n'));
                return false;
            }
            return true;
        }
        case 6:
            return dom.characterForm.reportValidity();
        default:
            return true;
    }
}
/** Handles the "Next" button click. */
export function handleNextPage() {
    if (!validatePage(currentPage))
        return;
    // Page 4 is never skipped. It used to be hidden for classes with no special
    // level-1 choice (barbarian, monk, paladin), but it now also carries the
    // optional starting feat, which every class is entitled to.
    const nextPage = currentPage + 1;
    if (nextPage <= totalPages)
        navigateToPage(nextPage);
}
/** Handles the "Previous" button click. */
export function handlePrevPage() {
    const prevPage = currentPage - 1;
    if (prevPage >= 1)
        navigateToPage(prevPage);
}
/** Sets up the initial view for the character creation wizard. */
export function setupInitialPage() {
    navigateToPage(1);
    updateCharacterCreationSummary();
}
// --- POINT-BUY FUNCTIONS ---
/** Resets the point-buy system to its default state. */
export function resetPointBuy() {
    pointBuyState = {
        pointsRemaining: POINT_BUY_TOTAL,
        scores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 }
    };
    let totalCost = 0;
    Object.values(pointBuyState.scores).forEach(score => totalCost += getPointBuyCost(score));
    pointBuyState.pointsRemaining = POINT_BUY_TOTAL - totalCost;
    updatePointBuyUI();
}
/** Updates the entire point-buy UI based on the current state. */
function updatePointBuyUI() {
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
    if (newScore < 8 || newScore > 20)
        return;
    const costChange = getPointBuyCost(newScore) - getPointBuyCost(currentScore);
    if (direction === 'increase' && pointBuyState.pointsRemaining < costChange)
        return;
    pointBuyState.scores[stat] = newScore;
    pointBuyState.pointsRemaining -= costChange;
    updatePointBuyUI();
}
// --- SKILL & FEATURE UI FUNCTIONS ---
export function handleCharacterCoreIdentityChange() {
    updateSkillSelectionUI();
    updateCharacterCreationSummary();
}
export function updateCharacterCreationSummary() {
    const raceData = dataManager.getRace(dom.charRaceInput.value);
    const classData = dataManager.getClass(dom.charClassInput.value);
    const backgroundData = dataManager.getBackground(dom.charBackgroundInput.value);
    let html = '';
    if (!raceData && !classData && !backgroundData) {
        dom.ccSummaryBox.innerHTML = `<p class="placeholder-text">Select a Race, Class, and Background to see their features.</p>`;
        return;
    }
    const renderSection = (title, data, extractor) => {
        html += `<h4>${title}</h4>`;
        if (data) {
            html += '<ul>';
            const items = extractor(data);
            if (items.length > 0)
                items.forEach(item => html += `<li><strong>${item.name}</strong><span>${createBlurb(item.desc)}</span></li>`);
            else
                html += '<li>No specific features.</li>';
            html += '</ul>';
        }
        else
            html += `<p class="placeholder-text">Select a ${title.split(' ')[0]}</p>`;
    };
    renderSection('Race Features', raceData, r => r.traits.filter((t) => !BOILERPLATE_TRAIT_REGEX.test(t.name.trim())));
    renderSection('Class Features (Level 1)', classData, c => c.features?.filter((f) => f.level === 1) || []);
    renderSection('Background Feature', backgroundData, b => b.benefits?.filter((f) => f.type === 'feature') || []);
    dom.ccSummaryBox.innerHTML = html;
}
export function updateSkillSelectionUI() {
    const container = document.getElementById('skill-selection-container');
    if (!container)
        return;
    container.innerHTML = '';
    const sources = [
        { name: 'Race', data: dataManager.getRace(dom.charRaceInput.value) },
        { name: 'Background', data: dataManager.getBackground(dom.charBackgroundInput.value) },
        { name: 'Class', data: dataManager.getClass(dom.charClassInput.value) },
    ];
    sources.forEach(source => {
        const { name, data } = source;
        if (!data)
            return;
        const sourceGrantedSkills = new Set();
        const sourceSkillChoices = [];
        if (isRaceData(data)) {
            if (data.parsed_skill_proficiencies) {
                data.parsed_skill_proficiencies.granted.forEach(skill => sourceGrantedSkills.add(skill));
                data.parsed_skill_proficiencies.choices.forEach(choice => sourceSkillChoices.push(choice));
            }
        }
        else if (isBackgroundData(data)) {
            if (data.parsed_skill_proficiencies) {
                data.parsed_skill_proficiencies.granted.forEach(skill => sourceGrantedSkills.add(skill));
                data.parsed_skill_proficiencies.choices.forEach(choice => sourceSkillChoices.push(choice));
            }
        }
        else if (isClassData(data)) {
            if (data.skill_proficiencies) {
                data.skill_proficiencies.forEach((prof) => {
                    if (prof.type === 'choice') {
                        const skillList = ((typeof prof.from === 'string') ? [prof.from] : prof.from).map((s) => s.trim().replace(/\./g, ''));
                        sourceSkillChoices.push({ choose: prof.choose, from: skillList });
                    }
                });
            }
        }
        if (sourceGrantedSkills.size > 0 || sourceSkillChoices.length > 0) {
            let html = `<div class="skill-choice-block"><h5>Skills from ${name} (${data.name})</h5>`;
            if (sourceGrantedSkills.size > 0) {
                html += `<div class="skill-choice-grid">${[...sourceGrantedSkills].map(skill => `<div class="skill-checkbox"><input type="checkbox" id="skill-granted-${name}-${skill}" value="${skill}" checked disabled><label>${skill.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</label></div>`).join('')}</div>`;
            }
            sourceSkillChoices.forEach((choice, index) => {
                const groupName = `skill-choice-group-${name.replace(/\s+/g, '-')}-${index}`;
                html += `<p class="skill-choice-header">Choose ${choice.choose}:</p><div class="skill-choice-grid">${choice.from.map(skill => `<div class="skill-checkbox"><input type="checkbox" id="skill-choice-${groupName}-${toCamelCase(skill)}" name="${groupName}" value="${toCamelCase(skill)}"><label for="skill-choice-${groupName}-${toCamelCase(skill)}">${skill.replace(/^./, str => str.toUpperCase())}</label></div>`).join('')}</div>`;
            });
            container.innerHTML += html + `</div>`;
        }
    });
    updateCheckboxStates();
}
export function updateCheckboxStates() {
    const container = document.getElementById('skill-selection-container');
    if (!container)
        return;
    const grantedSkills = new Set();
    container.querySelectorAll('input[id^="skill-granted-"]').forEach(cb => grantedSkills.add(cb.value));
    const backgroundChoiceSkills = new Set();
    container.querySelectorAll('input[name^="skill-choice-group-Background"]:checked').forEach(cb => backgroundChoiceSkills.add(cb.value));
    const allPreAcquiredSkills = new Set([...grantedSkills, ...backgroundChoiceSkills]);
    const choiceGroups = {};
    container.querySelectorAll('input[name^="skill-choice-group-"]').forEach(cb => {
        const groupName = cb.name;
        if (!choiceGroups[groupName]) {
            const header = Array.from(container.querySelectorAll('p.skill-choice-header')).find(p => p.nextElementSibling?.contains(cb));
            const chooseMatch = header?.textContent?.match(/Choose (\d+)/);
            choiceGroups[groupName] = { limit: chooseMatch ? parseInt(chooseMatch[1], 10) : 0, checkboxes: [] };
        }
        choiceGroups[groupName].checkboxes.push(cb);
    });
    Object.values(choiceGroups).forEach(group => {
        const isClassGroup = group.checkboxes[0]?.name.includes('-Class-');
        const externalSkills = isClassGroup ? allPreAcquiredSkills : grantedSkills;
        group.checkboxes.forEach(cb => {
            const wasExternallyDisabled = cb.hasAttribute('data-externally-disabled');
            cb.removeAttribute('data-externally-disabled');
            if (externalSkills.has(cb.value)) {
                cb.checked = true;
                cb.disabled = true;
                cb.setAttribute('data-externally-disabled', 'true');
            }
            else {
                if (wasExternallyDisabled)
                    cb.checked = false;
                cb.disabled = false;
            }
        });
        const numSelectedInGroup = group.checkboxes.filter(cb => cb.checked && !cb.hasAttribute('data-externally-disabled')).length;
        if (group.limit > 0 && numSelectedInGroup >= group.limit) {
            group.checkboxes.forEach(cb => {
                if (!cb.checked)
                    cb.disabled = true;
            });
        }
    });
}
export function enforceCheckboxLimit(name, limit) {
    const page = document.getElementById('spell-selection-page');
    if (!page)
        return;
    const checked = page.querySelectorAll(`input[name="${name}"]:checked`).length;
    page.querySelectorAll(`input[name="${name}"]:not(:checked)`).forEach(cb => cb.disabled = (checked >= limit));
}
export function updateSpecialSelectionsUI() {
    const page = document.getElementById('spell-selection-page');
    if (!page)
        return;
    const className = dom.charClassInput.value;
    const raceName = dom.charRaceInput.value;
    // Preserve state before re-rendering
    const previousState = {
        spells: Array.from(page.querySelectorAll('input[name$="-selection"]:checked')).map(cb => cb.dataset.spellName),
        // Several inputs share a name (Expertise, cantrips, spells known), so all
        // checked values must be kept. Collapsing to one value per name silently
        // unchecked the player's other picks every time the page re-rendered,
        // which then failed validation on Next.
        choices: Array.from(page.querySelectorAll('input[type="radio"]:checked, input[type="checkbox"]:checked')).reduce((acc, el) => {
            (acc[el.name] = acc[el.name] || []).push(el.value);
            return acc;
        }, {})
    };
    page.innerHTML = '';
    let hasContent = false;
    let pageHtml = '<div class="special-selection-container">';
    if (raceName.toLowerCase() === 'dragonborn') {
        const ancestryChoices = [
            { name: 'Black (Acid)', desc: 'You have resistance to Acid damage and an Acid breath weapon.' },
            { name: 'Blue (Lightning)', desc: 'You have resistance to Lightning damage and a Lightning breath weapon.' },
            { name: 'Brass (Fire)', desc: 'You have resistance to Fire damage and a Fire breath weapon.' },
            { name: 'Bronze (Lightning)', desc: 'You have resistance to Lightning damage and a Lightning breath weapon.' },
            { name: 'Copper (Acid)', desc: 'You have resistance to Acid damage and an Acid breath weapon.' },
            { name: 'Gold (Fire)', desc: 'You have resistance to Fire damage and a Fire breath weapon.' },
            { name: 'Green (Poison)', desc: 'You have resistance to Poison damage and a Poison breath weapon.' },
            { name: 'Red (Fire)', desc: 'You have resistance to Fire damage and a Fire breath weapon.' },
            { name: 'Silver (Cold)', desc: 'You have resistance to Cold damage and a Cold breath weapon.' },
            { name: 'White (Cold)', desc: 'You have resistance to Cold damage and a Cold breath weapon.' }
        ];
        pageHtml += createChoiceBlock('Draconic Ancestry', ancestryChoices, 'radio', 'draconicAncestry');
        hasContent = true;
    }
    const classChoices = {
        fighter: () => createChoiceBlock('Fighting Style', [{ name: 'Archery', desc: '+2 bonus to attack rolls you make with ranged weapons.' }, { name: 'Defense', desc: 'While you are wearing armor, you gain a +1 bonus to AC.' }, { name: 'Dueling', desc: 'When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.' }, { name: 'Great Weapon Fighting', desc: 'When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll.' }, { name: 'Protection', desc: 'When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll.' }, { name: 'Two-Weapon Fighting', desc: 'When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.' }], 'radio', 'fightingStyle'),
        rogue: () => {
            const skills = getCurrentlyProficientSkills();
            const skillOptions = skills.map(s => ({ name: s, desc: `Your proficiency bonus is doubled for any ability check you make that uses ${s}.` }));
            if (skillOptions.length > 0) {
                page.dataset.expertiseLimit = "2";
                return createChoiceBlock('Expertise', skillOptions, 'checkbox', 'rogueExpertise', 2);
            }
            return '<p>Please select skill proficiencies on the previous page to choose your Expertise.</p>';
        },
        cleric: () => createChoiceBlock('Divine Domain', [{ name: 'Life', desc: 'The Life domain focuses on the vibrant positive energy—one of the fundamental forces of the universe—that sustains all life.' }], 'radio', 'divineDomain'),
        ranger: () => createChoiceBlock('Favored Enemy', [{ name: 'Beasts' }, { name: 'Fey' }, { name: 'Humanoids' }, { name: 'Monstrosities' }, { name: 'Undead' }].map(c => ({ ...c, desc: `You have advantage on Wisdom (Survival) checks to track your favored enemies, as well as on Intelligence checks to recall information about them.` })), 'radio', 'favoredEnemy') + createChoiceBlock('Natural Explorer', [{ name: 'Forest' }, { name: 'Mountain' }, { name: 'Swamp' }, { name: 'Underdark' }].map(c => ({ ...c, desc: `You are particularly familiar with one type of natural environment and are adept at traveling and surviving in such regions.` })), 'radio', 'naturalExplorer'),
        sorcerer: () => {
            let html = createChoiceBlock('Sorcerous Origin', [{ name: 'Draconic Bloodline', desc: 'Your innate magic comes from draconic magic that was mingled with your blood or that of your ancestors.' }], 'radio', 'sorcerousOrigin');
            const selectedOrigin = previousState.choices['sorcerousOrigin']?.[0] || 'Draconic Bloodline';
            if (selectedOrigin === 'Draconic Bloodline' && raceName.toLowerCase() !== 'dragonborn') {
                html += createChoiceBlock('Draconic Ancestry', [{ name: 'Red (Fire)' }, { name: 'Blue (Lightning)' }, { name: 'Black (Acid)' }, { name: 'Green (Poison)' }, { name: 'White (Cold)' }].map(c => ({ ...c, desc: `Your affinity is with the damage type associated with your draconic ancestor.` })), 'radio', 'draconicAncestry');
            }
            return html;
        },
        warlock: () => createChoiceBlock('Otherworldly Patron', [{ name: 'The Fiend', desc: 'You have made a pact with a fiend from the lower planes of existence.' }], 'radio', 'otherworldlyPatron'),
    };
    const choiceBuilder = classChoices[className.toLowerCase()];
    if (choiceBuilder) {
        pageHtml += choiceBuilder();
        hasContent = true;
    }
    pageHtml += renderFeatSelection();
    hasContent = true;
    const isLvl1PaladinOrRanger = (className.toLowerCase() === 'paladin' || className.toLowerCase() === 'ranger');
    if (SPELLCASTING_CLASSES.has(className.toLowerCase()) && !isLvl1PaladinOrRanger) {
        pageHtml += renderSpellSelection(className);
        hasContent = true;
    }
    if (!hasContent) {
        pageHtml += `<p class="placeholder-text">This class has no special selections to make at level 1.</p>`;
    }
    page.innerHTML = pageHtml + '</div>';
    // Restore previous selections after re-render
    Object.entries(previousState.choices).forEach(([name, values]) => {
        page.querySelectorAll(`input[name="${name}"]`).forEach(input => {
            if (values.includes(input.value))
                input.checked = true;
        });
    });
    enforceCheckboxLimit('rogueExpertise', parseInt(page.dataset.expertiseLimit || '0', 10));
    enforceCheckboxLimit('cantrip-selection', parseInt(page.dataset.cantripLimit || '0', 10));
    enforceCheckboxLimit('level1-selection', parseInt(page.dataset.level1Limit || '0', 10));
}
function getCurrentlyProficientSkills() {
    const skills = new Set();
    document.querySelectorAll('#skill-selection-container input[type="checkbox"]:checked').forEach(cb => skills.add(cb.value));
    return Array.from(skills).map(s => s.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
}
function createChoiceBlock(title, choices, inputType, inputName, limit = 1) {
    let html = `<div class="choice-block"><h4>${title} ${inputType === 'checkbox' ? `(Choose ${limit})` : ''}</h4><div class="choice-grid">`;
    choices.forEach(choice => {
        const id = `${inputName}-${choice.name.toLowerCase().replace(/[\s\(\)]+/g, '-')}`;
        html += `<div class="choice-item"><div class="choice-item-header"><input type="${inputType}" id="${id}" name="${inputName}" value="${choice.name}"><label for="${id}">${choice.name}</label></div><p class="choice-desc">${createBlurb(choice.desc)}</p></div>`;
    });
    return html + '</div></div>';
}
/**
 * Optional starting feat. In SRD 5.1 feats are an optional rule normally taken
 * in place of an Ability Score Improvement, so this defaults to "None" and is
 * never forced. Feats whose prerequisite clearly isn't met are marked.
 */
function renderFeatSelection() {
    const feats = dataManager.getFeats();
    if (!feats || feats.length === 0) {
        console.warn('No feats loaded from data/feats.json; the starting feat choice cannot be shown.');
        return `<div class="choice-block"><h4>Starting Feat (optional)</h4>
        <p class="form-hint">The feat list could not be loaded, so no feat can be chosen right now.</p></div>`;
    }
    // Prerequisites are judged on the scores the character will actually have,
    // racial bonuses included - not the raw point-buy numbers.
    const scores = { ...pointBuyState.scores };
    const featRaceData = dataManager.getRace(dom.charRaceInput.value);
    if (featRaceData?.ability_bonuses) {
        for (const [stat, bonus] of Object.entries(featRaceData.ability_bonuses)) {
            if (scores[stat] !== undefined)
                scores[stat] += bonus;
        }
    }
    /** Best-effort prerequisite check against ability scores and proficiencies. */
    const meetsPrerequisite = (prereq) => {
        if (!prereq)
            return true;
        const text = String(prereq);
        // "Strength 13 or higher" style requirements can be checked directly.
        const abilityMatch = text.match(/(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+(\d+)/i);
        if (abilityMatch) {
            const stat = abilityMatch[1].toLowerCase();
            return (scores[stat] ?? 0) >= parseInt(abilityMatch[2], 10);
        }
        return true; // Anything we can't verify is left to the player.
    };
    const options = feats
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(f => {
            const ok = meetsPrerequisite(f.prerequisite);
            const id = `feat-${String(f.slug || f.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
            const cleanPre = String(f.prerequisite || '').replace(/[*_`]/g, '').trim();
            const pre = cleanPre ? `<em>Prerequisite: ${cleanPre}${ok ? '' : ' — not met'}</em><br>` : '';
            return `<div class="choice-item"><div class="choice-item-header">
                <input type="radio" id="${id}" name="startingFeat" value="${f.name}"${ok ? '' : ' disabled'}>
                <label for="${id}">${f.name}</label>
            </div><p class="choice-desc">${pre}${createBlurb(f.desc || (f.benefits || []).map(b => b.desc).join(' '))}</p></div>`;
        }).join('');
    return `<div class="choice-block"><h4>Starting Feat (optional)</h4>
        <p class="form-hint">Feats are an optional rule. Leave this as "None" to follow the standard progression.</p>
        <div class="choice-grid">
            <div class="choice-item"><div class="choice-item-header">
                <input type="radio" id="feat-none" name="startingFeat" value="" checked>
                <label for="feat-none">None</label>
            </div><p class="choice-desc">Take no feat at 1st level.</p></div>
            ${options}
        </div></div>`;
}
function renderSpellSelection(className) {
    const spellList = dataManager.getSpellList(className);
    if (!spellList)
        return `<p class="error-message">Could not find a spell list for ${className}.</p>`;
    const { wisdom, intelligence, charisma } = pointBuyState.scores;
    // Cantrips and "spells known" come from the class progression table built
    // from upstream data, so they stay correct if the source data changes.
    let cantrips = dataManager.getProgressionValue(className, 'cantrips-known', 1);
    let level1 = dataManager.getProgressionValue(className, 'spells-known', 1);
    // Prepared casters have no "spells known" column - their prepared count is
    // derived from level + spellcasting ability instead.
    switch (className.toLowerCase()) {
        case 'cleric':
        case 'druid':
            level1 = Math.max(1, 1 + getAbilityModifierValue(wisdom));
            break;
        case 'wizard':
            // A wizard's spellbook starts with six 1st-level spells.
            level1 = level1 || 6;
            break;
        case 'paladin':
            cantrips = 0;
            level1 = Math.max(1, 1 + getAbilityModifierValue(charisma));
            break;
    }
    const page = document.getElementById('spell-selection-page');
    if (page) {
        page.dataset.cantripLimit = String(cantrips);
        page.dataset.level1Limit = String(level1);
    }
    const allSpells = spellList.spells.map(s => dataManager.getSpell(s)).filter(Boolean);
    const renderGrid = (title, spells, limit, group) => {
        if (spells.length === 0 || limit === 0)
            return '';
        let html = `<div class="spell-list choice-block"><h4>${title} (Choose ${limit})</h4><div class="spell-grid">`;
        spells.forEach(s => html += `<div class="spell-item"><div class="spell-item-header"><input type="checkbox" id="spell-${group}-${s.name.toLowerCase().replace(/[\s/]+/g, '-')}" name="${group}-selection" data-spell-name="${s.name}"><label for="spell-${group}-${s.name.toLowerCase().replace(/[\s/]+/g, '-')}" data-spell-slug="${s.name.toLowerCase().replace(/[\s/]+/g, '-')}">${s.name}</label></div></div>`);
        return html + `</div></div>`;
    };
    return `${renderGrid('Cantrips', allSpells.filter(s => s.level === 0).sort((a, b) => a.name.localeCompare(b.name)), cantrips, 'cantrip')}
            <div id="spell-description-display" class="summary-box"><p class="placeholder-text">Click a spell name to see its description.</p></div>
            ${renderGrid('1st-Level Spells', allSpells.filter(s => s.level === 1).sort((a, b) => a.name.localeCompare(b.name)), level1, 'level1')}`;
}
export function displaySpellDetails(label) {
    const spell = dataManager.getSpell(label.dataset.spellSlug);
    const displayBox = document.getElementById('spell-description-display');
    if (!spell || !displayBox)
        return;
    document.querySelectorAll('#spell-selection-page label[data-spell-slug]').forEach(lbl => lbl.classList.remove('active'));
    label.classList.add('active');
    displayBox.innerHTML = `<h4>${spell.name}</h4><ul>${Object.entries({
        Level: spell.level === 0 ? 'Cantrip' : spell.level, School: spell.school, 'Casting Time': spell.casting_time,
        Range: spell.range, Components: spell.components, Duration: spell.duration
    }).map(([key, value]) => `<li><strong>${key}:</strong> <span>${value}</span></li>`).join('')}</ul>
    <p><strong>Description:</strong></p><div class="spell-description-text">${createBlurb(spell.description)}</div>`;
}
// --- STARTING GEAR SELECTION ---
const MUSICAL_INSTRUMENTS = ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan flute', 'Shawm', 'Viol'];
/** Minimal HTML-attribute escaping for dynamically injected gear labels. */
function escapeGearText(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/** Returns canonical weapon names from the data store filtered by category. */
function getWeaponNamesByCategory(isMartial, meleeOnly) {
    const weapons = dataManager.getWeapons();
    if (!weapons)
        return [];
    return Object.values(weapons)
        .filter(w => (isMartial ? w.is_martial : w.is_simple) && (meleeOnly ? w.is_melee : true))
        .map(w => w.name)
        .sort((a, b) => a.localeCompare(b));
}
/**
 * Resolves a single equipment clause into either a fixed item or a selectable,
 * open-ended category (e.g. "any simple weapon", "any musical instrument").
 */
function resolveGearClause(clause) {
    const label = clause.trim().replace(/\s+/g, ' ');
    const lower = label.toLowerCase();
    const weaponMatch = lower.match(/(simple|martial)\s*(melee|ranged)?\s*weapons?/);
    if (weaponMatch) {
        const count = /\btwo\b|\b2\b/.test(lower) ? 2 : 1;
        const options = getWeaponNamesByCategory(weaponMatch[1] === 'martial', weaponMatch[2] === 'melee');
        if (options.length > 0)
            return { type: 'select', label, count, options };
    }
    if (/musical instrument/.test(lower)) {
        return { type: 'select', label, count: 1, options: MUSICAL_INSTRUMENTS };
    }
    return { type: 'fixed', label };
}
/** Splits a clause string into individual item clauses on commas / "and". */
function splitGearItems(text) {
    // Split on commas/semicolons first. Only fall back to splitting on " and "
    // for simple two-part phrases with no punctuation ("Leather armor and a
    // dagger"); otherwise "chemical and botanical samples" gets torn in half.
    const hasPunctuation = /[,;]/.test(text);
    const parts = hasPunctuation ? text.split(/\s*[,;]\s*/) : text.split(/\s+and\s+/i);
    return parts
        .map(s => s.replace(/^(?:and|or)\s+/i, '').trim())
        .filter(Boolean);
}
/** Parses a class's SRD equipment string into granted blocks and choice blocks. */
function parseClassEquipment(equipmentStr) {
    if (!equipmentStr)
        return [];
    return equipmentStr.split(';').map(s => s.trim()).filter(Boolean).map(segment => {
        const clean = segment.replace(/\.\s*$/, '').trim();
        if (/\([a-c]\)/i.test(clean)) {
            const options = clean.split(/\([a-c]\)/i)
                .map(p => p.replace(/,?\s+or\s*$/i, '').replace(/,\s*$/, '').trim())
                .filter(Boolean);
            return { kind: 'choice', options };
        }
        return { kind: 'granted', text: clean };
    });
}
/** Extracts the background's equipment description text, if any. */
function getBackgroundEquipmentText(backgroundData) {
    if (!backgroundData || !backgroundData.benefits)
        return '';
    const eq = backgroundData.benefits.find(b => b.type === 'equipment');
    return eq ? (eq.desc || '').replace(/\s+/g, ' ').replace(/\.\s*$/, '').trim() : '';
}
/** Renders a set of item clauses as fixed labels and/or resolver dropdowns. */
function renderGearClauses(clauses, idPrefix) {
    return clauses.map((clause, i) => {
        const resolved = resolveGearClause(clause);
        if (resolved.type === 'fixed') {
            const safe = escapeGearText(resolved.label);
            return `<span class="gear-item" data-item="${safe}">${safe}</span>`;
        }
        let selects = '';
        for (let n = 0; n < resolved.count; n++) {
            selects += `<select class="gear-select" data-prefix="${idPrefix}-${i}-${n}">` +
                resolved.options.map(o => `<option value="${escapeGearText(o)}">${escapeGearText(o)}</option>`).join('') +
                `</select>`;
        }
        return `<span class="gear-item gear-item-select"><em>${escapeGearText(resolved.label)}:</em> ${selects}</span>`;
    }).join(' ');
}
/** Builds the starting-gear selection UI from the chosen class and background. */
export function updateGearSelectionUI() {
    const page = document.getElementById('gear-selection-page');
    if (!page)
        return;
    const classData = dataManager.getClass(dom.charClassInput.value);
    const backgroundData = dataManager.getBackground(dom.charBackgroundInput.value);
    let html = '<div class="gear-selection-container">';
    html += `<p class="gear-intro">Choose your starting equipment. Granted items are included automatically; pick one option for each choice.</p>`;
    html += `<h4>From Class (${escapeGearText(classData ? classData.name : '—')})</h4>`;
    const classSegments = parseClassEquipment(classData ? classData.equipment : '');
    if (classSegments.length === 0) {
        html += `<p class="placeholder-text">No class starting equipment found.</p>`;
    }
    classSegments.forEach((seg, gi) => {
        if (seg.kind === 'granted') {
            html += `<div class="gear-granted-block" data-group="class-${gi}"><span class="gear-granted-label">Granted:</span> ${renderGearClauses(splitGearItems(seg.text), `class-${gi}`)}</div>`;
        }
        else {
            html += `<div class="gear-choice-block" data-group="class-${gi}"><p class="gear-choice-header">Choose one:</p>`;
            seg.options.forEach((opt, oi) => {
                const radioId = `gear-class-${gi}-${oi}`;
                html += `<div class="gear-option" data-option="${oi}">
                        <input type="radio" id="${radioId}" name="gear-class-${gi}" value="${oi}" ${oi === 0 ? 'checked' : ''}>
                        <span class="gear-option-content">${renderGearClauses(splitGearItems(opt), `class-${gi}-${oi}`)}</span>
                    </div>`;
            });
            html += `</div>`;
        }
    });
    const bgText = getBackgroundEquipmentText(backgroundData);
    html += `<h4>From Background (${escapeGearText(backgroundData ? backgroundData.name : '—')})</h4>`;
    if (bgText) {
        html += `<div class="gear-granted-block" data-group="background-0"><span class="gear-granted-label">Granted:</span> ${renderGearClauses(splitGearItems(bgText), 'background-0')}</div>`;
    }
    else {
        html += `<p class="placeholder-text">No background equipment.</p>`;
    }
    html += '</div>';
    page.innerHTML = html;
    updateGearSelectionState();
}
/** Enables resolver dropdowns only within the currently selected choice option. */
export function updateGearSelectionState() {
    const page = document.getElementById('gear-selection-page');
    if (!page)
        return;
    page.querySelectorAll('.gear-choice-block').forEach(block => {
        const selected = block.querySelector('input[type="radio"]:checked');
        const selectedOption = selected ? selected.value : null;
        block.querySelectorAll('.gear-option').forEach(optEl => {
            const isSelected = optEl.dataset.option === selectedOption;
            optEl.classList.toggle('gear-option-active', isSelected);
            optEl.querySelectorAll('.gear-select').forEach(sel => { sel.disabled = !isSelected; });
        });
    });
}
/** Collects the player's resolved starting gear as a list of concrete item strings. */
/** Copper value of each coin denomination, for totalling mixed starting coin. */
const COIN_VALUE_IN_COPPER = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
/**
 * Rolls any dice expression embedded in a gear description. Sourcebook gear
 * lists say things like "1d4 metal perfume bottles" or "4d4 gp", and that text
 * was previously written into the inventory verbatim, leaving the player with
 * an unrolled formula instead of an item count.
 * @param {string} text
 * @returns {string}
 */
function resolveGearDice(text) {
    return text.replace(/\b(\d*)d(\d+)\b/gi, (whole, count, sides) => {
        const rolled = rollDice(`${count || 1}d${sides}`).total;
        return rolled > 0 ? String(rolled) : whole;
    });
}
/**
 * Separates coins from the gear list. Backgrounds hand out entries like
 * "a silk purse containing 10 gp", which used to sit in the inventory AND be
 * counted as starting money - the same coins existing in two places. The coins
 * become the character's starting purse and the container stays as an item.
 * @param {string[]} gear
 * @returns {{gear: string[], gp: number}}
 */
function extractGearCoins(gear) {
    let copper = 0;
    const cleaned = [];
    gear.forEach(entry => {
        let foundCoins = false;
        const stripped = entry.replace(/(\d+)\s*(cp|sp|ep|gp|pp)\b/gi, (whole, amount, unit) => {
            copper += parseInt(amount, 10) * COIN_VALUE_IN_COPPER[unit.toLowerCase()];
            foundCoins = true;
            return '';
        });
        if (!foundCoins) {
            cleaned.push(entry);
            return;
        }
        // "a silk purse containing 10 gp" -> "a silk purse".
        // A bare "10 gp" entry disappears entirely into the purse total.
        const tidied = stripped
            .replace(/\b(containing|holding|worth|of)\s*$/i, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/[\s,]+$/, '')
            .trim();
        if (tidied && !/^(a|an|the)$/i.test(tidied))
            cleaned.push(tidied);
    });
    return { gear: cleaned, gp: Math.round(copper) / 100 };
}
function collectStartingGear() {
    const page = document.getElementById('gear-selection-page');
    const items = [];
    if (!page)
        return items;
    const pushFrom = (el) => {
        el.querySelectorAll('.gear-item[data-item]').forEach(s => { if (s.dataset.item) items.push(s.dataset.item); });
        el.querySelectorAll('.gear-select').forEach(sel => { if (!sel.disabled && sel.value) items.push(sel.value); });
    };
    page.querySelectorAll('.gear-granted-block').forEach(pushFrom);
    page.querySelectorAll('.gear-choice-block').forEach(block => {
        const selected = block.querySelector('input[type="radio"]:checked');
        if (!selected)
            return;
        const optEl = block.querySelector(`.gear-option[data-option="${selected.value}"]`);
        if (optEl)
            pushFrom(optEl);
    });
    // Tidy article casing and de-duplicate while preserving order.
    const seen = new Set();
    return items
        .map(s => resolveGearDice(s.replace(/\s+/g, ' ').trim()))
        .filter(Boolean)
        .filter(s => { const k = s.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
/** Finds the canonical equipped weapon name from a list of gear items. */
function findGearWeaponName(gear) {
    const weapons = dataManager.getWeapons();
    if (!weapons)
        return null;
    const keys = Object.keys(weapons);
    for (const item of gear) {
        const norm = item.toLowerCase();
        const key = keys.filter(k => norm.includes(k)).sort((a, b) => b.length - a.length)[0];
        if (key)
            return weapons[key].name;
    }
    return null;
}
/** Finds the canonical equipped (body) armor name from a list of gear items. */
function findGearArmorName(gear) {
    const armors = dataManager.getArmor();
    if (!armors)
        return null;
    const keys = Object.keys(armors);
    for (const item of gear) {
        const norm = item.toLowerCase();
        const key = keys.filter(k => norm.includes(k) && armors[k].category !== 'shield').sort((a, b) => b.length - a.length)[0];
        if (key)
            return armors[key].name;
    }
    return null;
}
// --- FORM SUBMISSION ---
export async function handleCharacterCreationSubmit(event) {
    event.preventDefault();
    if (!validatePage(currentPage))
        return;
    const { isGenerating, llmProvider } = gameState.getState();
    if (isGenerating || !llmProvider)
        return;
    const characterInfo = {
        name: dom.charNameInput.value.trim(), desc: dom.charDescInput.value.trim(), bio: dom.charBioInput.value.trim(),
        race: dom.charRaceInput.value, characterClass: dom.charClassInput.value, background: dom.charBackgroundInput.value,
        alignment: dom.charAlignmentInput.value.trim(), gender: dom.charGenderInput.value
    };
    const page4 = document.getElementById('spell-selection-page');
    if (page4) {
        characterInfo.spellsSelected = Array.from(page4.querySelectorAll('input[name$="-selection"]:checked')).map(cb => cb.dataset.spellName);
        const getValue = (name) => page4.querySelector(`input[name="${name}"]:checked`)?.value;
        characterInfo.fightingStyle = getValue('fightingStyle');
        characterInfo.divineDomain = getValue('divineDomain');
        characterInfo.rogueExpertise = Array.from(page4.querySelectorAll('input[name="rogueExpertise"]:checked')).map(cb => cb.value);
        characterInfo.favoredEnemy = getValue('favoredEnemy');
        characterInfo.naturalExplorer = getValue('naturalExplorer');
        characterInfo.sorcerousOrigin = getValue('sorcerousOrigin');
        characterInfo.draconicAncestry = getValue('draconicAncestry');
        characterInfo.otherworldlyPatron = getValue('otherworldlyPatron');
        characterInfo.startingFeat = getValue('startingFeat');
    }
    let specialSelectionsText = '\n--- CLASS SELECTIONS ---';
    const selections = {
        'Fighting Style': characterInfo.fightingStyle, 'Divine Domain': characterInfo.divineDomain,
        'Expertise': characterInfo.rogueExpertise?.join(', '), 'Favored Enemy': characterInfo.favoredEnemy,
        'Natural Explorer Terrain': characterInfo.naturalExplorer, 'Sorcerous Origin': characterInfo.sorcerousOrigin,
        'Draconic Ancestry': characterInfo.draconicAncestry, 'Otherworldly Patron': characterInfo.otherworldlyPatron,
        'Starting Feat': characterInfo.startingFeat,
        'Spells Selected': characterInfo.spellsSelected?.join(', ')
    };
    Object.entries(selections).forEach(([key, value]) => {
        if (value && value.length > 0)
            specialSelectionsText += `\n${key}: ${value}`;
    });
    const { gear: startingGear, gp: startingCoins } = extractGearCoins(collectStartingGear());
    characterInfo.startingGear = startingGear;
    characterInfo.startingCoins = startingCoins;
    const startingGearText = startingGear.length > 0
        ? `\n\n--- STARTING EQUIPMENT (use these EXACT items as the character's starting inventory and equipped gear; calculate AC from any armor/shield listed) ---\n${startingGear.join('; ')}${startingCoins > 0 ? `\nStarting coin: ${startingCoins} gp (already counted; do not also list coins as an item)` : ''}`
        : '';
    const finalAbilityScores = { ...pointBuyState.scores };
    const raceData = dataManager.getRace(characterInfo.race);
    if (raceData && raceData.ability_bonuses) {
        for (const [stat, bonus] of Object.entries(raceData.ability_bonuses)) {
            if (finalAbilityScores[stat] !== undefined) {
                finalAbilityScores[stat] += bonus;
            }
        }
    }
    const fullCharacterDescription = `This is the user's primary input for their character. PRIORITIZE THIS TEXT. If it contains a full character sheet (stats, skills, etc.), use it directly.\n\n--- USER'S FREE-TEXT DESCRIPTION ---\nName: ${characterInfo.name}\nAppearance: ${characterInfo.desc}\nBackstory: ${characterInfo.bio}\n--- END OF FREE-TEXT ---\n\nUse the following selections to fill in missing details:\nRace: ${characterInfo.race}\nClass: ${characterInfo.characterClass}\nBackground: ${characterInfo.background}\nAlignment: ${characterInfo.alignment}\nGender: ${characterInfo.gender}\nAbility Scores: Str ${finalAbilityScores.strength}, Dex ${finalAbilityScores.dexterity}, Con ${finalAbilityScores.constitution}, Int ${finalAbilityScores.intelligence}, Wis ${finalAbilityScores.wisdom}, Cha ${finalAbilityScores.charisma}${specialSelectionsText}${startingGearText}`;
    dom.characterCreationModal.classList.add('hidden');
    dom.storyHooksModal.classList.remove('hidden');
    dom.storyHooksContainer.innerHTML = `<div class="spinner-container"><div class="spinner"></div><span>The Storyteller is crafting your character and adventure... This may take a moment.</span></div>`;
    try {
        const { isMatureEnabled } = gameState.getState();
        const { playerState, storyHooks } = await llmProvider.createCharacterSheet(characterInfo, fullCharacterDescription, isMatureEnabled);
        playerState.turnCount = 0;
        playerState.pregnancy = null;
        playerState.npcStates = {};
        // --- REBUILD CORE STATS FROM CANONICAL DATA ---
        // 1. Enforce final calculated ability scores to override any AI deviation.
        playerState.abilityScores = finalAbilityScores;
        // 1b. Level-1 hit points are a rules calculation, not a creative choice:
        // a full hit die plus the Constitution modifier. The AI used to supply
        // this number and would drift by a point or two.
        const hpClassData = dataManager.getClass(characterInfo.characterClass);
        if (hpClassData?.hit_die) {
            const conMod = getAbilityModifierValue(finalAbilityScores.constitution);
            const maxHp = Math.max(1, Number(hpClassData.hit_die) + conMod);
            playerState.health = { current: maxHp, max: maxHp };
        }
        // 2. Rebuild Traits & Features to prevent duplicates/naming issues from AI
        playerState.racialTraits = [];
        playerState.classFeatures = [];
        // Feats are canonical from the form: only the chosen starting feat (if any),
        // so the AI cannot invent feats from the backstory text.
        playerState.feats = characterInfo.startingFeat ? [characterInfo.startingFeat] : [];
        const raceData = dataManager.getRace(characterInfo.race);
        if (raceData) {
            playerState.racialTraits.push(...raceData.traits.map(t => t.name).filter(n => !BOILERPLATE_TRAIT_REGEX.test(n.trim())));
        }
        const classData = dataManager.getClass(characterInfo.characterClass);
        if (classData?.features) {
            playerState.classFeatures.push(...classData.features.filter(f => f.level === 1).map(f => f.name));
        }
        const backgroundData = dataManager.getBackground(characterInfo.background);
        if (backgroundData?.benefits) {
            playerState.classFeatures.push(...backgroundData.benefits.filter(b => b.type === 'feature').map(b => b.name));
        }
        playerState.racialTraits = [...new Set(playerState.racialTraits)];
        playerState.classFeatures = [...new Set(playerState.classFeatures)];
        // 3. Rebuild Skills from form selections to ensure user choice is respected
        const finalSkills = { ...DEFAULT_SKILLS };
        const skillContainer = document.getElementById('skill-selection-container');
        if (skillContainer) {
            skillContainer.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                const input = cb;
                if (input.value) {
                    finalSkills[input.value] = 'proficient';
                }
            });
        }
        // Expertise doubles the proficiency bonus, so those skills are marked
        // 'expert'. Previously the choice was recorded on characterInfo only and
        // had no mechanical effect once play started.
        (characterInfo.rogueExpertise || []).forEach(skillName => {
            const key = resolveSkillKey(skillName);
            if (key && finalSkills[key] !== undefined)
                finalSkills[key] = 'expert';
        });
        playerState.skills = finalSkills;
        // 4. Rebuild Saving Throws from class data
        if (classData) {
            const profSaves = classData.prof_saving_throws.toLowerCase().split(', ');
            const finalSaves = { ...DEFAULT_SAVING_THROWS };
            Object.keys(finalSaves).forEach(key => finalSaves[key] = 'none'); // Reset
            profSaves.forEach(save => {
                if (save.includes('str'))
                    finalSaves.strength = 'proficient';
                if (save.includes('dex'))
                    finalSaves.dexterity = 'proficient';
                if (save.includes('con'))
                    finalSaves.constitution = 'proficient';
                if (save.includes('int'))
                    finalSaves.intelligence = 'proficient';
                if (save.includes('wis'))
                    finalSaves.wisdom = 'proficient';
                if (save.includes('cha'))
                    finalSaves.charisma = 'proficient';
            });
            playerState.savingThrows = finalSaves;
        }
        // 5. Set spells from form selections
        playerState.spellsKnown = characterInfo.spellsSelected;
        // 6. Rebuild starting equipment & inventory from the player's gear selections
        if (startingGear.length > 0) {
            playerState.inventory = [...startingGear];
            const equippedWeapon = findGearWeaponName(startingGear);
            const equippedArmor = findGearArmorName(startingGear);
            playerState.equipment = {
                weapon: equippedWeapon || 'Unarmed',
                armor: equippedArmor || 'None'
            };
            // Recalculate AC now that armor/shield are canonical (shields detected from inventory).
            playerState.armorClass = calculateArmorClass(playerState);
        }
        // Coins pulled out of the gear list are the character's purse. Without
        // this the AI's guess stood, and the coins were double counted.
        if (startingCoins > 0) {
            playerState.money = { amount: startingCoins, currency: 'gp' };
        }
        // --- END REBUILD ---
        gameState.updateState({ characterInfo, playerState });
        ui.updatePlayerStateUI(playerState, characterInfo);
        dom.characterForm.reset();
        resetPointBuy();
        setupInitialPage();
        const finalHooks = Array.isArray(storyHooks) ? storyHooks : (storyHooks.storyHooks || []);
        ui.displayStoryHooks(finalHooks, startAdventure);
        const newCharacterId = Date.now().toString();
        gameState.updateState({ currentCharacterId: newCharacterId });
        game.addNewSave({ id: newCharacterId, characterInfo, playerState, chatHistory: [], currentModelIndex: llmProvider.getCurrentModelIndex() });
        await initializeChatSession();
    }
    catch (error) {
        console.error("Failed to generate character sheet:", error);
        ui.addMessage('error', `The storyteller had trouble creating your character. Try again or simplify your description. Error: ${error.message}`);
        dom.storyHooksModal.classList.add('hidden');
        ui.showCharacterCreation();
    }
}
export function handleCustomHookSubmit(event) {
    event.preventDefault();
    const customHook = dom.customHookInput.value.trim();
    if (customHook)
        startAdventure(customHook);
}
// --- LEVEL UP WIZARD ---
/**
 * Works out how many new cantrips and spells a class learns when moving between
 * two levels, using the upstream class progression table.
 * @param {string} className
 * @param {number} fromLevel
 * @param {number} toLevel
 * @returns {{cantrips: number, spells: number}}
 */
function getSpellGains(className, fromLevel, toLevel) {
    const delta = (column) => Math.max(0,
        dataManager.getProgressionValue(className, column, toLevel) -
        dataManager.getProgressionValue(className, column, fromLevel));
    const gains = { cantrips: delta('cantrips-known'), spells: delta('spells-known') };
    // Wizards have no "spells known" column: they add two spells to their
    // spellbook each level instead (SRD Spellbook feature).
    if (className && className.toLowerCase() === 'wizard' && toLevel > fromLevel) {
        gains.spells = 2 * (toLevel - fromLevel);
    }
    return gains;
}
/** Builds the level-up spell picker for whichever spell levels are now available. */
function renderLevelUpSpellChoices(className, playerState, gains) {
    const spellList = dataManager.getSpellList(className);
    if (!spellList)
        return `<p class="error-message">No spell list found for ${className}.</p>`;
    const known = new Set((playerState.spellsKnown || []).map(s => String(s).toLowerCase()));
    const all = spellList.spells.map(s => dataManager.getSpell(s)).filter(Boolean);
    // Highest spell level this character can now cast, from the slot columns.
    let maxSpellLevel = 1;
    for (let lvl = 9; lvl >= 1; lvl--) {
        const col = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'][lvl - 1];
        if (dataManager.getProgressionValue(className, col, levelUpState.targetLevel) > 0) { maxSpellLevel = lvl; break; }
    }
    const slotLevelRaw = dataManager.getClassProgression(className)?.['slot-level']?.[levelUpState.targetLevel - 1];
    if (slotLevelRaw) {
        const n = parseInt(String(slotLevelRaw), 10);
        if (Number.isFinite(n)) maxSpellLevel = n; // Warlock-style single slot level
    }
    const grid = (title, spells, limit, group) => {
        if (!spells.length || limit <= 0)
            return '';
        return `<div class="spell-list choice-block"><h4>${title} (Choose ${limit})</h4><div class="spell-grid">` +
            spells.map(s => {
                const id = `lu-${group}-${s.name.toLowerCase().replace(/[\s/]+/g, '-')}`;
                return `<div class="spell-item"><div class="spell-item-header"><input type="checkbox" id="${id}" name="${group}-levelup" data-spell-name="${s.name}"><label for="${id}">${s.name}</label></div></div>`;
            }).join('') + `</div></div>`;
    };
    const avail = (predicate) => all.filter(s => predicate(s) && !known.has(String(s.name).toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));
    let html = `<h4>New Magic</h4><p>Your growing power grants you new magic. Choose below.</p>`;
    html += grid('New Cantrips', avail(s => s.level === 0), gains.cantrips, 'cantrip');
    html += grid(`New Spells (up to level ${maxSpellLevel})`, avail(s => s.level >= 1 && s.level <= maxSpellLevel), gains.spells, 'spell');
    return html;
}
function renderLevelUpPage(page) {
    if (!levelUpState)
        return;
    const { playerState, characterInfo } = gameState.getState();
    if (!playerState || !characterInfo)
        return;
    const classData = dataManager.getClass(characterInfo.characterClass);
    if (!classData)
        return;
    let html = '';
    const container = dom.levelUpPagesContainer;
    container.innerHTML = '';
    // Update buttons and step indicator
    dom.levelUpPrevBtn.classList.toggle('hidden', page === 1);
    if (levelUpState.totalPages === 1) {
        dom.levelUpNextBtn.textContent = 'Finish Level Up';
    }
    else {
        dom.levelUpNextBtn.textContent = (page === levelUpState.totalPages) ? 'Finish Level Up' : 'Next >';
    }
    const stepIndicator = dom.levelUpStepIndicator;
    stepIndicator.innerHTML = '';
    for (let i = 1; i <= levelUpState.totalPages; i++) {
        const dot = document.createElement('div');
        dot.className = `step-dot ${i === page ? 'active' : ''}`;
        dot.dataset.step = String(i);
        stepIndicator.appendChild(dot);
    }
    switch (page) {
        case 1:
            // Page 1: HP and new features
            const conMod = getAbilityModifierValue(playerState.abilityScores.constitution);
            const hitDie = classData.hit_die;
            // Roll HP, but take average if it's better.
            const hpRoll = Math.max(Math.floor(Math.random() * hitDie) + 1, Math.floor(hitDie / 2) + 1);
            levelUpState.choices.hpRoll = hpRoll + conMod;
            const newProficiencyBonus = calculateProficiencyBonus(levelUpState.targetLevel);
            const profBonusIncreased = newProficiencyBonus > playerState.proficiencyBonus;
            levelUpState.newFeatures = classData.features?.filter(f => f.level === levelUpState.targetLevel).map(f => f.name) || [];
            html += `<h4>Hit Points</h4>`;
            html += `<p>Your maximum Hit Points increase by <strong>${levelUpState.choices.hpRoll}</strong> (1d${hitDie} + ${conMod} Constitution Modifier). Your new maximum HP will be ${playerState.health.max + levelUpState.choices.hpRoll}.</p>`;
            if (profBonusIncreased) {
                html += `<h4>Proficiency Bonus</h4>`;
                html += `<p>Your Proficiency Bonus has increased to <strong>+${newProficiencyBonus}</strong>!</p>`;
            }
            if (levelUpState.newFeatures.length > 0) {
                html += `<h4>New Features</h4><ul>`;
                levelUpState.newFeatures.forEach(featureName => {
                    const featureData = classData.features?.find(f => f.name === featureName);
                    html += `<li><strong>${featureName}:</strong> ${featureData ? createBlurb(featureData.desc) : ''}</li>`;
                });
                html += `</ul>`;
            }
            else if (!profBonusIncreased) {
                html += `<p>You gain no new class features at this level.</p>`;
            }
            break;
        case 2:
            // Ability Score Improvement. Only render it if this level actually
            // grants one - page 2 may instead be the new-spells page.
            if (levelUpState.asiPage !== 2)
                break;
            html += `<h4>Ability Score Improvement</h4>`;
            html += `<p>You can increase one ability score by 2, or two ability scores by 1. You have <strong id="asi-points-remaining">2</strong> points remaining.</p>`;
            html += `<div class="asi-container">`;
            for (const [stat, score] of Object.entries(playerState.abilityScores)) {
                html += `
                    <div class="asi-stat">
                        <label>${stat.charAt(0).toUpperCase() + stat.slice(1)}</label>
                        <span>${score}</span>
                        <button type="button" class="stat-btn increase-btn" data-stat="${stat}">+</button>
                    </div>
                 `;
            }
            html += `</div>`;
            html += `<button type="button" id="asi-reset-btn" class="secondary-btn">Reset Points</button>`;
            break;
    }
    // The spell page's position depends on whether this level also grants an ASI.
    if (levelUpState.spellPage && page === levelUpState.spellPage) {
        html = renderLevelUpSpellChoices(characterInfo.characterClass, playerState, levelUpState.gains);
    }
    const pageElement = document.createElement('div');
    pageElement.className = 'level-up-page active';
    pageElement.innerHTML = html;
    container.appendChild(pageElement);
    if (page === levelUpState.asiPage) {
        setupAsiListeners();
        document.getElementById('asi-reset-btn')?.addEventListener('click', () => {
            renderLevelUpPage(levelUpState.asiPage);
        });
    }
    if (levelUpState.spellPage && page === levelUpState.spellPage) {
        // Stop the player selecting more than the level grants.
        const enforce = (group, limit) => {
            const boxes = [...pageElement.querySelectorAll(`input[name="${group}-levelup"]`)];
            const update = () => {
                const checked = boxes.filter(b => b.checked).length;
                boxes.forEach(b => { if (!b.checked) b.disabled = checked >= limit; });
            };
            boxes.forEach(b => b.addEventListener('change', update));
            update();
        };
        enforce('cantrip', levelUpState.gains.cantrips);
        enforce('spell', levelUpState.gains.spells);
    }
}
function setupAsiListeners() {
    const container = dom.levelUpPagesContainer.querySelector('.asi-container');
    if (!container || !levelUpState)
        return;
    levelUpState.choices.asi = [];
    const newContainer = container.cloneNode(true);
    container.parentNode.replaceChild(newContainer, container);
    newContainer.addEventListener('click', (event) => {
        if (!levelUpState)
            return;
        const button = event.target.closest('.increase-btn');
        if (!button)
            return;
        const stat = button.dataset.stat;
        const pointsSpent = levelUpState.choices.asi.reduce((sum, choice) => sum + choice.points, 0);
        if (pointsSpent >= 2)
            return;
        const choice = levelUpState.choices.asi.find(c => c.stat === stat);
        if (choice) {
            if (choice.points === 1 && pointsSpent === 1) {
                choice.points = 2;
            }
        }
        else {
            levelUpState.choices.asi.push({ stat, points: 1 });
        }
        updateAsiUi();
    });
}
function updateAsiUi() {
    if (!levelUpState)
        return;
    const { playerState } = gameState.getState();
    if (!playerState)
        return;
    const pointsSpent = levelUpState.choices.asi.reduce((sum, choice) => sum + choice.points, 0);
    const pointsRemainingEl = document.getElementById('asi-points-remaining');
    if (pointsRemainingEl) {
        pointsRemainingEl.textContent = String(2 - pointsSpent);
    }
    const container = dom.levelUpPagesContainer.querySelector('.asi-container');
    if (!container)
        return;
    Object.keys(playerState.abilityScores).forEach(stat => {
        const choice = levelUpState.choices.asi.find(c => c.stat === stat);
        const pointsAdded = choice ? choice.points : 0;
        const scoreDisplay = container.querySelector(`[data-stat="${stat}"]`)?.previousElementSibling;
        const button = container.querySelector(`[data-stat="${stat}"]`);
        if (scoreDisplay) {
            scoreDisplay.textContent = `${playerState.abilityScores[stat] + pointsAdded}`;
        }
        if (button) {
            const statAlreadyChosen = levelUpState.choices.asi.some(c => c.stat === stat);
            const canAddSecondPoint = statAlreadyChosen && pointsSpent === 1 && (levelUpState.choices.asi.find(c => c.stat === stat)?.points === 1);
            button.disabled = pointsSpent >= 2 || (statAlreadyChosen && !canAddSecondPoint);
        }
    });
}
function validateLevelUpPage(page) {
    if (!levelUpState)
        return false;
    if (page === levelUpState.asiPage) {
        const pointsSpent = levelUpState.choices.asi?.reduce((acc, c) => acc + c.points, 0) || 0;
        if (pointsSpent !== 2) {
            alert('You must spend exactly 2 points for your Ability Score Improvement.');
            return false;
        }
    }
    if (levelUpState.spellPage && page === levelUpState.spellPage) {
        const container = dom.levelUpPagesContainer;
        const picked = (group) => [...container.querySelectorAll(`input[name="${group}-levelup"]:checked`)];
        const cantrips = picked('cantrip');
        const spells = picked('spell');
        const errors = [];
        if (cantrips.length !== levelUpState.gains.cantrips)
            errors.push(`Choose exactly ${levelUpState.gains.cantrips} new cantrip(s). You have chosen ${cantrips.length}.`);
        if (spells.length !== levelUpState.gains.spells)
            errors.push(`Choose exactly ${levelUpState.gains.spells} new spell(s). You have chosen ${spells.length}.`);
        if (errors.length) {
            alert(errors.join('\n'));
            return false;
        }
        levelUpState.choices.newSpells = [...cantrips, ...spells].map(cb => cb.dataset.spellName);
    }
    return true;
}
function applyLevelUp() {
    if (!levelUpState)
        return;
    const { playerState } = gameState.getState();
    if (!playerState)
        return;
    const playerStateUpdate = {
        level: levelUpState.targetLevel,
        health: {
            current: playerState.health.max + levelUpState.choices.hpRoll,
            max: playerState.health.max + levelUpState.choices.hpRoll
        },
        proficiencyBonus: calculateProficiencyBonus(levelUpState.targetLevel),
        classFeatures: [...playerState.classFeatures, ...levelUpState.newFeatures],
    };
    if (levelUpState.choices.newSpells && levelUpState.choices.newSpells.length > 0) {
        playerStateUpdate.spellsKnown = [
            ...new Set([...(playerState.spellsKnown || []), ...levelUpState.choices.newSpells])
        ];
    }
    if (levelUpState.choices.asi && levelUpState.choices.asi.length > 0) {
        const newScores = { ...playerState.abilityScores };
        levelUpState.choices.asi.forEach(choice => {
            newScores[choice.stat] += choice.points;
        });
        playerStateUpdate.abilityScores = newScores;
    }
    gameState.updatePlayerState(playerStateUpdate);
    // Recalculate derived stats like AC after potential Dex increase
    const finalState = gameState.getState().playerState;
    ui.updatePlayerStateUI(finalState, gameState.getState().characterInfo);
    saveCurrentGame();
    initializeChatSession();
    dom.levelUpModal.classList.add('hidden');
    levelUpState = null;
}
export function startLevelUp() {
    const { playerState, characterInfo } = gameState.getState();
    if (!playerState || !characterInfo)
        return;
    const classData = dataManager.getClass(characterInfo.characterClass);
    if (!classData)
        return;
    const targetLevel = playerState.level + 1;
    const newFeaturesData = classData.features?.filter(f => f.level === targetLevel) || [];
    const hasASI = newFeaturesData.some(f => f.name === 'Ability Score Improvement');
    // How many new spells/cantrips this level grants, straight from the class table.
    const gains = getSpellGains(characterInfo.characterClass, playerState.level, targetLevel);
    const hasSpellGain = (gains.cantrips + gains.spells) > 0;
    levelUpState = {
        targetLevel,
        currentPage: 1,
        totalPages: 1 + (hasASI ? 1 : 0) + (hasSpellGain ? 1 : 0),
        asiPage: hasASI ? 2 : null,
        spellPage: hasSpellGain ? (hasASI ? 3 : 2) : null,
        gains,
        choices: { asi: [], newSpells: [] },
        newFeatures: [],
    };
    dom.levelUpTitle.textContent = `Level Up: ${characterInfo.name} reaches Level ${targetLevel}!`;
    renderLevelUpPage(1);
    dom.levelUpModal.classList.remove('hidden');
}
export function handleLevelUpNext() {
    if (!levelUpState || !validateLevelUpPage(levelUpState.currentPage))
        return;
    if (levelUpState.currentPage < levelUpState.totalPages) {
        levelUpState.currentPage++;
        renderLevelUpPage(levelUpState.currentPage);
    }
    else {
        applyLevelUp();
    }
}
export function handleLevelUpPrev() {
    if (!levelUpState || levelUpState.currentPage <= 1)
        return;
    levelUpState.currentPage--;
    renderLevelUpPage(levelUpState.currentPage);
}
