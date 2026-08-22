"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { createTrackingEvent } from "../lib/tracking-events";
import { ShipmentEditor, TRANSPORT_OPTIONS, type ShipmentEditForm, type ShipmentEditorRecord } from "./ShipmentEditor";
import { automateShipmentOperations, getStatusTransitionWarning } from "../lib/operations-automation";
import { weightToKilograms } from "../lib/package-fields";

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

type ShipmentHistoryEntry = {
  id: number;
  status: string;
  location: string | null;
  note: string | null;
  created_at: string;
};

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

function displayDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
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
    client_company_name: shipment.client_company_name ?? "",
    client_phone: shipment.client_phone ?? "",
    client_address: shipment.client_address ?? "",
    client_receive_updates: String(shipment.client_receive_updates ?? false),
    origin_country: shipment.origin_country,
    destination_country: shipment.destination_country,
    current_location: shipment.current_location ?? "",
    courier_name: shipment.courier_name ?? "",
    item_description: shipment.item_description ?? "",
    estimated_delivery: shipment.estimated_delivery?.slice(0, 10) ?? "",
    transport_mode: shipment.transport_mode ?? "Air",
    vessel_name: shipment.vessel_name ?? "",
    receiver_name: shipment.receiver_name ?? "",
    receiver_company_name: shipment.receiver_company_name ?? "",
    receiver_phone: shipment.receiver_phone ?? "",
    receiver_email: shipment.receiver_email ?? "",
    receiver_address: shipment.receiver_address ?? "",
    receiver_receive_updates: String(shipment.receiver_receive_updates ?? false),
    shipment_status: shipment.shipment_status ?? "Shipment Created",
    update_note: "",
    weight_kg: shipment.weight_kg?.toString() ?? "",
    weight_unit: "KG",
    package_count: shipment.package_count?.toString() ?? "",
    package_type: shipment.package_type ?? "",
    dimensions: shipment.dimensions ?? "",
    container_number: shipment.container_number ?? "",
    seal_number: shipment.seal_number ?? "",
    declared_value: shipment.declared_value?.toString() ?? "",
    route_template_id: shipment.route_template_id ?? "",
    current_route_checkpoint_id: shipment.current_route_checkpoint_id ?? "",
  };
}

function validateEditForm(form: ShipmentEditForm) {
  const errors: Record<string, string> = {};
  if (!form.client_name.trim()) errors.client_name = "Sender name is required.";
  if (!form.receiver_name.trim()) errors.receiver_name = "Receiver name is required.";
  if (form.client_phone && !isInternationalPhone(form.client_phone)) errors.client_phone = "Use international format, for example +264 81 123 4567.";
  if (form.receiver_phone && !isInternationalPhone(form.receiver_phone)) errors.receiver_phone = "Use international format, for example +264 81 123 4567.";
  if (form.client_email && !/^\S+@\S+\.\S+$/.test(form.client_email)) errors.client_email = "Enter a valid email address.";
  if (form.receiver_email && !/^\S+@\S+\.\S+$/.test(form.receiver_email)) errors.receiver_email = "Enter a valid email address.";
  if (!form.origin_country.trim()) errors.origin_country = "Origin is required.";
  if (!form.destination_country.trim()) errors.destination_country = "Destination is required.";
  if (!form.shipment_status.trim()) errors.shipment_status = "Select a shipment status.";
  if (!TRANSPORT_OPTIONS.includes(form.transport_mode as (typeof TRANSPORT_OPTIONS)[number])) errors.transport_mode = "Select a valid transport mode.";
  if (form.estimated_delivery && Number.isNaN(new Date(`${form.estimated_delivery}T00:00:00`).getTime())) errors.estimated_delivery = "Enter a valid estimated delivery date.";
  if (form.weight_kg && (!Number.isFinite(Number(form.weight_kg)) || Number(form.weight_kg) < 0)) errors.weight_kg = "Total weight must be a valid non-negative number.";
  if (form.package_count && (!Number.isInteger(Number(form.package_count)) || Number(form.package_count) < 1)) errors.package_count = "Package quantity must be a whole number of at least one.";
  if (form.declared_value && (Number.isNaN(Number(form.declared_value)) || Number(form.declared_value) < 0)) errors.declared_value = "Declared value must be zero or greater.";
  return errors;
}

function automateForm(form: ShipmentEditForm) {
  return automateShipmentOperations({ shipmentStatus: form.shipment_status, transportMode: form.transport_mode, origin: form.origin_country, destination: form.destination_country, journey: null, receiverAddress: form.receiver_address, estimatedDelivery: form.estimated_delivery, operationalNote: form.update_note });
}

export default function ManagePage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [viewing, setViewing] = useState<Shipment | null>(null);
  const [viewHistory, setViewHistory] = useState<ShipmentHistoryEntry[]>([]);
  const [viewHistoryLoading, setViewHistoryLoading] = useState(false);
  const [viewHistoryError, setViewHistoryError] = useState("");
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [editForm, setEditForm] = useState<ShipmentEditForm | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editSuccess, setEditSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const saveRequestInFlight = useRef(false);
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

  async function openView(shipment: Shipment) {
    setViewing(shipment);
    setViewHistory([]);
    setViewHistoryError("");
    setViewHistoryLoading(true);
    const { data, error: historyError } = await supabase
      .from("shipment_history")
      .select("id, status, location, note, created_at")
      .eq("shipment_id", shipment.id)
      .order("created_at", { ascending: true });
    if (historyError) setViewHistoryError(historyError.message);
    else setViewHistory((data ?? []) as ShipmentHistoryEntry[]);
    setViewHistoryLoading(false);
  }

  function closeEdit() {
    setEditing(null);
    setEditForm(null);
    setEditErrors({});
    setEditSuccess("");
  }

  function updateEditField(field: keyof ShipmentEditForm, value: string) {
    if (field === "shipment_status" && editForm && editing) {
      const current = automateShipmentOperations({ shipmentStatus: editing.shipment_status, transportMode: editForm.transport_mode, origin: editForm.origin_country, destination: editForm.destination_country, journey: null, receiverAddress: editForm.receiver_address, estimatedDelivery: editForm.estimated_delivery });
      const target = automateShipmentOperations({ shipmentStatus: value, transportMode: editForm.transport_mode, origin: editForm.origin_country, destination: editForm.destination_country, journey: null, receiverAddress: editForm.receiver_address, estimatedDelivery: editForm.estimated_delivery, operationalNote: editForm.update_note });
      const warning = getStatusTransitionWarning(current, target);
      if (warning && !window.confirm(warning.message)) return;
    }
    setEditForm((current) => current ? { ...current, [field]: value } : current);
    setEditErrors((current) => current[field] ? { ...current, [field]: "" } : current);
    setEditSuccess("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, authoritativeCurrentLocation?: string) {
    event.preventDefault();
    if (!editing || !editForm || saveRequestInFlight.current) return;
    const validationErrors = validateEditForm(editForm);
    const statusChanged = normalize(editing.shipment_status) !== normalize(editForm.shipment_status);
    const checkpointChanged = editing.current_route_checkpoint_id !== (editForm.current_route_checkpoint_id || null);
    const selectedCurrentLocation = authoritativeCurrentLocation?.trim() || editForm.current_location;
    const locationChanged = normalize(editing.current_location) !== normalize(selectedCurrentLocation);
    if (editForm.update_note.trim() && !statusChanged && !checkpointChanged) validationErrors.update_note = "Change the shipment status or route checkpoint to attach this note to a new checkpoint event.";
    if (Object.keys(validationErrors).length) {
      setEditErrors(validationErrors);
      setEditSuccess("");
      return;
    }
    saveRequestInFlight.current = true;
    setSaving(true);
    setEditErrors({});
    setEditSuccess("");
    const automation = automateForm(editForm);
    const resolvedCurrentLocation = locationChanged
      ? selectedCurrentLocation.trim() || automation.currentLocation
      : editing.current_location?.trim() || automation.currentLocation;
    const payload = {
      client_name: editForm.client_name.trim(),
      client_company_name: editForm.client_company_name.trim() || null,
      client_phone: editForm.client_phone.trim() || null,
      client_email: editForm.client_email.trim() || null,
      client_address: editForm.client_address.trim() || null,
      client_receive_updates: editForm.client_receive_updates === "true",
      origin_country: editForm.origin_country.trim(),
      destination_country: editForm.destination_country.trim(),
      current_location: resolvedCurrentLocation,
      courier_name: editForm.courier_name.trim() || null,
      item_description: editForm.item_description.trim() || null,
      estimated_delivery: editForm.estimated_delivery || null,
      transport_mode: editForm.transport_mode,
      vessel_name: editForm.vessel_name.trim() || null,
      receiver_name: editForm.receiver_name.trim() || null,
      receiver_company_name: editForm.receiver_company_name.trim() || null,
      receiver_phone: editForm.receiver_phone.trim() || null,
      receiver_email: editForm.receiver_email.trim() || null,
      receiver_address: editForm.receiver_address.trim() || null,
      receiver_receive_updates: editForm.receiver_receive_updates === "true",
      shipment_status: editForm.shipment_status,
      current_route_checkpoint_id: editForm.current_route_checkpoint_id || null,
      weight_kg: weightToKilograms(editForm.weight_kg, editForm.weight_unit),
      package_count: editForm.package_count === "" ? null : Number(editForm.package_count),
      package_type: editForm.package_type.trim() || null,
      dimensions: editForm.dimensions.trim() || null,
      container_number: editForm.container_number.trim() || null,
      seal_number: editForm.seal_number.trim() || null,
      declared_value: editForm.declared_value === "" ? null : Number(editForm.declared_value),
    };
    const { data: updatedData, error: updateError } = await supabase.from("shipments").update(payload).eq("id", editing.id).select("*").single();
    if (updateError) {
      setEditErrors({ form: updateError.message });
      saveRequestInFlight.current = false;
      setSaving(false);
      return;
    }
    if (statusChanged || checkpointChanged) {
      const { error: historyError } = await createTrackingEvent({
        shipmentId: editing.id,
        trackingNumber: editing.tracking_number,
        status: editForm.shipment_status,
        transportMode: editForm.transport_mode,
        currentLocation: resolvedCurrentLocation,
        originCountry: editForm.origin_country,
        destinationCountry: editForm.destination_country,
        receiverAddress: editForm.receiver_address.trim() || null,
        estimatedDelivery: editForm.estimated_delivery || null,
        customNote: editForm.update_note.trim() || automation.customerNote,
        routeCheckpointId: editForm.current_route_checkpoint_id || null,
      });
      if (historyError) {
        setEditErrors({ form: `Shipment updated, but history could not be saved: ${historyError.message}` });
        saveRequestInFlight.current = false;
        setSaving(false);
        return;
      }
    }
    await loadShipments();
    const refreshed = updatedData as Shipment;
    setEditing(refreshed);
    setEditForm({ ...shipmentToForm(refreshed), update_note: "" });
    setEditSuccess("Shipment saved successfully. The shipment list and customer-facing derived state are now refreshed.");
    saveRequestInFlight.current = false;
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
                      <button type="button" onClick={() => void openView(shipment)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100">View</button>
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
        <div className="grid gap-4">
          <DetailsSection title="Shipment">
            <Detail label="Tracking Number" value={viewing.tracking_number}/><Detail label="Shipment Status" value={viewing.shipment_status}/>
            <Detail label="Origin" value={viewing.origin_country}/><Detail label="Destination" value={viewing.destination_country}/>
            <Detail label="Current Location" value={viewing.current_location}/><Detail label="Transport Mode" value={viewing.transport_mode}/>
            <Detail label="Courier" value={viewing.courier_name}/><Detail label="Estimated Delivery" value={viewing.estimated_delivery ? displayDate(viewing.estimated_delivery) : null}/>
            <Detail label="Created Date" value={displayDate(viewing.created_at)}/>
          </DetailsSection>
          <div className="grid gap-4 lg:grid-cols-2">
            <DetailsSection title="Sender / Supplier">
              <Detail label="Name" value={viewing.client_name}/><Detail label="Company" value={viewing.client_company_name}/>
              <Detail label="Phone" value={viewing.client_phone}/><Detail label="Email" value={viewing.client_email}/>
              <div className="sm:col-span-2"><Detail label="Pickup / Origin Address" value={viewing.client_address}/></div>
              <PreferenceDetail enabled={viewing.client_receive_updates}/>
            </DetailsSection>
            <DetailsSection title="Receiver / Client">
              <Detail label="Name" value={viewing.receiver_name}/><Detail label="Company" value={viewing.receiver_company_name}/>
              <Detail label="Phone" value={viewing.receiver_phone}/><Detail label="Email" value={viewing.receiver_email}/>
              <div className="sm:col-span-2"><Detail label="Delivery Address" value={viewing.receiver_address}/></div>
              <PreferenceDetail enabled={viewing.receiver_receive_updates}/>
            </DetailsSection>
          </div>
          <DetailsSection title="Package / Service">
            <div className="sm:col-span-2"><Detail label="Item Description" value={viewing.item_description}/></div>
            <Detail label="Weight" value={viewing.weight_kg == null ? null : `${viewing.weight_kg} kg`}/><Detail label="Package Count" value={viewing.package_count?.toString()}/>
            <Detail label="Package Type" value={viewing.package_type}/><Detail label="Declared Value" value={viewing.declared_value == null ? null : `$${viewing.declared_value.toLocaleString()}`}/>
          </DetailsSection>
        </div>
        <section className="mt-6 border-t border-gray-100 pt-5">
          <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-gray-800">Shipment History</h3>
          {viewHistoryLoading ? (
            <p className="mt-3 text-sm text-gray-500">Loading shipment history...</p>
          ) : viewHistoryError ? (
            <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Unable to read shipment history: {viewHistoryError}</p>
          ) : viewHistory.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">No shipment history recorded.</p>
          ) : (
            <ol className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-100">
              {viewHistory.map((entry) => (
                <li key={entry.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-5">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800">{entry.status}</p>
                    <p className="mt-0.5 text-sm text-gray-600">{entry.location || "Location not recorded"}</p>
                    {entry.note && <p className="mt-1 text-sm text-gray-500">{entry.note}</p>}
                  </div>
                  <time dateTime={entry.created_at} className="text-xs font-medium text-gray-500 sm:text-right">{displayDateTime(entry.created_at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
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
  return <div className="min-w-0"><dt className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-gray-400">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-gray-800">{value || "Not provided"}</dd></div>;
}

function DetailsSection({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-gray-100 bg-gray-50/60 p-4"><h3 className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-blue-700">{title}</h3><dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl></section>; }
function PreferenceDetail({ enabled }: { enabled: boolean }) { return <div><dt className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-gray-400">Shipment Updates</dt><dd className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-gray-200 text-gray-600"}`}>{enabled ? "Enabled" : "Disabled"}</dd></div>; }

function isInternationalPhone(value: string) { return /^\+[1-9]\d{6,14}$/.test(value.replace(/[\s()-]/g, "")); }
