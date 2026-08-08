"use client";

import React from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

function formatCompactMnt(v: number): string {
  const n = Math.round(v);
  if (Math.abs(n) >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}сая`;
  }
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(n);
}

type Props = {
  data: { date: string; count: number }[];
  seriesName?: string;
  valueLabel?: string;
  /** amount үед Y/tooltip-ийг төгрөгөөр харуулна */
  valueUnit?: "count" | "amount";
};

export default function MemberGrowthChart({
  data,
  seriesName = "Шинэ гишүүн",
  valueLabel = "шинэ гишүүн",
  valueUnit = "count",
}: Props) {
  const options: ApexCharts.ApexOptions = {
    chart: { type: "area", toolbar: { show: false }, sparkline: { enabled: false } },
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: data.map((d) => d.date.slice(5)),
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: {
      labels: {
        formatter: (v) =>
          valueUnit === "amount" ? formatCompactMnt(v) : String(Math.round(v)),
      },
    },
    colors: ["#8b5cf6"],
    tooltip: {
      shared: true,
      intersect: false,
      y: {
        formatter: (v) =>
          valueUnit === "amount"
            ? `${Math.round(v).toLocaleString("mn-MN")}₮`
            : `${Math.round(v)} ${valueLabel}`,
      },
    },
  };
  const series = [{ name: seriesName, data: data.map((d) => d.count) }];

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Өгөгдөл байхгүй
      </div>
    );
  }

  return (
    <div className="h-64">
      <Chart options={options} series={series} type="area" height="100%" />
    </div>
  );
}
