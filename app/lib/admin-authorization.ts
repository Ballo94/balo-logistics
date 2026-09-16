export type AdminUser = { email?: string | null; app_metadata?: Record<string, unknown> | null };

export function isVerifiedAdminUser(user: AdminUser | null | undefined, configuredAdminEmail?: string | null) {
  if (!user) return false;
  const role = typeof user.app_metadata?.role === "string" ? user.app_metadata.role.toLowerCase() : "";
  const configured = configuredAdminEmail?.trim().toLowerCase();
  return role === "admin" || Boolean(configured && user.email?.trim().toLowerCase() === configured);
}
