"use client";

import React from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type Props = { data: { gym: string; visits: number }[] };

export default function GymUtilizationChart({ data }: Props) {
  const options: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false } },
    plotOptions: {
      bar: { horizontal: true, barHeight: "55%", borderRadius: 4 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      labels: { formatter: (v) => String(Math.round(Number(v))) },
    },
    yaxis: {
      labels: { style: { fontSize: "12px" } },
    },
    colors: ["#10b981"],
    tooltip: { y: { formatter: (v) => `${v} ирц` } },
  };
  const series = [
    {
      name: "Ирц",
      data: data.map((d) => ({ x: d.gym, y: d.visits })),
    },
  ];

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Өгөгдөл байхгүй
      </div>
    );
  }

  return (
    <div className="h-64">
      <Chart options={options} series={series} type="bar" height="100%" />
    </div>
  );
}
