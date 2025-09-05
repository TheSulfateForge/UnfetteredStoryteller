/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { dom } from './dom.js';
// --- TEXT-TO-SPEECH SERVICE REMOVED ---
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
                if (event.results[i].isFinal)
                    finalTranscript += event.results[i][0].transcript;
                else
                    interimTranscript += event.results[i][0].transcript;
            }
            onResult(finalTranscript + interimTranscript);
        };
        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            onError(event.error);
        };
    }
    toggle() {
        if (!this.recognition)
            return;
        if (this.isListening) {
            this.recognition.stop();
        }
        else {
            this.recognition.start();
        }
    }
}
export const speech = new SpeechRecognitionService();