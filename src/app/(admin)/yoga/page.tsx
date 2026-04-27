export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import YogaSection from "../gyms/YogaSection";

export const metadata: Metadata = {
  title: "Йога төвүүд | GymHub Admin",
};

export default function YogaPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Йога төвүүд" />
      <div className="space-y-6">
        <YogaSection />
      </div>
    </div>
  );
}