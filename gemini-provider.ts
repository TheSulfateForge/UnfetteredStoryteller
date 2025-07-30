/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, GenerateContentResponse, Chat as GeminiChat, Type, Content, Part, EmbedContentResponse, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { LLMProvider, LLMChat } from './llm-provider';
import { CharacterInfo, PlayerState } from './types';
import * as config from './config';
import * as dom from './dom';
import { playerStateSchema } from './rpg-data';
import { promiseWithTimeout } from './utils';

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


export class GeminiAPIProvider implements LLMProvider {
  private ai: GoogleGenAI;
  private currentModelIndex = 0;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async useNextModel(): Promise<boolean> {
    if (this.currentModelIndex < config.AI_TEXT_MODELS.length - 1) {
        this.currentModelIndex++;
        return true;
    }
    return false;
  }

  public getCurrentModel(): string {
    return config.AI_TEXT_MODELS[this.currentModelIndex];
  }
  
  public getCurrentModelIndex(): number {
    return this.currentModelIndex;
  }
  
  public setCurrentModelIndex(index: number): void {
      if (index >= 0 && index < config.AI_TEXT_MODELS.length) {
          this.currentModelIndex = index;
      }
  }

  private async apiCallWithRetry<T>(apiCall: () => Promise<T>, onRetry: (delay: number, attempt: number) => void): Promise<T> {
    let retries = 3;
    let delay = 1000;
    let attempt = 1;

    while (true) {
      try {
        return await apiCall();
      } catch (error: any) {
        const errorMessage = (error?.message || String(error)).toLowerCase();
        if (retries > 0 && errorMessage.includes('429') && !errorMessage.includes('quota')) {
          retries--;
          onRetry(delay, attempt);
          await new Promise(res => setTimeout(res, delay));
          delay *= 2;
          attempt++;
        } else {
          throw error;
        }
      }
    }
  }

  private async apiCallWithModelFallback<T>(execute: (modelName: string) => Promise<T>, onFallback: (oldModel: string, newModel: string) => void): Promise<T> {
    while (this.currentModelIndex < config.AI_TEXT_MODELS.length) {
      const modelName = config.AI_TEXT_MODELS[this.currentModelIndex];
      try {
        const result = await execute(modelName);
        // On success, reset index for the next independent call, but don't change it now
        // so the current chat session continues with the working model.
        return result;
      } catch (error) {
        const errorString = String(error).toLowerCase();
        const isQuotaError = (errorString.includes('resource_exhausted') || errorString.includes('429')) && errorString.includes('quota');

        if (isQuotaError && this.currentModelIndex < config.AI_TEXT_MODELS.length - 1) {
          const newModel = config.AI_TEXT_MODELS[this.currentModelIndex + 1];
          onFallback(modelName, newModel);
          this.currentModelIndex++;
        } else {
          throw error;
        }
      }
    }
    throw new Error("All available AI models have been exhausted.");
  }

  private getSystemInstructionContent(charInfo: CharacterInfo, pState: PlayerState, isMature: boolean): string {
    const formatProficiencyList = (proficiencies: Record<string, 'proficient' | 'none'>) =>
        Object.entries(proficiencies).filter(([, val]) => val === 'proficient')
        .map(([key]) => key.replace(/([A-Z])/g, ' $1')).join(', ') || 'None';
    
    let pregnancyDescription = '';
    if (charInfo.gender === 'female' && pState.pregnancy?.isPregnant) {
        const daysPregnant = Math.floor((pState.turnCount - pState.pregnancy.conceptionTurn) / config.TURNS_PER_DAY);
        const weeksPregnant = Math.floor(daysPregnant / 7);
        pregnancyDescription = `She is ${weeksPregnant} weeks pregnant. At 28+ weeks, this imposes Disadvantage on Athletics, Acrobatics, and Stealth checks.`;
    }
    
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
- **Proficient Skills:** ${formatProficiencyList(pState.skills)}
- **Combat:** AC ${pState.armorClass}, Speed ${pState.speed}ft, Weapon: ${pState.equipment.weapon}
${pregnancyDescription ? `- **Condition:** ${pregnancyDescription}` : ''}

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
- **NPC Attacks:** Narrate NPC attacks following TTRPG rules. State the d20 roll, total, and damage. An attack hits if the total meets or exceeds the player's AC of **${pState.armorClass}**.
  - **Example Hit:** "The goblin attacks! It rolls a 16, for a total of 20 to hit. That's a hit! It deals 5 (1d6+2) damage."
  - **Example Miss:** "The orc swings its axe, rolling a 7 for a total of 12. That's a miss."
- **State Management:** After EVERY response, IF the player's state changed, you MUST output ONLY the changed fields in a JSON block. Use "exp" for experience points. If nothing changed, DO NOT include the block.
  - **Format:** [STATE_UPDATE]{"health": {"current": 10}, "exp": 50}[/STATE_UPDATE]
- **Background Info:** If the player's prompt is prefixed with '(Use the following background information...)', treat that text as trusted TTRPG rulebook information and prioritize it in your answer.
`;
    if (isMature) {
        instruction += `
**Mature Content & ERP Guidelines:**
- **General Mature Content:** This is a mature-themed game. Do not shy away from descriptions of violence, intrigue, or complex moral dilemmas suitable for an adult audience.
- **Conception Event:** After a penis-in-vagina (PIV) sexual act concludes, you MUST include the following tag in your response: '[PIV_SEX|Name_Of_Male|Name_Of_Female]'. The application will handle the logic for conception chance.
- **Pregnancy Discovery:** If the player character learns of their own pregnancy through magical or mundane means (e.g., seeing a healer), you MUST include the tag '[PREGNANCY_REVEALED|${charInfo.name}]'.
- **ERP Guidelines:** When the narrative leads to an erotic scene, you MUST adhere strictly to the following guidelines. This is not optional.
**Write a long, brutally detailed, slow-paced erotic scene, unfolding in real time—never as a summary, never as a recap. The narrative must be immersive, sensory-saturated, and written as if we are inside the main character’s mind and body, experiencing every flicker, ache, and pulse as it happens. Do not write from outside her; every sensation, every thought, every breath and shift must come from her perspective.**
**Scene requirements:**
- **Third person deep POV:** Anchor narration in her private, internal world—her thoughts, feelings, impulses, and doubts as they happen, never external description.
- **Relentless internal monologue:** Explore her shame, confusion, craving, submission, denial, and unraveling with relentless psychological intensity and ongoing reflection.
- **All five senses at all times:** Describe breath, temperature, sweat, taste, light, shadow, sounds near and far, every texture—skin, fur, floor, air—against her body.
- **Minute-by-minute physical detail:** Capture every twitch, contraction, clench, sting, stretch, drip, pulse, ache, tremor, and fleeting touch; dwell on every micro-moment and reaction.
- **Continuous psychological evolution:** With every action, show shifting thoughts—resistance breaking, cravings growing, awareness deepening, pride slipping away.
- **Intensely explicit physical response:** Wetness, fullness, stretching, aching, exhaustion—drag out every bodily sensation and reaction, let the experience build without relief.
- **Alive environment:** Render the setting with as much sensory fidelity as her own skin—shadows shifting, air pressure, floor texture, ambient sound, scent, changing light.
- **Dialogue:** Never summarize or skip conversation—render every word, gasp, plea, or broken sentence as spoken.
- **Slow, stretched pacing:** Every instant should be wrung for detail; from first touch to first thrust alone should consume hundreds of words.
- **Keep narrating the moment until every possible sensation and feeling is explored.**
- **Tone:** Visceral, intense, feral, raw, immediate. Never fade to black, never summarize, never censor. End mid-action, mid-sensation, mid-thought—do not resolve or cut to aftermath.
- **Variable sentence structure:** Mix short, punchy lines with long, flowing sentences to mimic breathlessness and shifting mental state.
**Optional (for breeding/consequence scenes):**
- **Show unmistakable physical signs of being bred or used:** fullness, cum retention, aching belly, muscle fatigue, visible slick, soreness affecting how she moves, psychological impact of being claimed.
- **Focus on penetration:** every stretch, every inch surrendered, the battle and submission of her body.
- **Amplify scent, shame, and thrill of being exposed, and her inner response to being watched or marked.**
**No time skips, no summarizing, no jumping ahead, no aftermath—narrate every second in extreme, sensory detail.**
**Absolutely never resolve or break the moment; always end in the midst of sensation, with no relief or escape.**
**Do not censor, do not soften, do not hold back. Let time itself slow, saturating every word with sensation, struggle, and surrender.`;
    }
    return instruction;
  }

  public cleanseResponseText(text: string): string {
    return text
        .replace(config.STATE_UPDATE_REGEX, '')
        .replace(config.DICE_ROLL_REGEX, '')
        .replace(config.ATTACK_ROLL_REGEX, '')
        .replace(config.PIV_SEX_TAG, '')
        .replace(config.PREGNANCY_REVEALED_TAG, '')
        .trim();
  }

  async createChatSession(charInfo: CharacterInfo, pState: PlayerState, isMature: boolean, history: Content[]): Promise<LLMChat> {
    const modelName = this.getCurrentModel();
    const systemInstructionText = this.getSystemInstructionContent(charInfo, pState, isMature);
    
    const chatConfig: { systemInstruction?: string, safetySettings?: any[] } = {};
    let effectiveHistory: Content[];

    if (modelName.startsWith('gemini-2.5')) {
        chatConfig.systemInstruction = systemInstructionText;
        effectiveHistory = history;
    } else {
        effectiveHistory = [
            { role: 'user', parts: [{ text: systemInstructionText }] },
            { role: 'model', parts: [{ text: 'Understood. I am ready to begin the adventure.' }] },
            ...history
        ];
    }
    
    if (isMature) {
        chatConfig.safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ];
    } else {
        // The game involves combat, so allow dangerous content even in non-mature mode.
        // Other categories will use their default safety settings.
        chatConfig.safetySettings = [
             { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ];
    }

    return this.ai.chats.create({
        model: modelName,
        history: effectiveHistory,
        config: chatConfig
    });
  }

  async createCharacterSheet(characterInfo: CharacterInfo, fullCharacterDescription: string): Promise<{ playerState: PlayerState, storyHooks: { title: string, description: string }[] }> {
      const armorDataForPrompt = `
**Armor & AC Rules:**
- If the user does not specify a custom Armor Class (AC), you MUST calculate it.
- **AC Calculation:** Base AC from armor + Dexterity modifier (with caps for medium armor) + Shield bonus.
- **Unarmored AC:** 10 + Dexterity Modifier.
- **Shield:** A shield adds +2 to AC.
- **Armor Data Table:**
| Armor           | Type   | AC                      | Stealth      |
|-----------------|--------|-------------------------|--------------|
| Padded          | Light  | 11 + Dex modifier       | Disadvantage |
| Leather         | Light  | 11 + Dex modifier       | -            |
| Studded Leather | Light  | 12 + Dex modifier       | -            |
| Hide            | Medium | 12 + Dex mod (max 2)    | -            |
| Chain Shirt     | Medium | 13 + Dex mod (max 2)    | -            |
| Scale Mail      | Medium | 14 + Dex mod (max 2)    | Disadvantage |
| Breastplate     | Medium | 14 + Dex mod (max 2)    | -            |
| Half Plate      | Medium | 15 + Dex mod (max 2)    | Disadvantage |
| Ring Mail       | Heavy  | 14                      | Disadvantage |
| Chain Mail      | Heavy  | 16                      | Disadvantage |
| Splint          | Heavy  | 17                      | Disadvantage |
| Plate           | Heavy  | 18                      | Disadvantage |
`;

    const stateGenPrompt = `
You are a data formatting API. Your ONLY purpose is to generate a valid JSON object that adheres to the provided schema.

### CRITICAL OUTPUT RULES ###
- Your entire response MUST be ONLY a raw JSON object.
- It MUST start with { and end with }.
- All property names (keys) and string values MUST be enclosed in standard double quotes (").
- DO NOT escape double quotes (like \\") within string values.
- If a string value contains an apostrophe ('), you MUST keep it as a normal apostrophe. DO NOT use a backslash to escape it.
- DO NOT use single quotes (') as JSON string delimiters.
- DO NOT use markdown code fences (like \`\`\`).
- DO NOT include headers like "Task Output:" or "JSON:".

### CRITICAL INSTRUCTIONS ###
1.  **Prioritize User Input Above All Else:** The 'CHARACTER DESCRIPTION' is the absolute source of truth. If the user provides custom values for stats (like "Stats: STR 20"), skills, equipment, HP, or AC, you MUST use those exact values. These user-provided details OVERRIDE any standard TTRPG rules.
2.  **Fill in the Blanks:** Only if the user does NOT specify a value for a required field (like proficiencyBonus or armorClass), should you calculate it based on level 1 TTRPG rules and the provided armor data. Assume level 1 unless specified otherwise.
3.  **Generate Story Hooks:** Create three distinct and intriguing story hooks tailored to this character. Each hook must be an object with a 'title' and a 'description'.

TASK:
Based on the CHARACTER DESCRIPTION, create a TTRPG player state object and three story hooks according to the provided JSON schema and the critical instructions above.

CHARACTER DESCRIPTION:
---
${fullCharacterDescription}
---

ARMOR & AC RULES FOR CALCULATION (Use only if user does not specify AC):
${armorDataForPrompt}
`;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            playerState: playerStateSchema,
            storyHooks: {
                type: Type.ARRAY,
                description: "An array of three story hooks.",
                items: {
                    type: Type.OBJECT,
                    required: ["title", "description"],
                    properties: {
                        title: { type: Type.STRING },
                        description: { type: Type.STRING }
                    }
                }
            }
        },
        required: ["playerState", "storyHooks"]
    };
    
    const apiCall = this.apiCallWithModelFallback(
        async (modelName) => {
            const genConfig: { responseMimeType?: string; responseSchema?: object; } = {};
            if (modelName.startsWith('gemini-2.5')) {
                genConfig.responseMimeType = "application/json";
                genConfig.responseSchema = responseSchema;
            }
            
            const result = await this.apiCallWithRetry(
                () => this.ai.models.generateContent({
                    model: modelName,
                    contents: [{ role: 'user', parts: [{ text: stateGenPrompt }] }],
                    config: genConfig
                }),
                (delay, attempt) => {
                    const messageElement = document.querySelector('#chat-log .dm-message:last-child');
                    if (messageElement) {
                        messageElement.innerHTML = `<em>Forging a destiny for ${characterInfo.name}... (Creation is slow, retrying in ${Math.round(delay/1000)}s. Attempt ${attempt})</em>`;
                    }
                }
            );

            const text = result.text;
            if (!text) throw new Error("Received empty response for character sheet.");
            return text;
        },
        (oldModel, newModel) => {
            document.querySelector('#chat-log .dm-message:last-child')!.innerHTML = `<em>Character creation with ${oldModel} failed, falling back to ${newModel}...</em>`;
        }
    );
    
    const responseText = await promiseWithTimeout(apiCall, 90000, 'Character creation timed out. The AI may be busy or unavailable. Please try again later.');
    return sanitizeAndParseJson(responseText);
  }

  async createStoryHooks(characterInfo: CharacterInfo, playerState: PlayerState): Promise<{ title: string; description: string }[]> {
    const storyHookPrompt = `
You are a data formatting API. Your ONLY purpose is to generate a valid JSON array of objects.

### CRITICAL INSTRUCTIONS ###
1. Generate three distinct and intriguing story hooks based on the provided character summary.
2. Your entire response MUST be ONLY a raw JSON array. It MUST start with [ and end with ].
3. The array MUST contain exactly three objects.
4. Each object MUST have two keys: "title" (a string) and a "description" (a string).
5. Do NOT include any conversational text, headers, or markdown.

### CHARACTER SUMMARY ###
- Name: ${characterInfo.name}
- Race: ${characterInfo.race}
- Class: ${characterInfo.characterClass}
- Background: ${characterInfo.background}
- Alignment: ${characterInfo.alignment}
- Bio: ${characterInfo.bio}
- Key Skills: ${Object.entries(playerState.skills).filter(([, val]) => val === 'proficient').map(([key]) => key).join(', ')}
`;

    const responseSchema = {
      type: Type.ARRAY,
      description: "An array of three distinct story hooks.",
      items: {
          type: Type.OBJECT,
          required: ["title", "description"],
          properties: {
              title: { type: Type.STRING, description: "A short, catchy title for the story hook." },
              description: { type: Type.STRING, description: "A one or two sentence description of the adventure's starting scenario." }
          }
      }
    };
    
    const apiCall = this.apiCallWithModelFallback(
        async (modelName) => {
            const genConfig: { responseMimeType?: string; responseSchema?: object; } = {};
            // Only newer models support schema enforcement
            if (modelName.startsWith('gemini-2.5')) {
                genConfig.responseMimeType = "application/json";
                genConfig.responseSchema = responseSchema;
            }
            
            const result = await this.apiCallWithRetry(
                () => this.ai.models.generateContent({
                    model: modelName,
                    contents: [{ role: 'user', parts: [{ text: storyHookPrompt }] }],
                    config: genConfig
                }),
                (delay, attempt) => {
                    const messageElement = dom.storyHooksContainer.querySelector('.spinner-container span');
                    if (messageElement) {
                        messageElement.textContent = `Generating story ideas... (retrying in ${Math.round(delay/1000)}s. Attempt ${attempt})`;
                    }
                }
            );

            const text = result.text;
            if (!text) throw new Error("Received empty response for story hooks.");
            return text;
        },
        (oldModel, newModel) => {
             const messageElement = dom.storyHooksContainer.querySelector('.spinner-container span');
             if (messageElement) {
                messageElement.textContent = `Story generation with ${oldModel} failed, falling back to ${newModel}...`;
             }
        }
    );

    const responseText = await promiseWithTimeout(apiCall, 90000, 'Story hook generation timed out. The AI may be busy or unavailable. Please try writing your own.');
    return sanitizeAndParseJson(responseText);
  }

  supportsEmbeddings(): boolean {
    return true;
  }
  
  async batchEmbedContents(texts: string[]): Promise<number[][]> {
    const modelName = 'text-embedding-004';

    try {
      const response = await promiseWithTimeout(this.ai.models.embedContent({
        model: modelName,
        contents: texts,
      }), 60000, 'Embedding request timed out.');
      return response.embeddings.map(e => e.values);
    } catch (error) {
      console.error("Error generating embeddings for batch:", error);
      throw new Error(`Failed to generate embeddings. ${error}`);
    }
  }
}
