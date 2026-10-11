export type SequenceResult =
  | { status: "accepted"; previous: number | null; current: number | null }
  | { status: "duplicate"; previous: number; current: number }
  | { status: "gap"; previous: number; current: number }
  | { status: "unsequenced"; previous: number | null; current: null };

export class SequenceTracker {
  private readonly lastByKey = new Map<string, number>();

  observe(key: string, sequence: number | undefined | null): SequenceResult {
    const previous = this.lastByKey.get(key) ?? null;
    if (sequence === undefined || sequence === null) {
      return { status: "unsequenced", previous, current: null };
    }

    if (previous === null) {
      this.lastByKey.set(key, sequence);
      return { status: "accepted", previous, current: sequence };
    }

    if (sequence <= previous) {
      return { status: "duplicate", previous, current: sequence };
    }

    if (sequence !== previous + 1) {
      this.lastByKey.set(key, sequence);
      return { status: "gap", previous, current: sequence };
    }

    this.lastByKey.set(key, sequence);
    return { status: "accepted", previous, current: sequence };
  }

  reset(key?: string): void {
    if (key) this.lastByKey.delete(key);
    else this.lastByKey.clear();
  }
}
