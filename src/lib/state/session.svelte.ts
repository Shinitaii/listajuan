import { ensureSignedIn } from '../data/auth';

let _uid = $state<string | null>(null);
let _ready = $state(false);
let _error = $state<unknown>(null);

export const session = {
  get uid() { return _uid; },
  get ready() { return _ready; },
  get error() { return _error; },
};

let started = false;
export async function startSession(): Promise<void> {
  if (started) return;
  started = true;
  try {
    _uid = await ensureSignedIn();
  } catch (e) {
    _error = e;
  } finally {
    _ready = true;
  }
}
