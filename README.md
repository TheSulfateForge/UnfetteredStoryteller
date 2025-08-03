# Unfettered Storyteller

*A classic tabletop RPG experience, powered by your choice of AI.*

---

### [► Play Now!](https://thesulfateforge.github.io/UnfetteredStoryteller/)

---

## What is Unfettered Storyteller?

Unfettered Storyteller is a solo TTRPG-style adventure game where an AI acts as your personal Game Master. Create a unique character, choose your path, and immerse yourself in a dynamic, ever-unfolding narrative that reacts to your every decision.

Built as a modern Progressive Web App (PWA), it works entirely in your browser with no backend server. It's fully installable on your desktop or mobile device, works offline, and keeps all your game saves and API keys securely on your own machine.

## Key Features

- **Dynamic AI Game Master:** Experience a reactive story that adapts to your choices, powered by a sophisticated rules-based prompt.
- **Flexible AI Providers:** Connect to the powerful **Google Gemini** API or use your own **Local LLM** (like `oobabooga/text-generation-webui` with an OpenAI-compatible endpoint) for complete privacy and control.
- **Automatic Model Fallback:** To ensure a smooth gameplay experience, the game will automatically switch to a new model if the current one is unavailable (e.g., due to API rate limits). It will cycle through the following models in order: `gemini-2.5-flash`, `gemma-3-27b-it`, and other Gemini Flash variants.
- **Deep Character Creation:** A full point-buy system with races, classes, backgrounds, and skills from the 5e SRD to build your perfect hero.
- **RAG Knowledge Base:** Enhance the AI's accuracy by building a local vector database from TTRPG sourcebooks, ensuring the storyteller respects game rules and lore.
- **Voice-to-Play:** Use your microphone for speech-to-text input and enable "Read Aloud" (TTS) for an immersive, audio-based experience.
- **Installable & Offline:** Works like a native app. Add it to your home screen and play your saved games anytime, even without an internet connection.
- **Private & Secure:** Your API keys and game saves are stored exclusively in your browser's `localStorage`—never uploaded to a server.
- **Mature Content (18+):** An optional toggle for players who want a darker, more adult-themed adventure.

## How to Play

1.  **Open the Game:** Visit [thesulfateforge.github.io/UnfetteredStoryteller/](https://thesulfateforge.github.io/UnfetteredStoryteller/).
2.  **Configure Settings:** Click **Settings** on the main menu.
    -   **For Gemini:** Select "Google Gemini" and enter your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
    -   **For a Local LLM:** Select "Local LLM" and enter the full chat completions endpoint for your local server (e.g., `http://127.0.0.1:5000/v1/chat/completions` for `oobabooga/text-generation-webui`).
3.  **Start a New Adventure:** Go back to the main menu and click "New Adventure".
4.  **Create Your Character:** Fill out the form to define your hero. Your choices will shape the entire story.
5.  **Choose a Story Hook:** The AI will generate three unique starting points for your adventure. Pick one, or write your own!
6.  **Play!** Type what you want to do in the input box and watch the story unfold.

## Installing the App

You can install Unfettered Storyteller on your device to play it like a native app.

-   **On Android (Chrome):** Open the game URL, tap the three-dot menu icon (⋮), and select **Install app**.
-   **On iOS (Safari):** Open the game URL, tap the Share button, and scroll down to select **Add to Home Screen**.
-   **On Desktop (Chrome/Edge):** Open the game URL and click the install icon that appears on the right side of the address bar.

## Credits and Licensing

#### Application Code
The original source code for this application is an independent work of authorship by TheSulfateForge and is licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License](https://creativecommons.org/licenses/by-nc/4.0/).

#### Game Data & Systems Reference Document
This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and is used under the **Open Game License v 1.0a**.

Much of the game data (monsters, spells, classes, etc.) is sourced from the fantastic [Open5e project](https://open5e.com/), which is also provided under the OGL 1.0a.
