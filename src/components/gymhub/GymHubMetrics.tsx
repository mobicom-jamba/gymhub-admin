"use client";

import React from "react";

type GymHubMetricsProps = {
  userCount: number;
  paymentCount: number;
  companyCount: number;
  fitnessCount: number;
  yogaCount: number;
};

const metrics: {
  key: keyof Omit<GymHubMetricsProps, never>;
  label: string;
  icon: string;
  bg: string;
  iconColor: string;
}[] = [
  { key: "userCount", label: "Хэрэглэгч", icon: "👤", bg: "bg-blue-50 dark:bg-blue-900/20", iconColor: "text-blue-600" },
  { key: "paymentCount", label: "Төлбөр", icon: "📋", bg: "bg-green-50 dark:bg-green-900/20", iconColor: "text-green-600" },
  { key: "companyCount", label: "Компани", icon: "🏢", bg: "bg-blue-50 dark:bg-blue-900/20", iconColor: "text-blue-600" },
  { key: "fitnessCount", label: "Фитнес", icon: "📍", bg: "bg-orange-50 dark:bg-orange-900/20", iconColor: "text-orange-600" },
  { key: "yogaCount", label: "Йога", icon: "🧘", bg: "bg-pink-50 dark:bg-pink-900/20", iconColor: "text-pink-600" },
];

export function GymHubMetrics(props: GymHubMetricsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5">
      {metrics.map((m) => (
        <div
          key={m.key}
          className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg ${m.bg}`}>
            {m.icon}
          </div>
          <div className="min-w-0">
            <h4 className="text-xl font-bold text-gray-800 dark:text-white/90">
              {(props[m.key as keyof GymHubMetricsProps] ?? 0).toLocaleString()}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {m.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
