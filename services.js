/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as config from './config.js';
import * as dom from './dom.js';
import * as ui from './ui.js';
import { fetchWithTimeout } from './utils.js';


// --- TEXT-TO-SPEECH SERVICE ---
class TtsService {
    audioQueue = [];
    isSpeaking = false;
    isEnabled = false;
    isAvailable = true;
    currentAudio = null;
    providerSettings = null;

    init(initialState, providerSettings) {
        this.providerSettings = providerSettings;
        // Force the feature to be disabled as per the user's request.
        this.isEnabled = false;
        this.isAvailable = false;
        dom.readAloudToggle.checked = false;
        dom.readAloudToggle.disabled = true;

        const labelParent = dom.readAloudToggle.closest('.switch')?.parentElement;
        if (labelParent) {
            labelParent.title = "The Read Aloud feature is currently disabled.";
        }
    }

    setEnabled(isEnabled) {
        this.isEnabled = isEnabled;
        if (!isEnabled) {
            this.cancel();
        }
    }

    disable(reason = 'key') {
        if (!this.isAvailable) return;
        
        this.isAvailable = false;
        this.isEnabled = false;
        dom.readAloudToggle.checked = false;
        dom.readAloudToggle.disabled = true;

        const label = document.querySelector('label[for="read-aloud-toggle"]');
        if (label) {
            if (reason === 'key') {
                console.warn("Disabling Text-to-Speech feature due to API key error.");
                label.textContent = "Read Aloud (Unavailable)";
                if (label.parentElement) {
                    label.parentElement.title = "Text-to-Speech is unavailable due to an API key configuration issue.";
                }
            }
        }
        this.cancel();
    }

    queue(text) {
        if (!this.isEnabled || !text.trim() || !this.isAvailable) return;
        this.audioQueue.push(text);
        this.processQueue();
    }

    cancel() {
        this.audioQueue.length = 0;
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
        this.isSpeaking = false;
    }

    async processQueue() {
        if (this.isSpeaking || this.audioQueue.length === 0) return;
        this.isSpeaking = true;
        const textToSpeak = this.audioQueue.shift();
        if (textToSpeak) {
            const audio = await this.getAudioFromAPI(textToSpeak);
            if (audio) {
                this.currentAudio = audio;
                this.currentAudio.onended = () => {
                    this.isSpeaking = false;
                    this.currentAudio = null;
                    this.processQueue();
                };
                this.currentAudio.play();
            } else {
                this.isSpeaking = false;
                this.processQueue();
            }
        } else {
            this.isSpeaking = false;
        }
    }

    async getAudioFromAPI(text) {
        const cleanedText = text.replace(/\*\*|\*|\[ROLL\|.*?\|.*?\]/g, '');
        if (!cleanedText || !this.isAvailable) return null;
        
        const apiKey = this.providerSettings?.apiKey;
        if (!apiKey) {
            console.error("TTS failed: API key is not available.");
            this.disable('key');
            return null;
        }

        const API_URL = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
        const requestBody = {
          input: { text: cleanedText },
          voice: { languageCode: config.TTS_VOICE_LANGUAGE_CODE, name: config.TTS_VOICE_NAME },
          audioConfig: { audioEncoding: 'MP3' },
        };

        try {
          const response = await fetchWithTimeout(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
          }, 20000); // 20-second timeout

          if (!response.ok) {
            const errorDetails = await response.json();
            console.error('TTS API request failed:', errorDetails);
            if (errorDetails?.error?.message.includes('API key not valid')) {
                ui.addMessage('error', 'The provided API key is not valid for Text-to-Speech. Disabling this feature.');
            }
            this.disable('key');
            return null;
          }
          const data = await response.json();
          return data.audioContent ? new Audio(`data:audio/mp3;base64,${data.audioContent}`) : null;
        } catch (error) {
          if (error.name === 'AbortError') {
              console.error('TTS API request timed out.');
              ui.addMessage('error', 'Text-to-speech request timed out.');
          } else {
              console.error('Error calling TTS API:', error);
              this.disable('key');
          }
          return null;
        }
    }
}

export const tts = new TtsService();

// --- SPEECH RECOGNITION SERVICE ---
class SpeechRecognitionService {
    recognition = null;
    isListening = false;
    
    init(onResult, onError) {
        const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionImpl) {
            dom.micBtn.disabled = true;
            dom.micBtn.title = "Speech recognition is not supported in this browser.";
            return;
        }
        this.recognition = new SpeechRecognitionImpl();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isListening = true;
            dom.micBtn.classList.add('listening');
            dom.micBtn.setAttribute('aria-label', 'Stop listening');
        };

        this.recognition.onend = () => {
            this.isListening = false;
            dom.micBtn.classList.remove('listening');
            dom.micBtn.setAttribute('aria-label', 'Use microphone');
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '', interimTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
                if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
                else interimTranscript += event.results[i][0].transcript;
            }
            onResult(finalTranscript + interimTranscript);
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            onError(event.error);
        };
    }

    toggle(onStartListening) {
        if (!this.recognition) return;
        if (this.isListening) {
            this.recognition.stop();
        } else {
            onStartListening?.();
            this.recognition.start();
        }
    }
}

export const speech = new SpeechRecognitionService();