"use client";

import React from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type ChartData = { date: string; count: number }[];

export default function BookingsChart({ data }: { data: ChartData }) {
  const options: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false } },
    plotOptions: {
      bar: { columnWidth: "60%", borderRadius: 4 },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: data.map((d) => d.date.slice(5)),
      labels: { style: { fontSize: "11px" } },
    },
    yaxis: { labels: { formatter: (v) => String(Math.round(v)) } },
    colors: ["#6366f1"],
  };
  const series = [{ name: "Захиалга", data: data.map((d) => d.count) }];

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
