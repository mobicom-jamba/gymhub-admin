"use client";

import React from "react";
import { t } from "@/lib/i18n";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export default function SearchInput({
  value,
  onChange,
  placeholder = t("search"),
  className = "",
}: Props) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.25 3C5.3505 3 3 5.3505 3 8.25C3 11.1495 5.3505 13.5 8.25 13.5C11.1495 13.5 13.5 11.1495 13.5 8.25C13.5 5.3505 11.1495 3 8.25 3ZM1.5 8.25C1.5 4.52208 4.52208 1.5 8.25 1.5C11.9779 1.5 15 4.52208 15 8.25C15 9.88575 14.4531 11.3807 13.5384 12.5472L16.4697 15.4785C16.7626 15.7714 16.7626 16.2463 16.4697 16.5392C16.1768 16.8321 15.7019 16.8321 15.409 16.5392L12.4777 13.6079C11.3112 14.5226 9.81625 15.0695 8.18054 15.0695C4.45262 15.0695 1.43054 12.0474 1.43054 8.31949L1.5 8.25Z"
            fill="currentColor"
          />
        </svg>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-gray-500"
      />
    </div>
  );
}
