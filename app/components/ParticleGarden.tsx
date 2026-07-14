"use client";
/* eslint-disable @next/next/no-img-element -- fallback must support uploaded blob URLs */

import { useEffect, useRef, useState } from "react";
import styles from "./ParticleGarden.module.css";

export interface ParticleGardenReadyDetail {
  pointCount: number;
  reducedMotion: boolean;
  renderer: "webgl2" | "unavailable";
}

export interface ParticleGardenProps {
  /** A same-origin URL, data URL, or object URL created from an uploaded image. */
  imageUrl?: string | null;
  /** Normalized microphone/music energy. Values outside 0..1 are clamped. */
  audioLevel?: number;
  /** Multiplier for the pointer gravity well. */
  interactionStrength?: number;
  className?: string;
  onReady?: (detail: ParticleGardenReadyDetail) => void;
}

type MutableInput = {
  audio: number;
  interaction: number;
};

type PointerState = {
  x: number;
  y: number;
  active: number;
};

type NavigatorWithPerformanceHints = Navigator & {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
  };
};

const FLOATS_PER_POINT = 10;
const VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aHome;
layout(location = 1) in vec4 aColor;
layout(location = 2) in vec4 aMeta;

uniform float uTime;
uniform float uAudio;
uniform float uInteraction;
uniform float uMotion;
uniform float uDpr;
uniform float uImageAspect;
uniform vec2 uViewport;
uniform vec3 uPointer;

out vec4 vColor;
out float vHalo;
out float vSpark;

const float TAU = 6.28318530718;

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

  // A slow curl-like field keeps the image alive without losing its silhouette.
  float motionTime = uTime * uMotion;
  vec2 flow = vec2(
    sin(aHome.y * 7.4 + motionTime * 0.34 + aMeta.x * TAU),
    cos(aHome.x * 6.8 - motionTime * 0.29 + aMeta.y * TAU)
  );
  base += flow * (0.0018 + aMeta.z * 0.0034) * uMotion;

  // Edge duplicates drift beyond the image boundary and form the particle halo.
  float haloBreath = 0.82 + 0.18 * sin(uTime * 0.42 + aMeta.y * TAU);
  float haloDistance = (0.025 + aMeta.y * 0.085) * haloBreath;
  base += aMeta.w * (radial * haloDistance + randomDirection * haloDistance * 0.52);
  base += randomDirection * aMeta.z * 0.007 * (0.75 + 0.25 * sin(motionTime + aMeta.x * TAU));

  // Audio produces a restrained outward pulse and simulated depth movement.
  float audioWave = sin(uTime * (2.2 + aMeta.y * 2.1) + aMeta.x * TAU);
  float audioPulse = uAudio * (0.55 + 0.45 * audioWave);
  base += radial * audioPulse * (0.006 + aMeta.z * 0.018 + aMeta.w * 0.014);
  float depth = sin(aHome.x * 5.0 + aHome.y * 4.2 + uTime * 0.8 + aMeta.x * TAU);
  depth *= 0.015 + uAudio * 0.11;

  // The pointer attracts a wide ring, swirls it, and repels the tiny core.
  vec2 toPointer = uPointer.xy - base;
  float pointerDistance = max(length(toPointer), 0.0001);
  vec2 pointerDirection = toPointer / pointerDistance;
  vec2 tangent = vec2(-pointerDirection.y, pointerDirection.x);
  float field = exp(-pointerDistance * pointerDistance * 12.0);
  float core = exp(-pointerDistance * pointerDistance * 115.0);
  float pointResponse = (0.52 + aMeta.z * 0.48) * uPointer.z * uInteraction;
  base += (pointerDirection * field * 0.065 + tangent * field * 0.038) * pointResponse;
  base -= pointerDirection * core * 0.042 * pointResponse;

  float perspective = 1.0 + depth * 0.22;
  gl_Position = vec4(base * perspective, depth, 1.0);

  float edgeSize = 0.8 + aMeta.z * 0.95 + aMeta.w * 0.5;
  float audioSize = uAudio * (1.2 + aMeta.z * 1.8);
  gl_PointSize = clamp((1.35 + edgeSize + audioSize) * uDpr * (1.0 + depth), 1.0, 10.0 * uDpr);

  vec3 liftedColor = pow(max(aColor.rgb, vec3(0.0)), vec3(0.78));
  float shimmer = 0.91 + 0.09 * sin(uTime * 0.72 + aMeta.x * TAU);
  vColor = vec4(liftedColor * shimmer, aColor.a);
  vHalo = aMeta.w;
  vSpark = clamp(aMeta.z + audioPulse * 0.48, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec4 vColor;
in float vHalo;
in float vSpark;

out vec4 outColor;

void main() {
  vec2 centered = gl_PointCoord - vec2(0.5);
  float distanceFromCenter = length(centered);
  if (distanceFromCenter > 0.5) {
    discard;
  }

  float core = 1.0 - smoothstep(0.05, 0.29, distanceFromCenter);
  float glow = 1.0 - smoothstep(0.13, 0.5, distanceFromCenter);
  float intensity = core * (0.72 + vSpark * 0.42) + glow * (0.24 + vSpark * 0.2);
  float haloOpacity = mix(1.0, 0.38, vHalo);
  float alpha = vColor.a * intensity * haloOpacity;

  if (alpha < 0.008) {
    discard;
  }

  outColor = vec4(vColor.rgb * (0.86 + vSpark * 0.36), alpha);
}
`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const random01 = (seed: number) => {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
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
  const areaBudget = Math.floor((width * height) / (lowPower ? 11 : 7));

  if (reducedMotion) {
    return clamp(areaBudget, 14_000, 28_000);
  }

  return lowPower
    ? clamp(areaBudget, 22_000, 48_000)
    : clamp(areaBudget, 36_000, 88_000);
}

function sampleImage(image: HTMLImageElement, pointBudget: number) {
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
  const haloLimit = Math.floor(pointBudget * 0.22);
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
  ) => {
    points.push(x, y, red, green, blue, alpha, seedA, seedB, edge, halo);
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const offset = index * 4;
      const sourceAlpha = pixels[offset + 3] / 255;
      if (sourceAlpha < 0.035) {
        continue;
      }

      const red = pixels[offset] / 255;
      const green = pixels[offset + 1] / 255;
      const blue = pixels[offset + 2] / 255;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      const gradientX = luminanceAt(column + 1, row) - luminanceAt(column - 1, row);
      const gradientY = luminanceAt(column, row + 1) - luminanceAt(column, row - 1);
      const edge = clamp(Math.hypot(gradientX, gradientY) * 2.8, 0, 1);
      const seedA = random01(index + 1);
      const seedB = random01(index * 1.713 + 19);
      const jitterX = (seedA - 0.5) / columns;
      const jitterY = (seedB - 0.5) / rows;
      const x = ((column + 0.5) / columns) * 2 - 1 + jitterX;
      const y = 1 - ((row + 0.5) / rows) * 2 + jitterY;
      const visibility = clamp(0.16 + luminance * 1.08, 0.12, 1);

      pushPoint(
        x,
        y,
        red,
        green,
        blue,
        sourceAlpha * visibility,
        seedA,
        seedB,
        edge,
        0,
      );

      const haloChance = edge * 0.72;
      if (haloCount < haloLimit && edge > 0.13 && random01(index * 2.31) < haloChance) {
        const haloSeedA = random01(index * 3.17 + 7);
        const haloSeedB = random01(index * 5.03 + 13);
        pushPoint(
          x,
          y,
          red,
          green,
          blue,
          sourceAlpha * visibility * (0.45 + edge * 0.28),
          haloSeedA,
          haloSeedB,
          edge,
          1,
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
  className,
  onReady,
}: ParticleGardenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showFallback, setShowFallback] = useState(false);
  const inputsRef = useRef<MutableInput>({
    audio: clamp(audioLevel, 0, 1),
    interaction: Math.max(0, interactionStrength),
  });
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    inputsRef.current.audio = clamp(audioLevel, 0, 1);
  }, [audioLevel]);

  useEffect(() => {
    inputsRef.current.interaction = Math.max(0, interactionStrength);
  }, [interactionStrength]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;
    let disposed = false;
    let animationFrame = 0;
    let pointCount = 0;
    let imageAspect = 1;
    let currentAudio = 0;
    let lastFrameTime = performance.now();
    const startTime = lastFrameTime;
    const pointerTarget: PointerState = { x: 2, y: 2, active: 0 };
    const pointerCurrent: PointerState = { x: 2, y: 2, active: 0 };

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: "high-performance",
      premultipliedAlpha: false,
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
    };

    gl.clearColor(0, 0, 0, 1);
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
      pointerTarget.active = event.buttons > 0 ? 1 : 0.62;
    };
    const handlePointerDown = (event: PointerEvent) => {
      updatePointer(event);
      pointerTarget.active = 1;
      canvas.setPointerCapture?.(event.pointerId);
    };
    const handlePointerUp = (event: PointerEvent) => {
      updatePointer(event);
      pointerTarget.active = 0.62;
      if (canvas.hasPointerCapture?.(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };
    const handlePointerLeave = () => {
      pointerTarget.active = 0;
    };
    const handleMotionPreference = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      resize();
    };

    canvas.addEventListener("pointermove", updatePointer, { passive: true });
    canvas.addEventListener("pointerdown", handlePointerDown, { passive: true });
    canvas.addEventListener("pointerup", handlePointerUp, { passive: true });
    canvas.addEventListener("pointercancel", handlePointerLeave, { passive: true });
    canvas.addEventListener("pointerleave", handlePointerLeave, { passive: true });
    reducedMotionQuery.addEventListener("change", handleMotionPreference);

    const image = imageUrl ? new Image() : null;
    if (image && imageUrl) {
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      image.onload = () => {
        if (disposed) {
          return;
        }

        try {
          const budget = choosePointBudget(canvas.clientWidth, canvas.clientHeight, reducedMotion);
          const sampled = sampleImage(image, budget);
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

      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * pointerBlend;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * pointerBlend;
      pointerCurrent.active += (pointerTarget.active - pointerCurrent.active) * activeBlend;
      currentAudio += (inputsRef.current.audio - currentAudio) * audioBlend;

      gl.clear(gl.COLOR_BUFFER_BIT);
      if (pointCount > 0) {
        gl.useProgram(program);
        gl.bindVertexArray(vertexArray);
        gl.uniform1f(uniforms.time, elapsed);
        gl.uniform1f(uniforms.audio, currentAudio);
        gl.uniform1f(uniforms.interaction, inputsRef.current.interaction);
        gl.uniform1f(uniforms.motion, reducedMotion ? 0.08 : 1);
        gl.uniform1f(uniforms.dpr, dpr);
        gl.uniform1f(uniforms.imageAspect, imageAspect);
        gl.uniform2f(uniforms.viewport, canvas.width, canvas.height);
        gl.uniform3f(
          uniforms.pointer,
          pointerCurrent.x,
          pointerCurrent.y,
          pointerCurrent.active,
        );
        gl.drawArrays(gl.POINTS, 0, pointCount);
        gl.bindVertexArray(null);
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
      canvas.removeEventListener("pointercancel", handlePointerLeave);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      if (image) {
        image.onload = null;
        image.onerror = null;
        image.removeAttribute("src");
      }
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vertexArray);
      gl.deleteProgram(program);
    };
  }, [imageUrl]);

  const rootClassName = className ? `${styles.root} ${className}` : styles.root;

  return (
    <div
      className={rootClassName}
      role="img"
      aria-label="由上传图片生成、可随声音与指针流动的粒子记忆"
    >
      {imageUrl && <img className={`${styles.fallback} ${showFallback ? styles.fallbackVisible : ""}`} src={imageUrl} alt="" aria-hidden="true" />}
      <canvas ref={canvasRef} className={`${styles.canvas} ${showFallback ? styles.canvasHidden : ""}`} aria-hidden="true" />
      <span className={styles.vignette} aria-hidden="true" />
    </div>
  );
}

export default ParticleGarden;
