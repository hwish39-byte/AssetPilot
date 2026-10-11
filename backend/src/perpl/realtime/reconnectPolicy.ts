export class ReconnectPolicy {
  private attempt = 0;

  constructor(
    private readonly options: {
      baseDelayMs?: number;
      maxDelayMs: number;
      jitterMs?: number;
      random?: () => number;
    }
  ) {}

  nextDelayMs(): number {
    const base = this.options.baseDelayMs ?? 500;
    const jitter = Math.floor((this.options.random ?? Math.random)() * (this.options.jitterMs ?? 250));
    const delay = Math.min(this.options.maxDelayMs, base * 2 ** this.attempt + jitter);
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }
}
