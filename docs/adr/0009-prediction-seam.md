# ADR 0009: Prediction seam (replaceable predictor)

- Status: Accepted
- Date: 2026-10-04

## Context
v1 has no real data, so prediction is rule-based. A real ML model should be swappable later without touching other modules.

## Decision
Define `PredictionService.predict(readings) -> { healthScore, failureProbability, rulDays, contributingFactors[] }`. v1 implements it with thresholds and a linear trend. Every alert stores why it fired (contributing sensors, values, trend, confidence). All results are labelled as simulated.

## Alternatives considered
- Train an ML model on simulator data now: circular, because the simulator and model would share the same assumptions.
- Hard-code rules inside the alerts module: not replaceable.

## Consequences
- A future Python service or ONNX model can implement the same interface.
- No accuracy claims; evaluate only detection lead time on simulated scenarios.