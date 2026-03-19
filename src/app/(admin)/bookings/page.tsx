export const dynamic = "force-dynamic";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { t } from "@/lib/i18n";
import { Metadata } from "next";
import BookingsSection from "./BookingsSection";

export const metadata: Metadata = {
  title: `${t("bookings")} | GymHub Admin`,
  description: "GymHub захиалгын удирдлага",
};

export default function BookingsPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle={t("bookings")} />
      <div className="space-y-6">
        <BookingsSection />
      </div>
    </div>
  );
}
