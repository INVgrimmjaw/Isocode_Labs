import type { CaptureUnit, ConfidenceBand } from '../types/api.ts';

export const HIGH_CONFIDENCE = 0.85;
export const MEDIUM_CONFIDENCE = 0.6;

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= HIGH_CONFIDENCE) return 'HIGH';
  return confidence >= MEDIUM_CONFIDENCE ? 'MEDIUM' : 'LOW';
}

/** Only a confident match with a stated quantity and unit can be accepted without a decision. */
export function lineNeedsDecision(line: {
  band: ConfidenceBand;
  quantity: number | null;
  unit: CaptureUnit;
}): boolean {
  return line.band !== 'HIGH' || line.quantity === null || line.unit === 'UNCLEAR';
}
