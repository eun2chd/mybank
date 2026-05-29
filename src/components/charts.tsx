import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CHART_PALETTE = ["#2F80ED", "#4D96FF", "#7FB4FF", "#A9CDFF", "#5B5BD6", "#3FD68C"];

export function useCountUp(target: number, duration = 1100) {
  const [val, setVal] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(target * ease);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    const fallback = window.setTimeout(() => setVal(target), duration + 60);
    return () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(fallback);
    };
  }, [target, duration]);

  return val;
}

type DonutItem = { label: string; value: number };

export function DonutChart({
  data,
  size = 196,
  thickness = 22,
  centerLabel,
  centerValue,
  palette = CHART_PALETTE
}: {
  data: DonutItem[];
  size?: number;
  thickness?: number;
  centerLabel: string;
  centerValue: string;
  palette?: string[];
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const prog = useCountUp(1, 1300);
  const [active, setActive] = useState<number | null>(null);
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const start = acc * 360;
    const end = (acc + frac) * 360;
    acc += frac;
    return { ...d, start, end, frac, color: palette[i % palette.length] };
  });
  const circ = 2 * Math.PI * r;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={thickness} />
        {segs.map((s, i) => {
          const len = s.frac * circ * prog;
          const offset = (s.start / 360) * circ;
          const dim = active !== null && active !== i;
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={active === i ? thickness + 4 : thickness}
              strokeDasharray={`${len} ${circ}`}
              strokeDashoffset={-offset}
              className={cn("cursor-pointer transition-[opacity,stroke-width]", dim && "opacity-30")}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xs text-muted-foreground">{active !== null ? segs[active].label : centerLabel}</span>
        <strong className="mt-0.5 text-[22px] font-bold">
          {active !== null ? `${Math.round(segs[active].frac * 100)}%` : centerValue}
        </strong>
      </div>
    </div>
  );
}

type TrendPoint = { label: string; value: number; display?: string };

export function LineChart({ data, height = 230, primary = "var(--primary)" }: { data: TrendPoint[]; height?: number; primary?: string }) {
  const prog = useCountUp(1, 1200);
  const [hover, setHover] = useState<number | null>(null);
  if (data.length < 2) {
    return <p className="text-sm text-muted-foreground">소비 추이 데이터가 부족합니다.</p>;
  }
  const max = Math.max(...data.map((d) => d.value)) * 1.12 || 1;
  const min = Math.min(...data.map((d) => d.value)) * 0.85;
  const pad = { t: 18, b: 28, l: 8, r: 8 };
  const W = 600;
  const innerH = height - pad.t - pad.b;
  const innerW = W - pad.l - pad.r;
  const pts = data.map((d, i) => {
    const x = pad.l + (i / (data.length - 1)) * innerW;
    const y = pad.t + innerH - ((d.value - min) / (max - min || 1)) * innerH;
    return [x, y] as const;
  });
  const line = pts.reduce((acc, p, i, a) => {
    if (i === 0) return `M ${p[0]} ${p[1]}`;
    const p0 = a[i - 1];
    const cx = (p0[0] + p[0]) / 2;
    return `${acc} C ${cx} ${p0[1]} ${cx} ${p[1]} ${p[0]} ${p[1]}`;
  }, "");
  const area = `${line} L ${pts[pts.length - 1][0]} ${pad.t + innerH} L ${pts[0][0]} ${pad.t + innerH} Z`;

  return (
    <div className="w-full">
      <svg width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="lc-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary} stopOpacity="0.35" />
            <stop offset="100%" stopColor={primary} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.33, 0.66, 1].map((g, i) => (
          <line key={i} x1={0} x2={W} y1={pad.t + innerH * (1 - g)} y2={pad.t + innerH * (1 - g)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}
        <path d={area} fill="url(#lc-grad)" style={{ opacity: prog }} />
        <path d={line} fill="none" stroke={primary} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={1200} strokeDashoffset={1200 * (1 - prog)} />
        {pts.map((p, i) => (
          <g key={i}>
            <rect x={p[0] - innerW / (data.length - 1) / 2} y={pad.t} width={innerW / (data.length - 1)} height={innerH} fill="transparent" onMouseEnter={() => setHover(i)} />
            <circle cx={p[0]} cy={p[1]} r={hover === i ? 6 : 3.5} fill="var(--card)" stroke={primary} strokeWidth={2.5} />
            {hover === i && (
              <text x={p[0]} y={p[1] - 14} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--foreground)">
                {data[i].display ?? data[i].value}
              </text>
            )}
            <text x={p[0]} y={height - 8} textAnchor="middle" fontSize={13} fill="var(--muted-foreground)">
              {data[i].label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({
  data,
  height = 230,
  primary = "var(--primary)",
  accent = "var(--accent)"
}: {
  data: TrendPoint[];
  height?: number;
  primary?: string;
  accent?: string;
}) {
  const prog = useCountUp(1, 1000);
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="text-sm text-muted-foreground">소비 추이 데이터가 없습니다.</p>;
  const max = Math.max(...data.map((d) => d.value)) || 1;
  const pad = { t: 16, b: 28 };
  const innerH = height - pad.t - pad.b;

  return (
    <div className="w-full">
      <svg width="100%" height={height} viewBox={`0 0 600 ${height}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75, 1].map((g, i) => (
          <line key={i} x1={0} x2={600} y1={pad.t + innerH * (1 - g)} y2={pad.t + innerH * (1 - g)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
        ))}
        {data.map((d, i) => {
          const slot = 600 / data.length;
          const bx = i * slot + slot / 2;
          const bw = Math.min(34, slot * 0.5);
          const h = (d.value / max) * innerH * prog;
          const isH = hover === i;
          return (
            <g key={i} className="cursor-pointer" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={bx - bw / 2} y={pad.t} width={bw} height={innerH} rx={4} fill="rgba(255,255,255,0.02)" />
              <rect x={bx - bw / 2} y={pad.t + innerH - h} width={bw} height={h} rx={4} fill={isH ? accent : primary} />
              {isH && (
                <text x={bx} y={pad.t + innerH - h - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--foreground)">
                  {d.display ?? d.value}
                </text>
              )}
              <text x={bx} y={height - 8} textAnchor="middle" fontSize={13} fill="var(--muted-foreground)">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GaugeBar({ value, max, primary = "var(--primary)", accent = "var(--accent)" }: { value: number; max: number; primary?: string; accent?: string }) {
  const prog = useCountUp(1, 1100);
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const over = pct > 0.85;
  return (
    <div className="h-2.5 overflow-hidden rounded-md bg-white/10">
      <div
        className="h-full rounded-md transition-[width] duration-300"
        style={{
          width: `${pct * prog * 100}%`,
          background: over ? "linear-gradient(90deg,#4D96FF,#F85149)" : `linear-gradient(90deg,${primary},${accent})`
        }}
      />
    </div>
  );
}

export function CategoryBars({
  data,
  primary = "var(--primary)",
  accent = "var(--accent)"
}: {
  data: Array<{ label: string; value: number }>;
  primary?: string;
  accent?: string;
}) {
  const prog = useCountUp(1, 1100);
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="flex flex-col gap-4">
      {data.map((d, i) => {
        const pct = (d.value / total) * 100;
        const top3 = i < 3;
        return (
          <div key={d.label}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className={cn(top3 ? "font-semibold" : "font-medium")}>{d.label}</span>
              <span className="text-muted-foreground tnum">
                ₩{d.value.toLocaleString("ko-KR")}{" "}
                <em className={cn("font-semibold not-italic", top3 ? "text-accent" : "text-muted-foreground/70")}>
                  · {pct.toFixed(0)}%
                </em>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-white/10">
              <div
                className="h-full rounded-md transition-[width] duration-300"
                style={{
                  width: `${(d.value / max) * prog * 100}%`,
                  background: top3 ? `linear-gradient(90deg,${primary},${accent})` : "rgba(255,255,255,0.18)"
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({ color = "var(--success)" }: { color?: string }) {
  const pts = [6, 5, 7, 6.4, 8, 7.5, 9.2, 8.6, 10];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${28 - ((p - min) / (max - min)) * 24}`).join(" ");
  return (
    <svg className="mt-3.5 block w-full" height={32} viewBox="0 0 100 32" preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
