import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import styles from "./MonoLineBeam.module.css";

interface MonoLineBeamProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  radius?: number;
}

/**
 * Shared, paint-light reproduction of Border Beam's Line / Mono / 70% preset.
 * The traveling beam is a single composited layer, so instances reuse one
 * keyframe instead of injecting per-instance gradient and animation rules.
 */
export function MonoLineBeam({
  children,
  className = "",
  radius = 16,
  style,
  ...props
}: MonoLineBeamProps) {
  return (
    <div
      {...props}
      className={`${styles.frame} ${className}`}
      data-beam-color="mono"
      data-beam-strength="0.7"
      data-beam-type="line"
      style={{
        ...style,
        "--mono-beam-radius": `${radius}px`,
      } as CSSProperties}
    >
      {children}
      <span className={styles.runner} aria-hidden="true" />
    </div>
  );
}
