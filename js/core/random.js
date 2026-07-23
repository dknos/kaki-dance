export function hashSeed(...parts) {
  let hash = 2166136261 >>> 0;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export class SeededRandom {
  constructor(seed = 0x4b414b49) {
    this.state = (Number(seed) >>> 0) || 0x6d2b79f5;
  }

  nextUint() {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state;
  }

  next() {
    return this.nextUint() / 0x100000000;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }

  int(min, maxInclusive) {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  pick(items) {
    if (!items?.length) return undefined;
    return items[this.int(0, items.length - 1)];
  }

  chance(probability) {
    return this.next() < probability;
  }

  clone() {
    return new SeededRandom(this.state);
  }
}
