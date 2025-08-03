/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A utility function that wraps a Promise with a timeout.
 * @param promise The promise to wrap.
 * @param timeout The timeout in milliseconds.
 * @param timeoutMessage The message for the error thrown on timeout.
 * @returns A new promise that resolves/rejects with the original promise, or rejects on timeout.
 */
export function promiseWithTimeout(promise, timeout, timeoutMessage) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(timeoutMessage));
        }, timeout);

        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

/**
 * A utility function that performs a fetch request with a specified timeout.
 * @param resource The URL to fetch.
 * @param options The fetch options.
 * @param timeout The timeout in milliseconds.
 * @returns A promise that resolves with the fetch Response.
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
 * Converts a hex string to a regular string.
 * @param hex The hex string to convert.
 * @returns The decoded string.
 */
export function hexToString(hex) {
    let str = '';
    for (let i = 0; i < hex.length; i += 2) {
        str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return str;
}

/**
 * Converts a string into camelCase.
 * e.g., "Sleight of Hand" becomes "sleightOfHand".
 * @param str The string to convert.
 * @returns The camelCased string.
 */
export function toCamelCase(str) {
    return str.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
        return index === 0 ? word.toLowerCase() : word.toUpperCase();
    }).replace(/\s+/g, '');
}
