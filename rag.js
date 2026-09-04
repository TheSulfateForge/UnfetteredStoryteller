/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createChunk } from './chunking-strategies.js';
import * as localEmbedder from './local-embedder.js';
import { isAllowedSource, isAllowedDocumentKey } from './config.js';
// --- STATE ---
let provider = null;
let statusCallback = null;
let vectorStore = [];
let db = null;
let status = 'idle';
// --- CONSTANTS ---
// Minimum cosine similarity for a retrieved chunk to be considered relevant.
// Normalized MiniLM embeddings put genuine matches well above this; unrelated
// entries typically score under ~0.25.
const MIN_SIMILARITY = 0.4;
const DB_NAME = 'UnfetteredRagStore';
// v2 adds the buildState store, which lets an interrupted build resume.
const DB_VERSION = 2;
const STORE_NAME = 'vectors';
const STATE_STORE = 'buildState';
const STATE_KEY = 'current';
// How many documents are embedded before their vectors are written to IndexedDB.
// Everything up to the last completed group survives a crash or a killed tab,
// and nothing larger than one group is ever held in memory as pending writes.
const PERSIST_BATCH = 50;
const DATA_SOURCES = {
    spells: "data/spells-0-1.json",
    spells2to3: "data/spells-2-3.json",
    spells4to5: "data/spells-4-5.json",
    spells6to7: "data/spells-6-7.json",
    spells8to9: "data/spells-8-9.json",
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
            if (!db.objectStoreNames.contains(STATE_STORE)) {
                db.createObjectStore(STATE_STORE, { keyPath: 'key' });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(`IndexedDB error: ${event.target.error}`);
    });
}
/** Promise wrapper for a single IDBRequest. */
function idbRequest(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
/** Resolves when a transaction has fully committed. */
function txDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}
/** Reads the saved progress record of an interrupted or completed build. */
async function readBuildState() {
    if (!db || !db.objectStoreNames.contains(STATE_STORE))
        return null;
    try {
        const tx = db.transaction(STATE_STORE, 'readonly');
        return await idbRequest(tx.objectStore(STATE_STORE).get(STATE_KEY));
    }
    catch (e) {
        console.warn('Could not read knowledge base build state.', e);
        return null;
    }
}
/** Records how far the current build has progressed. */
async function writeBuildState(state) {
    const tx = db.transaction(STATE_STORE, 'readwrite');
    tx.objectStore(STATE_STORE).put({ key: STATE_KEY, ...state });
    await txDone(tx);
}
/** Empties both the vector store and any saved build progress. */
async function clearStores() {
    const tx = db.transaction([STORE_NAME, STATE_STORE], 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.objectStore(STATE_STORE).clear();
    await txDone(tx);
}
/**
 * Cheap fingerprint of a chunk set, so a resumed build is only ever resumed onto
 * the exact same source data and embedding model it started with.
 */
function buildSignature(chunks) {
    let hash = 5381;
    for (const entry of chunks) {
        const name = (entry.metadata && entry.metadata.name) || '';
        const key = `${entry.metadata ? entry.metadata.source : ''}:${name}:${entry.chunk.length}`;
        for (let i = 0; i < key.length; i++) {
            hash = ((hash * 33) ^ key.charCodeAt(i)) >>> 0;
        }
    }
    return `${localEmbedder.EMBEDDING_DIMENSIONS}:${chunks.length}:${hash.toString(36)}`;
}
/** Calculates cosine similarity between two vectors. */
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    if (magA === 0 || magB === 0)
        return 0;
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}
// --- PUBLIC API ---
/** Initializes the RAG service. Must be called before other functions. */
export async function init(llmProvider, callback) {
    provider = llmProvider;
    statusCallback = callback;
    updateStatus('initializing');
    // Embeddings are generated locally (in-browser), independent of the chat AI
    // provider, so the knowledge base is always supported.
    try {
        db = await openDb();
        const tx = db.transaction(STORE_NAME, 'readonly');
        vectorStore = await idbRequest(tx.objectStore(STORE_NAME).getAll());
        if (vectorStore.length === 0) {
            return updateStatus('idle');
        }
        // Guard against a store built by a different embedding model (e.g. an
        // old Gemini-API build). Mismatched vector lengths would silently
        // produce meaningless similarity scores rather than failing loudly.
        const storedDimensions = vectorStore[0]?.embedding?.length;
        if (storedDimensions !== localEmbedder.EMBEDDING_DIMENSIONS) {
            console.warn(`Discarding knowledge base: built with ${storedDimensions}-dimension vectors, current model uses ${localEmbedder.EMBEDDING_DIMENSIONS}.`);
            vectorStore = [];
            await clearStores();
            return updateStatus('idle', 'A knowledge base built by a different embedding model was found and ignored. Please rebuild it.');
        }
        // A build that was interrupted (a killed tab, a crashed renderer) leaves
        // usable-but-incomplete vectors. Report it as resumable rather than
        // presenting a partial knowledge base as finished.
        const state = await readBuildState();
        if (state && state.total && state.completed < state.total) {
            return updateStatus('idle', `Partial knowledge base found (${state.completed} of ${state.total} documents). Click below to resume where it stopped.`);
        }
        updateStatus('ready', `${vectorStore.length} documents loaded from cache.`);
    }
    catch (e) {
        console.error("RAG init failed:", e);
        updateStatus('error', 'Failed to initialize database.');
    }
}
/** Builds the entire vector store from local JSON files. */
export async function buildStore() {
    if (!db)
        return updateStatus('error', 'Service not initialized.');
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
            // Index only content from the licensed sources listed in config.
            // documents.json records its source as `key`/`slug` rather than `document`.
            const filteredItems = (type === 'documents')
                ? items.filter(doc => isAllowedDocumentKey(doc.key ?? doc.slug))
                : items.filter(isAllowedSource);
            for (const item of filteredItems) {
                chunks.push({
                    chunk: createChunk(item, type),
                    metadata: { source: type, name: item.name || item.slug }
                });
            }
        }
        catch (error) {
            console.error(`Error loading or processing ${url}:`, error);
            updateStatus('error', `Could not load or parse ${type}.json.`);
            return; // Stop the build if a file is corrupt
        }
    }
    const totalChunks = chunks.length;
    if (totalChunks === 0) {
        return updateStatus('error', 'Failed to load any data from local files.');
    }
    const signature = buildSignature(chunks);
    let completed = 0;
    try {
        // Resume an interrupted build when the source data and model are unchanged.
        const saved = await readBuildState();
        if (saved && saved.signature === signature && saved.completed > 0 && saved.completed < totalChunks) {
            completed = saved.completed;
            updateStatus('building', `Resuming previous build at ${completed} of ${totalChunks} documents...`);
        }
        else {
            await clearStores();
            vectorStore = [];
        }
        // Load the local embedding model first (downloads ~25MB once, then cached).
        updateStatus('building', 'Loading embedding model (first run downloads ~25MB)...');
        const device = await localEmbedder.warmUp(msg => updateStatus('building', msg));
        updateStatus('building', `Generating embeddings for ${totalChunks} documents locally on ${device.toUpperCase()}... This may take a few minutes.`);
        while (completed < totalChunks) {
            const end = Math.min(completed + PERSIST_BATCH, totalChunks);
            const group = chunks.slice(completed, end);
            const percent = Math.round((completed / totalChunks) * 100);
            updateStatus('building', `Embedding documents ${completed + 1}–${end} of ${totalChunks} (${percent}%)...`);
            const embeddings = await localEmbedder.embedTexts(group.map(c => c.chunk));
            // Persist this group before starting the next one, so an interrupted
            // build resumes from here instead of starting over.
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            for (let i = 0; i < group.length; i++) {
                store.put({
                    id: completed + i + 1,
                    chunk: group[i].chunk,
                    embedding: embeddings[i],
                    metadata: group[i].metadata
                });
            }
            await txDone(tx);
            completed = end;
            await writeBuildState({ signature, total: totalChunks, completed });
        }
        updateStatus('building', 'Loading knowledge base...');
        const readTx = db.transaction(STORE_NAME, 'readonly');
        vectorStore = await idbRequest(readTx.objectStore(STORE_NAME).getAll());
        updateStatus('ready', `${vectorStore.length} documents indexed successfully.`);
    }
    catch (e) {
        console.error('Embedding generation failed:', e);
        const progress = completed > 0
            ? ` Progress was saved (${completed} of ${totalChunks} documents) — click Build again to resume.`
            : '';
        updateStatus('error', `Failed to generate embeddings: ${e.message || e}${progress}`);
    }
}
/** Searches the vector store for the most relevant chunks. */
export async function search(query, topK = 3, minScore = MIN_SIMILARITY) {
    if (status !== 'ready' || vectorStore.length === 0) {
        return [];
    }
    try {
        const queryEmbedding = (await localEmbedder.embedTexts([query]))[0];
        const scoredItems = vectorStore.map(item => ({
            ...item,
            score: cosineSimilarity(queryEmbedding, item.embedding)
        }));
        scoredItems.sort((a, b) => b.score - a.score);
        // Only return genuinely relevant chunks. Without this, every query returns
        // its "top 3" no matter how unrelated, injecting noise into the prompt.
        return scoredItems.filter(item => item.score >= minScore).slice(0, topK);
    }
    catch (e) {
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
