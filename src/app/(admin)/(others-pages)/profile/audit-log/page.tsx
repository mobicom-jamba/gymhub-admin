export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import MembershipAuditSection from "./MembershipAuditSection";

export const metadata: Metadata = {
  title: "Membership Audit Log | GymHub Admin",
  description: "Гишүүнчлэлийн өөрчлөлтийн бүртгэл",
};

export default function MembershipAuditPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Membership Audit Log" />
      <div className="space-y-6">
        <MembershipAuditSection />
      </div>
    </div>
  );
}
