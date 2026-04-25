"use client";

import React from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Row = { gym: string; count: number };

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

  // Sort descending so the largest bar sits on top
  const sorted = [...data].sort((a, b) => b.count - a.count);
  const truncate = (s: string, n = 24) =>
    s.length > n ? s.slice(0, n - 1) + "…" : s;

  const points = sorted.map((d) => ({ x: truncate(d.gym), y: d.count }));

  // Auto-size: ~32px per bar + padding so labels never overlap
  const computedHeight = Math.max(height, sorted.length * 32 + 48);

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      fontFamily: "inherit",
      background: "transparent",
      animations: { enabled: true, speed: 600 },
    },
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: "68%",
        borderRadius: 6,
        borderRadiusApplication: "end",
        dataLabels: { position: "top" }, // value at the end of the bar
        distributed: true,
      },
    },
    colors: [
      "#6366F1", // indigo
      "#10B981", // emerald
      "#F59E0B", // amber
      "#EC4899", // pink
      "#22C55E", // green
      "#3B82F6", // blue
      "#A855F7", // purple
      "#EF4444", // red
      "#14B8A6", // teal
      "#F97316", // orange
      "#0EA5E9", // sky
      "#84CC16", // lime
    ],
    grid: {
      strokeDashArray: 4,
      borderColor: "rgba(148,163,184,0.18)",
      padding: { left: 0, right: 36, top: -4, bottom: -4 },
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    dataLabels: {
      enabled: true,
      textAnchor: "start",
      offsetX: 6,
      style: {
        fontSize: "12px",
        fontWeight: 600,
        colors: ["#475569"],
      },
      formatter: (val) => String(val),
      background: { enabled: false },
    },
    xaxis: {
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: { fontSize: "11px", colors: "#94A3B8" },
        formatter: (v) => String(Math.round(Number(v))),
      },
    },
    yaxis: {
      labels: {
        style: { fontSize: "12px", colors: "#64748B", fontWeight: 500 },
        maxWidth: 220,
      },
    },
    legend: { show: false }, // redundant with y-axis labels
    tooltip: {
      theme: "light",
      y: { formatter: (v) => `${v} ирц` },
      // Show full (non-truncated) gym name in tooltip
      x: {
        formatter: (_, opts) =>
          sorted[opts?.dataPointIndex ?? 0]?.gym ?? "",
      },
    },
    states: {
      hover: { filter: { type: "darken" } },
      active: { filter: { type: "none" } },
    },
  };

  const series: ApexAxisChartSeries = [{ name: "Ирц", data: points }];

  return (
    <div style={{ height: computedHeight }} className="w-full">
      <Chart options={options} series={series} type="bar" height="100%" />
    </div>
  );
}