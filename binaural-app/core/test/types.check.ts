// Compile-time only: a real browser AudioContext must satisfy the engine's structural interface.
import type { AudioContextLike } from '../src/audio/webaudio';

export const realContextIsCompatible = (c: AudioContext): AudioContextLike => c;
