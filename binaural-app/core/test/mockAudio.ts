import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
} from '../src/audio/webaudio';

type Ev =
  | { kind: 'set'; time: number; value: number }
  | { kind: 'linear'; time: number; value: number }
  | { kind: 'exp'; time: number; value: number }
  | { kind: 'target'; time: number; value: number; tc: number };

/** AudioParam mock that actually evaluates its automation timeline, so tests can assert real values. */
export class MockParam implements AudioParamLike {
  events: Ev[] = [];
  calls: string[] = [];
  /** legacyParams mode: what .value reports (refreshed only on ctx.tick(), like a render quantum). */
  private rendered: number;
  constructor(
    private readonly ctx: MockAudioContext,
    private defaultValue: number,
  ) {
    this.rendered = defaultValue;
    if (ctx.opts.legacyParams) {
      // Firefox: no cancelAndHoldAtTime.
      (this as { cancelAndHoldAtTime?: unknown }).cancelAndHoldAtTime = undefined;
      ctx.params.push(this);
    }
  }

  get value(): number {
    if (this.ctx.opts.legacyParams) return this.rendered;
    return this.valueAt(this.ctx.currentTime);
  }

  /** Called by ctx.tick() in legacyParams mode. */
  render(): void {
    this.rendered = this.valueAt(this.ctx.currentTime);
  }
  set value(v: number) {
    this.defaultValue = v;
    this.rendered = v;
  }

  valueAt(t: number): number {
    let prevTime = 0;
    let prevValue = this.defaultValue;
    for (const e of this.events) {
      if (e.kind === 'set' || e.kind === 'target') {
        if (e.time > t) break;
        if (e.kind === 'set') {
          prevTime = e.time;
          prevValue = e.value;
        } else {
          const v = e.value + (prevValue - e.value) * Math.exp(-(t - e.time) / e.tc);
          prevValue = v;
          prevTime = t;
        }
        continue;
      }
      // ramps run from previous event to e.time
      if (e.time <= t) {
        prevTime = e.time;
        prevValue = e.value;
        continue;
      }
      const frac = (t - prevTime) / (e.time - prevTime);
      if (e.kind === 'linear') return prevValue + (e.value - prevValue) * frac;
      return prevValue * Math.pow(e.value / prevValue, frac);
    }
    return prevValue;
  }

  private insert(e: Ev) {
    this.events.push(e);
    this.events.sort((a, b) => a.time - b.time);
  }
  setValueAtTime(value: number, time: number) {
    this.calls.push(`set(${value},${time})`);
    this.insert({ kind: 'set', time, value });
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.calls.push(`linear(${value},${time})`);
    this.insert({ kind: 'linear', time, value });
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) throw new RangeError('exponential ramp to non-positive value');
    this.calls.push(`exp(${value},${time})`);
    this.insert({ kind: 'exp', time, value });
  }
  setTargetAtTime(value: number, time: number, tc: number) {
    this.calls.push(`target(${value},${time},${tc})`);
    this.insert({ kind: 'target', time, value, tc });
  }
  cancelScheduledValues(time: number) {
    this.calls.push(`cancel(${time})`);
    this.events = this.events.filter((e) => e.time < time);
  }
  /**
   * Spec semantics (Chromium, WebKit): the hold value is inserted only when `time` cuts through an
   * automation event that is still running (a ramp ending after `time`, or a setTarget). Once the last
   * event has finished, nothing is inserted, so a following ramp interpolates from that last event.
   * (Round 3 audio B1: the old mock always inserted a hold and hid that.)
   */
  cancelAndHoldAtTime(time: number) {
    this.calls.push(`hold(${time})`);
    const v = this.valueAt(time);
    const active = this.events.some((e) => e.time > time && (e.kind === 'linear' || e.kind === 'exp'))
      || this.events.some((e) => e.kind === 'target' && e.time <= time);
    const cut = this.events.find((e) => e.time > time && (e.kind === 'linear' || e.kind === 'exp'));
    this.events = this.events.filter((e) => e.time < time || (e.time === time && e.kind === 'set'));
    if (!active) return;
    // A ramp cut short ends at `time` with its value there (same shape up to the cut).
    if (cut) this.insert({ kind: cut.kind === 'exp' ? 'exp' : 'linear', time, value: v });
    else this.insert({ kind: 'set', time, value: v });
  }
}

export class MockNode implements AudioNodeLike {
  connections: { dest: AudioNodeLike; output?: number | undefined; input?: number | undefined }[] = [];
  disconnected = false;
  constructor(
    public readonly ctx: MockAudioContext,
    public readonly kind: string,
  ) {
    ctx.nodes.push(this);
  }
  connect(dest: AudioNodeLike, output?: number, input?: number) {
    this.connections.push({ dest, output, input });
    return dest;
  }
  disconnect() {
    this.disconnected = true;
    this.connections = [];
  }
}

export class MockOscillator extends MockNode implements OscillatorNodeLike {
  type = 'sine';
  frequency: MockParam;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor(ctx: MockAudioContext) {
    super(ctx, 'oscillator');
    this.frequency = new MockParam(ctx, 440);
  }
  start(when = 0) {
    if (this.startedAt !== null) throw new Error('InvalidStateError: start called twice');
    this.startedAt = when;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

export class MockGain extends MockNode implements GainNodeLike {
  gain: MockParam;
  constructor(ctx: MockAudioContext) {
    super(ctx, 'gain');
    this.gain = new MockParam(ctx, 1);
  }
}

export class MockCompressor extends MockNode implements DynamicsCompressorNodeLike {
  threshold: MockParam;
  knee: MockParam;
  ratio: MockParam;
  attack: MockParam;
  release: MockParam;
  constructor(ctx: MockAudioContext) {
    super(ctx, 'compressor');
    this.threshold = new MockParam(ctx, -24);
    this.knee = new MockParam(ctx, 30);
    this.ratio = new MockParam(ctx, 12);
    this.attack = new MockParam(ctx, 0.003);
    this.release = new MockParam(ctx, 0.25);
  }
}

export class MockBuffer implements AudioBufferLike {
  private data: Float32Array[];
  constructor(
    public readonly numberOfChannels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c: number) {
    return this.data[c]!;
  }
}

export class MockBufferSource extends MockNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  constructor(ctx: MockAudioContext) {
    super(ctx, 'bufferSource');
  }
  start(when = 0) {
    this.startedAt = when;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

export interface MockContextOptions {
  /** Hold suspend() promises until settleSuspend() (state changes when it settles, like real browsers). */
  deferSuspend?: boolean;
  /** Hold resume() promises until settleResume(). */
  deferResume?: boolean;
  /** resume() resolves but leaves the context in this state (autoplay block / iOS 'interrupted'). */
  resumeBlockedState?: 'suspended' | 'interrupted' | null;
  /** resume() rejects (e.g. InvalidStateError on a closed context). */
  resumeRejects?: boolean;
  /**
   * Emulate a browser without cancelAndHoldAtTime (Firefox) whose AudioParam.value only updates once
   * per render quantum: .value returns the default until the next tick(), ignoring fresh automation.
   */
  legacyParams?: boolean;
}

export class MockAudioContext implements AudioContextLike {
  currentTime = 0;
  sampleRate = 8000; // small buffers keep tests fast
  private _state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
  nodes: MockNode[] = [];
  params: MockParam[] = [];
  destination: MockNode;
  resumeCalls = 0;
  suspendCalls = 0;
  buffersCreated = 0;
  listeners = new Set<() => void>();
  private pendingSuspends: (() => void)[] = [];
  private pendingResumes: (() => void)[] = [];

  constructor(public opts: MockContextOptions = {}) {
    this.destination = new MockNode(this, 'destination');
  }
  get state() {
    return this._state;
  }
  /** Change state and fire 'statechange' (simulate OS interruptions with this). */
  setState(s: 'suspended' | 'running' | 'closed' | 'interrupted') {
    if (s === this._state) return;
    this._state = s;
    for (const fn of [...this.listeners]) fn();
  }
  addEventListener(type: 'statechange', fn: () => void) {
    if (type === 'statechange') this.listeners.add(fn);
  }
  removeEventListener(type: 'statechange', fn: () => void) {
    if (type === 'statechange') this.listeners.delete(fn);
  }
  createOscillator() {
    return new MockOscillator(this);
  }
  createGain() {
    return new MockGain(this);
  }
  createChannelMerger(_n = 6) {
    return new MockNode(this, 'merger');
  }
  createDynamicsCompressor() {
    return new MockCompressor(this);
  }
  createBufferSource() {
    return new MockBufferSource(this);
  }
  createBuffer(ch: number, len: number, sr: number) {
    this.buffersCreated++;
    return new MockBuffer(ch, len, sr);
  }
  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.opts.resumeRejects) return Promise.reject(new Error('InvalidStateError: cannot resume'));
    const apply = () => this.setState(this.opts.resumeBlockedState ?? 'running');
    if (!this.opts.deferResume) {
      apply();
      return Promise.resolve();
    }
    return new Promise<void>((r) => this.pendingResumes.push(() => (apply(), r())));
  }
  suspend(): Promise<void> {
    this.suspendCalls++;
    const apply = () => this.setState('suspended');
    if (!this.opts.deferSuspend) {
      apply();
      return Promise.resolve();
    }
    return new Promise<void>((r) => this.pendingSuspends.push(() => (apply(), r())));
  }
  settleSuspend() {
    const q = this.pendingSuspends.splice(0);
    q.forEach((f) => f());
    return q.length;
  }
  settleResume() {
    const q = this.pendingResumes.splice(0);
    q.forEach((f) => f());
    return q.length;
  }
  async close() {
    this.setState('closed');
  }

  /** Advance audio time (seconds). */
  tick(sec: number) {
    this.currentTime += sec;
    for (const p of this.params) p.render();
  }

  of<T extends MockNode>(kind: string): T[] {
    return this.nodes.filter((n) => n.kind === kind) as T[];
  }
}

/** Await queued microtasks (promise chains inside the engine). */
export async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}
