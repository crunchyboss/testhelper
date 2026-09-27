/**
 * Adaptive speech threshold: a multiple of the quietest block so far (room noise), clamped so
 * a noisy room cannot push it out of reach and a silent one cannot drop it to zero.
 */
export function speechThreshold(noiseFloor: number | null, base: number, max = 0.08): number {
  if (noiseFloor == null) return base;
  return Math.min(max, Math.max(base, noiseFloor * 3));
}

/**
 * Block range [start, end) to keep: from shortly before the first speech block to shortly after
 * the last one. Cuts the silence before speaking and the auto-stop tail. null = no speech at all.
 */
export function speechBounds(levels: number[], threshold: number, padBlocks: number): [number, number] | null {
  const first = levels.findIndex((l) => l > threshold);
  if (first < 0) return null;
  let last = first;
  for (let i = levels.length - 1; i > first; i--) {
    if (levels[i] > threshold) {
      last = i;
      break;
    }
  }
  return [Math.max(0, first - padBlocks), Math.min(levels.length, last + 1 + padBlocks)];
}
