"use client";

import React from "react";
import Image from "next/image";

type Props = {
  channels: {
    qpay: number;
    sono: number;
    pocket: number;
    gift: number;
  };
};

const items = [
  {
    key: "qpay" as const,
    label: "Qpay",
    description: "Банк болон дансаар төлсөн",
    logo: "/logos/qpay.png",
  },
  {
    key: "sono" as const,
    label: "Sono",
    description: "Sono апп ашигласан",
    logo: "/logos/sono.png",
  },
  {
    key: "pocket" as const,
    label: "Pocket",
    description: "Pocket апп ашигласан",
    logo: "/logos/pocket.png",
  },
  {
    key: "gift" as const,
    label: "Gift",
    description: "Урамшуулал болон бэлэг",
    logo: null, // no logo — use emoji
  },
];

export default function PaymentChannelsCard({ channels }: Props) {
  return (
    <div className="space-y-3">
      {items.map((ch) => (
        <div
          key={ch.key}
          className="flex items-center justify-between rounded-xl px-2 py-2.5 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
        >
          <div className="flex items-center gap-3">
            {ch.logo ? (
              <Image
                src={ch.logo}
                alt={ch.label}
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F59E0B]">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4l3.38 4.6L17 10.83 14.92 8H20v6z" />
                </svg>
              </div>
            )}
            <div>
              <p className="font-bold text-gray-800 dark:text-white/90 text-sm">
                {ch.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {ch.description}
              </p>
            </div>
          </div>
          <span className="font-bold text-gray-800 dark:text-white/90 text-lg tabular-nums">
            {channels[ch.key].toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
