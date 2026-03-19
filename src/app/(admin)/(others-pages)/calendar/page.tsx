import GymHubCalendar from "@/components/calendar/GymHubCalendar";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Календарь | GymHub Admin",
  description: "Хичээлийн цагийн хуваарь",
};
export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Календарь" />
      <GymHubCalendar />
    </div>
  );
}
