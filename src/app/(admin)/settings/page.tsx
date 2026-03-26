import BackupRestore from "@/components/gymhub/BackupRestore";
import PaymentAppSettingsSection from "@/components/gymhub/PaymentAppSettingsSection";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Тохиргоо
      </h1>
      <PaymentAppSettingsSection />
      <BackupRestore />
    </div>
  );
}
