import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import BasicTableOne from "@/components/tables/BasicTableOne";
import { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Энгийн хүснэгт | GymHub Admin",
  description: "Энгийн хүснэгт",
};

export default function BasicTables() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Энгийн хүснэгт" />
      <div className="space-y-6">
        <ComponentCard title="Энгийн хүснэгт">
          <BasicTableOne />
        </ComponentCard>
      </div>
    </div>
  );
}
