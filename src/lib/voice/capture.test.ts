import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Capacitor plugin before importing the module under test.
vi.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: {
    available: vi.fn(),
    requestPermissions: vi.fn(),
    start: vi.fn(),
  },
}));

import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { isVoiceAvailable, captureTranscript } from './capture';

const mockAvailable = vi.mocked(SpeechRecognition.available);
const mockRequestPermissions = vi.mocked(SpeechRecognition.requestPermissions);
const mockStart = vi.mocked(SpeechRecognition.start);

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// isVoiceAvailable
// ---------------------------------------------------------------------------

describe('isVoiceAvailable', () => {
  it('returns true when the plugin reports available', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    expect(await isVoiceAvailable()).toBe(true);
  });

  it('returns false when the plugin reports not available', async () => {
    mockAvailable.mockResolvedValue({ available: false });
    expect(await isVoiceAvailable()).toBe(false);
  });

  it('returns false when the plugin throws', async () => {
    mockAvailable.mockRejectedValue(new Error('plugin missing'));
    expect(await isVoiceAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// captureTranscript
// ---------------------------------------------------------------------------

describe('captureTranscript', () => {
  it('returns null immediately when voice is not available', async () => {
    mockAvailable.mockResolvedValue({ available: false });
    const result = await captureTranscript();
    expect(result).toBeNull();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('returns null when permission is denied', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'denied' });
    expect(await captureTranscript()).toBeNull();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('returns null when permission status is not granted (prompt)', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'prompt' });
    expect(await captureTranscript()).toBeNull();
  });

  it('returns null when start() throws', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'granted' });
    mockStart.mockRejectedValue(new Error('microphone error'));
    expect(await captureTranscript()).toBeNull();
  });

  it('returns null when matches array is empty', async () => {
    mockAvailable.mockResolvedValue({ available: true });
    mockRequestPermissions.mockResolvedValue({ speechRecognition: 'granted' });
    mockStart.mockResolvedValue({ matches: [] });
    expect(await captureTranscript()).toBeNull();
  });
});
