"use client";

import React from "react";
import Image from "next/image";
import {
  getPaymentChannelVisual,
  type PaymentChannelKey,
} from "@/lib/payment-channel-label";

type Props = {
  channels: {
    qpay: number;
    sono: number;
    pocket: number;
    carepay?: number;
    monpay?: number;
    gymfintech?: number;
    gift: number;
    other?: number;
  };
};

const ORDER: PaymentChannelKey[] = [
  "qpay",
  "sono",
  "pocket",
  "carepay",
  "monpay",
  "gymfintech",
  "gift",
  "other",
];

function countFor(
  channels: Props["channels"],
  key: PaymentChannelKey,
): number {
  if (key === "carepay") return channels.carepay ?? 0;
  if (key === "monpay") return channels.monpay ?? 0;
  if (key === "gymfintech") return channels.gymfintech ?? 0;
  if (key === "other") return channels.other ?? 0;
  return channels[key];
}

export default function PaymentChannelsCard({ channels }: Props) {
  const rows = ORDER.map((key) => {
    const visual = getPaymentChannelVisual(key);
    return { key, visual, count: countFor(channels, key) };
  }).filter((row) => {
    if (row.key === "other" || row.key === "carepay" || row.key === "monpay" || row.key === "gymfintech") {
      return row.count > 0;
    }
    return true;
  });

  return (
    <div className="space-y-3">
      {rows.map(({ key, visual, count }) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-xl px-2 py-2.5 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3">
            {visual.logo ? (
              <Image
                src={visual.logo}
                alt={visual.label}
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-xl object-cover"
              />
            ) : key === "other" ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-400 dark:bg-slate-600">
                <span className="text-sm font-bold text-white">?</span>
              </div>
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400">
                <span className="text-lg">🎁</span>
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                {visual.label}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{visual.title}</p>
            </div>
          </div>
          <p className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
            {count.toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
