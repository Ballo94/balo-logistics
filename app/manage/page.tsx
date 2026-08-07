"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { sendAutomaticNotification } from "../lib/notifications";
import { ShipmentEditor, TRANSPORT_OPTIONS, type ShipmentEditForm, type ShipmentEditorRecord } from "./ShipmentEditor";

const STATUS_OPTIONS = [
  "Shipment Created",
  "Collected",
  "In Warehouse",
  "In Transit",
  "Customs Clearance",
  "Out For Delivery",
  "Delivered",
  "Delayed",
  "Shipment Issue",
];

const FILTERS = ["All", "Air", "Sea", "Delivered", "Out for Delivery", "Delayed"] as const;
type Filter = (typeof FILTERS)[number];

type Shipment = ShipmentEditorRecord;

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusStyle(status: string | null) {
  const value = normalize(status);
  if (value === "delivered") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (value === "delayed" || value === "shipment issue") return "bg-red-50 text-red-700 ring-red-600/20";
  if (value === "out for delivery") return "bg-violet-50 text-violet-700 ring-violet-600/20";
  if (value === "in transit") return "bg-blue-50 text-blue-700 ring-blue-600/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

function shipmentToForm(shipment: Shipment): ShipmentEditForm {
  return {
    tracking_number: shipment.tracking_number,
    client_name: shipment.client_name,
    client_email: shipment.client_email ?? "",
    origin_country: shipment.origin_country,
    destination_country: shipment.destination_country,
    current_location: shipment.current_location ?? "",
    courier_name: shipment.courier_name ?? "",
    item_description: shipment.item_description ?? "",
    estimated_delivery: shipment.estimated_delivery?.slice(0, 10) ?? "",
    transport_mode: shipment.transport_mode ?? "Air",
    receiver_name: shipment.receiver_name ?? "",
    receiver_phone: shipment.receiver_phone ?? "",
    receiver_email: shipment.receiver_email ?? "",
    receiver_address: shipment.receiver_address ?? "",
    shipment_status: shipment.shipment_status ?? "Shipment Created",
    update_note: "",
    weight_kg: shipment.weight_kg?.toString() ?? "",
    package_count: shipment.package_count?.toString() ?? "",
    package_type: shipment.package_type ?? "",
    declared_value: shipment.declared_value?.toString() ?? "",
  };
}

function validEmail(value: string) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }

function validateEditForm(form: ShipmentEditForm) {
  const errors: Record<string, string> = {};
  if (!form.client_name.trim()) errors.client_name = "Sender name is required.";
  if (!form.origin_country.trim()) errors.origin_country = "Origin is required.";
  if (!form.destination_country.trim()) errors.destination_country = "Destination is required.";
  if (!form.shipment_status.trim()) errors.shipment_status = "Select a shipment status.";
  if (!TRANSPORT_OPTIONS.includes(form.transport_mode as (typeof TRANSPORT_OPTIONS)[number])) errors.transport_mode = "Select a valid transport mode.";
  if (form.estimated_delivery && Number.isNaN(new Date(`${form.estimated_delivery}T00:00:00`).getTime())) errors.estimated_delivery = "Enter a valid estimated delivery date.";
  if (!validEmail(form.client_email)) errors.client_email = "Enter a valid sender email address.";
  if (!validEmail(form.receiver_email)) errors.receiver_email = "Enter a valid receiver email address.";
  if (form.weight_kg && (Number.isNaN(Number(form.weight_kg)) || Number(form.weight_kg) < 0)) errors.weight_kg = "Weight must be zero or greater.";
  if (form.package_count && (!Number.isInteger(Number(form.package_count)) || Number(form.package_count) < 0)) errors.package_count = "Quantity must be a whole number of zero or greater.";
  if (form.declared_value && (Number.isNaN(Number(form.declared_value)) || Number(form.declared_value) < 0)) errors.declared_value = "Declared value must be zero or greater.";
  return errors;
}

export default function ManagePage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [viewing, setViewing] = useState<Shipment | null>(null);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [editForm, setEditForm] = useState<ShipmentEditForm | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSuccess, setEditSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadShipments = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("shipments")
      .select("*")
      .order("created_at", { ascending: false });

    if (loadError) setError(loadError.message);
    else setShipments((data ?? []) as Shipment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Supabase is an external data source; load its current state when this client view mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadShipments();
  }, [loadShipments]);

  const filteredShipments = useMemo(() => {
    const query = search.toLowerCase().trim();
    return shipments.filter((shipment) => {
      const matchesSearch = !query || shipment.tracking_number.toLowerCase().includes(query) || shipment.client_name.toLowerCase().includes(query);
      const target = normalize(filter);
      const matchesFilter = filter === "All" || (filter === "Air" || filter === "Sea"
        ? normalize(shipment.transport_mode) === target
        : normalize(shipment.shipment_status) === target);
      return matchesSearch && matchesFilter;
    });
  }, [filter, search, shipments]);

  function openEdit(shipment: Shipment) {
    setEditing(shipment);
    setEditForm(shipmentToForm(shipment));
    setEditErrors({});
    setEditSuccess("");
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(null);
    setEditErrors({});
    setEditSuccess("");
  }

  function updateEditField(field: keyof ShipmentEditForm, value: string) {
    setEditForm((current) => current ? { ...current, [field]: value } : current);
    setEditErrors((current) => current[field] ? { ...current, [field]: "" } : current);
    setEditSuccess("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editForm) return;
    const validationErrors = validateEditForm(editForm);
    if (Object.keys(validationErrors).length) {
      setEditErrors(validationErrors);
      setEditSuccess("");
      return;
    }
    setSaving(true);
    setEditErrors({});
    setEditSuccess("");
    const payload = {
      client_name: editForm.client_name.trim(),
      client_email: editForm.client_email.trim() || null,
      origin_country: editForm.origin_country.trim(),
      destination_country: editForm.destination_country.trim(),
      current_location: editForm.current_location.trim() || null,
      courier_name: editForm.courier_name.trim() || null,
      item_description: editForm.item_description.trim() || null,
      estimated_delivery: editForm.estimated_delivery || null,
      transport_mode: editForm.transport_mode,
      receiver_name: editForm.receiver_name.trim() || null,
      receiver_phone: editForm.receiver_phone.trim() || null,
      receiver_email: editForm.receiver_email.trim() || null,
      receiver_address: editForm.receiver_address.trim() || null,
      shipment_status: editForm.shipment_status,
      weight_kg: editForm.weight_kg === "" ? null : Number(editForm.weight_kg),
      package_count: editForm.package_count === "" ? null : Number(editForm.package_count),
      package_type: editForm.package_type.trim() || null,
      declared_value: editForm.declared_value === "" ? null : Number(editForm.declared_value),
    };
    const { data: updatedData, error: updateError } = await supabase.from("shipments").update(payload).eq("id", editing.id).select("*").single();
    if (updateError) {
      setEditErrors({ form: updateError.message });
      setSaving(false);
      return;
    }
    const statusChanged = normalize(editing.shipment_status) !== normalize(editForm.shipment_status);
    const locationChanged = normalize(editing.current_location) !== normalize(editForm.current_location);
    const hasOperationalNote = Boolean(editForm.update_note.trim());
    if (statusChanged || locationChanged || hasOperationalNote) {
      const { error: historyError } = await supabase.from("shipment_history").insert([{
        shipment_id: editing.id,
        status: editForm.shipment_status,
        location: editForm.current_location.trim() || null,
        note: editForm.update_note.trim() || null,
        created_at: new Date().toISOString(),
      }]);
      if (historyError) {
        setEditErrors({ form: `Shipment updated, but history could not be saved: ${historyError.message}` });
        setSaving(false);
        return;
      }
    }
    if (statusChanged) {
      const eventType = normalize(editForm.shipment_status) === "delivered" ? "delivered" : "status_changed";
      void sendAutomaticNotification(editing.id, eventType);
    }
    await loadShipments();
    const refreshed = updatedData as Shipment;
    setEditing(refreshed);
    setEditForm({ ...shipmentToForm(refreshed), update_note: "" });
    setEditSuccess("Shipment saved successfully. The shipment list and customer-facing derived state are now refreshed.");
    setSaving(false);
  }

  async function deleteShipment(shipment: Shipment) {
    if (!window.confirm(`Delete shipment ${shipment.tracking_number}? This action cannot be undone.`)) return;
    setDeletingId(shipment.id);
    const { error: deleteError } = await supabase.from("shipments").delete().eq("id", shipment.id);
    if (deleteError) setError(deleteError.message);
    else setShipments((current) => current.filter((item) => item.id !== shipment.id));
    setDeletingId(null);
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 text-gray-900 sm:px-6 lg:p-10">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Logistics operations</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Manage Shipments</h1>
            <p className="mt-2 text-gray-600">Search, review and update every shipment from one place.</p>
          </div>
          <Link href="/admin" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold shadow-sm transition hover:bg-gray-50">
            ← Back to Dashboard
          </Link>
        </div>

        <section className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-gray-200/60">
          <div className="border-b border-gray-100 p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="relative w-full xl:max-w-md">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"><circle cx="11" cy="11" r="7" strokeWidth="2"/><path d="m20 20-4-4" strokeWidth="2" strokeLinecap="round"/></svg>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tracking number or client..." aria-label="Search shipments" className="h-12 w-full rounded-xl border border-gray-200 bg-gray-50 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Shipment filters">
                {FILTERS.map((item) => (
                  <button key={item} type="button" onClick={() => setFilter(item)} className={`whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-semibold transition ${filter === item ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>{filteredShipments.length} of {shipments.length} shipments</span>
              <button type="button" onClick={() => void loadShipments()} className="font-semibold text-blue-600 hover:text-blue-700">Refresh data</button>
            </div>
          </div>

          {error && <div role="alert" className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>{["Tracking Number", "Client Name", "Origin", "Destination", "Transport Mode", "Shipment Status", "Estimated Delivery", "Created Date", "Actions"].map((heading) => <th key={heading} className="px-5 py-4 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={9} className="px-5 py-16 text-center text-gray-500">Loading shipments...</td></tr>
                ) : filteredShipments.length === 0 ? (
                  <tr><td colSpan={9} className="px-5 py-16 text-center"><p className="font-semibold text-gray-800">No shipments found</p><p className="mt-1 text-gray-500">Try changing your search or filter.</p></td></tr>
                ) : filteredShipments.map((shipment) => (
                  <tr key={shipment.id} className="transition hover:bg-blue-50/40">
                    <td className="px-5 py-4 font-bold text-blue-700">{shipment.tracking_number}</td>
                    <td className="px-5 py-4 font-medium">{shipment.client_name}</td>
                    <td className="px-5 py-4 text-gray-600">{shipment.origin_country}</td>
                    <td className="px-5 py-4 text-gray-600">{shipment.destination_country}</td>
                    <td className="px-5 py-4"><span className="rounded-md bg-gray-100 px-2.5 py-1 font-medium text-gray-700">{shipment.transport_mode ?? "—"}</span></td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(shipment.shipment_status)}`}>{shipment.shipment_status ?? "Shipment Created"}</span></td>
                    <td className="px-5 py-4 text-gray-600">{displayDate(shipment.estimated_delivery)}</td>
                    <td className="px-5 py-4 text-gray-600">{displayDate(shipment.created_at)}</td>
                    <td className="px-5 py-4"><div className="flex items-center gap-2">
                      <button type="button" onClick={() => setViewing(shipment)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">View</button>
                      <button type="button" onClick={() => openEdit(shipment)} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-100">Edit</button>
                      <button type="button" disabled={deletingId === shipment.id} onClick={() => void deleteShipment(shipment)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">{deletingId === shipment.id ? "Deleting..." : "Delete"}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {viewing && <Modal title="Shipment Details" subtitle={viewing.tracking_number} onClose={() => setViewing(null)}>
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <Detail label="Client Name" value={viewing.client_name} /><Detail label="Shipment Status" value={viewing.shipment_status} />
          <Detail label="Origin" value={viewing.origin_country} /><Detail label="Destination" value={viewing.destination_country} />
          <Detail label="Current Location" value={viewing.current_location} /><Detail label="Transport Mode" value={viewing.transport_mode} />
          <Detail label="Courier" value={viewing.courier_name} /><Detail label="Estimated Delivery" value={displayDate(viewing.estimated_delivery)} />
          <Detail label="Weight" value={viewing.weight_kg == null ? null : `${viewing.weight_kg} kg`} /><Detail label="Package Count" value={viewing.package_count?.toString()} />
          <Detail label="Package Type" value={viewing.package_type} /><Detail label="Declared Value" value={viewing.declared_value == null ? null : `$${viewing.declared_value.toLocaleString()}`} />
          <Detail label="Receiver Name" value={viewing.receiver_name} /><Detail label="Receiver Phone" value={viewing.receiver_phone} />
          <div className="sm:col-span-2"><Detail label="Receiver Address" value={viewing.receiver_address} /></div>
          <div className="sm:col-span-2"><Detail label="Item Description" value={viewing.item_description} /></div>
          <Detail label="Created Date" value={displayDate(viewing.created_at)} />
        </div>
      </Modal>}

      {editing && editForm && <ShipmentEditor shipment={editing} form={editForm} statusOptions={STATUS_OPTIONS} errors={editErrors} saving={saving} success={editSuccess} onChange={updateEditField} onSubmit={saveEdit} onClose={closeEdit} />}
    </main>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-6 py-5">
        <div><h2 id="modal-title" className="text-2xl font-bold">{title}</h2><p className="mt-1 font-semibold text-blue-600">{subtitle}</p></div>
        <button type="button" onClick={onClose} aria-label="Close modal" className="rounded-lg p-2 text-2xl leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-700">×</button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>;
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</dt><dd className="mt-1.5 font-medium text-gray-800">{value || "—"}</dd></div>;
}
