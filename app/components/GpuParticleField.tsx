"use client";
/* eslint-disable react-hooks/immutability, react-hooks/exhaustive-deps -- Three.js textures and shader uniforms are intentionally mutated inside the render loop. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ParticleTuning } from "./particleConfig";

const SIMULATION_VERTEX = `precision highp float;

in vec3 position;
out vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SIMULATION_FRAGMENT = `precision highp float;

uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uImage;
uniform vec2 uImageTexel;
uniform vec2 uViewport;
uniform vec2 uFit;
uniform float uTime;
uniform float uDelta;
uniform float uPeelThreshold;
uniform float uErosionRate;
uniform float uNoiseStrength;
uniform float uNoiseFrequency;
uniform float uFlowSpeed;
uniform float uFlowAmplitude;
uniform float uDepthStrength;
uniform float uDepthWave;
uniform float uCoreRetention;
uniform float uHomeSpring;
uniform float uVelocityDamping;
uniform float uEdgePerturbation;
uniform float uEdgeScatter;
uniform float uDiffusion;
uniform float uHaloLifespan;
uniform vec2 uWind;
uniform vec2 uPointer;
uniform vec2 uRotation;
uniform float uPointerForce;
uniform float uPointerActive;
uniform float uMouseRadius;
uniform float uMouseRepulsion;
uniform float uMouseSwirl;
uniform float uMouseRingWidth;
uniform float uMouseDepthPull;
uniform float uAudioEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBassGain;
uniform float uFlowReactStrength;
uniform float uDepthReactStrength;
uniform float uRhythmIntensity;
uniform float uDanceStrength;
uniform float uReactTarget;

in vec2 vUv;
layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outVelocity;

float luminanceAt(vec2 uv) {
  vec3 color = texture(uImage, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

float sobelEdge(vec2 uv) {
  vec2 t = max(uImageTexel, vec2(0.00001));
  float tl = luminanceAt(uv + vec2(-t.x,  t.y));
  float tc = luminanceAt(uv + vec2( 0.0,  t.y));
  float tr = luminanceAt(uv + vec2( t.x,  t.y));
  float ml = luminanceAt(uv + vec2(-t.x,  0.0));
  float mr = luminanceAt(uv + vec2( t.x,  0.0));
  float bl = luminanceAt(uv + vec2(-t.x, -t.y));
  float bc = luminanceAt(uv + vec2( 0.0, -t.y));
  float br = luminanceAt(uv + vec2( t.x, -t.y));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -bl - 2.0 * bc - br + tl + 2.0 * tc + tr;
  return clamp(length(vec2(gx, gy)) * 1.65, 0.0, 1.0);
}

float hash21(vec2 value) {
  vec3 p3 = fract(vec3(value.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float fieldNoise(vec2 point) {
  float first = sin(point.x * 1.37 + sin(point.y * 0.83));
  float second = cos(point.y * 1.71 - cos(point.x * 0.69));
  float third = sin((point.x + point.y) * 0.47);
  return (first + second + third) / 3.0;
}

vec2 curlNoise(vec2 point) {
  float epsilon = 0.08;
  float left = fieldNoise(point - vec2(epsilon, 0.0));
  float right = fieldNoise(point + vec2(epsilon, 0.0));
  float down = fieldNoise(point - vec2(0.0, epsilon));
  float up = fieldNoise(point + vec2(0.0, epsilon));
  return normalize(vec2((up - down), -(right - left)) + vec2(0.0001));
}

void main() {
  vec4 previousPosition = texture(uPositionState, vUv);
  vec4 previousVelocity = texture(uVelocityState, vUv);
  vec3 position = previousPosition.xyz;
  vec3 velocity = previousVelocity.xyz;
  float seed = previousPosition.w;
  float life = previousVelocity.w;
  vec3 home = vec3(vUv * 2.0 - 1.0, 0.0);
  float frameScale = min(uDelta * 60.0, 2.5);

  float edge = sobelEdge(vUv);
  float reactiveBass = clamp(uBass * uBassGain, 0.0, 1.5);
  float reactiveFlow = 1.0 + (uAudioEnergy + uMid * 0.65) * uFlowReactStrength;
  float bassPeel = reactiveBass * uRhythmIntensity * 0.055;
  float threshold = clamp(uPeelThreshold - bassPeel, 0.02, 0.98);
  float edgeWeight = smoothstep(threshold - 0.12, threshold + 0.12, edge);
  float stagger = hash21(vUv * 1931.17 + seed);
  float haloParticle = smoothstep(uCoreRetention - 0.08, 1.0, seed);
  float release = edgeWeight * mix(0.035, 1.0, haloParticle);

  float pace = max(uErosionRate, 0.001);
  if (life < 0.0) {
    life += uDelta * pace * (0.55 + seed * 0.5);
  }

  float detached = step(0.0, life) * release;
  float audioDepth = reactiveBass * uDanceStrength * uDepthReactStrength;
  float waveAmount = (uDepthWave + audioDepth) * 0.1;
  float depthPhase = uTime * uFlowSpeed * 0.36;
  float depthWave = sin(home.x * 3.7 + depthPhase + seed * 1.8);
  depthWave *= cos(home.y * 3.1 - depthPhase * 0.73 + seed * 2.7);
  float depthTarget = depthWave * waveAmount * clamp(uDepthStrength / 100.0, 0.0, 1.5) * 0.72;
  depthTarget *= 0.1 + release * 0.9;

  vec3 targetHome = vec3(home.xy, depthTarget);
  float springWeight = mix(1.38, 0.72, release);
  velocity += (targetHome - position) * uHomeSpring * springWeight * frameScale;

  float noiseTime = uTime * uFlowSpeed * (0.16 + pace * 0.18) *
    (1.0 + uAudioEnergy * uFlowReactStrength * 0.18);
  noiseTime *= 1.0 + step(1.5, uReactTarget) * step(uReactTarget, 2.5) * uTreble * 0.22;
  vec2 noisePoint = position.xy * max(uNoiseFrequency, 0.05) * 2.35;
  noisePoint += vec2(noiseTime, -noiseTime * 0.71);
  vec2 curl = curlNoise(noisePoint);
  float diffusion = clamp(uDiffusion / 1.5, 0.0, 3.0);
  float flowWeight = 0.018 + release * 0.982;
  velocity.xy += curl * uNoiseStrength * uFlowAmplitude * reactiveFlow *
    flowWeight * 0.0028 * frameScale * diffusion;
  velocity.xy += uWind * detached * 0.0018 * frameScale;
  velocity.z += fieldNoise(noisePoint * 0.72) * uFlowAmplitude * reactiveFlow *
    flowWeight * 0.0013 * frameScale;

  vec2 trebleRipple = vec2(
    sin(uTime * 0.73 + seed * 17.0),
    cos(uTime * 0.61 + seed * 13.0)
  ) * uTreble * uRhythmIntensity * 0.0025 * frameScale;
  velocity.xy += trebleRipple * release;

  vec2 edgeDirection = normalize(home.xy + vec2(0.0001));
  velocity.xy += edgeDirection * detached * edgeWeight * uEdgeScatter * 0.00042 * frameScale;
  velocity.xy += vec2(seed - 0.5, stagger - 0.5) * detached * uEdgePerturbation * 0.0012 * frameScale;

  vec2 pointerOnPlane = uPointer / max(uFit, vec2(0.001));
  float cosYaw = max(cos(uRotation.y), 0.14);
  float cosPitch = max(cos(uRotation.x), 0.14);
  float pointerX = pointerOnPlane.x / cosYaw;
  float pointerY = (
    pointerOnPlane.y - pointerX * sin(uRotation.y) * sin(uRotation.x)
  ) / cosPitch;
  vec2 pointerInField = vec2(pointerX, pointerY);
  vec2 pointerDelta = position.xy - pointerInField;
  float pointerDistance = max(length(pointerDelta), 0.0001);
  float radius = max((uMouseRadius * 2.0) / max(uViewport.y, 1.0), 0.025);
  float normalizedDistance = pointerDistance / radius;
  float pointerField = (1.0 - smoothstep(0.0, 1.0, normalizedDistance)) * uPointerActive * uPointerForce;
  float ring = exp(-pow((normalizedDistance - 0.66) / max(uMouseRingWidth, 0.03), 2.0));
  float centerTrough = 1.0 - smoothstep(0.0, 0.54, normalizedDistance);
  float raisedRim = ring * (1.0 - smoothstep(0.82, 1.0, normalizedDistance));
  vec2 radial = pointerDelta / pointerDistance;
  vec2 tangent = vec2(-radial.y, radial.x);
  velocity.xy += radial * pointerField * uMouseRepulsion *
    (0.0025 + raisedRim * 0.0055) * frameScale;
  velocity.xy += tangent * pointerField * uMouseSwirl *
    (0.0018 + raisedRim * 0.0042) * frameScale;
  float depthBowl = raisedRim * 0.031 - centerTrough * 0.012;
  velocity.z += depthBowl * uPointerActive * uPointerForce *
    uMouseDepthPull * frameScale;

  velocity *= pow(clamp(uVelocityDamping, 0.75, 0.999), frameScale);
  position += velocity * frameScale;

  if (detached > 0.01) {
    life += uDelta * (0.58 + seed * 0.42);
  }

  float escaped = step(2.8, max(abs(position.x), abs(position.y)));
  if (life > uHaloLifespan || escaped > 0.5) {
    life = -(0.55 + seed * 4.5);
    velocity *= 0.18;
    position = mix(position, targetHome, 0.46);
  }

  outPosition = vec4(position, seed);
  outVelocity = vec4(velocity, life);
}
`;

const PARTICLE_VERTEX = `precision highp float;

uniform sampler2D uPositionState;
uniform sampler2D uVelocityState;
uniform sampler2D uImage;
uniform vec2 uImageTexel;
uniform vec2 uViewport;
uniform float uImageAspect;
uniform float uParticleSize;
uniform float uHaloLifespan;
uniform float uLuminanceMultiplier;
uniform float uHueDrift;
uniform float uColorShiftSpeed;
uniform float uContrast;
uniform float uCoreRetention;
uniform float uHaloWidth;
uniform float uHaloDensity;
uniform float uEdgeFeather;
uniform float uClusterIrregularity;
uniform float uDensityGamma;
uniform float uSparkleAmount;
uniform float uBloomRadius;
uniform float uBloomThreshold;
uniform float uHaloLayer;
uniform float uSurfaceLayer;
uniform float uImageClarity;
uniform float uDepthStrength;
uniform vec2 uRotation;
uniform float uZoom;
uniform float uTime;
uniform float uDpr;
uniform float uAudio;
uniform float uSubjectRhythmStrength;
uniform float uTreble;
uniform float uAudioBrightnessStrength;
uniform float uAudioBloomStrength;
uniform float uSparkleReactStrength;
uniform float uReactTarget;

in vec3 position;
in vec2 aParticleUv;

out vec3 vColor;
out float vAlpha;
out float vGlow;
out float vSparkle;
out float vSurface;

float hash21(vec2 value) {
  vec3 p3 = fract(vec3(value.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hueRotate(vec3 color, float angle) {
  vec3 axis = vec3(0.57735026919);
  return max(
    color * cos(angle) +
    cross(axis, color) * sin(angle) +
    axis * dot(axis, color) * (1.0 - cos(angle)),
    vec3(0.0)
  );
}

vec3 rotateField(vec3 point, vec2 rotation) {
  float cosYaw = cos(rotation.y);
  float sinYaw = sin(rotation.y);
  vec3 yawed = vec3(
    point.x * cosYaw + point.z * sinYaw,
    point.y,
    -point.x * sinYaw + point.z * cosYaw
  );
  float cosPitch = cos(rotation.x);
  float sinPitch = sin(rotation.x);
  return vec3(
    yawed.x,
    yawed.y * cosPitch - yawed.z * sinPitch,
    yawed.y * sinPitch + yawed.z * cosPitch
  );
}

void main() {
  vec4 particle = texture(uPositionState, aParticleUv);
  vec4 motion = texture(uVelocityState, aParticleUv);
  vec4 source = texture(uImage, aParticleUv);
  float viewportAspect = max(uViewport.x / max(uViewport.y, 1.0), 0.001);
  vec2 fit = vec2(0.91);
  if (uImageAspect > viewportAspect) {
    fit.y *= viewportAspect / uImageAspect;
  } else {
    fit.x *= uImageAspect / viewportAspect;
  }

  vec2 home = aParticleUv * 2.0 - 1.0;
  float seed = particle.w;
  float radius = length(home / vec2(1.0, 1.06));
  float angle = atan(home.y, home.x);
  float contourNoise =
    sin(angle * 3.0 + 1.7) * 0.55 +
    sin(angle * 7.0 - 0.8) * 0.28 +
    sin(angle * 13.0 + 2.4) * 0.17;
  float granularNoise = hash21(aParticleUv * 91.73) - 0.5;
  float irregular = contourNoise * uClusterIrregularity;
  float boundary = 0.82 + irregular * 0.18 +
    granularNoise * uClusterIrregularity * 0.12;
  float shapeMask = 1.0 - smoothstep(
    boundary,
    boundary + max(uEdgeFeather * 0.46, 0.025),
    radius
  );

  float luminance = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
  float left = dot(texture(uImage, aParticleUv - vec2(uImageTexel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float right = dot(texture(uImage, aParticleUv + vec2(uImageTexel.x, 0.0)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float down = dot(texture(uImage, aParticleUv - vec2(0.0, uImageTexel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float up = dot(texture(uImage, aParticleUv + vec2(0.0, uImageTexel.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
  float imageEdge = clamp(length(vec2(right - left, up - down)) * 2.2, 0.0, 1.0);
  float contentBounds = 1.0 - smoothstep(
    0.76 + contourNoise * uClusterIrregularity * 0.035,
    1.02 + contourNoise * uClusterIrregularity * 0.025,
    radius
  );
  float contentOverride = smoothstep(0.045, 0.42, luminance) *
    uCoreRetention * contentBounds;
  float clusterMask = max(shapeMask, contentOverride);

  float haloGate = step(1.0 - uHaloDensity, hash21(aParticleUv * 1723.91 + seed));
  float haloBand = smoothstep(0.42, 1.02, radius);
  vec2 haloDirection = normalize(home + vec2(0.0001));
  float trailSelector = pow(hash21(aParticleUv * 2309.73 + seed), 2.4);
  vec2 plumeDirection = normalize(vec2(
    sin(seed * 31.0 + angle * 1.7) * 0.42,
    0.72 + cos(seed * 19.0 - angle) * 0.28
  ));
  float haloFlutter = sin(uTime * 0.31 + seed * 21.0) * 0.5 + 0.5;
  float trailLength = uHaloWidth * haloBand *
    (0.18 + seed * 0.46 + trailSelector * 1.55);
  trailLength *= 1.0 + uAudio * (0.22 + trailSelector * 0.9);
  vec2 haloOffset = mix(
    haloDirection,
    plumeDirection,
    0.38 + trailSelector * 0.5
  ) * trailLength;
  haloOffset += vec2(
    sin(seed * 41.0 + uTime * 0.19),
    cos(seed * 37.0 - uTime * 0.17)
  ) * uHaloWidth * (0.08 + trailSelector * 0.18) * haloFlutter;

  float relief = (luminance - 0.38) * clamp(uDepthStrength / 100.0, 0.0, 2.0) * 0.18;
  relief += imageEdge * clamp(uDepthStrength / 100.0, 0.0, 2.0) * 0.075;
  relief += granularNoise * 0.018;
  vec3 fieldPosition = vec3(
    particle.xy + haloOffset * uHaloLayer,
    particle.z + relief * mix(1.0, 0.3, uHaloLayer)
  );
  float subjectPulse = pow(clamp(uAudio, 0.0, 1.0), 0.72) *
    uSubjectRhythmStrength;
  float subjectBreath = 1.0 + subjectPulse *
    (0.012 + sin(uTime * 1.7) * 0.004);
  fieldPosition.xy *= mix(subjectBreath, 1.0 + subjectPulse * 0.018, uHaloLayer);
  fieldPosition.z += sin(
    home.x * 2.8 + home.y * 2.1 + uTime * 1.35
  ) * subjectPulse * 0.012;
  vec3 rotatedPosition = rotateField(fieldPosition, uRotation);
  float perspective = clamp(1.0 / (1.0 - rotatedPosition.z * 0.42), 0.58, 1.7);
  vec2 clipPosition = rotatedPosition.xy * fit * perspective * uZoom;
  gl_Position = vec4(clipPosition, 0.0, 1.0);

  float detached = step(0.0, motion.w);
  float age = clamp(motion.w / max(uHaloLifespan, 0.01), 0.0, 1.0);
  float decay = 1.0 - smoothstep(0.38, 1.0, age);
  float softPulse = 0.94 + sin(uTime * 0.56 + particle.z * 19.0) * 0.06;
  float audioSize = step(-0.5, uReactTarget) * step(uReactTarget, 0.5) * uAudio * 0.08;
  float bloomSize = smoothstep(uBloomThreshold, 1.0, luminance) * uBloomRadius;
  float zoomPointScale = sqrt(max(uZoom, 0.55));
  float luminousPointSize = clamp(
    uParticleSize * uDpr * perspective * zoomPointScale *
      (0.58 + sqrt(max(luminance, 0.0)) * 0.66 + audioSize + bloomSize * 0.34) *
      mix(1.0, 0.76, uHaloLayer),
    0.65 * uDpr,
    7.5 * uDpr
  );
  float surfacePointSize = clamp(
    uParticleSize * uDpr * perspective * zoomPointScale *
      (0.46 + sqrt(max(luminance, 0.0)) * 0.27),
    0.62 * uDpr,
    3.1 * uDpr
  );
  gl_PointSize = mix(luminousPointSize, surfacePointSize, uSurfaceLayer);

  float hueTarget = step(2.5, uReactTarget) * uAudio * 0.08;
  float hueAngle = radians(uHueDrift) * (0.3 + seed * 0.7) *
    sin(uTime * uColorShiftSpeed * 0.12 + seed * 6.2831);
  hueAngle += hueTarget;
  vec3 contrasted = clamp((source.rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec3 color = hueRotate(contrasted, hueAngle);
  color *= mix(0.9, uLuminanceMultiplier, smoothstep(0.42, 0.92, luminance));
  color *= 1.0 + uAudio * uAudioBrightnessStrength;
  color += vec3(0.08, 0.16, 0.24) * detached * 0.22;
  vec3 surfaceColor = contrasted * (0.86 + luminance * 0.2);
  surfaceColor *= 1.0 + uAudio * uAudioBrightnessStrength * 0.72;
  color = mix(color, surfaceColor, uSurfaceLayer);

  float surfacePulse = 0.99 + sin(uTime * 0.38 + seed * 8.0) * 0.01;
  vColor = color * mix(softPulse, surfacePulse, uSurfaceLayer);
  float density = pow(max(luminance, 0.012), max(uDensityGamma, 0.1));
  float coreAlpha = source.a * clusterMask * (0.24 + density * 0.92);
  float surfaceAlpha = source.a * clusterMask * uImageClarity *
    (0.48 + density * 0.48) * (0.9 + hash21(aParticleUv * 613.1) * 0.1);
  float haloAlpha = source.a * haloGate * uHaloDensity *
    (0.16 + density * 0.48 + imageEdge * 0.34) * mix(1.0, decay, detached);
  haloAlpha *= 1.0 + uAudio * (0.72 + trailSelector * 0.88);
  float luminousAlpha = mix(
    mix(coreAlpha, haloAlpha, uHaloLayer),
    surfaceAlpha,
    uSurfaceLayer
  );
  float audioAlphaGain = mix(
    1.0 + uAudio * mix(0.06, 0.82, uHaloLayer),
    1.0 + uAudio * 0.035,
    uSurfaceLayer
  );
  vAlpha = luminousAlpha * audioAlphaGain;
  vGlow = (
    smoothstep(uBloomThreshold, 1.0, luminance) + imageEdge * 0.28 +
    detached * 0.12 +
    uAudio * uAudioBloomStrength * mix(0.22, 1.0, uHaloLayer)
  ) * mix(1.0, 0.22, uSurfaceLayer);
  vSparkle = hash21(aParticleUv * 787.13) * uSparkleAmount *
    (0.35 + 0.65 * sin(uTime * (0.8 + seed) + seed * 31.0) * 0.5 + 0.5);
  vSparkle += hash21(aParticleUv * 1291.37 + seed) * uTreble * uSparkleReactStrength;
  float sparkleZone = mix(
    0.2 + imageEdge * 0.8,
    0.46 + haloBand * 0.74,
    uHaloLayer
  );
  vSparkle *= sparkleZone;
  vSparkle *= 1.0 - uSurfaceLayer;
  vSurface = uSurfaceLayer;
}
`;

const PARTICLE_FRAGMENT = `precision highp float;

in vec3 vColor;
in float vAlpha;
in float vGlow;
in float vSparkle;
in float vSurface;

uniform float uHighlightGain;
uniform float uBloomStrength;

out vec4 outColor;

void main() {
  vec2 centered = gl_PointCoord - 0.5;
  float radius = length(centered);
  if (radius > 0.5) discard;
  float core = 1.0 - smoothstep(0.04, 0.23, radius);
  float halo = 1.0 - smoothstep(0.12, 0.5, radius);
  float luminousAlpha = vAlpha *
    (core * 0.84 + halo * (0.14 + vGlow * uBloomStrength * 0.14));
  luminousAlpha += vSparkle * core * 0.22;
  float grainDisc = 1.0 - smoothstep(0.34, 0.5, radius);
  float surfaceAlpha = vAlpha * grainDisc * (0.9 + vGlow * 0.08);
  float alpha = mix(luminousAlpha, surfaceAlpha, vSurface);
  if (alpha < 0.006) discard;
  vec3 luminousColor = vColor * (0.88 + vGlow * uHighlightGain * 0.24 + vSparkle);
  vec3 surfaceColor = vColor * (0.94 + vGlow * 0.08);
  vec3 litColor = mix(luminousColor, surfaceColor, vSurface);
  vec3 overflow = max(litColor - vec3(1.0), vec3(0.0));
  litColor /= 1.0 + overflow * 0.22;
  outColor = vec4(litColor, alpha);
}
`;

const FADE_VERTEX = `precision highp float;
in vec3 position;
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FADE_FRAGMENT = `precision highp float;
uniform float uOpacity;
out vec4 outColor;
void main() {
  outColor = vec4(0.0, 0.0, 0.0, uOpacity);
}
`;

export type AudioBands = {
  bass: number;
  mid: number;
  treble: number;
};

type GpuParticleFieldProps = {
  imageUrl: string;
  particleCount: number;
  tuning: ParticleTuning;
  audioLevel: number;
  audioBands: AudioBands;
  interactionStrength: number;
  imageClarity: number;
  zoom: number;
  preview?: boolean;
  onReady?: (pointCount: number) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const reactTargetCode = (target: ParticleTuning["reactTarget"]) => {
  switch (target) {
    case "size":
      return 0;
    case "diffusion":
      return 1;
    case "noise":
      return 2;
    case "hue":
      return 3;
    default:
      return -1;
  }
};

function createInitialTextures(side: number) {
  const positionData = new Float32Array(side * side * 4);
  const velocityData = new Float32Array(side * side * 4);
  for (let index = 0; index < side * side; index += 1) {
    const column = index % side;
    const row = Math.floor(index / side);
    const u = (column + 0.5) / side;
    const v = (row + 0.5) / side;
    const seed = (Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1;
    const normalizedSeed = seed < 0 ? seed + 1 : seed;
    const offset = index * 4;
    positionData[offset] = u * 2 - 1;
    positionData[offset + 1] = v * 2 - 1;
    positionData[offset + 2] = 0;
    positionData[offset + 3] = normalizedSeed;
    velocityData[offset] = 0;
    velocityData[offset + 1] = 0;
    velocityData[offset + 2] = 0;
    velocityData[offset + 3] = -(0.5 + normalizedSeed * 4.5);
  }
  const positionTexture = new THREE.DataTexture(
    positionData,
    side,
    side,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  const velocityTexture = new THREE.DataTexture(
    velocityData,
    side,
    side,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  [positionTexture, velocityTexture].forEach((texture) => {
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  });
  return { positionTexture, velocityTexture };
}

function createParticleGeometry(count: number, side: number) {
  const positions = new Float32Array(count * 3);
  const particleUvs = new Float32Array(count * 2);
  for (let index = 0; index < count; index += 1) {
    const column = index % side;
    const row = Math.floor(index / side);
    particleUvs[index * 2] = (column + 0.5) / side;
    particleUvs[index * 2 + 1] = (row + 0.5) / side;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aParticleUv", new THREE.BufferAttribute(particleUvs, 2));
  geometry.setDrawRange(0, count);
  return geometry;
}

function GpuParticleScene({
  imageUrl,
  particleCount,
  tuning,
  audioLevel,
  audioBands,
  interactionStrength,
  imageClarity,
  zoom,
  preview = false,
  onReady,
}: GpuParticleFieldProps) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const pointer = useThree((state) => state.pointer);
  const sourceTexture = useLoader(THREE.TextureLoader, imageUrl);
  const effectiveCount = preview ? Math.min(particleCount, 65_536) : particleCount;
  const side = Math.ceil(Math.sqrt(effectiveCount));
  const initialTextures = useMemo(() => createInitialTextures(side), [side]);
  const initialPositionTexture = initialTextures.positionTexture;
  const initialVelocityTexture = initialTextures.velocityTexture;
  const geometry = useMemo(
    () => createParticleGeometry(effectiveCount, side),
    [effectiveCount, side],
  );
  const simulationCamera = useMemo(
    () => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
    [],
  );
  const simulationScene = useMemo(() => new THREE.Scene(), []);
  const renderTargets = useMemo(() => {
    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };
    const multipleOptions: THREE.RenderTargetOptions = { ...options, count: 2 };
    return [
      new THREE.WebGLRenderTarget<THREE.Texture>(side, side, multipleOptions),
      new THREE.WebGLRenderTarget<THREE.Texture>(side, side, multipleOptions),
    ] as const;
  }, [side]);
  const positionTextureRef = useRef<THREE.Texture>(initialPositionTexture);
  const velocityTextureRef = useRef<THREE.Texture>(initialVelocityTexture);
  const writeIndexRef = useRef(0);
  const frameRef = useRef(0);
  const pointerActiveRef = useRef(0);
  const smoothedPointerRef = useRef(new THREE.Vector2(0, 0));
  const smoothedPointerActiveRef = useRef(0);
  const rotationRef = useRef(new THREE.Vector2(0, 0));
  const rotationTargetRef = useRef(new THREE.Vector2(0, 0));
  const rotationVelocityRef = useRef(new THREE.Vector2(0, 0));
  const zoomRef = useRef(1);
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    x: 0,
    y: 0,
  });
  const smoothedAudioRef = useRef({ level: 0, bass: 0, mid: 0, treble: 0 });
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  const imageSize = useMemo(() => {
    const image = sourceTexture.image as { width?: number; height?: number };
    return {
      width: Math.max(image.width ?? 1, 1),
      height: Math.max(image.height ?? 1, 1),
    };
  }, [sourceTexture]);

  useEffect(() => {
    sourceTexture.colorSpace = THREE.SRGBColorSpace;
    sourceTexture.minFilter = THREE.LinearFilter;
    sourceTexture.magFilter = THREE.LinearFilter;
    sourceTexture.wrapS = THREE.ClampToEdgeWrapping;
    sourceTexture.wrapT = THREE.ClampToEdgeWrapping;
    sourceTexture.needsUpdate = true;
  }, [sourceTexture]);

  useEffect(() => {
    const canvas = gl.domElement;
    const activatePointer = () => {
      pointerActiveRef.current = 1;
    };
    const deactivatePointer = () => {
      if (!dragRef.current.active) pointerActiveRef.current = 0;
    };
    const beginDrag = (event: PointerEvent) => {
      activatePointer();
      if (preview) return;
      dragRef.current = {
        active: true,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      canvas.setPointerCapture?.(event.pointerId);
    };
    const rotateCloud = (event: PointerEvent) => {
      activatePointer();
      const drag = dragRef.current;
      if (preview || !drag.active || drag.pointerId !== event.pointerId) return;
      const deltaX = event.clientX - drag.x;
      const deltaY = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      const target = rotationTargetRef.current;
      target.x = clamp(target.x - deltaY * 0.0062, -1.43, 1.43);
      target.y = clamp(target.y + deltaX * 0.0062, -1.43, 1.43);
      rotationVelocityRef.current.set(-deltaY * 0.00145, deltaX * 0.00145);
    };
    const endDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) return;
      drag.active = false;
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };
    canvas.addEventListener("pointerenter", activatePointer, { passive: true });
    canvas.addEventListener("pointermove", rotateCloud, { passive: true });
    canvas.addEventListener("pointerdown", beginDrag, { passive: true });
    canvas.addEventListener("pointerup", endDrag, { passive: true });
    canvas.addEventListener("pointerleave", deactivatePointer, { passive: true });
    canvas.addEventListener("pointercancel", endDrag, { passive: true });
    window.addEventListener("pointerup", endDrag, { passive: true });
    return () => {
      canvas.removeEventListener("pointerenter", activatePointer);
      canvas.removeEventListener("pointermove", rotateCloud);
      canvas.removeEventListener("pointerdown", beginDrag);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointerleave", deactivatePointer);
      canvas.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("pointerup", endDrag);
    };
  }, [gl, preview]);

  useEffect(() => {
    rotationRef.current.set(0, 0);
    rotationTargetRef.current.set(0, 0);
    rotationVelocityRef.current.set(0, 0);
    zoomRef.current = 1;
  }, [imageUrl]);

  const simulationMaterial = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SIMULATION_VERTEX,
    fragmentShader: SIMULATION_FRAGMENT,
    uniforms: {
      uPositionState: { value: initialPositionTexture },
      uVelocityState: { value: initialVelocityTexture },
      uImage: { value: sourceTexture },
      uImageTexel: { value: new THREE.Vector2(1 / imageSize.width, 1 / imageSize.height) },
      uViewport: { value: new THREE.Vector2(size.width, size.height) },
      uFit: { value: new THREE.Vector2(0.91, 0.91) },
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uPeelThreshold: { value: tuning.peelThreshold },
      uErosionRate: { value: tuning.erosionRate },
      uNoiseStrength: { value: tuning.noiseStrength },
      uNoiseFrequency: { value: tuning.noiseFrequency },
      uFlowSpeed: { value: tuning.flowSpeed },
      uFlowAmplitude: { value: tuning.flowAmplitude },
      uDepthStrength: { value: tuning.depthStrength },
      uDepthWave: { value: tuning.depthWave },
      uCoreRetention: { value: tuning.coreRetention },
      uHomeSpring: { value: tuning.homeSpring },
      uVelocityDamping: { value: tuning.velocityDamping },
      uEdgePerturbation: { value: tuning.edgePerturbation },
      uEdgeScatter: { value: tuning.edgeScatter },
      uDiffusion: { value: tuning.diffusion },
      uHaloLifespan: { value: tuning.emberLifespan },
      uWind: { value: new THREE.Vector2(tuning.windX, tuning.windY) },
      uPointer: { value: new THREE.Vector2(2, 2) },
      uRotation: { value: new THREE.Vector2(0, 0) },
      uPointerForce: { value: interactionStrength * tuning.mouseForce },
      uPointerActive: { value: 0 },
      uMouseRadius: { value: tuning.mouseRadius },
      uMouseRepulsion: { value: tuning.mouseRepulsion },
      uMouseSwirl: { value: tuning.mouseSwirl },
      uMouseRingWidth: { value: tuning.mouseRingWidth },
      uMouseDepthPull: { value: tuning.mouseDepthPull },
      uAudioEnergy: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uBassGain: { value: tuning.bassGain },
      uFlowReactStrength: { value: tuning.flowReactStrength },
      uDepthReactStrength: { value: tuning.depthReactStrength },
      uRhythmIntensity: { value: tuning.rhythmIntensity },
      uDanceStrength: { value: tuning.danceStrength },
      uReactTarget: { value: reactTargetCode(tuning.reactTarget) },
    },
    depthTest: false,
    depthWrite: false,
  }), [
    imageSize.height,
    imageSize.width,
    initialPositionTexture,
    initialVelocityTexture,
    size.height,
    size.width,
    sourceTexture,
  ]);

  const simulationQuad = useMemo(() => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simulationMaterial);
    mesh.frustumCulled = false;
    simulationScene.add(mesh);
    return mesh;
  }, [simulationMaterial, simulationScene]);

  const particleMaterial = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: PARTICLE_VERTEX,
    fragmentShader: PARTICLE_FRAGMENT,
    uniforms: {
      uPositionState: { value: initialPositionTexture },
      uVelocityState: { value: initialVelocityTexture },
      uImage: { value: sourceTexture },
      uImageTexel: { value: new THREE.Vector2(1 / imageSize.width, 1 / imageSize.height) },
      uViewport: { value: new THREE.Vector2(size.width, size.height) },
      uImageAspect: { value: imageSize.width / imageSize.height },
      uParticleSize: { value: tuning.particleSize },
      uHaloLifespan: { value: tuning.emberLifespan },
      uLuminanceMultiplier: { value: tuning.luminanceMultiplier },
      uHueDrift: { value: tuning.hueDrift },
      uColorShiftSpeed: { value: tuning.colorShiftSpeed },
      uContrast: { value: tuning.contrast },
      uCoreRetention: { value: tuning.coreRetention },
      uHaloWidth: { value: tuning.haloWidth },
      uHaloDensity: { value: tuning.haloDensity },
      uEdgeFeather: { value: tuning.edgeFeather },
      uClusterIrregularity: { value: tuning.clusterIrregularity },
      uDensityGamma: { value: tuning.densityGamma },
      uSparkleAmount: { value: tuning.sparkleAmount },
      uHighlightGain: { value: tuning.highlightGain },
      uBloomStrength: { value: tuning.bloomStrength },
      uBloomRadius: { value: tuning.bloomRadius },
      uBloomThreshold: { value: tuning.bloomThreshold },
      uHaloLayer: { value: 0 },
      uSurfaceLayer: { value: 0 },
      uImageClarity: { value: imageClarity },
      uDepthStrength: { value: tuning.depthStrength },
      uRotation: { value: new THREE.Vector2(0, 0) },
      uZoom: { value: 1 },
      uTime: { value: 0 },
      uDpr: { value: gl.getPixelRatio() },
      uAudio: { value: 0 },
      uSubjectRhythmStrength: { value: tuning.subjectRhythmStrength },
      uTreble: { value: 0 },
      uAudioBrightnessStrength: { value: tuning.audioBrightnessStrength },
      uAudioBloomStrength: { value: tuning.audioBloomStrength },
      uSparkleReactStrength: { value: tuning.sparkleReactStrength },
      uReactTarget: { value: reactTargetCode(tuning.reactTarget) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [
    gl,
    imageSize.height,
    imageSize.width,
    initialPositionTexture,
    initialVelocityTexture,
    size.height,
    size.width,
    sourceTexture,
  ]);

  const haloMaterial = useMemo(() => {
    const material = particleMaterial.clone();
    material.uniforms.uHaloLayer.value = 1;
    return material;
  }, [particleMaterial]);

  const surfaceMaterial = useMemo(() => {
    const material = particleMaterial.clone();
    material.uniforms.uSurfaceLayer.value = 1;
    material.blending = THREE.NormalBlending;
    material.needsUpdate = true;
    return material;
  }, [particleMaterial]);

  const fadeMaterial = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: FADE_VERTEX,
    fragmentShader: FADE_FRAGMENT,
    uniforms: {
      uOpacity: { value: clamp(1 - tuning.trailLength, 0.015, 1) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NormalBlending,
  }), []);

  useEffect(() => {
    positionTextureRef.current = initialPositionTexture;
    velocityTextureRef.current = initialVelocityTexture;
    writeIndexRef.current = 0;
    onReadyRef.current?.(effectiveCount);
    return () => {
      simulationScene.remove(simulationQuad);
      simulationQuad.geometry.dispose();
      simulationMaterial.dispose();
      particleMaterial.dispose();
      haloMaterial.dispose();
      surfaceMaterial.dispose();
      fadeMaterial.dispose();
      geometry.dispose();
      initialPositionTexture.dispose();
      initialVelocityTexture.dispose();
      renderTargets.forEach((target) => target.dispose());
    };
  }, [
    effectiveCount,
    fadeMaterial,
    geometry,
    haloMaterial,
    initialPositionTexture,
    initialVelocityTexture,
    particleMaterial,
    renderTargets,
    simulationMaterial,
    simulationQuad,
    simulationScene,
    surfaceMaterial,
  ]);

  useFrame((state, delta) => {
    frameRef.current += 1;
    if (preview && frameRef.current % 2 === 1) return;

    const smoothed = smoothedAudioRef.current;
    const gatedLevel = clamp(
      (audioLevel - tuning.audioNoiseGate) / Math.max(1 - tuning.audioNoiseGate, 0.001),
      0,
      1,
    );
    const curvedLevel = Math.pow(gatedLevel, clamp(tuning.audioDynamicCurve, 0.3, 1.5));
    const envelopeTime = curvedLevel > smoothed.level
      ? Math.max(tuning.audioAttack, 0.01)
      : Math.max(tuning.audioRelease, 0.05);
    const envelopeResponse = 1 - Math.exp(-delta / envelopeTime);
    smoothed.level += (curvedLevel - smoothed.level) * envelopeResponse;

    const smoothing = clamp(tuning.audioSmoothing, 0.1, 0.99);
    const bandResponse = 1 - Math.pow(smoothing, delta * 60);
    smoothed.bass += (audioBands.bass - smoothed.bass) * bandResponse;
    smoothed.mid += (audioBands.mid - smoothed.mid) * bandResponse;
    smoothed.treble += (audioBands.treble - smoothed.treble) * bandResponse;

    const viewportAspect = Math.max(size.width / Math.max(size.height, 1), 0.001);
    const imageAspect = imageSize.width / imageSize.height;
    let fitX = 0.91;
    let fitY = 0.91;
    if (imageAspect > viewportAspect) {
      fitY *= viewportAspect / imageAspect;
    } else {
      fitX *= imageAspect / viewportAspect;
    }

    const pointerBlend = 1 - Math.exp(-delta / Math.max(tuning.pointerSmoothing, 0.01));
    smoothedPointerRef.current.lerp(pointer, pointerBlend);
    smoothedPointerActiveRef.current +=
      (pointerActiveRef.current - smoothedPointerActiveRef.current) * pointerBlend;

    if (!preview && !dragRef.current.active) {
      const velocity = rotationVelocityRef.current;
      const target = rotationTargetRef.current;
      target.x = clamp(target.x + velocity.x * delta * 60, -1.43, 1.43);
      target.y = clamp(target.y + velocity.y * delta * 60, -1.43, 1.43);
      velocity.multiplyScalar(Math.exp(-delta * 5.4));
    }
    const rotationBlend = 1 - Math.exp(-delta * 12);
    rotationRef.current.lerp(rotationTargetRef.current, rotationBlend);
    const zoomBlend = 1 - Math.exp(-delta * 10);
    zoomRef.current += (clamp(zoom, 0.55, 2.5) - zoomRef.current) * zoomBlend;

    const simUniforms = simulationMaterial.uniforms;
    simUniforms.uPositionState.value = positionTextureRef.current;
    simUniforms.uVelocityState.value = velocityTextureRef.current;
    simUniforms.uViewport.value.set(size.width, size.height);
    simUniforms.uFit.value.set(fitX * zoomRef.current, fitY * zoomRef.current);
    simUniforms.uTime.value = state.clock.elapsedTime;
    simUniforms.uDelta.value = Math.min(delta, 0.05) * (preview ? 2 : 1);
    simUniforms.uPeelThreshold.value = tuning.peelThreshold;
    simUniforms.uErosionRate.value = tuning.erosionRate;
    simUniforms.uNoiseStrength.value = tuning.noiseStrength;
    simUniforms.uNoiseFrequency.value = tuning.noiseFrequency;
    simUniforms.uFlowSpeed.value = tuning.flowSpeed;
    simUniforms.uFlowAmplitude.value = tuning.flowAmplitude;
    simUniforms.uDepthStrength.value = tuning.depthStrength;
    simUniforms.uDepthWave.value = tuning.depthWave;
    simUniforms.uCoreRetention.value = tuning.coreRetention;
    simUniforms.uHomeSpring.value = tuning.homeSpring;
    simUniforms.uVelocityDamping.value = tuning.velocityDamping;
    simUniforms.uEdgePerturbation.value = tuning.edgePerturbation;
    simUniforms.uEdgeScatter.value = tuning.edgeScatter;
    simUniforms.uDiffusion.value = tuning.diffusion;
    simUniforms.uHaloLifespan.value = tuning.emberLifespan;
    simUniforms.uWind.value.set(tuning.windX, tuning.windY);
    simUniforms.uPointer.value.copy(smoothedPointerRef.current);
    simUniforms.uRotation.value.copy(rotationRef.current);
    simUniforms.uPointerForce.value = interactionStrength * tuning.mouseForce;
    simUniforms.uPointerActive.value = smoothedPointerActiveRef.current;
    simUniforms.uMouseRadius.value = tuning.mouseRadius;
    simUniforms.uMouseRepulsion.value = tuning.mouseRepulsion;
    simUniforms.uMouseSwirl.value = tuning.mouseSwirl;
    simUniforms.uMouseRingWidth.value = tuning.mouseRingWidth;
    simUniforms.uMouseDepthPull.value = tuning.mouseDepthPull;
    simUniforms.uAudioEnergy.value = smoothed.level;
    simUniforms.uBass.value = smoothed.bass;
    simUniforms.uMid.value = smoothed.mid;
    simUniforms.uTreble.value = smoothed.treble;
    simUniforms.uBassGain.value = tuning.bassGain;
    simUniforms.uFlowReactStrength.value = tuning.flowReactStrength;
    simUniforms.uDepthReactStrength.value = tuning.depthReactStrength;
    simUniforms.uRhythmIntensity.value = tuning.rhythmIntensity;
    simUniforms.uDanceStrength.value = tuning.danceStrength;
    simUniforms.uReactTarget.value = reactTargetCode(tuning.reactTarget);

    const target = renderTargets[writeIndexRef.current];
    const previousTarget = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(simulationScene, simulationCamera);
    gl.setRenderTarget(previousTarget);
    positionTextureRef.current = target.textures[0];
    velocityTextureRef.current = target.textures[1];
    writeIndexRef.current = writeIndexRef.current === 0 ? 1 : 0;

    [particleMaterial, haloMaterial, surfaceMaterial].forEach((material) => {
      const pointUniforms = material.uniforms;
      pointUniforms.uPositionState.value = positionTextureRef.current;
      pointUniforms.uVelocityState.value = velocityTextureRef.current;
      pointUniforms.uViewport.value.set(size.width, size.height);
      pointUniforms.uParticleSize.value = tuning.particleSize;
      pointUniforms.uHaloLifespan.value = tuning.emberLifespan;
      pointUniforms.uLuminanceMultiplier.value = tuning.luminanceMultiplier;
      pointUniforms.uHueDrift.value = tuning.hueDrift;
      pointUniforms.uColorShiftSpeed.value = tuning.colorShiftSpeed;
      pointUniforms.uContrast.value = tuning.contrast;
      pointUniforms.uCoreRetention.value = tuning.coreRetention;
      pointUniforms.uHaloWidth.value = tuning.haloWidth;
      pointUniforms.uHaloDensity.value = tuning.haloDensity;
      pointUniforms.uEdgeFeather.value = tuning.edgeFeather;
      pointUniforms.uClusterIrregularity.value = tuning.clusterIrregularity;
      pointUniforms.uDensityGamma.value = tuning.densityGamma;
      pointUniforms.uSparkleAmount.value = tuning.sparkleAmount;
      pointUniforms.uHighlightGain.value = tuning.highlightGain;
      pointUniforms.uBloomStrength.value = tuning.bloomStrength;
      pointUniforms.uBloomRadius.value = tuning.bloomRadius;
      pointUniforms.uBloomThreshold.value = tuning.bloomThreshold;
      pointUniforms.uImageClarity.value = imageClarity;
      pointUniforms.uDepthStrength.value = tuning.depthStrength;
      pointUniforms.uRotation.value.copy(rotationRef.current);
      pointUniforms.uZoom.value = zoomRef.current;
      pointUniforms.uTime.value = state.clock.elapsedTime;
      pointUniforms.uDpr.value = gl.getPixelRatio();
      pointUniforms.uAudio.value = smoothed.level;
      pointUniforms.uSubjectRhythmStrength.value = tuning.subjectRhythmStrength;
      pointUniforms.uTreble.value = smoothed.treble;
      pointUniforms.uAudioBrightnessStrength.value = tuning.audioBrightnessStrength;
      pointUniforms.uAudioBloomStrength.value = tuning.audioBloomStrength;
      pointUniforms.uSparkleReactStrength.value = tuning.sparkleReactStrength;
      pointUniforms.uReactTarget.value = reactTargetCode(tuning.reactTarget);
    });
    fadeMaterial.uniforms.uOpacity.value = preview
      ? 1
      : clamp(1 - tuning.trailLength, 0.015, 1);
  }, -1);

  return (
    <>
      {!preview && (
        <mesh renderOrder={-1000} frustumCulled={false}>
          <planeGeometry args={[2, 2]} />
          <primitive object={fadeMaterial} attach="material" />
        </mesh>
      )}
      <points
        geometry={geometry}
        material={surfaceMaterial}
        frustumCulled={false}
        renderOrder={-2}
      />
      <points
        geometry={geometry}
        material={haloMaterial}
        frustumCulled={false}
        renderOrder={0}
      />
      <points
        geometry={geometry}
        material={particleMaterial}
        frustumCulled={false}
        renderOrder={1}
      />
    </>
  );
}

export default GpuParticleScene;
