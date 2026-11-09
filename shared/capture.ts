import type { CaptureFlag, CaptureUnit, ConfidenceBand } from './api.ts';

export const HIGH_CONFIDENCE = 0.85;
export const MEDIUM_CONFIDENCE = 0.6;

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= HIGH_CONFIDENCE) return 'HIGH';
  return confidence >= MEDIUM_CONFIDENCE ? 'MEDIUM' : 'LOW';
}

/**
 * A line a person has to decide. Only a confident match with a stated quantity and unit,
 * and nothing odd about it, is pre-filled for the reviewer to simply accept.
 */
export function lineNeedsDecision(line: {
  band: ConfidenceBand;
  quantity: number | null;
  unit: CaptureUnit;
  flags: CaptureFlag[];
}): boolean {
  return line.band !== 'HIGH' || line.quantity === null || line.unit === 'UNCLEAR' || line.flags.length > 0;
}
