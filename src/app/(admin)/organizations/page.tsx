"use client";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import OrganizationsSection from "./OrganizationsSection";

export default function OrganizationsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Байгууллагууд" />
      <OrganizationsSection />
    </div>
  );
}
