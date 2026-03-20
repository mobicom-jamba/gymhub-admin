"use client";

import React from "react";

type GymRow = {
  id: string;
  name: string | null;
  address: string | null;
  phone?: string | null;
  image_url?: string | null;
  created_at?: string;
};

export default function NewGymsCard({ gyms }: { gyms: GymRow[] }) {
  if (gyms.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        Шинэ фитнес олдсонгүй
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {gyms.map((g) => (
        <div
          key={g.id}
          className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-gray-50 dark:hover:bg-white/[0.03]"
        >
          {g.image_url ? (
            <img
              src={g.image_url}
              alt={g.name ?? "Gym"}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 text-white text-sm">
              🏋️
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-800 dark:text-white/90 text-sm truncate">
              {g.name ?? "—"}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {g.address ?? "—"}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-xs font-mono font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
            {g.phone ?? "—"}
          </span>
          <button className="shrink-0 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
