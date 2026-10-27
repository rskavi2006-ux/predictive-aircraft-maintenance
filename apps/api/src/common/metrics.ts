export const METRICS = ['egt', 'vibration', 'oilPressure', 'oilTemp'] as const;
export type MetricName = (typeof METRICS)[number];
export type Measures = Partial<Record<MetricName, number | null>>;
export type Reading = { timestamp: Date } & Measures;