/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Wraps a Promise with a timeout. If the promise does not resolve or reject
 * within the specified time, it will be rejected with a custom error message.
 * @template T
 * @param {Promise<T>} promise The promise to wrap.
 * @param {number} timeout The timeout duration in milliseconds.
 * @param {string} timeoutMessage The error message for the rejection on timeout.
 * @returns {Promise<T>} A new promise that resolves/rejects with the original promise, or rejects on timeout.
 */
export function promiseWithTimeout(promise, timeout, timeoutMessage) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeout);
        promise.then(value => {
            clearTimeout(timer);
            resolve(value);
        }, error => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
/**
 * Performs a `fetch` request with a specified timeout using an AbortController.
 * @param {RequestInfo | URL} resource The URL or Request object to fetch.
 * @param {RequestInit} options The standard fetch options object.
 * @param {number} timeout The timeout duration in milliseconds. Defaults to 30000ms.
 * @returns {Promise<Response>} A promise that resolves with the fetch `Response` object.
 */
export async function fetchWithTimeout(resource, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(resource, {
        ...options,
        signal: controller.signal
    });
    clearTimeout(id);
    return response;
}
/**
 * Converts a hexadecimal string to a regular UTF-8 string.
 * @param {string} hex The hex string to convert.
 * @returns {string} The decoded string.
 */
export function hexToString(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
}
/**
 * Converts a string into camelCase format.
 * e.g., "Sleight of Hand" becomes "sleightOfHand".
 * @param {string} str The string to convert.
 * @returns {string} The camelCased string.
 */
export function toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
}
/**
 * Escapes characters in a string that have special meaning in regular expressions.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeRegExp(str) {
    // $& means the whole matched string
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
