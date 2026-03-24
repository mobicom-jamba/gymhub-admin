"use client";

import React, { useState } from "react";

export type ColumnOption = { key: string; label: string };

export default function ColumnToggle({
  options,
  visible,
  onChange,
}: {
  options: ColumnOption[];
  visible: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
      >
        Багана
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 min-w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {options.map((opt) => (
            <label key={opt.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-white/[0.04]">
              <input
                type="checkbox"
                checked={visible[opt.key] !== false}
                onChange={(e) => onChange({ ...visible, [opt.key]: e.target.checked })}
                className="size-4"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

