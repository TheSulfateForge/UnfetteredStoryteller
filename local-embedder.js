/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// In-browser text embeddings using Transformers.js. Runs entirely on the user's
// own machine (WebGPU when available, WASM fallback) — no API key, no rate limits,
// and fully offline after the model is cached on first use.
import { pipeline, env } from '@huggingface/transformers';

// Download models from the Hugging Face Hub (we don't bundle local model files).
env.allowRemoteModels = true;
env.allowLocalModels = false;

// Small, fast, well-supported sentence-embedding model (384-dimensional output).
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

// How many texts to push through the model per forward pass while building.
const FORWARD_BATCH = 32;

let extractorPromise = null;
let currentDevice = 'unknown';

/**
 * Lazily loads the feature-extraction pipeline, preferring WebGPU then WASM.
 * @param {(msg: string) => void} [onProgress]
 */
async function getExtractor(onProgress) {
    if (extractorPromise)
        return extractorPromise;
    const reportDownload = (p) => {
        if (onProgress && p && p.status === 'progress' && p.file) {
            onProgress(`Downloading embedding model (${p.file}): ${Math.round(p.progress || 0)}%`);
        }
    };
    const load = (device) => pipeline('feature-extraction', MODEL_ID, {
        device,
        progress_callback: reportDownload,
    });
    extractorPromise = (async () => {
        try {
            // Prefer WebGPU for speed; fall back to WASM if it is unavailable or fails.
            if (typeof navigator !== 'undefined' && navigator.gpu) {
                try {
                    const extractor = await load('webgpu');
                    currentDevice = 'webgpu';
                    return extractor;
                }
                catch (e) {
                    console.warn('WebGPU embedding init failed; falling back to WASM.', e);
                }
            }
            const extractor = await load('wasm');
            currentDevice = 'wasm';
            return extractor;
        }
        catch (e) {
            extractorPromise = null; // allow a later retry
            throw e;
        }
    })();
    return extractorPromise;
}

/** Always true — local embeddings work regardless of the chat AI provider. */
export function supportsEmbeddings() {
    return true;
}

/** Returns which backend the model loaded on ('webgpu', 'wasm', or 'unknown'). */
export function getDevice() {
    return currentDevice;
}

/** Ensures the model is loaded (triggering download on first run). */
export async function warmUp(onProgress) {
    await getExtractor(onProgress);
    return currentDevice;
}

/**
 * Embeds an array of texts into mean-pooled, L2-normalized vectors.
 * @param {string[]} texts
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<number[][]>} one number[] vector per input text, in order
 */
export async function embedTexts(texts, onProgress) {
    if (!Array.isArray(texts) || texts.length === 0)
        return [];
    const extractor = await getExtractor(onProgress);
    const results = new Array(texts.length);
    for (let i = 0; i < texts.length; i += FORWARD_BATCH) {
        const slice = texts.slice(i, i + FORWARD_BATCH);
        const output = await extractor(slice, { pooling: 'mean', normalize: true });
        const dim = output.dims[output.dims.length - 1];
        const data = output.data;
        for (let r = 0; r < slice.length; r++) {
            results[i + r] = Array.from(data.slice(r * dim, (r + 1) * dim));
        }
        if (onProgress) {
            onProgress(`Embedded ${Math.min(i + FORWARD_BATCH, texts.length)} / ${texts.length}`);
        }
    }
    return results;
}
