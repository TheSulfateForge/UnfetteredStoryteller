

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createChunk } from './chunking-strategies.js';

// --- STATE ---
let provider = null;
let statusCallback = null;
let vectorStore = [];
let db = null;
let status = 'idle';

// --- CONSTANTS ---
const DB_NAME = 'UnfetteredRagStore';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';
const DATA_SOURCES = {
    spells: "data/spells.json",
    monsters: "data/monsters.json",
    backgrounds: "data/backgrounds.json",
    feats: "data/feats.json",
    conditions: "data/conditions.json",
    races: "data/races.json",
    classes: "data/classes.json",
    magicitems: "data/magicitems.json",
    weapons: "data/weapons.json",
    armor: "data/armor.json",
    planes: "data/planes.json",
    sections: "data/sections.json",
    spelllist: "data/spelllist.json",
    documents: "data/documents.json",
    lore: "data/lore.json",
};

// --- PRIVATE HELPERS ---

function updateStatus(newStatus, message) {
    status = newStatus;
    if (statusCallback) {
        statusCallback(status, message);
    }
}

/** Opens and initializes the IndexedDB database. */
function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(`IndexedDB error: ${event.target.error}`);
    });
}

/** Calculates cosine similarity between two vectors. */
function cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((acc, val, i) => acc + val * vecB[i], 0);
    const magA = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
    const magB = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}

// --- PUBLIC API ---

/** Initializes the RAG service. Must be called before other functions. */
export async function init(llmProvider, callback) {
    provider = llmProvider;
    statusCallback = callback;
    updateStatus('initializing');

    if (!provider.supportsEmbeddings()) {
        updateStatus('unsupported');
        return;
    }

    try {
        db = await openDb();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            vectorStore = request.result;
            if (vectorStore.length > 0) {
                updateStatus('ready', `${vectorStore.length} documents loaded from cache.`);
            } else {
                updateStatus('idle');
            }
        };
        request.onerror = () => {
            updateStatus('error', 'Could not load knowledge base from cache.');
        };
    } catch (e) {
        console.error("RAG init failed:", e);
        updateStatus('error', 'Failed to initialize database.');
    }
}

/** Builds the entire vector store from local JSON files. */
export async function buildStore() {
    if (!provider || !db) return updateStatus('error', 'Service not initialized.');
    if (!provider.supportsEmbeddings()) return updateStatus('unsupported');
    
    updateStatus('building', 'Loading data from local files...');
    
    const chunks = [];
    for (const [type, url] of Object.entries(DATA_SOURCES)) {
        updateStatus('building', `Loading ${type}...`);
        
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // For the lore file, it's okay if it doesn't exist. Just warn and skip.
                if (type === 'lore') {
                    console.warn(`Optional lore file not found at ${url}. Skipping.`);
                    continue;
                }
                console.error(`Failed to fetch ${url}: ${response.statusText}`);
                updateStatus('error', `Could not find ${type}.json. Ensure it exists in a /data directory.`);
                return; // Stop the build if a file is missing
            }
            const data = await response.json();
            const items = Array.isArray(data) ? data : data.results;

            if (!items) {
                 console.warn(`No valid data array found in ${url}. Skipping.`);
                 continue;
            }

            let filteredItems = items;
            // Filter out any content from Eberron sourcebooks
            if (type === 'documents') {
                filteredItems = items.filter(doc => !doc.slug?.includes('eberron'));
            } else {
                filteredItems = items.filter(item => !item.document__slug?.includes('eberron'));
            }
            
            for (const item of filteredItems) {
                chunks.push({
                    chunk: createChunk(item, type),
                    metadata: { source: type, name: item.name || item.slug }
                });
            }
        } catch (error) {
            console.error(`Error loading or processing ${url}:`, error);
            updateStatus('error', `Could not load or parse ${type}.json.`);
            return; // Stop the build if a file is corrupt
        }
    }

    const BATCH_SIZE = 100; // A safe batch size for embedding APIs
    const totalChunks = chunks.length;
    
    if (totalChunks === 0) {
        return updateStatus('error', 'Failed to load any data from local files.');
    }

    updateStatus('building', `Generating embeddings for ${totalChunks} documents... This may take a few minutes.`);

    try {
        const allEmbeddings = [];
        const numBatches = Math.ceil(totalChunks / BATCH_SIZE);

        for (let i = 0; i < numBatches; i++) {
            const batchStart = i * BATCH_SIZE;
            const batchEnd = Math.min(batchStart + BATCH_SIZE, totalChunks);
            const batchChunks = chunks.slice(batchStart, batchEnd);

            updateStatus('building', `Embedding batch ${i + 1} of ${numBatches} (${batchChunks.length} documents)...`);
            
            const batchEmbeddings = await provider.batchEmbedContents(batchChunks.map(c => c.chunk));
            allEmbeddings.push(...batchEmbeddings);
        }
        
        updateStatus('building', 'Saving to database...');
        const clearTransaction = db.transaction(STORE_NAME, 'readwrite');
        const clearStore = clearTransaction.objectStore(STORE_NAME);
        await new Promise((resolve, reject) => { // Clearing the store is async
            const req = clearStore.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
        
        // Create a new transaction for adding items for robustness
        const addTransaction = db.transaction(STORE_NAME, 'readwrite');
        const addStore = addTransaction.objectStore(STORE_NAME);

        vectorStore = []; // Reset in-memory store
        allEmbeddings.forEach((embedding, i) => {
            const item = {
                chunk: chunks[i].chunk,
                embedding: embedding,
                metadata: chunks[i].metadata
            };
            addStore.add(item);
            // Also update in-memory store, the ID will be wrong but it's not used immediately
            vectorStore.push({ ...item, id: i + 1 });
        });

        addTransaction.oncomplete = () => {
            updateStatus('ready', `${chunks.length} documents indexed successfully.`);
        };
        addTransaction.onerror = () => {
            updateStatus('error', 'Failed to save knowledge base to database.');
        };

    } catch (e) {
        console.error('Embedding generation failed:', e);
        updateStatus('error', `Failed to generate embeddings: ${e.message || e}`);
    }
}

/** Searches the vector store for the most relevant chunks. */
export async function search(query, topK = 3) {
    if (status !== 'ready' || !provider || vectorStore.length === 0) {
        return [];
    }
    
    try {
        const queryEmbedding = (await provider.batchEmbedContents([query]))[0];
        
        const scoredItems = vectorStore.map(item => ({
            ...item,
            score: cosineSimilarity(queryEmbedding, item.embedding)
        }));
        
        scoredItems.sort((a, b) => b.score - a.score);
        
        return scoredItems.slice(0, topK);
    } catch (e) {
        console.error("RAG search failed:", e);
        return [];
    }
}

/** Returns true if the RAG service is ready to perform searches. */
export function isReady() {
    return status === 'ready' && vectorStore.length > 0;
}

/** Returns the current status of the RAG service. */
export function getStatus() {
    return status;
}