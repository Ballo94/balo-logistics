import { supabase } from "./supabase";

export type AdminShipmentHistoryEntry = {
  id: number;
  status: string;
  location: string | null;
  note: string | null;
  route_checkpoint_id: string | null;
  created_at: string;
  internal_note: string | null;
};

export async function loadAdminShipmentHistory(shipmentId: number) {
  const [historyResult, internalNotesResult] = await Promise.all([
    supabase
      .from("shipment_history")
      .select("id, status, location, note, route_checkpoint_id, created_at")
      .eq("shipment_id", shipmentId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("shipment_history_internal_notes")
      .select("shipment_history_id, note")
      .eq("shipment_id", shipmentId),
  ]);

  if (historyResult.error) return { entries: [] as AdminShipmentHistoryEntry[], error: historyResult.error };
  const internalNotes = new Map((internalNotesResult.data ?? []).map((item) => [Number(item.shipment_history_id), item.note]));
  const entries = (historyResult.data ?? []).map((entry) => ({
    ...entry,
    internal_note: internalNotes.get(Number(entry.id)) ?? null,
  })) as AdminShipmentHistoryEntry[];
  return { entries, error: internalNotesResult.error };
}
