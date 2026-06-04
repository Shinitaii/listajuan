import { SpeechRecognition } from '@capacitor-community/speech-recognition';

/**
 * True only where a real microphone + speech-recognition engine exists (native
 * device). Web/dev → false, so the UI can hide the voice affordance and fall
 * back to manual entry gracefully.
 */
export async function isVoiceAvailable(): Promise<boolean> {
  try {
    const { available } = await SpeechRecognition.available();
    return available;
  } catch {
    return false;
  }
}

/**
 * Request permission, perform a single-shot listen, and return the first
 * recognised transcript string. Returns null if: unavailable, permission
 * denied, no speech detected, or any error. Never throws — the caller treats
 * null as "no voice input".
 */
export async function captureTranscript(lang?: string): Promise<string | null> {
  try {
    if (!(await isVoiceAvailable())) return null;
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') return null;
    const { matches } = await SpeechRecognition.start({
      language: lang ?? 'fil-PH',
      maxResults: 1,
      popup: false,
    });
    return matches?.[0] ?? null;
  } catch {
    return null;
  }
}
