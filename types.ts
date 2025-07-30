/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Content, Part, GenerateContentResponse } from '@google/genai';
import { LLMChat } from './llm-provider';

// --- TYPE DEFINITIONS for SpeechRecognition (Microphone Input) ---
export interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onend: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

declare global {
  interface Window {
    SpeechRecognition: { new(): SpeechRecognition };
    webkitSpeechRecognition: { new(): SpeechRecognition };
    AudioContext: { new(): AudioContext };
  }
}

// --- PROVIDER & SETTINGS INTERFACES ---
export type LLMProviderType = 'gemini' | 'local';

export interface ProviderSettings {
    provider: LLMProviderType;
    apiKey: string | null;
    localUrl: string | null;
}


// --- GAME STATE INTERFACES ---

export interface PregnancyState {
    isPregnant: boolean;
    conceptionTurn: number;
    sire: string;
    knowledgeRevealed: boolean;
}

// New interface for Ability Scores
export interface AbilityScores {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
}

export interface PlayerState {
    name: string;
    backstory: string;
    appearanceDescription: string;
    alignment: string;
    health: { current: number; max: number };
    location: string;
    money: { amount: number; currency: string };
    inventory: string[];
    equipment: { weapon: string; armor: string; };
    party: string[];
    quests: { name: string; description: string; }[];
    exp: number;
    turnCount: number; // Tracks number of player actions as a proxy for time
    pregnancy: PregnancyState | null;
    npcStates: Record<string, { pregnancy: PregnancyState | null }>;
    // TTRPG additions
    level: number;
    proficiencyBonus: number; // Derived from level (e.g., +2 at levels 1-4)
    armorClass: number; // Calculated based on armor, Dexterity, etc.
    speed: number; // Base walking speed in feet
    abilityScores: AbilityScores;
    // Skills and Saving Throws as records where key is skill/save name, value is 'proficient' or 'none'
    skills: {
        acrobatics: 'proficient' | 'none';
        animalHandling: 'proficient' | 'none';
        arcana: 'proficient' | 'none';
        athletics: 'proficient' | 'none';
        culture: 'proficient' | 'none';
        deception: 'proficient' | 'none';
        engineering: 'proficient' | 'none';
        history: 'proficient' | 'none';
        insight: 'proficient' | 'none';
        intimidation: 'proficient' | 'none';
        investigation: 'proficient' | 'none';
        medicine: 'proficient' | 'none';
        nature: 'proficient' | 'none';
        perception: 'proficient' | 'none';
        performance: 'proficient' | 'none';
        persuasion: 'proficient' | 'none';
        religion: 'proficient' | 'none';
        sleightOfHand: 'proficient' | 'none';
        stealth: 'proficient' | 'none';
        survival: 'proficient' | 'none';
    };
    savingThrows: {
        strength: 'proficient' | 'none';
        dexterity: 'proficient' | 'none';
        constitution: 'proficient' | 'none';
        intelligence: 'proficient' | 'none';
        wisdom: 'proficient' | 'none';
        charisma: 'proficient' | 'none';
    };
    feats: string[]; // List of feat names, AI interprets their effects
    racialTraits: string[]; // Key racial abilities/features for AI to remember
    classFeatures: string[]; // Key class features for AI to remember
}

export interface CharacterInfo {
    name: string;
    desc: string;
    bio: string;
    gender: 'male' | 'female';
    // TTRPG additions
    race: string;
    characterClass: string;
    background: string; // e.g., "Urchin", "Soldier", "Noble"
    alignment: string; // e.g., "Chaotic Good", "Lawful Evil"
}

export interface SaveSlot {
    id: string;
    characterInfo: CharacterInfo;
    playerState: PlayerState;
    chatHistory: Content[];
    currentModelIndex: number;
}

export type DiceRollContent = {
    description: string;
    roll: number;
    modifier: number;
    total: number;
    dieValue: number;
    diceString: string; // e.g., "d20+5"
    skillOrAbility: string; // e.g., "Athletics"
    allRolls: number[];
    rollModifier?: 'ADVANTAGE' | 'DISADVANTAGE' | 'NONE';
};

export type AttackRollContent = {
    description: string;
    weaponName: string;
    attackRoll: number;
    attackBonus: number;
    totalAttackRoll: number;
    damageRoll: number;
    damageBonus: number;
    totalDamage: number;
    damageDice: string;
    isCritical: boolean;
    allRolls: number[];
    rollModifier?: 'ADVANTAGE' | 'DISADVANTAGE' | 'NONE';
};

export type RagStatus = 'idle' | 'initializing' | 'building' | 'ready' | 'error' | 'unsupported';