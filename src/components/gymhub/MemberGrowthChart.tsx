"use client";

import React from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Props = { data: { date: string; count: number }[] };

export default function MemberGrowthChart({ data }: Props) {
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
    yaxis: { labels: { formatter: (v) => String(Math.round(v)) } },
    colors: ["#8b5cf6"],
    tooltip: { y: { formatter: (v) => `${v} шинэ гишүүн` } },
  };
  const series = [{ name: "Шинэ гишүүн", data: data.map((d) => d.count) }];

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
