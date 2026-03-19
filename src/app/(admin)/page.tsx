import type { Metadata } from "next";
import DashboardSection from "@/components/gymhub/DashboardSection";
import { t } from "@/lib/i18n";
import React from "react";

export const metadata: Metadata = {
  title: `${t("dashboard")} | GymHub Admin`,
  description: "GymHub админ хяналтын самбар",
};

export default function DashboardPage() {
  return <DashboardSection />;
}
