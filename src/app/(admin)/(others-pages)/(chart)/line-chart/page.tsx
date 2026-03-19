import LineChartOne from "@/components/charts/line/LineChartOne";
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Шугаман график | GymHub Admin",
  description: "Шугаман график",
};
export default function LineChart() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Шугаман график" />
      <div className="space-y-6">
        <ComponentCard title="Шугаман график">
          <LineChartOne />
        </ComponentCard>
      </div>
    </div>
  );
}
