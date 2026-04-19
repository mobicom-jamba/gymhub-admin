export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import CouponsSection from "./CouponsSection";

export const metadata: Metadata = {
  title: "Купон | GymHub Admin",
  description: "Партнер купоны удирдлага",
};

export default function CouponsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Партнер купон" />
      <div className="space-y-6">
        <CouponsSection />
      </div>
    </div>
  );
}
