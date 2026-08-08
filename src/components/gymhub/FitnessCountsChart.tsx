"use client";

import React from "react";

type Row = { gym: string; count: number; image_url?: string | null };

const BAR_COLORS = [
  "#6366F1",
  "#10B981",
  "#F59E0B",
  "#EC4899",
  "#22C55E",
  "#3B82F6",
  "#A855F7",
  "#EF4444",
  "#14B8A6",
  "#F97316",
  "#0EA5E9",
  "#84CC16",
];

function GymAvatar({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className="size-7 shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
      />
    );
  }
  const initial = (name.trim()[0] || "?").toUpperCase();
  return (
    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 ring-1 ring-gray-200 dark:bg-white/10 dark:text-slate-300 dark:ring-gray-700">
      {initial}
    </span>
  );
}

export default function FitnessCountsChart({
  data,
  height = 480,
}: {
  data: Row[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
        Өгөгдөл байхгүй
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((d) => d.count), 1);
  const minHeight = Math.max(height, sorted.length * 36 + 16);

  return (
    <div style={{ minHeight }} className="flex w-full flex-col justify-center gap-2.5">
      {sorted.map((d, i) => {
        const pct = Math.max(4, Math.round((d.count / max) * 100));
        const color = BAR_COLORS[i % BAR_COLORS.length];
        return (
          <div key={`${d.gym}-${i}`} className="flex items-center gap-2.5">
            <div className="flex w-[11.5rem] shrink-0 items-center justify-start gap-2 sm:w-56">
              <GymAvatar name={d.gym} imageUrl={d.image_url} />
              <span
                className="min-w-0 truncate text-left text-xs font-medium text-slate-600 dark:text-slate-400"
                title={d.gym}
              >
                {d.gym}
              </span>
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="h-6 overflow-hidden rounded-md bg-slate-100/80 dark:bg-white/[0.04]">
                <div
                  className="h-full rounded-md transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                {d.count}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
