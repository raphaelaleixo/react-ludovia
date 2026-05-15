import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Box } from "@mui/material";

/**
 * Scales its child uniformly to fill the available space. The child renders
 * at its natural pixel size; we measure it and apply a CSS transform so the
 * board grows when the viewport has room.
 */
export default function BoardStage({ children }: { children: ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const recompute = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const cw = inner.offsetWidth;
      const ch = inner.offsetHeight;
      if (cw === 0 || ch === 0 || w === 0 || h === 0) return;
      const pad = 24;
      setScale(Math.min((w - pad) / cw, (h - pad) / ch));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <Box
      ref={wrapRef}
      sx={{
        flex: 1,
        minWidth: 0,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Box
        ref={innerRef}
        sx={{
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
