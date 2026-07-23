import InstallmentsSection from "./InstallmentsSection";

export default function InstallmentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Flexy
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        2–8 хуваарьт, хүүгүй төлөлтийн багцууд
      </p>
      <InstallmentsSection />
    </div>
  );
}
