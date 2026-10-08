"use client";

import React, { useEffect, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import { formatCountdown } from "@/lib/gym-opening";

/** "Гэрээ хийгдэж байна · Тун удахгүй" + countdown ticking every second until opens_at. */
export default function GymOpeningCountdown({ opensAt }: { opensAt: string }) {
  const target = new Date(opensAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!(target > Date.now())) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const remaining = target - now;
  if (!(remaining > 0)) return null;

  return (
    <span className="mt-1 flex flex-col items-start gap-0.5">
      <Badge size="sm" color="info">
        Гэрээ хийгдэж байна · Тун удахгүй
      </Badge>
      <span className="text-[11px] font-semibold tabular-nums text-gray-700 dark:text-gray-200">
        {formatCountdown(remaining)}
      </span>
    </span>
  );
}
