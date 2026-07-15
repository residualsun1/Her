"use client";
/* eslint-disable @next/next/no-img-element -- fallback must support uploaded blob URLs */

import { useEffect, useRef, useState } from "react";
import styles from "./ParticleGarden.module.css";

export interface ParticleGardenReadyDetail {
  pointCount: number;
  reducedMotion: boolean;
  renderer: "webgl2" | "unavailable";
}

export type ParticleTuning = {
  dispersion: number;
  particleSize: number;
  contrast: number;
  flowSpeed: number;
  flowAmplitude: number;
  depthStrength: number;
  mouseRadius: number;
  colorShiftSpeed: number;
  danceStrength: number;
  depthWave: number;
};

export type SubjectTuning = {
  backgroundSuppression: number;
  exposure: number;
  shadowLift: number;
  surfaceFill: number;
  edgePreservation: number;
};

export const DEFAULT_PARTICLE_TUNING: ParticleTuning = {
  dispersion: 1.5,
  particleSize: 2.8,
  contrast: 1.3,
  flowSpeed: 1,
  flowAmplitude: 1,
  depthStrength: 50,
  mouseRadius: 110,
  colorShiftSpeed: 2,
  danceStrength: 7.5,
  depthWave: 5,
};

export const DEFAULT_SUBJECT_TUNING: SubjectTuning = {
  backgroundSuppression: 0.74,
  exposure: 1.34,
  shadowLift: 0.12,
  surfaceFill: 1.12,
  edgePreservation: 0.72,
};

export interface ParticleGardenProps {
  /** A same-origin URL, data URL, or object URL created from an uploaded image. */
  imageUrl?: string | null;
  /** Normalized microphone/music energy. Values outside 0..1 are clamped. */
  audioLevel?: number;
  /** Multiplier for the pointer gravity well. */
  interactionStrength?: number;
  /** Strength of the continuous subject layer below the reconstructed point cloud. */
  imageClarity?: number;
  /** True when the supplied asset is already a finished particle reference and needs layered preservation. */
  precomposed?: boolean;
  /** Live controls mirroring the visual parameters shown in the reference video. */
  tuning?: Partial<ParticleTuning>;
  /** Subject-aware preparation applied before the image becomes a particle field. */
  subjectTuning?: Partial<SubjectTuning>;
  className?: string;
  onReady?: (detail: ParticleGardenReadyDetail) => void;
}

type MutableInput = {
  audio: number;
  interaction: number;
  clarity: number;
  tuning: ParticleTuning;
  subject: SubjectTuning;
  precomposed: boolean;
};

type PointerState = {
  x: number;
  y: number;
  active: number;
};

type DragState = {
  x: number;
  y: number;
};

type NavigatorWithPerformanceHints = Navigator & {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
  };
};

type SubjectAnalysis = {
  width: number;
  height: number;
  saliency: Float32Array;
};

const FLOATS_PER_POINT = 11;
const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aHome;
layout(location = 1) in vec4 aColor;
layout(location = 2) in vec4 aMeta;
layout(location = 3) in float aSubject;

uniform float uTime;
uniform float uAudio;
uniform float uInteraction;
uniform float uMotion;
uniform float uDpr;
uniform float uImageAspect;
uniform vec2 uViewport;
uniform vec3 uPointer;
uniform vec2 uDrag;
uniform float uSubjectDetail;
uniform float uDispersion;
uniform float uParticleSize;
uniform float uContrast;
uniform float uFlowSpeed;
uniform float uFlowAmplitude;
uniform float uDepthStrength;
uniform float uMouseRadius;
uniform float uColorShiftSpeed;
uniform float uDanceStrength;
uniform float uDepthWave;
uniform float uSubjectFill;

out vec4 vColor;
out float vHalo;
out float vSpark;
out float vField;

const float TAU = 6.28318530718;

vec3 rotateHue(vec3 color, float angle) {
  vec3 axis = vec3(0.57735026919);
  return color * cos(angle) + cross(axis, color) * sin(angle) + axis * dot(axis, color) * (1.0 - cos(angle));
}

void main() {
  float viewportAspect = max(uViewport.x / max(uViewport.y, 1.0), 0.001);
  vec2 fit = vec2(0.88);

  if (uImageAspect > viewportAspect) {
    fit.y *= viewportAspect / uImageAspect;
  } else {
    fit.x *= uImageAspect / viewportAspect;
  }

  vec2 base = aHome * fit;
  vec2 randomDirection = vec2(
    cos(aMeta.x * TAU + aMeta.y * 2.7),
    sin(aMeta.x * TAU + aMeta.y * 2.7)
  );
  vec2 radial = normalize(aHome + vec2(0.0001));
  vec2 curlDirection = vec2(-radial.y, radial.x);
  float core = 1.0 - smoothstep(
    0.35,
    0.82,
    length(vec2(aHome.x * 0.9, (aHome.y - 0.12) * 0.72))
  );
  float subjectDeform = mix(0.42, 0.12, uSubjectDetail);
  float deform = mix(subjectDeform, 1.0, pow(1.0 - core, 1.05));
  deform = mix(deform, 1.0, aMeta.w);

  float outerMetric = length(vec2(aHome.x * 0.82, aHome.y));
  float envelopeNoise = sin(aHome.x * 4.1 + aMeta.x * TAU) * 0.055;
  envelopeNoise += cos(aHome.y * 5.2 + aMeta.y * TAU) * 0.045;
  float imageEnvelope = 1.0 - smoothstep(0.68, 1.04, outerMetric + envelopeNoise);

  // The dense surface is always alive; the face moves less, but never becomes a static photo.
  float motionTime = uTime * uMotion * max(uFlowSpeed, 0.0);
  vec2 flow = vec2(
    sin(aHome.y * 7.4 + motionTime * 0.34 + sin(aHome.x * 4.2 - motionTime * 0.17) + aMeta.x * TAU),
    cos(aHome.x * 6.8 - motionTime * 0.29 + cos(aHome.y * 4.6 + motionTime * 0.15) + aMeta.y * TAU)
  );
  base += flow * (0.0024 + aMeta.z * 0.0042) * uMotion * uFlowAmplitude * deform;

  // Edge duplicates form the turbulent blue-white halo visible in the references.
  float haloBreath = 0.76 + 0.24 * sin(uTime * 0.52 + aMeta.y * TAU);
  float haloDistance = (0.034 + aMeta.y * 0.124) * haloBreath * (uDispersion / 1.5);
  float haloCurl = sin(uTime * 0.38 + aMeta.x * TAU + aHome.y * 3.0);
  base += aMeta.w * (
    radial * haloDistance +
    curlDirection * haloDistance * haloCurl * 0.62 +
    randomDirection * haloDistance * 0.34
  );
  base += randomDirection * aMeta.z * 0.008 * deform * uDispersion * (0.72 + 0.28 * sin(motionTime + aMeta.x * TAU));

  // Voice and music add breathing, depth and sparkle without erasing the subject.
  float audioWave = sin(uTime * (2.2 + aMeta.y * 2.1) + aMeta.x * TAU);
  float audioEnergy = uAudio * (uDanceStrength / 7.5);
  float audioPulse = audioEnergy * (0.55 + 0.45 * audioWave);
  base += radial * audioPulse * (0.005 + aMeta.z * 0.016 + aMeta.w * 0.036) * deform;
  float luminance = dot(aColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  float depthScale = uDepthStrength / 50.0;
  float depthWave = sin(aHome.x * (4.0 + uDepthWave * 0.2) + aHome.y * (3.4 + uDepthWave * 0.16) + motionTime * 0.8 + aMeta.x * TAU);
  float depth = (luminance - 0.5) * 0.12 * depthScale;
  depth += depthWave * (0.012 + uDepthWave * 0.0028 + audioEnergy * 0.15) * deform * depthScale;
  depth += aMeta.w * sin(uTime * 0.7 + aMeta.y * TAU) * 0.08;

  // Drag rotates the complete point cloud in 3D, then spring inertia returns it home.
  float yaw = uDrag.x * 1.18;
  float pitch = -uDrag.y * 0.86;
  vec3 position = vec3(base, depth);
  float cosYaw = cos(yaw);
  float sinYaw = sin(yaw);
  position = vec3(
    position.x * cosYaw + position.z * sinYaw,
    position.y,
    -position.x * sinYaw + position.z * cosYaw
  );
  float cosPitch = cos(pitch);
  float sinPitch = sin(pitch);
  position = vec3(
    position.x,
    position.y * cosPitch - position.z * sinPitch,
    position.y * sinPitch + position.z * cosPitch
  );
  float dragPerspective = 1.0 / max(0.72, 1.0 - position.z * 0.38);
  base = position.xy * dragPerspective;
  depth = position.z;

  // The pointer creates the black gravity well, luminous rim and swirling wake.
  vec2 toPointer = uPointer.xy - base;
  vec2 screenDelta = vec2(toPointer.x * viewportAspect, toPointer.y);
  float pointerDistance = max(length(screenDelta), 0.0001);
  vec2 screenDirection = screenDelta / pointerDistance;
  vec2 pointerDirection = normalize(vec2(screenDirection.x / viewportAspect, screenDirection.y) + vec2(0.00001));
  vec2 tangent = vec2(-pointerDirection.y, pointerDirection.x);
  float mouseRadius = max((uMouseRadius * 2.0) / max(min(uViewport.x, uViewport.y), 1.0), 0.035);
  float field = exp(-pow(pointerDistance / mouseRadius, 2.0) * 1.45);
  float pointerCore = exp(-pow(pointerDistance / max(mouseRadius * 0.34, 0.001), 2.0) * 2.2);
  float ringRadius = mouseRadius * 0.48;
  float ring = exp(-pow((pointerDistance - ringRadius) / max(mouseRadius * 0.12, 0.001), 2.0));
  float ripple = sin((pointerDistance / mouseRadius) * TAU * 2.0 - uTime * 3.6) * field;
  float pointResponse = (0.55 + aMeta.z * 0.45) * uPointer.z * uInteraction;
  pointResponse *= mix(mix(0.58, 1.0, 1.0 - core), 1.0, aMeta.w);
  base += (pointerDirection * field * 0.052 + tangent * field * 0.07) * pointResponse;
  base -= pointerDirection * pointerCore * 0.13 * pointResponse;
  base += pointerDirection * ripple * 0.012 * pointResponse;

  float perspective = 1.0 + depth * 0.2;
  gl_Position = vec4(base * perspective, depth, 1.0);

  float subjectFill = clamp(uSubjectFill, 0.6, 1.6);
  float surfaceSize = mix(0.76 + uSubjectDetail * 0.18, 1.02, 1.0 - core);
  surfaceSize *= mix(0.92, subjectFill, aSubject);
  float edgeSize = aMeta.z * 0.22 + aMeta.w * 0.18;
  float audioSize = audioEnergy * (0.3 + aMeta.z * 0.42 + aMeta.w * 0.34);
  gl_PointSize = clamp(uParticleSize * (surfaceSize + edgeSize + audioSize) * uDpr * (1.0 + depth * 0.16), 0.7 * uDpr, 6.4 * uDpr);

  vec3 contrastedColor = clamp((aColor.rgb - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec3 liftedColor = pow(max(contrastedColor, vec3(0.0)), vec3(0.9));
  float hueAngle = sin(uTime * uColorShiftSpeed * 0.18 + aMeta.x * TAU) * 0.12 * (0.25 + (1.0 - core) * 0.75);
  liftedColor = max(rotateHue(liftedColor, hueAngle), vec3(0.0));
  float shimmer = 0.88 + 0.12 * sin(uTime * 0.82 + aMeta.x * TAU);
  float surfaceOpacity = mix(0.82 + uSubjectDetail * 0.17, 0.92, 1.0 - core);
  surfaceOpacity *= mix(0.76, min(1.18, 0.9 + subjectFill * 0.2), aSubject);
  float envelopeOpacity = mix(imageEnvelope, max(imageEnvelope, 0.44), aMeta.w);
  vColor = vec4(liftedColor * shimmer, aColor.a * surfaceOpacity * envelopeOpacity);
  vHalo = aMeta.w;
  vSpark = clamp(aMeta.z + audioPulse * 0.58 + ring * uPointer.z * 0.72, 0.0, 1.0);
  vField = ring * uPointer.z;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vColor;
in float vHalo;
in float vSpark;
in float vField;

out vec4 outColor;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float distanceFromCenter = length(centered);
  if (distanceFromCenter > 0.5) {
    discard;
  }

  float core = 1.0 - smoothstep(0.05, 0.29, distanceFromCenter);
  float glow = 1.0 - smoothstep(0.13, 0.5, distanceFromCenter);
  float intensity = core * (0.78 + vSpark * 0.38) + glow * (0.2 + vSpark * 0.2);
  float haloOpacity = mix(1.0, 0.48, vHalo);
  float alpha = vColor.a * intensity * haloOpacity;

  if (alpha < 0.008) {
    discard;
  }

  vec3 fieldTint = mix(vColor.rgb, vec3(0.58, 0.86, 1.0), vField * 0.72);
  outColor = vec4(fieldTint * (0.9 + vSpark * 0.48 + vField * 0.54), alpha);
}
`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const random01 = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
};

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const normalized = clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
};

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Unable to create the particle shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Unable to create the particle program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown program error";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function choosePointBudget(width: number, height: number, reducedMotion: boolean) {
  const performanceNavigator = navigator as NavigatorWithPerformanceHints;
  const cores = performanceNavigator.hardwareConcurrency ?? 4;
  const memory = performanceNavigator.deviceMemory ?? 4;
  const lowPower =
    cores <= 4 || memory <= 4 || performanceNavigator.connection?.saveData === true;
  const compact = width < 700 || height < 700;
  const areaBudget = Math.floor((width * height) / (lowPower ? 8 : compact ? 6 : 5));

  if (reducedMotion) {
    return clamp(areaBudget, 20_000, 42_000);
  }

  return lowPower
    ? clamp(areaBudget, 38_000, 72_000)
    : compact
      ? clamp(areaBudget, 52_000, 96_000)
      : clamp(areaBudget, 68_000, 132_000);
}

function boxBlur(values: Float32Array, width: number, height: number, radius: number) {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));

  for (let row = 0; row < height; row += 1) {
    let rowSum = 0;
    for (let column = 0; column < width; column += 1) {
      rowSum += values[row * width + column];
      integral[(row + 1) * stride + column + 1] =
        integral[row * stride + column + 1] + rowSum;
    }
  }

  const blurred = new Float32Array(values.length);
  for (let row = 0; row < height; row += 1) {
    const top = Math.max(0, row - radius);
    const bottom = Math.min(height - 1, row + radius);
    for (let column = 0; column < width; column += 1) {
      const left = Math.max(0, column - radius);
      const right = Math.min(width - 1, column + radius);
      const sum =
        integral[(bottom + 1) * stride + right + 1] -
        integral[top * stride + right + 1] -
        integral[(bottom + 1) * stride + left] +
        integral[top * stride + left];
      blurred[row * width + column] =
        sum / Math.max(1, (right - left + 1) * (bottom - top + 1));
    }
  }

  return blurred;
}

function percentile(values: Float32Array, ratio: number) {
  const ordered = Array.from(values).sort((left, right) => left - right);
  return ordered[Math.round(clamp(ratio, 0, 1) * Math.max(0, ordered.length - 1))] ?? 0;
}

/**
 * A lightweight, local saliency pass. It distinguishes likely subjects from
 * the border background without uploading, cropping, scaling, or repositioning
 * the source image.
 */
function analyzeSubject(image: HTMLImageElement): SubjectAnalysis {
  const maxDimension = 180;
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight, 1),
  );
  const width = Math.max(24, Math.round(image.naturalWidth * scale));
  const height = Math.max(24, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
  if (!context) {
    return {
      width: 1,
      height: 1,
      saliency: new Float32Array([1]),
    };
  }

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const luminance = new Float32Array(width * height);
  const borderHistogram = new Uint32Array(512);
  const borderSize = Math.max(2, Math.round(Math.min(width, height) * 0.08));

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const offset = index * 4;
      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      luminance[index] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      if (
        row < borderSize ||
        row >= height - borderSize ||
        column < borderSize ||
        column >= width - borderSize
      ) {
        const key = (pixels[offset] >> 5) * 64 +
          (pixels[offset + 1] >> 5) * 8 +
          (pixels[offset + 2] >> 5);
        borderHistogram[key] += 1;
      }
    }
  }

  const palette = Array.from(borderHistogram, (count, key) => ({ count, key }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 10)
    .map(({ key }) => [
      (Math.floor(key / 64) * 32 + 16) / 255,
      (Math.floor((key % 64) / 8) * 32 + 16) / 255,
      ((key % 8) * 32 + 16) / 255,
    ] as const);

  const rawSaliency = new Float32Array(width * height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const offset = index * 4;
      const left = luminance[row * width + Math.max(0, column - 1)];
      const right = luminance[row * width + Math.min(width - 1, column + 1)];
      const top = luminance[Math.max(0, row - 1) * width + column];
      const bottom = luminance[Math.min(height - 1, row + 1) * width + column];
      const edge = Math.hypot(right - left, bottom - top);
      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      let borderDistance = 1;
      for (const color of palette) {
        borderDistance = Math.min(
          borderDistance,
          Math.hypot(red - color[0], green - color[1], blue - color[2]) / 1.35,
        );
      }
      rawSaliency[index] = edge * 1.45 + borderDistance * 0.78;
    }
  }

  const radius = clamp(Math.round(Math.min(width, height) * 0.055), 2, 10);
  const coherentSaliency = boxBlur(rawSaliency, width, height, radius);
  const maskLow = percentile(coherentSaliency, 0.48);
  const maskHigh = percentile(coherentSaliency, 0.86);
  const saliency = new Float32Array(width * height);

  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const score = coherentSaliency[index];
      saliency[index] = smoothstep(maskLow, Math.max(maskLow + 0.0001, maskHigh), score);
    }
  }

  return { width, height, saliency };
}

function sampleSubjectMask(analysis: SubjectAnalysis, normalizedX: number, normalizedY: number) {
  const x = clamp(normalizedX, 0, 1) * (analysis.width - 1);
  const y = clamp(normalizedY, 0, 1) * (analysis.height - 1);
  const left = Math.floor(x);
  const top = Math.floor(y);
  const right = Math.min(analysis.width - 1, left + 1);
  const bottom = Math.min(analysis.height - 1, top + 1);
  const mixX = x - left;
  const mixY = y - top;
  const topValue = analysis.saliency[top * analysis.width + left] * (1 - mixX) +
    analysis.saliency[top * analysis.width + right] * mixX;
  const bottomValue = analysis.saliency[bottom * analysis.width + left] * (1 - mixX) +
    analysis.saliency[bottom * analysis.width + right] * mixX;
  return topValue * (1 - mixY) + bottomValue * mixY;
}

function sampleImage(
  image: HTMLImageElement,
  pointBudget: number,
  analysis: SubjectAnalysis,
  subjectTuning: SubjectTuning,
  precomposed: boolean,
) {
  const imageAspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
  const columns = Math.max(2, Math.round(Math.sqrt(pointBudget * imageAspect)));
  const rows = Math.max(2, Math.round(columns / imageAspect));
  const samplingCanvas = document.createElement("canvas");
  samplingCanvas.width = columns;
  samplingCanvas.height = rows;

  const context = samplingCanvas.getContext("2d", {
    alpha: true,
    willReadFrequently: true,
  });
  if (!context) {
    throw new Error("Unable to sample the uploaded image.");
  }

  context.clearRect(0, 0, columns, rows);
  context.drawImage(image, 0, 0, columns, rows);
  const pixels = context.getImageData(0, 0, columns, rows).data;
  const points: number[] = [];
  const haloLimit = Math.floor(pointBudget * 0.2);
  let haloCount = 0;

  const luminanceAt = (column: number, row: number) => {
    const safeColumn = clamp(column, 0, columns - 1);
    const safeRow = clamp(row, 0, rows - 1);
    const offset = (safeRow * columns + safeColumn) * 4;
    return (
      pixels[offset] * 0.2126 +
      pixels[offset + 1] * 0.7152 +
      pixels[offset + 2] * 0.0722
    ) / 255;
  };

  const pushPoint = (
    x: number,
    y: number,
    red: number,
    green: number,
    blue: number,
    alpha: number,
    seedA: number,
    seedB: number,
    edge: number,
    halo: number,
    subject: number,
  ) => {
    points.push(x, y, red, green, blue, alpha, seedA, seedB, edge, halo, subject);
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const offset = index * 4;
      const sourceAlpha = pixels[offset + 3] / 255;
      if (sourceAlpha < 0.035) {
        continue;
      }

      let red = pixels[offset] / 255;
      let green = pixels[offset + 1] / 255;
      let blue = pixels[offset + 2] / 255;
      const sourceNormalizedX = (column + 0.5) / columns;
      const sourceNormalizedY = (row + 0.5) / rows;
      const subject = precomposed
        ? 1
        : sampleSubjectMask(analysis, sourceNormalizedX, sourceNormalizedY);
      const originalLuminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const gradientX = luminanceAt(column + 1, row) - luminanceAt(column - 1, row);
      const gradientY = luminanceAt(column, row + 1) - luminanceAt(column, row - 1);
      const edge = clamp(Math.hypot(gradientX, gradientY) * 2.8, 0, 1);
      const seedA = random01(index + 1);
      const seedB = random01(index * 1.713 + 19);
      const suppression = precomposed ? 0 : clamp(subjectTuning.backgroundSuppression, 0, 1);
      const backgroundKeep = 1 - suppression * (0.9 - edge * 0.18);
      const keepProbability = backgroundKeep * (1 - subject) + subject;
      if (seedA > keepProbability) {
        continue;
      }

      const exposure = precomposed ? 1 : clamp(subjectTuning.exposure, 0.75, 2.2);
      const shadowLift = precomposed ? 0 : clamp(subjectTuning.shadowLift, 0, 0.45);
      const edgePreservation = precomposed
        ? 0
        : clamp(subjectTuning.edgePreservation, 0, 1);
      const gamma = 1 / exposure;
      const protectedLift = shadowLift * (1 - edge * edgePreservation);
      const correctChannel = (channel: number) => {
        const exposed = Math.pow(clamp(channel, 0, 1), gamma);
        const lifted = exposed + protectedLift * (1 - exposed);
        const edgeLight = edge * edgePreservation * 0.16;
        return clamp(lifted + edgeLight, 0, 1);
      };
      red += (correctChannel(red) - red) * subject;
      green += (correctChannel(green) - green) * subject;
      blue += (correctChannel(blue) - blue) * subject;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const homeX = ((column + 0.5) / columns) * 2 - 1;
      const homeY = 1 - ((row + 0.5) / rows) * 2;
      const coreMetric = Math.hypot(homeX * 0.9, (homeY - 0.12) * 0.72);
      const coreProtection = 1 - smoothstep(0.35, 0.82, coreMetric);
      const jitterScale = 0.16 + (1 - coreProtection) * 0.84;
      const jitterX = ((seedA - 0.5) / columns) * jitterScale;
      const jitterY = ((seedB - 0.5) / rows) * jitterScale;
      const x = homeX + jitterX;
      const y = homeY + jitterY;
      const outerMetric = Math.hypot(homeX * 0.82, homeY);
      const envelopeNoise = Math.sin(homeX * 4.1 + seedA * Math.PI * 2) * 0.055
        + Math.cos(homeY * 5.2 + seedB * Math.PI * 2) * 0.045;
      const imageEnvelope = 1 - smoothstep(0.68, 1.04, outerMetric + envelopeNoise);
      if (imageEnvelope < 0.006) {
        continue;
      }
      const visibility = clamp(
        0.58 + Math.sqrt(luminance) * 0.38 + subject * Math.max(0, originalLuminance - 0.5) * 0.08,
        0.54,
        1.06,
      );
      const subjectAlpha = (1 - suppression * 0.78) * (1 - subject) + subject;
      const fill = precomposed ? 1 : clamp(subjectTuning.surfaceFill, 0.6, 1.6);
      const fillAlpha = 1 + (fill - 1) * subject;

      pushPoint(
        x,
        y,
        red,
        green,
        blue,
        sourceAlpha * visibility * subjectAlpha * fillAlpha * Math.pow(imageEnvelope, 0.76),
        seedA,
        seedB,
        edge,
        0,
        subject,
      );

      const outer = smoothstep(0.48, 0.94, outerMetric + envelopeNoise * 0.6);
      const haloChance = clamp(
        outer * 0.44 + edge * (1 - coreProtection) * 0.32 + edge * subject * 0.1,
        0,
        0.62,
      );
      if (haloCount < haloLimit && haloChance > 0.035 && random01(index * 2.31) < haloChance) {
        const haloSeedA = random01(index * 3.17 + 7);
        const haloSeedB = random01(index * 5.03 + 13);
        pushPoint(
          x,
          y,
          red,
          green,
          blue,
          sourceAlpha * visibility * subjectAlpha * (0.54 + edge * 0.32),
          haloSeedA,
          haloSeedB,
          edge,
          1,
          subject,
        );
        haloCount += 1;
      }
    }
  }

  return {
    data: new Float32Array(points),
    imageAspect,
    pointCount: points.length / FLOATS_PER_POINT,
  };
}

export function ParticleGarden({
  imageUrl,
  audioLevel = 0,
  interactionStrength = 1,
  imageClarity = 0.52,
  precomposed = false,
  tuning,
  subjectTuning,
  className,
  onReady,
}: ParticleGardenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const resampleRef = useRef<(() => void) | null>(null);
  const [showFallback, setShowFallback] = useState(false);
  const inputsRef = useRef<MutableInput>({
    audio: clamp(audioLevel, 0, 1),
    interaction: Math.max(0, interactionStrength),
    clarity: clamp(imageClarity, 0, 1),
    tuning: { ...DEFAULT_PARTICLE_TUNING, ...tuning },
    subject: { ...DEFAULT_SUBJECT_TUNING, ...subjectTuning },
    precomposed,
  });
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    inputsRef.current.audio = clamp(audioLevel, 0, 1);
  }, [audioLevel]);

  useEffect(() => {
    inputsRef.current.interaction = Math.max(0, interactionStrength);
  }, [interactionStrength]);

  useEffect(() => {
    inputsRef.current.clarity = clamp(imageClarity, 0, 1);
  }, [imageClarity]);

  useEffect(() => {
    inputsRef.current.tuning = { ...DEFAULT_PARTICLE_TUNING, ...tuning };
  }, [tuning]);

  useEffect(() => {
    inputsRef.current.subject = { ...DEFAULT_SUBJECT_TUNING, ...subjectTuning };
    inputsRef.current.precomposed = precomposed;
    const timer = window.setTimeout(() => resampleRef.current?.(), 70);
    return () => window.clearTimeout(timer);
  }, [precomposed, subjectTuning]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const trailCanvas = trailCanvasRef.current;
    if (!canvas || !trailCanvas) {
      return;
    }

    const trailContext = trailCanvas.getContext("2d", { alpha: true });
    if (!trailContext) {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;
    let disposed = false;
    let animationFrame = 0;
    let pointCount = 0;
    let imageAspect = 1;
    let currentAudio = 0;
    let trailFrame = 0;
    let lastFrameTime = performance.now();
    const startTime = lastFrameTime;
    const pointerTarget: PointerState = { x: 2, y: 2, active: 0 };
    const pointerCurrent: PointerState = { x: 2, y: 2, active: 0 };
    const dragTarget: DragState = { x: 0, y: 0 };
    const dragCurrent: DragState = { x: 0, y: 0 };
    const dragOrigin = { x: 0, y: 0 };
    const dragBase: DragState = { x: 0, y: 0 };
    let dragging = false;

    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!gl) {
      window.setTimeout(() => setShowFallback(true), 0);
      onReadyRef.current?.({
        pointCount: 0,
        reducedMotion,
        renderer: "unavailable",
      });
      return;
    }

    let program: WebGLProgram;
    try {
      program = createProgram(gl);
    } catch (error) {
      console.warn("ParticleGarden could not initialize WebGL2.", error);
      window.setTimeout(() => setShowFallback(true), 0);
      onReadyRef.current?.({
        pointCount: 0,
        reducedMotion,
        renderer: "unavailable",
      });
      return;
    }

    const buffer = gl.createBuffer();
    const vertexArray = gl.createVertexArray();
    if (!buffer || !vertexArray) {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
      return;
    }

    gl.bindVertexArray(vertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = FLOATS_PER_POINT * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 10 * Float32Array.BYTES_PER_ELEMENT);
    gl.bindVertexArray(null);

    const uniforms = {
      time: gl.getUniformLocation(program, "uTime"),
      audio: gl.getUniformLocation(program, "uAudio"),
      interaction: gl.getUniformLocation(program, "uInteraction"),
      motion: gl.getUniformLocation(program, "uMotion"),
      dpr: gl.getUniformLocation(program, "uDpr"),
      imageAspect: gl.getUniformLocation(program, "uImageAspect"),
      viewport: gl.getUniformLocation(program, "uViewport"),
      pointer: gl.getUniformLocation(program, "uPointer"),
      drag: gl.getUniformLocation(program, "uDrag"),
      subjectDetail: gl.getUniformLocation(program, "uSubjectDetail"),
      dispersion: gl.getUniformLocation(program, "uDispersion"),
      particleSize: gl.getUniformLocation(program, "uParticleSize"),
      contrast: gl.getUniformLocation(program, "uContrast"),
      flowSpeed: gl.getUniformLocation(program, "uFlowSpeed"),
      flowAmplitude: gl.getUniformLocation(program, "uFlowAmplitude"),
      depthStrength: gl.getUniformLocation(program, "uDepthStrength"),
      mouseRadius: gl.getUniformLocation(program, "uMouseRadius"),
      colorShiftSpeed: gl.getUniformLocation(program, "uColorShiftSpeed"),
      danceStrength: gl.getUniformLocation(program, "uDanceStrength"),
      depthWave: gl.getUniformLocation(program, "uDepthWave"),
      subjectFill: gl.getUniformLocation(program, "uSubjectFill"),
    };

    gl.clearColor(0, 0, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    let dpr = 1;
    const resize = () => {
      const performanceNavigator = navigator as NavigatorWithPerformanceHints;
      const lowPower =
        (performanceNavigator.hardwareConcurrency ?? 4) <= 4 ||
        (performanceNavigator.deviceMemory ?? 4) <= 4;
      const dprLimit = lowPower || reducedMotion ? 1.35 : 2;
      dpr = clamp(window.devicePixelRatio || 1, 1, dprLimit);
      const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const trailDpr = Math.min(dpr, 1.25);
      const trailWidth = Math.max(1, Math.round(canvas.clientWidth * trailDpr));
      const trailHeight = Math.max(1, Math.round(canvas.clientHeight * trailDpr));
      if (trailCanvas.width !== trailWidth || trailCanvas.height !== trailHeight) {
        trailCanvas.width = trailWidth;
        trailCanvas.height = trailHeight;
        trailContext.clearRect(0, 0, trailWidth, trailHeight);
      }
      gl.viewport(0, 0, width, height);
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const updatePointer = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) {
        return;
      }
      pointerTarget.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointerTarget.y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;
      pointerTarget.active = event.buttons > 0 ? 1 : 0.3;
      if (dragging) {
        dragTarget.x = clamp(
          dragBase.x + ((event.clientX - dragOrigin.x) / bounds.width) * 2.8,
          -1,
          1,
        );
        dragTarget.y = clamp(
          dragBase.y + ((event.clientY - dragOrigin.y) / bounds.height) * 2.35,
          -1,
          1,
        );
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      event.preventDefault();
      dragging = true;
      dragOrigin.x = event.clientX;
      dragOrigin.y = event.clientY;
      dragBase.x = dragTarget.x;
      dragBase.y = dragTarget.y;
      updatePointer(event);
      pointerTarget.active = 1;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const handlePointerUp = (event: PointerEvent) => {
      updatePointer(event);
      dragging = false;
      pointerTarget.active = 0.3;
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };
    const handlePointerLeave = () => {
      pointerTarget.active = 0;
    };
    const handlePointerCancel = () => {
      dragging = false;
      pointerTarget.active = 0;
    };
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      resize();
    };

    canvas.addEventListener("pointermove", updatePointer, { passive: true });
    canvas.addEventListener("pointerdown", handlePointerDown, { passive: false });
    canvas.addEventListener("pointerup", handlePointerUp, { passive: true });
    canvas.addEventListener("pointercancel", handlePointerCancel, { passive: true });
    canvas.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    reducedMotionQuery.addEventListener("change", handleMotionPreference);

    const image = imageUrl ? new Image() : null;
    let subjectAnalysis: SubjectAnalysis | null = null;
    const resample = () => {
      if (disposed || !image || !image.complete || !subjectAnalysis) {
        return;
      }
      try {
        const budget = choosePointBudget(canvas.clientWidth, canvas.clientHeight, reducedMotion);
        const sampled = sampleImage(
          image,
          budget,
          subjectAnalysis,
          inputsRef.current.subject,
          inputsRef.current.precomposed,
        );
        pointCount = sampled.pointCount;
        imageAspect = sampled.imageAspect;
        setShowFallback(false);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, sampled.data, gl.STATIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        onReadyRef.current?.({
          pointCount,
          reducedMotion,
          renderer: "webgl2",
        });
      } catch (error) {
        console.warn(
          "ParticleGarden could not read the image. Use an uploaded object URL or a CORS-enabled URL.",
          error,
        );
        setShowFallback(true);
        onReadyRef.current?.({
          pointCount: 0,
          reducedMotion,
          renderer: "webgl2",
        });
      }
    };
    resampleRef.current = resample;
    if (image && imageUrl) {
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (disposed) {
          return;
        }

        subjectAnalysis = analyzeSubject(image);
        resample();
      };
      image.onerror = () => {
        console.warn("ParticleGarden could not load the supplied image URL.");
        setShowFallback(true);
        onReadyRef.current?.({
          pointCount: 0,
          reducedMotion,
          renderer: "webgl2",
        });
      };
      image.src = imageUrl;
    } else {
      onReadyRef.current?.({
        pointCount: 0,
        reducedMotion,
        renderer: "webgl2",
      });
    }

    const render = (now: number) => {
      if (disposed || gl.isContextLost()) {
        return;
      }

      const elapsed = (now - startTime) / 1000;
      const delta = clamp((now - lastFrameTime) / 1000, 0, 0.1);
      lastFrameTime = now;
      const pointerBlend = 1 - Math.exp(-delta * 9);
      const activeBlend = 1 - Math.exp(-delta * 6);
      const audioBlend = 1 - Math.exp(-delta * 8);
      const dragBlend = 1 - Math.exp(-delta * 7);

      if (!dragging) {
        const dragRelease = Math.exp(-delta * 1.7);
        dragTarget.x *= dragRelease;
        dragTarget.y *= dragRelease;
      }

      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * pointerBlend;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * pointerBlend;
      pointerCurrent.active += (pointerTarget.active - pointerCurrent.active) * activeBlend;
      dragCurrent.x += (dragTarget.x - dragCurrent.x) * dragBlend;
      dragCurrent.y += (dragTarget.y - dragCurrent.y) * dragBlend;
      currentAudio += (inputsRef.current.audio - currentAudio) * audioBlend;

      const dragActivity = clamp(Math.hypot(dragCurrent.x, dragCurrent.y), 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (pointCount > 0) {
        gl.useProgram(program);
        gl.bindVertexArray(vertexArray);
        gl.uniform1f(uniforms.time, elapsed);
        gl.uniform1f(uniforms.audio, currentAudio);
        gl.uniform1f(uniforms.interaction, inputsRef.current.interaction);
        gl.uniform1f(uniforms.motion, reducedMotion ? 0.08 : 1);
        gl.uniform1f(uniforms.subjectDetail, inputsRef.current.clarity);
        gl.uniform1f(uniforms.dispersion, inputsRef.current.tuning.dispersion);
        gl.uniform1f(uniforms.particleSize, inputsRef.current.tuning.particleSize);
        gl.uniform1f(uniforms.contrast, inputsRef.current.tuning.contrast);
        gl.uniform1f(uniforms.flowSpeed, inputsRef.current.tuning.flowSpeed);
        gl.uniform1f(uniforms.flowAmplitude, inputsRef.current.tuning.flowAmplitude);
        gl.uniform1f(uniforms.depthStrength, inputsRef.current.tuning.depthStrength);
        gl.uniform1f(uniforms.mouseRadius, inputsRef.current.tuning.mouseRadius * dpr);
        gl.uniform1f(uniforms.colorShiftSpeed, inputsRef.current.tuning.colorShiftSpeed);
        gl.uniform1f(uniforms.danceStrength, inputsRef.current.tuning.danceStrength);
        gl.uniform1f(uniforms.depthWave, inputsRef.current.tuning.depthWave);
        gl.uniform1f(uniforms.subjectFill, inputsRef.current.subject.surfaceFill);
        gl.uniform1f(uniforms.dpr, dpr);
        gl.uniform1f(uniforms.imageAspect, imageAspect);
        gl.uniform2f(uniforms.viewport, canvas.width, canvas.height);
        gl.uniform3f(
          uniforms.pointer,
          pointerCurrent.x,
          pointerCurrent.y,
          pointerCurrent.active,
        );
        gl.uniform2f(
          uniforms.drag,
          dragCurrent.x * (reducedMotion ? 0.24 : 1),
          dragCurrent.y * (reducedMotion ? 0.24 : 1),
        );
        gl.drawArrays(gl.POINTS, 0, pointCount);
        gl.bindVertexArray(null);

        trailFrame += 1;
        if (!reducedMotion && trailFrame % 2 === 0) {
          trailContext.save();
          trailContext.globalCompositeOperation = "destination-out";
          trailContext.globalAlpha = 0.105;
          trailContext.fillStyle = "#000";
          trailContext.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
          trailContext.globalCompositeOperation = "lighter";
          trailContext.globalAlpha = clamp(
            0.075 + pointerCurrent.active * 0.08 + dragActivity * 0.12 + currentAudio * 0.055,
            0.075,
            0.28,
          );
          trailContext.filter = "blur(0.65px)";
          trailContext.drawImage(
            canvas,
            0,
            0,
            canvas.width,
            canvas.height,
            0,
            0,
            trailCanvas.width,
            trailCanvas.height,
          );
          trailContext.restore();
        }
      }

      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      reducedMotionQuery.removeEventListener("change", handleMotionPreference);
      canvas.removeEventListener("pointermove", updatePointer);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      trailContext.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      }
      if (resampleRef.current === resample) {
        resampleRef.current = null;
      }
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    };
  }, [imageUrl]);

  const rootClassName = [
    styles.root,
    precomposed ? styles.precomposed : "",
    showFallback ? styles.fallback : "",
    className ?? "",
  ].filter(Boolean).join(" ");
  return (
    <div
      className={rootClassName}
      role="img"
      aria-label="由上传图片生成、可随声音与指针流动的粒子记忆"
    >
      {imageUrl && <img className={`${styles.imageBase} ${showFallback ? styles.imageBaseFallback : ""}`} src={imageUrl} alt="" aria-hidden="true" />}
      <canvas ref={trailCanvasRef} className={styles.trailCanvas} aria-hidden="true" />
      <canvas ref={canvasRef} className={`${styles.canvas} ${showFallback ? styles.canvasHidden : ""}`} aria-hidden="true" />
      <span className={styles.vignette} aria-hidden="true" />
    </div>
  );
}

export default ParticleGarden;
