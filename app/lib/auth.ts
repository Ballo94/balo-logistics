import { supabase } from "./supabase";

export const ADMIN_ROLE = "Admin" as const;

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function getAdminName(user: { email?: string; user_metadata?: Record<string, unknown> }) {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim()) return metadataName.trim();
  return user.email?.split("@")[0] || "Administrator";
}

export function getAdminRole(user: { user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> }) {
  const role = user.app_metadata?.role ?? user.user_metadata?.role;
  return typeof role === "string" && role.trim() ? role.trim() : ADMIN_ROLE;
}
