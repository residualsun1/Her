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

uniform sampler2D uState;
uniform sampler2D uImage;
uniform vec2 uImageTexel;
uniform float uTime;
uniform float uDelta;
uniform float uPeelThreshold;
uniform float uErosionRate;
uniform float uNoiseStrength;
uniform float uNoiseFrequency;
uniform float uEdgePerturbation;
uniform float uEdgeScatter;
uniform float uDiffusion;
uniform float uEmberLifespan;
uniform vec2 uWind;
uniform vec2 uPointer;
uniform float uPointerForce;
uniform float uBass;
uniform float uTreble;
uniform float uRhythmIntensity;
uniform float uReactTarget;

in vec2 vUv;
out vec4 outState;

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
  vec4 previous = texture(uState, vUv);
  vec2 home = vUv * 2.0 - 1.0;
  vec2 position = previous.xy;
  float seed = previous.z;
  float life = previous.w;

  float edge = sobelEdge(vUv);
  float bassPeel = uBass * uRhythmIntensity * 0.055;
  float threshold = clamp(uPeelThreshold - bassPeel, 0.02, 0.98);
  float edgeWeight = smoothstep(threshold - 0.12, threshold + 0.12, edge);
  float stagger = hash21(vUv * 1931.17 + seed);
  float release = smoothstep(stagger * 0.78, 0.96, edgeWeight);

  float pace = max(uErosionRate, 0.001);
  if (life < 0.0) {
    life += uDelta * pace * (0.46 + seed * 0.44);
  }

  float detached = step(0.0, life) * release;
  if (detached > 0.5) {
    float targetBoost = 1.0;
    targetBoost += step(0.5, uReactTarget) * step(uReactTarget, 1.5) * uBass * 0.18;
    float noiseTime = uTime * (0.11 + pace * 0.24);
    noiseTime *= 1.0 + step(1.5, uReactTarget) * step(uReactTarget, 2.5) * uTreble * 0.22;
    vec2 noisePoint = position * max(uNoiseFrequency, 0.05) * 2.4;
    noisePoint += vec2(noiseTime, -noiseTime * 0.71);
    vec2 curl = curlNoise(noisePoint);
    vec2 trebleRipple = vec2(
      sin(uTime * 0.73 + seed * 17.0),
      cos(uTime * 0.61 + seed * 13.0)
    ) * uTreble * uRhythmIntensity * 0.012;
    vec2 edgeKick = normalize(home + vec2(0.0001)) * edgeWeight * uEdgeScatter * 0.003;
    edgeKick += vec2(seed - 0.5, stagger - 0.5) * uEdgePerturbation * 0.008;
    vec2 velocity = uWind * 0.055 + trebleRipple;
    velocity += curl * uNoiseStrength * 0.014;
    velocity += edgeKick;

    vec2 pointerDelta = position - uPointer;
    float pointerDistance = max(length(pointerDelta), 0.001);
    float pointerField = exp(-pointerDistance * pointerDistance * 8.0) * uPointerForce;
    velocity += normalize(pointerDelta) * pointerField * 0.055;
    velocity += vec2(-pointerDelta.y, pointerDelta.x) * pointerField * 0.045;

    float diffusion = mix(0.12, 1.35, clamp(uDiffusion / 100.0, 0.0, 1.0));
    position += velocity * uDelta * diffusion * targetBoost;
    life += uDelta * pace * (0.34 + seed * 0.4 + edgeWeight * 0.28);
  } else {
    float returnBlend = 1.0 - exp(-uDelta * (2.0 + pace * 2.0));
    position = mix(position, home, returnBlend);
  }

  float escaped = step(2.7, max(abs(position.x), abs(position.y)));
  if (life > uEmberLifespan || escaped > 0.5) {
    position = home;
    life = -(0.5 + seed * 5.5);
  }

  outState = vec4(position, seed, life);
}
`;

const PARTICLE_VERTEX = `precision highp float;

uniform sampler2D uState;
uniform sampler2D uImage;
uniform vec2 uImageTexel;
uniform vec2 uViewport;
uniform float uImageAspect;
uniform float uParticleSize;
uniform float uEmberLifespan;
uniform float uLuminanceMultiplier;
uniform float uHueDrift;
uniform float uTime;
uniform float uDpr;
uniform float uAudio;
uniform float uReactTarget;

in vec3 position;
in vec2 aParticleUv;

out vec3 vColor;
out float vAlpha;
out float vGlow;

vec3 hueRotate(vec3 color, float angle) {
  vec3 axis = vec3(0.57735026919);
  return max(
    color * cos(angle) +
    cross(axis, color) * sin(angle) +
    axis * dot(axis, color) * (1.0 - cos(angle)),
    vec3(0.0)
  );
}

void main() {
  vec4 particle = texture(uState, aParticleUv);
  vec4 source = texture(uImage, aParticleUv);
  float viewportAspect = max(uViewport.x / max(uViewport.y, 1.0), 0.001);
  vec2 fit = vec2(0.91);
  if (uImageAspect > viewportAspect) {
    fit.y *= viewportAspect / uImageAspect;
  } else {
    fit.x *= uImageAspect / viewportAspect;
  }

  vec2 clipPosition = particle.xy * fit;
  gl_Position = vec4(clipPosition, 0.0, 1.0);

  float luminance = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
  float detached = step(0.0, particle.w);
  float age = clamp(particle.w / max(uEmberLifespan, 0.01), 0.0, 1.0);
  float decay = 1.0 - smoothstep(0.38, 1.0, age);
  float softPulse = 0.94 + sin(uTime * 0.56 + particle.z * 19.0) * 0.06;
  float audioSize = step(-0.5, uReactTarget) * step(uReactTarget, 0.5) * uAudio * 0.08;
  gl_PointSize = clamp(
    uParticleSize * uDpr * (0.68 + sqrt(max(luminance, 0.0)) * 0.72 + audioSize),
    0.65 * uDpr,
    5.5 * uDpr
  );

  float hueTarget = step(2.5, uReactTarget) * uAudio * 0.08;
  float hueAngle = radians(uHueDrift) * (0.3 + particle.z * 0.7) * sin(uTime * 0.12 + particle.z * 6.2831);
  hueAngle += hueTarget;
  vec3 color = hueRotate(source.rgb, hueAngle);
  color *= mix(0.9, uLuminanceMultiplier, smoothstep(0.42, 0.92, luminance));
  color += vec3(0.08, 0.16, 0.24) * detached * 0.22;

  vColor = color * softPulse;
  vAlpha = source.a * mix(0.93, decay * 0.78, detached);
  vGlow = smoothstep(0.48, 1.0, luminance) + detached * 0.18;
}
`;

const PARTICLE_FRAGMENT = `precision highp float;

in vec3 vColor;
in float vAlpha;
in float vGlow;

out vec4 outColor;

void main() {
  vec2 centered = gl_PointCoord - 0.5;
  float radius = length(centered);
  if (radius > 0.5) discard;
  float core = 1.0 - smoothstep(0.04, 0.23, radius);
  float halo = 1.0 - smoothstep(0.12, 0.5, radius);
  float alpha = vAlpha * (core * 0.86 + halo * (0.18 + vGlow * 0.12));
  if (alpha < 0.006) discard;
  outColor = vec4(vColor * (0.9 + vGlow * 0.22), alpha);
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
  treble: number;
};

type GpuParticleFieldProps = {
  imageUrl: string;
  particleCount: number;
  tuning: ParticleTuning;
  audioLevel: number;
  audioBands: AudioBands;
  interactionStrength: number;
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

function createInitialTexture(side: number) {
  const data = new Float32Array(side * side * 4);
  for (let index = 0; index < side * side; index += 1) {
    const column = index % side;
    const row = Math.floor(index / side);
    const u = (column + 0.5) / side;
    const v = (row + 0.5) / side;
    const seed = (Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1;
    const normalizedSeed = seed < 0 ? seed + 1 : seed;
    const offset = index * 4;
    data[offset] = u * 2 - 1;
    data[offset + 1] = v * 2 - 1;
    data[offset + 2] = normalizedSeed;
    data[offset + 3] = -(0.5 + normalizedSeed * 5.5);
  }
  const texture = new THREE.DataTexture(
    data,
    side,
    side,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
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
  preview = false,
  onReady,
}: GpuParticleFieldProps) {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const pointer = useThree((state) => state.pointer);
  const sourceTexture = useLoader(THREE.TextureLoader, imageUrl);
  const effectiveCount = preview ? Math.min(particleCount, 65_536) : particleCount;
  const side = Math.ceil(Math.sqrt(effectiveCount));
  const initialTexture = useMemo(() => createInitialTexture(side), [side]);
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
    return [
      new THREE.WebGLRenderTarget(side, side, options),
      new THREE.WebGLRenderTarget(side, side, options),
    ] as const;
  }, [side]);
  const stateTextureRef = useRef<THREE.Texture>(initialTexture);
  const writeIndexRef = useRef(0);
  const frameRef = useRef(0);
  const smoothedAudioRef = useRef({ level: 0, bass: 0, treble: 0 });
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

  const simulationMaterial = useMemo(() => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SIMULATION_VERTEX,
    fragmentShader: SIMULATION_FRAGMENT,
    uniforms: {
      uState: { value: initialTexture },
      uImage: { value: sourceTexture },
      uImageTexel: { value: new THREE.Vector2(1 / imageSize.width, 1 / imageSize.height) },
      uTime: { value: 0 },
      uDelta: { value: 0 },
      uPeelThreshold: { value: tuning.peelThreshold },
      uErosionRate: { value: tuning.erosionRate },
      uNoiseStrength: { value: tuning.noiseStrength },
      uNoiseFrequency: { value: tuning.noiseFrequency },
      uEdgePerturbation: { value: tuning.edgePerturbation },
      uEdgeScatter: { value: tuning.edgeScatter },
      uDiffusion: { value: tuning.diffusion },
      uEmberLifespan: { value: tuning.emberLifespan },
      uWind: { value: new THREE.Vector2(tuning.windX, tuning.windY) },
      uPointer: { value: new THREE.Vector2(2, 2) },
      uPointerForce: { value: interactionStrength },
      uBass: { value: 0 },
      uTreble: { value: 0 },
      uRhythmIntensity: { value: tuning.rhythmIntensity },
      uReactTarget: { value: reactTargetCode(tuning.reactTarget) },
    },
    depthTest: false,
    depthWrite: false,
  }), [imageSize.height, imageSize.width, initialTexture, sourceTexture]);

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
      uState: { value: initialTexture },
      uImage: { value: sourceTexture },
      uImageTexel: { value: new THREE.Vector2(1 / imageSize.width, 1 / imageSize.height) },
      uViewport: { value: new THREE.Vector2(size.width, size.height) },
      uImageAspect: { value: imageSize.width / imageSize.height },
      uParticleSize: { value: tuning.particleSize },
      uEmberLifespan: { value: tuning.emberLifespan },
      uLuminanceMultiplier: { value: tuning.luminanceMultiplier },
      uHueDrift: { value: tuning.hueDrift },
      uTime: { value: 0 },
      uDpr: { value: gl.getPixelRatio() },
      uAudio: { value: 0 },
      uReactTarget: { value: reactTargetCode(tuning.reactTarget) },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [gl, imageSize.height, imageSize.width, initialTexture, size.height, size.width, sourceTexture]);

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
    stateTextureRef.current = initialTexture;
    writeIndexRef.current = 0;
    onReadyRef.current?.(effectiveCount);
    return () => {
      simulationScene.remove(simulationQuad);
      simulationQuad.geometry.dispose();
      simulationMaterial.dispose();
      particleMaterial.dispose();
      fadeMaterial.dispose();
      geometry.dispose();
      initialTexture.dispose();
      renderTargets.forEach((target) => target.dispose());
    };
  }, [
    effectiveCount,
    fadeMaterial,
    geometry,
    initialTexture,
    particleMaterial,
    renderTargets,
    simulationMaterial,
    simulationQuad,
    simulationScene,
  ]);

  useFrame((state, delta) => {
    frameRef.current += 1;
    if (preview && frameRef.current % 2 === 1) return;

    const smoothing = clamp(tuning.audioSmoothing, 0.1, 0.99);
    const response = 1 - Math.pow(smoothing, delta * 60);
    const smoothed = smoothedAudioRef.current;
    smoothed.level += (audioLevel - smoothed.level) * response;
    smoothed.bass += (audioBands.bass - smoothed.bass) * response;
    smoothed.treble += (audioBands.treble - smoothed.treble) * response;

    const simUniforms = simulationMaterial.uniforms;
    simUniforms.uState.value = stateTextureRef.current;
    simUniforms.uTime.value = state.clock.elapsedTime;
    simUniforms.uDelta.value = Math.min(delta, 0.05) * (preview ? 2 : 1);
    simUniforms.uPeelThreshold.value = tuning.peelThreshold;
    simUniforms.uErosionRate.value = tuning.erosionRate;
    simUniforms.uNoiseStrength.value = tuning.noiseStrength;
    simUniforms.uNoiseFrequency.value = tuning.noiseFrequency;
    simUniforms.uEdgePerturbation.value = tuning.edgePerturbation;
    simUniforms.uEdgeScatter.value = tuning.edgeScatter;
    simUniforms.uDiffusion.value = tuning.diffusion;
    simUniforms.uEmberLifespan.value = tuning.emberLifespan;
    simUniforms.uWind.value.set(tuning.windX, tuning.windY);
    simUniforms.uPointer.value.copy(pointer);
    simUniforms.uPointerForce.value = interactionStrength;
    simUniforms.uBass.value = smoothed.bass;
    simUniforms.uTreble.value = smoothed.treble;
    simUniforms.uRhythmIntensity.value = tuning.rhythmIntensity;
    simUniforms.uReactTarget.value = reactTargetCode(tuning.reactTarget);

    const target = renderTargets[writeIndexRef.current];
    const previousTarget = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.clear();
    gl.render(simulationScene, simulationCamera);
    gl.setRenderTarget(previousTarget);
    stateTextureRef.current = target.texture;
    writeIndexRef.current = writeIndexRef.current === 0 ? 1 : 0;

    const pointUniforms = particleMaterial.uniforms;
    pointUniforms.uState.value = stateTextureRef.current;
    pointUniforms.uViewport.value.set(size.width, size.height);
    pointUniforms.uParticleSize.value = tuning.particleSize;
    pointUniforms.uEmberLifespan.value = tuning.emberLifespan;
    pointUniforms.uLuminanceMultiplier.value = tuning.luminanceMultiplier;
    pointUniforms.uHueDrift.value = tuning.hueDrift;
    pointUniforms.uTime.value = state.clock.elapsedTime;
    pointUniforms.uDpr.value = gl.getPixelRatio();
    pointUniforms.uAudio.value = smoothed.level;
    pointUniforms.uReactTarget.value = reactTargetCode(tuning.reactTarget);
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
        material={particleMaterial}
        frustumCulled={false}
        renderOrder={1}
      />
    </>
  );
}

export default GpuParticleScene;
