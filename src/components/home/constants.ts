// Rough estimates for file size based on quality (MB per minute)
export const SIZE_ESTIMATION_RATES: Record<number, number> = {
  2160: 35,
  1440: 20,
  1080: 12,
  720: 6,
  480: 3,
  360: 1.5,
  240: 0.8,
  144: 0.4,
} as const;
