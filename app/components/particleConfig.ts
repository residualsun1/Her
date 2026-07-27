export type ParticleReactTarget = "peel" | "size" | "diffusion" | "noise" | "hue";

export type ParticleTuning = {
  particleCount: number;
  particleSize: number;
  trailLength: number;
  diffusion: number;
  noiseStrength: number;
  noiseFrequency: number;
  peelThreshold: number;
  erosionRate: number;
  windX: number;
  windY: number;
  emberLifespan: number;
  edgePerturbation: number;
  edgeScatter: number;
  hueDrift: number;
  luminanceMultiplier: number;
  rhythmIntensity: number;
  reactTarget: ParticleReactTarget;
  audioSmoothing: number;
};

export const DEFAULT_PARTICLE_TUNING: ParticleTuning = {
  particleCount: 256_000,
  particleSize: 1.5,
  trailLength: 0.85,
  diffusion: 34,
  noiseStrength: 2,
  noiseFrequency: 1.15,
  peelThreshold: 0.46,
  erosionRate: 0.22,
  windX: 0.22,
  windY: 0.13,
  emberLifespan: 7.5,
  edgePerturbation: 1.6,
  edgeScatter: 7,
  hueDrift: 14,
  luminanceMultiplier: 1.5,
  rhythmIntensity: 1.8,
  reactTarget: "peel",
  audioSmoothing: 0.86,
};
