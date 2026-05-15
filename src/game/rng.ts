/**
 * Tiny, deterministic PRNG. Returns a function that yields uniform floats in
 * [0, 1) for a given 32-bit seed. Same seed → same sequence — useful for
 * reproducible game setup and tests. Never call Math.random() on the client;
 * all randomness must be server-authoritative, which means a seeded source.
 *
 * Algorithm: mulberry32 (https://gist.github.com/tommyettinger/46a3...).
 */
/** Fisher-Yates shuffle. Non-mutating; returns a new array. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
