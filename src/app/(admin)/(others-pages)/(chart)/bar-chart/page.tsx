import BarChartOne from "@/components/charts/bar/BarChartOne";
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Баганан график | GymHub Admin",
  description: "Баганан график",
};

export default function page() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Баганан график" />
      <div className="space-y-6">
        <ComponentCard title="Баганан график">
          <BarChartOne />
        </ComponentCard>
      </div>
    </div>
  );
}
