import { redirect } from "next/navigation";

export default function BasseinPage() {
  redirect("/gyms?type=pool");
}
