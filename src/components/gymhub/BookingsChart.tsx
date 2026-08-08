"use client";

import React from "react";
import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

type ChartData = { date: string; count: number }[];

function formatCompactMnt(v: number): string {
  const n = Math.round(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}сая`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(n);
}

export default function BookingsChart({
  data,
  seriesName = "Төлбөр",
  valueUnit = "count",
}: {
  data: ChartData;
  /** Сарын баганы нэр (жиш. орлуулгын үед «Гишүүнчлэл эхэлсэн») */
  seriesName?: string;
  /** amount үед Y тэнхлэгийг товчилсон төгрөгөөр харуулна */
  valueUnit?: "count" | "amount";
}) {
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
    yaxis: {
      labels: {
        formatter: (v) =>
          valueUnit === "amount" ? formatCompactMnt(v) : String(Math.round(v)),
      },
    },
    colors: ["#6366f1"],
    // partial tooltip (shared байхгүй) → ApexCharts "reading 'shared'" crash
    tooltip: {
      shared: true,
      intersect: false,
      y: {
        formatter: (v) =>
          valueUnit === "amount"
            ? `${Math.round(v).toLocaleString("mn-MN")}₮`
            : String(Math.round(v)),
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
      <Chart options={options} series={series} type="bar" height="100%" />
    </div>
  );
}
