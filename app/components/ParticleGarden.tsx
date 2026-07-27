"use client";
/* eslint-disable @next/next/no-img-element -- fallback and uploaded object URLs need native images */

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import GpuParticleScene, { type AudioBands } from "./GpuParticleField";
import {
  DEFAULT_PARTICLE_TUNING,
  type ParticleReactTarget,
  type ParticleTuning,
} from "./particleConfig";
import styles from "./ParticleGarden.module.css";

export { DEFAULT_PARTICLE_TUNING };
export type { ParticleReactTarget, ParticleTuning };

export interface ParticleGardenReadyDetail {
  pointCount: number;
  reducedMotion: boolean;
  renderer: "r3f-fbo" | "unavailable";
}

export interface ParticleGardenProps {
  imageUrl?: string | null;
  audioLevel?: number;
  audioBands?: AudioBands;
  interactionStrength?: number;
  imageClarity?: number;
  zoom?: number;
  precomposed?: boolean;
  preview?: boolean;
  tuning?: Partial<ParticleTuning>;
  className?: string;
  onReady?: (detail: ParticleGardenReadyDetail) => void;
}

export function ParticleGarden({
  imageUrl,
  audioLevel = 0,
  audioBands = { bass: 0, mid: 0, treble: 0 },
  interactionStrength = 1,
  imageClarity = 0.82,
  zoom = 1,
  precomposed = false,
  preview = false,
  tuning,
  className,
  onReady,
}: ParticleGardenProps) {
  const mergedTuning = useMemo(
    () => ({ ...DEFAULT_PARTICLE_TUNING, ...tuning }),
    [tuning],
  );
  const [debouncedCount, setDebouncedCount] = useState(mergedTuning.particleCount);
  const [particleCap, setParticleCap] = useState(262_144);
  const [readyKey, setReadyKey] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedCount(mergedTuning.particleCount),
      320,
    );
    return () => window.clearTimeout(timer);
  }, [mergedTuning.particleCount]);

  useEffect(() => {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    const narrow = window.innerWidth < 900;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let nextCap = 262_144;
    if (reducedMotion || memory <= 4 || cores <= 4) {
      nextCap = 65_536;
    } else if (narrow || memory <= 8 || cores <= 8) {
      nextCap = 131_072;
    }
    const frame = window.requestAnimationFrame(() => setParticleCap(nextCap));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const adaptiveCount = preview
    ? Math.min(debouncedCount, 65_536)
    : Math.min(debouncedCount, particleCap);
  const renderKey = `${imageUrl ?? "empty"}-${adaptiveCount}-${preview ? "preview" : "hero"}`;
  const ready = readyKey === renderKey;

  const rootClassName = [
    styles.root,
    precomposed ? styles.precomposed : "",
    ready ? styles.ready : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  if (!imageUrl) {
    return <div className={rootClassName} />;
  }

  return (
    <div
      className={rootClassName}
      role="img"
      aria-label="由上传图片生成、可随鼠标与声音流动的星团记忆"
      style={{ "--image-clarity": imageClarity } as CSSProperties}
    >
      <img className={styles.imageBase} src={imageUrl} alt="" aria-hidden="true" />
      <Canvas
        key={renderKey}
        className={styles.canvas}
        dpr={preview ? [1, 1.15] : [1, 1.5]}
        frameloop="always"
        gl={{
          alpha: true,
          antialias: false,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.autoClear = preview;
        }}
        fallback={<img className={styles.imageBaseFallback} src={imageUrl} alt="" />}
      >
        <Suspense fallback={null}>
          <GpuParticleScene
            imageUrl={imageUrl}
            particleCount={adaptiveCount}
            tuning={mergedTuning}
            audioLevel={audioLevel}
            audioBands={audioBands}
            interactionStrength={interactionStrength}
            imageClarity={imageClarity}
            zoom={zoom}
            preview={preview}
            onReady={(pointCount) => {
              setReadyKey(renderKey);
              onReady?.({
                pointCount,
                reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
                renderer: "r3f-fbo",
              });
            }}
          />
        </Suspense>
      </Canvas>
      <span className={styles.vignette} aria-hidden="true" />
    </div>
  );
}

export default ParticleGarden;
