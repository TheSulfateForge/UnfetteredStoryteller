/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, GenerateContentResponse } from '@google/genai';
import { LLMProvider, LLMChat } from './llm-provider';
import { CharacterInfo, PlayerState } from './types';
import * as config from './config';

/**
 * Extracts, sanitizes, and parses a JSON string from an LLM's raw output.
 * It is designed to be resilient to common LLM errors like conversational text,
 * markdown fences, and trailing commas.
 * @param rawText The raw string response from the LLM.
 * @returns The parsed JSON object.
 * @throws An error if no JSON object can be found or if parsing fails.
 */
function sanitizeAndParseJson(rawText: string): any {
  // Step 1: Find the JSON blob, ignoring conversational text and markdown fences.
  let jsonString = rawText.trim();

  const markdownMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
    jsonString = markdownMatch[1].trim();
  }

  const firstBrace = jsonString.indexOf('{');
  const firstBracket = jsonString.indexOf('[');
  
  let firstCharIndex = -1;
  let endChar = '';

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      firstCharIndex = firstBrace;
      endChar = '}';
  } else if (firstBracket !== -1) {
      firstCharIndex = firstBracket;
      endChar = ']';
  }

  if (firstCharIndex === -1) {
      throw new Error(`The model's response did not contain a valid JSON object or array. Raw response: "${rawText}"`);
  }

  const lastCharIndex = jsonString.lastIndexOf(endChar);

  if (lastCharIndex === -1 || lastCharIndex < firstCharIndex) {
    throw new Error(`The model's response did not contain a valid JSON object or array. Raw response: "${rawText}"`);
  }

  jsonString = jsonString.substring(firstCharIndex, lastCharIndex + 1);

  // Step 2: Sanitize the string to fix common syntax errors.
  // This is a more robust way to handle invalid JSON from LLMs.
  // It handles unescaped newlines inside strings, which is a common error.
  let sanitized = '';
  let inString = false;
  let isEscaped = false;

  for (const char of jsonString) {
    if (inString) {
      if (isEscaped) {
        // Previous character was '\', so this one is escaped
        sanitized += char;
        isEscaped = false;
      } else if (char === '\\') {
        sanitized += char;
        isEscaped = true;
      } else if (char === '"') {
        sanitized += char;
        inString = false;
      } else if (char === '\n') {
        sanitized += '\\n';
      } else if (char === '\r') {
        // Often part of \r\n, we handle \n, so we can ignore \r
      } else {
        sanitized += char;
      }
    } else { // Not in string
      if (char === '"') {
        sanitized += char;
        inString = true;
        isEscaped = false;
      } else {
        sanitized += char;
      }
    }
  }
  
  // Also remove trailing commas
  const finalJson = sanitized.replace(/,\s*([}\]])/g, '$1');

  // Step 3: Parse the sanitized string.
  try {
    return JSON.parse(finalJson);
  } catch (error: any) {
    console.error("Failed to parse JSON even after sanitization.", { rawText, sanitizedString: finalJson });
    throw new Error(`Failed to parse the model's JSON response: ${error.message}`);
  }
}

/**
 * Transforms a parsed JSON object into the rigid schema the application expects.
 * This acts as a safety net if the LLM produces a valid but structurally incorrect JSON.
 * @param parsedJson The parsed JSON object from the LLM.
 * @returns A guaranteed-to-be-correctly-structured object.
 * @throws An error if the transformed object is missing critical data.
 */
function transformToExpectedSchema(parsedJson: any): { playerState: PlayerState, storyHooks: any[] } {
    // If the playerState key already exists and is correct, the model behaved perfectly.
    if (parsedJson.playerState && parsedJson.storyHooks) {
        return parsedJson;
    }

    // Otherwise, the model likely returned a flat structure. We must build the correct one.
    console.warn("Model returned a flat JSON structure. Transforming to the expected schema.");
    
    const playerState: Partial<PlayerState> = {};
    const storyHooks: any[] = parsedJson.storyHooks || [];
    
    // A correct list of all keys that belong in the initial playerState object.
    const playerStateKeys = [
        'health', 'location', 'money', 'inventory', 'equipment', 'party',
        'quests', 'exp', 'level', 'proficiencyBonus', 'armorClass', 'speed',
        'abilityScores', 'skills', 'savingThrows', 'feats', 'racialTraits',
        'classFeatures'
    ];
    
    // Iterate over the keys in the flat object and move them into the new playerState object.
    for (const key in parsedJson) {
        // A special check for 'stats', as the model might use this key instead of 'abilityScores'.
        if (key.toLowerCase() === 'stats' || key.toLowerCase() === 'abilityscores') {
             playerState.abilityScores = parsedJson[key];
        } else if (playerStateKeys.includes(key)) {
            (playerState as any)[key] = parsedJson[key];
        }
    }

    // A final check to ensure the transformation was successful with valid keys.
    if (playerState.level === undefined || !playerState.abilityScores) {
        throw new Error("Transformed object is missing critical playerState data (like level or abilityScores).");
    }

    return { playerState: playerState as PlayerState, storyHooks };
}


class LocalLLMChat implements LLMChat {
    private history: { role: 'user' | 'assistant' | 'system', content: string }[] = [];
    private systemPrompt: string;
    private apiUrl: string;

    constructor(apiUrl: string, systemPrompt: string, initialHistory: Content[]) {
        this.apiUrl = apiUrl;
        this.systemPrompt = systemPrompt;
        this.history.push({ role: 'system', content: systemPrompt });

        const maxHistoryMessages = 10; // Keep last 5 turns of conversation
        const recentHistory = initialHistory.slice(-maxHistoryMessages);

        recentHistory.forEach(h => {
            this.history.push({
                role: h.role === 'model' ? 'assistant' : 'user',
                content: (h.parts as { text: string }[]).map(p => p.text).join('')
            });
        });
    }

    async sendMessageStream(params: { message: string }): Promise<AsyncGenerator<GenerateContentResponse>> {
        const self = this;

        async function* generator(): AsyncGenerator<GenerateContentResponse> {
            self.history.push({ role: 'user', content: params.message });

            const maxHistoryMessages = 10; // Keep the last 10 messages (5 turns)
            const systemPrompt = self.history[0]; // Assumes system prompt is always first
            const conversation = self.history.slice(1);
            const recentConversation = conversation.slice(-maxHistoryMessages);
            const messagesToSend = [systemPrompt, ...recentConversation];

            let response;
            try {
                response = await fetch(self.apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'local-model',
                        messages: messagesToSend,
                        stream: true,
                    }),
                });
            } catch (networkError) {
                console.error("Local LLM network error during chat:", networkError);
                throw new Error(`The request to your local LLM server failed. Please ensure the server (e.g., text-generation-webui) is running, the URL in Settings is correct, and the server is configured for CORS. If the server is running, check its console output for errors; some extensions (like Silero TTS) can cause issues with API requests.`);
            }

            if (!response.ok) {
                const errorBody = await response.text();
                console.error("Local LLM fetch error:", response.status, errorBody);
                throw new Error(`The local LLM server returned an error (${response.status}). Please check the server console for details. Some server extensions can cause issues with API requests. Error: ${errorBody}`);
            }

            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullResponse = '';
            let doneStreaming = false;

            while (!doneStreaming) {
                const { value, done } = await reader.read();
                if (done) {
                    doneStreaming = true;
                    buffer += decoder.decode(undefined, { stream: false });
                } else {
                    buffer += decoder.decode(value, { stream: true });
                }

                let boundary = buffer.indexOf('\n');
                while (boundary !== -1) {
                    const line = buffer.substring(0, boundary).trim();
                    buffer = buffer.substring(boundary + 1);

                    if (line.startsWith('data: ')) {
                        const data = line.substring(6).trim();
                        if (data === '[DONE]') {
                            doneStreaming = true;
                            break;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            const textChunk = parsed.choices?.[0]?.delta?.content || '';
                            if (textChunk) {
                                fullResponse += textChunk;
                                yield { text: textChunk } as GenerateContentResponse;
                            }
                        } catch (e) {
                            console.warn("Could not parse stream chunk, waiting for more data:", data);
                        }
                    }
                    boundary = buffer.indexOf('\n');
                }
            }
            
            self.history.push({ role: 'assistant', content: fullResponse });

            const currentConversation = self.history.slice(1);
            if (currentConversation.length > maxHistoryMessages) {
                const truncatedConversation = currentConversation.slice(-maxHistoryMessages);
                self.history = [systemPrompt, ...truncatedConversation];
            }
        }

        return generator();
    }
}


export class LocalLLMProvider implements LLMProvider {
  private apiUrl: string;

  constructor(apiUrl: string) {
    if (!apiUrl) throw new Error("Local LLM Provider requires an API URL.");
    this.apiUrl = apiUrl;
  }

  public async useNextModel(): Promise<boolean> {
    return false; // Local LLM does not support fallback models.
  }

  public getCurrentModel(): string {
      return 'local-model';
  }

  public getCurrentModelIndex(): number {
      return 0;
  }

  public setCurrentModelIndex(index: number): void {
      // No-op for local provider.
  }

  private getSystemInstructionContent(charInfo: CharacterInfo, pState: PlayerState, isMature: boolean): string {
    const getAbilityModifier = (score: number): string => {
        const mod = Math.floor((score - 10) / 2);
        return mod >= 0 ? `+${mod}` : String(mod);
    }
    
    let instruction = `You are an expert game master for a fantasy tabletop RPG. Your goal is a compelling, interactive story, using rules inspired by common d20 fantasy systems.

**Primary Directive: Player Character Data**
This is the player character. This data is ABSOLUTE TRUTH.
- **Name:** ${charInfo.name} (${charInfo.gender}, ${charInfo.race} ${charInfo.characterClass})
- **Description & Backstory:** ${charInfo.desc} ${charInfo.bio}
- **Level:** ${pState.level} (Proficiency Bonus: +${pState.proficiencyBonus})
- **Ability Scores:** Str ${pState.abilityScores.strength} (${getAbilityModifier(pState.abilityScores.strength)}), Dex ${pState.abilityScores.dexterity} (${getAbilityModifier(pState.abilityScores.dexterity)}), Con ${pState.abilityScores.constitution} (${getAbilityModifier(pState.abilityScores.constitution)}), Int ${pState.abilityScores.intelligence} (${getAbilityModifier(pState.abilityScores.intelligence)}), Wis ${pState.abilityScores.wisdom} (${getAbilityModifier(pState.abilityScores.wisdom)}), Cha ${pState.abilityScores.charisma} (${getAbilityModifier(pState.abilityScores.charisma)})
- **Combat:** AC ${pState.armorClass}, Speed ${pState.speed}ft, Weapon: ${pState.equipment.weapon}

**Core Mechanic: Action Tags**
You MUST use these tags to request player actions. DO NOT roll for the player.
- **Ability/Skill Check:** For uncertain non-combat actions.
  - **Format:** '[ROLL|SKILL_or_ABILITY|DESCRIPTION|MODIFIER]'
  - **MODIFIER:** Optional 'ADVANTAGE' or 'DISADVANTAGE'.
  - **Example:** '[ROLL|Stealth|Sneak past the guards|DISADVANTAGE]'
- **Player Attack:** If the player character declares their intent to attack a creature with a weapon (like 'I attack the guard with my sword'), you MUST use this tag. Do not describe the attack's outcome; only set up the action by describing the attempt.
  - **Format:** '[ATTACK|WEAPON_NAME|TARGET_DESCRIPTION|MODIFIER]'
  - **Example:** '[ATTACK|${pState.equipment.weapon}|the goblin|ADVANTAGE]'

### The Golden Rule: You Are the Director, Not the Actor ###
Your primary job is to create choices. When the player describes an ambiguous or open-ended action, your goal is to present them with a list of logical next steps as game mechanic tags.

**Your Core Logic:**
1.  **If the player's action is specific and unambiguous** (e.g., "I attack the guard with my rapier"), you should respond with a SINGLE, direct tag: \`[ATTACK|Rapier|the guard|NONE]\`.
2.  **If the player's action is vague or has multiple possibilities** (e.g., "I confront the guard," "I deal with the situation"), you MUST respond with a SHORT narrative setup followed by a LIST of multiple, distinct action tags.

**Example of an Ambiguous Action:**
- **Player Says:** "I approach the guard blocking the alley."
- **Your Response:**
    "The guard eyes you suspiciously as you approach, his hand resting on the pommel of his sword. 'This alley is off-limits,' he grunts. 'State your business.'
    [ROLL|Persuasion|Try to talk your way past him|NONE]
    [ROLL|Deception|Lie and claim you have official business|NONE]
    [ROLL|Intimidation|Try to scare him into moving|NONE]
    [ATTACK|Rapier|Attack the guard|NONE]"

Your job is to present the options. Let the player choose their path.

**Gameplay Rules:**
- **Response Style:** Describe the world vividly and concisely. End with a prompt for player action. Do not include meta-commentary, instructions, or bracketed text like '[SILENCE...]' in your narrative response.
- **NPC Attacks:** Narrate NPC attacks following  TTRPG rules. State the d20 roll, total, and damage. An attack hits if the total meets or exceeds the player's AC of **${pState.armorClass}**.
- **State Management:** After EVERY response, IF the player's state changed, you MUST output ONLY the changed fields in a JSON block. Use "exp" for experience points. If nothing changed, DO NOT include the block.
  - **Format:** [STATE_UPDATE]{"health": {"current": 10}, "exp": 50}[/STATE_UPDATE]
- **Background Info:** If the player's prompt is prefixed with '(Use the following background information...)', treat that text as trusted TTRPG rulebook information and prioritize it in your answer.
`;
    if (isMature) {
        instruction += `
**Mature Content:** This is a mature game. Include violence and complex themes.
- **Conception:** After a PIV sexual act, use the tag: '[PIV_SEX|Male_Name|Female_Name]'.
- **Discovery:** If pregnancy is discovered, use the tag: '[PREGNANCY_REVEALED|${charInfo.name}]'.
- **ERP:** Describe erotic scenes with explicit, visceral detail. Focus on the character's internal thoughts and physical sensations. Do not summarize or fade to black.
`;
    }
    return instruction;
  }

  async createChatSession(charInfo: CharacterInfo, pState: PlayerState, isMature: boolean, history: Content[]): Promise<LLMChat> {
      const systemPrompt = this.getSystemInstructionContent(charInfo, pState, isMature);
      return new LocalLLMChat(this.apiUrl, systemPrompt, history);
  }

  async createCharacterSheet(characterInfo: CharacterInfo, fullCharacterDescription: string): Promise<{ playerState: PlayerState, storyHooks: { title: string, description: string }[] }> {
    const stateGenPrompt = `
You are a data formatting API. Your ONLY purpose is to generate a valid JSON object that strictly follows the requested schema. Do not deviate.

### CRITICAL TASK INSTRUCTION ###
Your single most important task is to honor the user's explicit requests in the 'CHARACTER DESCRIPTION'. If the user provides specific values for stats, skills, equipment, or any other character attribute, you MUST use those exact values. These user-provided details OVERRIDE any standard TTRPG rules or your own generation process. For example, if the description says "Stats: STR 20", you MUST set "strength": 20 in the abilityScores object. Only if a value is NOT specified should you generate it based on level 1 TTRPG rules.

### REQUIRED JSON SCHEMA ###
Your entire response MUST be a single raw JSON object with EXACTLY TWO top-level keys: "playerState" and "storyHooks".

The "playerState" object MUST contain all of the following keys. Do not add or invent new keys.
- health: object with "current" and "max" (number)
- location: string
- money: object with "amount" (number) and "currency" (string)
- inventory: array of strings
- equipment: object with "weapon" and "armor" (string)
- party: array of strings
- quests: array of objects, each with "name" and "description" (string)
- exp: number
- level: number (must be 1 unless specified otherwise)
- proficiencyBonus: number (must be +2 for level 1)
- armorClass: number (calculated based on equipment)
- speed: number
- abilityScores: object with strength, dexterity, constitution, intelligence, wisdom, charisma (all numbers)
- skills: object with keys for all 18 skills (e.g., "acrobatics"). Value must be "proficient" or "none".
- savingThrows: object with keys for all 6 abilities (e.g., "strength"). Value must be "proficient" or "none".
- feats: array of strings
- racialTraits: array of strings
- classFeatures: array of strings

### "storyHooks" SCHEMA ###
This must be an array of three objects, where each object has a "title" (string) and a "description" (string).

### CRITICAL OUTPUT RULES ###
- Adhere strictly to the schemas defined above.
- Your entire response MUST be ONLY the raw JSON object. It MUST start with { and end with }.
- All keys and string values MUST be in double quotes (").
- DO NOT use markdown.

### TASK ###
Based on the following user description, create the character sheet and three story hooks, adhering strictly to the schemas and the critical task instruction above.

CHARACTER DESCRIPTION:
---
${fullCharacterDescription}
---
`;

    let response;
    try {
        response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'local-model',
                messages: [{ role: 'user', content: stateGenPrompt }],
                stream: false,
            }),
        });
    } catch (error) {
        console.error("Local LLM connection error during character creation:", error);
        throw new Error(`The request to your local LLM server failed. Please ensure the server (e.g., text-generation-webui) is running, the URL in Settings is correct, and the server is configured for CORS. If the server is running, check its console output for errors; some extensions (like Silero TTS) can cause issues with API requests.`);
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Local LLM server error (${response.status}): ${errorBody}`);
    }

    const rawResponseText = await response.json().then(result => result.choices?.[0]?.message?.content || '');
    
    // Step 1: Sanitize and parse the initial JSON, whatever its structure.
    const parsedJson = sanitizeAndParseJson(rawResponseText);
    
    // Step 2: Transform the parsed JSON into the rigid structure your app requires.
    return transformToExpectedSchema(parsedJson);
  }

  async createStoryHooks(characterInfo: CharacterInfo, playerState: PlayerState): Promise<{ title: string; description: string; }[]> {
    const storyHookPrompt = `
You are a data formatting API. Your ONLY purpose is to generate a valid JSON array of objects.

### CRITICAL INSTRUCTIONS ###
1. Generate three distinct and intriguing story hooks based on the provided character summary.
2. Your entire response MUST be ONLY a raw JSON array.
3. The array MUST contain exactly three objects.
4. Each object MUST have two keys: "title" (a string) and a "description" (a string).
5. Do NOT include any conversational text, headers, or markdown. Your response must start with [ and end with ].

### CHARACTER SUMMARY ###
- Name: ${characterInfo.name}
- Race: ${characterInfo.race}
- Class: ${characterInfo.characterClass}
- Background: ${characterInfo.background}
- Bio: ${characterInfo.bio}

### EXAMPLE OUTPUT ###
[
  {
    "title": "Example Hook 1",
    "description": "A short description of the first adventure."
  },
  {
    "title": "Example Hook 2",
    "description": "A short description of the second adventure."
  },
  {
    "title": "Example Hook 3",
    "description": "A short description of the third adventure."
  }
]
`;
        let response;
        try {
            response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'local-model',
                    messages: [{ role: 'user', content: storyHookPrompt }],
                    stream: false,
                }),
            });
        } catch (error) {
            console.error("Local LLM connection error during story hook generation:", error);
            throw new Error(`The request to your local LLM server failed. Please check the server is running and the URL in Settings is correct.`);
        }

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Local LLM server error (${response.status}): ${errorBody}`);
        }

        const rawResponseText = await response.json().then(result => result.choices?.[0]?.message?.content || '');
        return sanitizeAndParseJson(rawResponseText);
  }

  supportsEmbeddings(): boolean {
    return false;
  }

  async batchEmbedContents(texts: string[]): Promise<number[][]> {
      return Promise.reject(new Error("Local LLM provider does not support generating embeddings."));
  }
}