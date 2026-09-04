/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// In-browser text embeddings using Transformers.js. Runs entirely on the user's
// own machine (WebGPU when available, WASM fallback) — no API key, no rate limits,
// and fully offline after the model is cached on first use.
// NOTE: Transformers.js is loaded with a DYNAMIC import inside getExtractor(),
// never at module scope. A static top-level import would put a large CDN module
// in the app's startup dependency graph, so any CDN failure would stop the whole
// application from booting rather than just disabling the knowledge base.
let transformers = null;
async function loadTransformers() {
    if (!transformers) {
        transformers = await import('@huggingface/transformers');
        // Download models from the Hugging Face Hub (we don't bundle model files).
        transformers.env.allowRemoteModels = true;
        transformers.env.allowLocalModels = false;
    }
    return transformers;
}

// Small, fast, well-supported sentence-embedding model (384-dimensional output).
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

/** True on phones/tablets, where GPU and renderer memory budgets are small. */
function detectMobile() {
    if (typeof navigator === 'undefined')
        return false;
    if (navigator.userAgentData && typeof navigator.userAgentData.mobile === 'boolean')
        return navigator.userAgentData.mobile;
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}
const IS_MOBILE = detectMobile();

// How many texts to push through the model per forward pass while building.
// Mobile keeps this small: every forward pass allocates tensors sized
// (batch x longest sequence in the batch), and on a phone a large padded tensor
// is what exhausts GPU/renderer memory part-way through a build.
const FORWARD_BATCH = IS_MOBILE ? 8 : 32;
// Second cap on a forward pass: approximate total characters (batch size x the
// longest text in it). Stops a single long chunk from creating a huge padded
// tensor even when the batch is small.
const BATCH_CHAR_BUDGET = IS_MOBILE ? 3000 : 20000;

let extractorPromise = null;
let currentDevice = 'unknown';
let forcedWasm = false;

/**
 * Which backend to try first.
 * WebGPU is much faster, but mobile GPU drivers run out of memory part-way
 * through a long build and the loss of the GPU device takes the whole tab down
 * (Chrome's "Aw, Snap!") before any JS error handler can run — so mobile builds
 * on WASM by default. Set localStorage['ufst-embedding-device'] to 'webgpu' or
 * 'wasm' to override this on any device.
 */
function preferredDevice() {
    if (forcedWasm)
        return 'wasm';
    try {
        const override = localStorage.getItem('ufst-embedding-device');
        if (override === 'webgpu' || override === 'wasm')
            return override;
    }
    catch (e) {
        // Storage may be unavailable (private mode); fall through to the default.
    }
    return IS_MOBILE ? 'wasm' : 'webgpu';
}

/** Recognizes errors that mean "the GPU backend died", not "bad input". */
function isBackendFailure(e) {
    const message = String((e && e.message) || e || '').toLowerCase();
    return message.includes('webgpu')
        || message.includes('gpubuffer')
        || message.includes('gpudevice')
        || message.includes('device is lost')
        || message.includes('device lost')
        || message.includes('mapasync')
        || message.includes('ortrun')
        || message.includes('instance reference')
        || message.includes('out of memory');
}

/** Yields to the event loop so the browser can paint and reclaim memory. */
function breathe() {
    return new Promise(resolve => setTimeout(resolve, IS_MOBILE ? 15 : 0));
}

/**
 * Lazily loads the feature-extraction pipeline on the preferred backend,
 * falling back to WASM if the preferred one is unavailable or fails to load.
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
    const load = async (device) => {
        const { pipeline } = await loadTransformers();
        return pipeline('feature-extraction', MODEL_ID, {
            device,
            progress_callback: reportDownload,
        });
    };
    extractorPromise = (async () => {
        try {
            if (preferredDevice() === 'webgpu' && typeof navigator !== 'undefined' && navigator.gpu) {
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

/**
 * Drops the GPU pipeline and reloads the model on WASM. Used when the GPU
 * backend fails mid-build so the build can continue instead of dying.
 * @param {(msg: string) => void} [onProgress]
 */
async function switchToWasm(onProgress) {
    forcedWasm = true;
    extractorPromise = null;
    currentDevice = 'unknown';
    if (onProgress)
        onProgress('GPU backend failed — continuing on CPU (WASM)...');
    return getExtractor(onProgress);
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
 * Groups texts into forward passes of similar length. Sorting by length first
 * means each pass pads to nearly the length of its own texts instead of to the
 * longest text in an arbitrary group, which is the difference between a modest
 * tensor and one that exhausts memory on a phone.
 * @param {string[]} texts
 * @returns {number[][]} batches of indices into `texts`
 */
function planBatches(texts) {
    const order = texts.map((_, i) => i).sort((a, b) => texts[a].length - texts[b].length);
    const batches = [];
    let current = [];
    let longest = 0;
    for (const index of order) {
        const length = texts[index].length || 1;
        const nextLongest = Math.max(longest, length);
        const wouldExceed = current.length >= FORWARD_BATCH
            || nextLongest * (current.length + 1) > BATCH_CHAR_BUDGET;
        if (current.length > 0 && wouldExceed) {
            batches.push(current);
            current = [];
            longest = 0;
        }
        current.push(index);
        longest = Math.max(longest, length);
    }
    if (current.length > 0)
        batches.push(current);
    return batches;
}

/**
 * Embeds an array of texts into mean-pooled, L2-normalized vectors.
 * @param {string[]} texts
 * @param {(msg: string) => void} [onProgress]
 * @returns {Promise<Float32Array[]>} one vector per input text, in order
 */
export async function embedTexts(texts, onProgress) {
    if (!Array.isArray(texts) || texts.length === 0)
        return [];
    let extractor = await getExtractor(onProgress);
    const results = new Array(texts.length);
    const batches = planBatches(texts);
    let done = 0;
    for (const batch of batches) {
        const slice = batch.map(i => texts[i]);
        let output;
        try {
            output = await extractor(slice, { pooling: 'mean', normalize: true });
        }
        catch (e) {
            // A dead GPU backend is recoverable: reload on WASM and retry once.
            if (currentDevice === 'webgpu' && isBackendFailure(e)) {
                console.warn('WebGPU embedding failed mid-build; switching to WASM.', e);
                extractor = await switchToWasm(onProgress);
                output = await extractor(slice, { pooling: 'mean', normalize: true });
            }
            else {
                throw e;
            }
        }
        const dim = output.dims[output.dims.length - 1];
        const data = output.data;
        for (let r = 0; r < batch.length; r++) {
            results[batch[r]] = data.slice(r * dim, (r + 1) * dim);
        }
        if (typeof output.dispose === 'function') {
            try {
                output.dispose();
            }
            catch (e) {
                // Older builds of Transformers.js have no dispose(); ignore.
            }
        }
        done += batch.length;
        if (onProgress) {
            onProgress(`Embedded ${done} / ${texts.length}`);
        }
        await breathe();
    }
    return results;
}
