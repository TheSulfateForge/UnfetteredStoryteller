# Unfettered Storyteller (v0.1.0)

**Unfettered Storyteller** is an advanced, offline-capable Progressive Web App (PWA) designed to provide a deep and unrestricted solo TTRPG experience.

The project's core philosophy is a hybrid approach: **Code for Rules, AI for Creativity.**

Character creation and all game mechanics are handled by a robust, client-side engine that strictly adheres to the SRD 5.2.1 ruleset. This system is powered by the comprehensive game data sourced from the Open5e project, ensuring a stable, predictable, and accurate character sheet.

The storytelling, world-building, and NPC interactions are powered by a cutting-edge, uncensored Large Language Model. The AI acts as a "Creative Director," proposing choices, describing outcomes, and building a dynamic narrative in response to player actions.

## Features

-   **Deep, Client-Side Character Creator:** Build your character with a dynamic point-buy system and a rules-as-written skill selection engine. No AI shortcuts, just pure, classic RPG mechanics.
-   **Choice-Based Gameplay:** Guide the story your way. The AI acts as your personal Game Master, presenting you with dynamic situations and a list of possible actions. Will you persuade, intimidate, or attack? The choice is always yours.
-   **Uncensored AI Storyteller:** Explore a world where all themes are on the table. The AI is designed to be a powerful and unrestricted creative partner for mature audiences.
-   **Pluggable AI Backend:** Seamlessly switch between the powerful, cloud-based Gemini API and a locally hosted LLM (via `text-generation-webui`).
-   **Play Anywhere, Anytime:** As a fully offline-capable Progressive Web App (PWA), you can install the game directly to your desktop or mobile home screen and play your adventure whenever and wherever you want.

## Getting Started: Running Locally

This project was built with [Vite](https://vitejs.dev/) and TypeScript.

### Prerequisites

-   [Node.js](https://nodejs.org/en) (v20 or later recommended)
-   A modern web browser (Chrome, Edge, Firefox)

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/TheSulfateForge/unfettered-storyteller.git
    cd unfettered-storyteller
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure your AI Provider:**
    *   Create a new file in the root directory named `.env.local`.
    *   To use the **Gemini API**, add the following line to the file, replacing `YOUR_API_KEY_HERE` with your actual key:
        ```
        VITE_GEMINI_API_KEY="YOUR_API_KEY_HERE"
        ```
    *   The application is configured to use this environment variable by default. No other changes are needed.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    This will start a local server, typically at `http://localhost:5173`. Open this URL in your browser to start the application.

## Deployment

This application is a Progressive Web App and can be deployed to any static hosting service. A GitHub Actions workflow is included to automate deployment to **GitHub Pages**.

1.  **Build the application:**
    ```bash
    npm run build
    ```
    This command will compile the project into a `dist` folder.

2.  **Push to GitHub:**
    *   Push your code to the `main` branch of your repository.
    *   The included GitHub Action (`.github/workflows/deploy.yml`) will automatically build and deploy the contents of the `dist` folder to your live GitHub Pages URL.

## Licensing

This project is made possible through a combination of open-source data and original code, and is governed by two separate licenses.

### Application Code

The original source code for the **Unfettered Storyteller** application is licensed under the [Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0)](./LICENSES/LICENSE-CODE.md).

### Game Data

The underlying game data (monsters, spells, etc.) is used under the terms of the [Open Game License v1.0a](./LICENSES/LICENSE-SRD.md), sourced from the System Reference Document 5.2.1 and the Open5e project.

---
*This work is not affiliated with, endorsed, sponsored, or specifically approved by Wizards of the Coast LLC.*
