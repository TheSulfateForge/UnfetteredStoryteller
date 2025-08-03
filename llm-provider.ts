/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Content, GenerateContentResponse } from '@google/genai';
import { CharacterInfo, PlayerState } from './types';

/**
 * A generic interface for a chat session, compatible with both Gemini's Chat
 * and a custom implementation for local LLMs.
 */
export interface LLMChat {
  sendMessageStream(params: { message: string }): Promise<AsyncGenerator<GenerateContentResponse>>;
}

/**
 * Defines the standard contract for any AI provider used by the application.
 * This allows for a pluggable architecture to switch between services like
 * Google Gemini and a self-hosted local LLM.
 */
export interface LLMProvider {
  /**
   * Creates a new chat session with the AI provider.
   * @param charInfo - The character's static information.
   * @param pState - The character's dynamic state.
   * @param isMature - Flag for enabling mature content guidelines.
   * @param history - The existing chat history to continue from.
   * @returns A promise that resolves to an object conforming to the LLMChat interface.
   */
  createChatSession(
    charInfo: CharacterInfo,
    pState: PlayerState,
    isMature: boolean,
    history: Content[]
  ): Promise<LLMChat>;

  /**
   * Generates a character sheet and story hooks based on a user's description.
   * @param characterInfo - Basic character info.
   * @param fullCharacterDescription - The detailed user-provided description.
   * @returns A promise that resolves to the player state and an array of story hooks.
   */
  createCharacterSheet(
    characterInfo: CharacterInfo,
    fullCharacterDescription: string
  ): Promise<{ playerState: PlayerState; storyHooks: { title: string; description: string }[] }>;
  
  /**
   * Generates creative story hooks based on a finalized character sheet.
   * @param characterInfo The character's static information.
   * @param playerState The character's finalized game state.
   * @returns A promise that resolves to an array of story hooks.
   */
  createStoryHooks(
    characterInfo: CharacterInfo,
    playerState: PlayerState
  ): Promise<{ title: string; description: string }[]>;

  /**
   * Indicates if the provider supports generating text embeddings.
   */
  supportsEmbeddings(): boolean;

  /**
   * Generates embeddings for a batch of text contents.
   * @param texts - An array of strings to embed.
   * @returns A promise that resolves to an array of embedding vectors.
   */
  batchEmbedContents(texts: string[]): Promise<number[][]>;

  /**
   * Switches to the next available model in the provider's list.
   * @returns A promise that resolves to true if a switch was successful, false otherwise.
   */
  useNextModel(): Promise<boolean>;

  /**
   * Gets the name of the currently active model.
   * @returns The name of the current model.
   */
  getCurrentModel(): string;

  /**
   * Gets the index of the currently active model.
   * @returns The index of the current model.
   */
  getCurrentModelIndex(): number;

  /**
   * Sets the active model by its index.
   * @param index The index of the model to set as active.
   */
  setCurrentModelIndex(index: number): void;

  /**
   * Constructs the system instruction content based on character and game state.
   * @param charInfo The character's static information.
   * @param pState The character's dynamic state.
   * @param isMature Flag for enabling mature content guidelines.
   * @returns The complete system instruction string.
   */
  getSystemInstructionContent(
    charInfo: CharacterInfo,
    pState: PlayerState,
    isMature: boolean
  ): string;
}
