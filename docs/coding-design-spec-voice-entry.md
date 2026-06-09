# Coding Design Spec: Voice Entry for Listahan

## Tech Stack Decisions
- **Speech Recognition**: Capacitor speech plugin (offline-capable, native iOS/Android)
- **Item Matching**: Existing searchLibrary function (reuse denormalized matching)
- **Offline Handling**: IndexedDB for caching voice results locally
- **No External APIs**: All processing client-side (Firestore data layer intact)

## Modules

1. **VoiceCapture Module**
   - Purpose: Capture audio from microphone, convert to text
   - Owns: Microphone permission, audio buffering, speech-to-text integration
   - Dependencies: Capacitor plugin, offline detection
   - Tech: TypeScript, Capacitor speech plugin

2. **ItemMatching Module**
   - Purpose: Parse voice text ("2 kilos cabbage 50 pesos") → item + quantity + price
   - Owns: Natural language parsing, searchLibrary integration, quantity/price extraction
   - Dependencies: VoiceCapture, searchLibrary (existing)
   - Tech: TypeScript, regex/NLP

3. **OfflineHandler Module**
   - Purpose: Cache voice results locally, sync on network reconnect
   - Owns: IndexedDB persistence, sync queue, conflict resolution
   - Dependencies: ItemMatching, data layer
   - Tech: TypeScript, IndexedDB

## Module Dependencies
```
VoiceCapture → ItemMatching → OfflineHandler
                    ↓
            searchLibrary (existing)
```

## Integration Points
- VoiceCapture outputs: `{ transcript: string, confidence: number }`
- ItemMatching outputs: `{ itemId, quantity, price, confidence }`
- OfflineHandler stores: `{ tripItemId, syncStatus, timestamp }`
- Existing data layer: No changes required

## Constraints & Rules
- Offline-first: Must work without network
- No external APIs: Capacitor plugin only
- Fallback: If speech fails, show manual entry UI
- Reuse existing patterns: searchLibrary, tripItem data model
- Single-handed: Minimize touch interactions (voice-first UX)

## Project Context
- Framework: Svelte 5 + Capacitor 8
- Data layer: Firestore + offline cache (persistentLocalCache)
- Existing patterns: `src/lib/data/` isolation, denormalized `lastPrice`
- Testing: Jest + Firestore emulator
