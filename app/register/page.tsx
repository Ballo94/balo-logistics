import { redirect } from "next/navigation";

export default function RegisterPage() {
  // Balo currently operates with one provisioned Supabase administrator.
  // Public registration is intentionally disabled; future administrator
  // provisioning can be added behind an authorized management workflow.
  redirect("/login");
}
