"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { createTrackingEvent } from "../lib/tracking-events";
import { ShipmentEditor, TRANSPORT_OPTIONS, type ShipmentEditForm, type ShipmentEditorRecord } from "./ShipmentEditor";
import { isFinalMileStatus } from "../lib/shipment-current-location";
import { automateShipmentOperations, getStatusTransitionWarning } from "../lib/operations-automation";
import { weightToKilograms } from "../lib/package-fields";
import { loadAdminShipmentHistory, type AdminShipmentHistoryEntry } from "../lib/shipment-history-admin";
import { filterAndSortShipments, MANAGE_SORT_OPTIONS, MANAGE_TRANSPORT_FILTERS, operationalAttention, paginateShipments, shipmentOperationCounts, type ManageShipmentSort, type ManageTransportFilter } from "../lib/manage-shipments";

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

const PAGE_SIZES = [10, 25, 50] as const;

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
  if (value.includes("customs")) return "bg-amber-50 text-amber-800 ring-amber-600/20";
  if (["in transit", "in flight", "road transit", "at sea"].includes(value)) return "bg-blue-50 text-blue-700 ring-blue-600/20";
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
    internal_note: "",
    weight_kg: shipment.weight_kg?.toString() ?? "",
    weight_unit: "KG",
    package_count: shipment.package_count?.toString() ?? "",
    package_type: shipment.package_type ?? "",
    dimensions: shipment.dimensions ?? "",
    container_number: shipment.container_number ?? "",
    seal_number: shipment.seal_number ?? "",
    declared_value: shipment.declared_value?.toString() ?? "",
    insurance_status: shipment.insurance_status ?? "not_specified",
    route_template_id: shipment.route_template_id ?? "",
    current_route_checkpoint_id: shipment.current_route_checkpoint_id ?? "",
  };
}

function validateEditForm(form: ShipmentEditForm, requiresDeliveryAddress = false) {
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
  if (isFinalMileStatus(form.shipment_status) && !form.current_location.trim()) errors.current_location = "Select or enter the actual delivery-stage location before saving.";
  if (requiresDeliveryAddress && ["out for delivery", "delivered"].includes(normalize(form.shipment_status)) && !form.receiver_address.trim()) {
    errors.receiver_address = "Enter the receiver's final delivery address for this door-to-door shipment.";
    errors.form = "Final delivery address is missing. Open Receiver / Client and add it before this door-to-door update.";
  }
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
  const [transportFilter, setTransportFilter] = useState<ManageTransportFilter>("All");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState<ManageShipmentSort>("created-newest");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<Shipment | null>(null);
  const [viewHistory, setViewHistory] = useState<AdminShipmentHistoryEntry[]>([]);
  const [viewHistoryLoading, setViewHistoryLoading] = useState(false);
  const [viewHistoryError, setViewHistoryError] = useState("");
  const viewRequestId = useRef(0);
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

  const statusFilterOptions = useMemo(() => [...new Set(shipments.map((shipment) => shipment.shipment_status?.trim() || "Shipment Created"))].sort((left, right) => left.localeCompare(right)), [shipments]);
  const summaryCounts = useMemo(() => shipmentOperationCounts(shipments), [shipments]);
  const filteredShipments = useMemo(() => filterAndSortShipments(shipments, { search, transport: transportFilter, status: statusFilter, sort }), [search, shipments, sort, statusFilter, transportFilter]);
  const pagination = useMemo(() => paginateShipments(filteredShipments, page, pageSize), [filteredShipments, page, pageSize]);
  const filtersActive = Boolean(search.trim() || transportFilter !== "All" || statusFilter || sort !== "created-newest");

  function clearListControls() {
    setSearch("");
    setTransportFilter("All");
    setStatusFilter("");
    setSort("created-newest");
    setPage(1);
  }

  function openEdit(shipment: Shipment) {
    setEditing(shipment);
    setEditForm(shipmentToForm(shipment));
    setEditErrors({});
    setEditSuccess("");
  }

  function switchEditedShipment(shipmentId: number) {
    const nextShipment = shipments.find((shipment) => shipment.id === shipmentId);
    if (!nextShipment || nextShipment.id === editing?.id) return false;
    const hasUnsavedChanges = Boolean(editing && editForm && JSON.stringify(editForm) !== JSON.stringify(shipmentToForm(editing)));
    if (hasUnsavedChanges && !window.confirm("Switch shipment and discard unsaved changes in this editor?")) return false;
    openEdit(nextShipment);
    return true;
  }

  async function openView(shipment: Shipment) {
    const requestId = viewRequestId.current + 1;
    viewRequestId.current = requestId;
    setViewing(shipment);
    setViewHistory([]);
    setViewHistoryError("");
    setViewHistoryLoading(true);
    const historyResult = await loadAdminShipmentHistory(shipment.id);
    if (viewRequestId.current !== requestId) return;
    setViewHistory(historyResult.entries);
    if (historyResult.error) setViewHistoryError(`Shipment history loaded where available, but private Internal Notes could not be read. ${historyResult.error.message}`);
    setViewHistoryLoading(false);
  }

  function closeView() {
    viewRequestId.current += 1;
    setViewing(null);
    setViewHistory([]);
    setViewHistoryError("");
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

  async function saveEdit(event: FormEvent<HTMLFormElement>, authoritativeCurrentLocation?: string, requiresDeliveryAddress = false) {
    event.preventDefault();
    if (!editing || !editForm || saveRequestInFlight.current) return;
    const validationErrors = validateEditForm(editForm, requiresDeliveryAddress);
    const statusChanged = normalize(editing.shipment_status) !== normalize(editForm.shipment_status);
    const checkpointChanged = editing.current_route_checkpoint_id !== (editForm.current_route_checkpoint_id || null);
    const selectedCurrentLocation = authoritativeCurrentLocation?.trim() || editForm.current_location;
    const locationChanged = normalize(editing.current_location) !== normalize(selectedCurrentLocation);
    if (editForm.update_note.trim() && !statusChanged && !checkpointChanged) validationErrors.update_note = "Change the shipment status or route checkpoint to attach this customer update to a new checkpoint event.";
    if (editForm.internal_note.trim() && !statusChanged && !checkpointChanged) validationErrors.internal_note = "Change the shipment status or route checkpoint to attach this private note to a new checkpoint event.";
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
      insurance_status: editForm.insurance_status,
    };
    const { data: updatedData, error: updateError } = await supabase.from("shipments").update(payload).eq("id", editing.id).select("*").single();
    if (updateError) {
      setEditErrors({ form: updateError.message });
      saveRequestInFlight.current = false;
      setSaving(false);
      return;
    }
    if (statusChanged || checkpointChanged) {
      const { error: historyError, internalNoteError } = await createTrackingEvent({
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
        internalNote: editForm.internal_note.trim() || null,
        routeCheckpointId: editForm.current_route_checkpoint_id || null,
      });
      if (historyError) {
        setEditErrors({ form: `Shipment saved, but its tracking history could not be recorded. Keep this editor open and retry Save Update; the existing history check prevents a duplicate. ${historyError.message}` });
        saveRequestInFlight.current = false;
        setSaving(false);
        return;
      }
      if (internalNoteError) {
        setEditErrors({ form: `Shipment and customer Journey History were saved, but the private Internal Note could not be stored. Keep this editor open and retry Save Update; retry protection will reuse the existing history event. ${internalNoteError.message}` });
        saveRequestInFlight.current = false;
        setSaving(false);
        return;
      }
    }
    await loadShipments();
    const refreshed = updatedData as Shipment;
    setEditing(refreshed);
    setEditForm({ ...shipmentToForm(refreshed), update_note: "", internal_note: "" });
    setEditSuccess("Shipment saved successfully. The shipment list and customer-facing derived state are now refreshed.");
    window.setTimeout(() => setEditSuccess(""), 6000);
    saveRequestInFlight.current = false;
    setSaving(false);
  }

  async function deleteShipment(shipment: Shipment) {
    if (!window.confirm(`Delete shipment ${shipment.tracking_number}? This action cannot be undone.`)) return;
    setError("");
    setDeletingId(shipment.id);
    const { error: deleteError } = await supabase.from("shipments").delete().eq("id", shipment.id);
    if (deleteError) setError(deleteError.message);
    else setShipments((current) => current.filter((item) => item.id !== shipment.id));
    setDeletingId(null);
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8 text-gray-900 sm:px-6 lg:p-10">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Logistics operations</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Manage Shipments</h1>
            <p className="mt-2 text-gray-600">Search, review and manage every shipment from one place.</p>
          </div>
          <Link href="/admin" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-semibold shadow-sm transition hover:bg-gray-50">
            ← Back to Dashboard
          </Link>
        </div>

        <section className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6" aria-label="Shipment operational summary">
          <SummaryMetric label="Total" value={summaryCounts.total} tone="blue"/><SummaryMetric label="Active" value={summaryCounts.active} tone="slate"/><SummaryMetric label="Customs" value={summaryCounts.customs} tone="amber"/><SummaryMetric label="Delayed / Exception" value={summaryCounts.exceptions} tone="red"/><SummaryMetric label="Out for Delivery" value={summaryCounts.outForDelivery} tone="violet"/><SummaryMetric label="Delivered" value={summaryCounts.delivered} tone="green"/>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-gray-200/60">
          <div className="border-b border-gray-100 p-4 sm:p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_auto_auto_auto] xl:items-end">
              <div className="relative min-w-0">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"><circle cx="11" cy="11" r="7" strokeWidth="2"/><path d="m20 20-4-4" strokeWidth="2" strokeLinecap="round"/></svg>
                <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search tracking, client, receiver, origin or destination" aria-label="Search shipments" className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-12 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
              </div>
              <FilterSelect label="Transport" value={transportFilter} onChange={(value) => { setTransportFilter(value as ManageTransportFilter); setPage(1); }} options={MANAGE_TRANSPORT_FILTERS.map((value) => ({ value, label: value }))}/>
              <FilterSelect label="Status" value={statusFilter} onChange={(value) => { setStatusFilter(value); setPage(1); }} options={[{ value: "", label: "All statuses" }, ...statusFilterOptions.map((value) => ({ value, label: value }))]}/>
              <FilterSelect label="Sort" value={sort} onChange={(value) => { setSort(value as ManageShipmentSort); setPage(1); }} options={MANAGE_SORT_OPTIONS.map((option) => ({ ...option }))}/>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 text-sm text-gray-500">
              <div className="flex flex-wrap items-center gap-3"><span>{filteredShipments.length} of {shipments.length} shipments</span><label className="flex items-center gap-2 text-xs font-semibold"><span>Rows</span><select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); }} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-bold text-gray-700 outline-none focus:border-blue-500">{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>{filtersActive && <button type="button" onClick={clearListControls} className="font-bold text-blue-600 hover:text-blue-700">Clear filters</button>}</div>
              <button type="button" onClick={() => void loadShipments()} className="font-semibold text-blue-600 hover:text-blue-700">Refresh data</button>
            </div>
          </div>

          {error && <div role="alert" className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {loading ? <div className="px-5 py-16 text-center text-gray-500">Loading shipments...</div> : filteredShipments.length === 0 ? <ListEmptyState hasShipments={shipments.length > 0} onClear={clearListControls}/> : <>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>{["Tracking", "Client / Receiver", "Route", "Mode", "Status", "Estimated Delivery", "Created", "Actions"].map((heading) => <th key={heading} className="px-4 py-3.5 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagination.items.map((shipment) => (
                  <tr key={shipment.id} className={`transition hover:bg-blue-50/40 ${attentionRowStyle(shipment.shipment_status)}`}>
                    <td className="px-4 py-3.5"><button type="button" onClick={() => void openView(shipment)} className="break-all text-left font-black text-blue-700 hover:text-blue-900 hover:underline">{shipment.tracking_number}</button></td>
                    <td className="px-4 py-3.5"><p className="font-bold text-gray-800">{shipment.receiver_name || shipment.client_name || "Not provided"}</p>{shipment.receiver_name && normalize(shipment.client_name) !== normalize(shipment.receiver_name) && <p className="mt-0.5 text-xs text-gray-500">Sender: {shipment.client_name}</p>}</td>
                    <td className="px-4 py-3.5 text-gray-600"><span className="font-semibold text-gray-800">{shipment.origin_country || "—"}</span><span aria-hidden="true" className="mx-1.5 text-gray-300">→</span><span className="font-semibold text-gray-800">{shipment.destination_country || "—"}</span></td>
                    <td className="px-4 py-3.5"><ModeBadge mode={shipment.transport_mode}/></td>
                    <td className="px-4 py-3.5"><div className="flex flex-col items-start gap-1.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(shipment.shipment_status)}`}>{shipment.shipment_status ?? "Shipment Created"}</span><AttentionBadge status={shipment.shipment_status}/></div></td>
                    <td className="px-4 py-3.5 text-gray-600">{displayDate(shipment.estimated_delivery)}</td>
                    <td className="px-4 py-3.5 text-gray-600">{displayDate(shipment.created_at)}</td>
                    <td className="px-4 py-3.5"><div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => void openView(shipment)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">View</button>
                      <button type="button" onClick={() => openEdit(shipment)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:border-blue-300 hover:text-blue-700">Edit</button>
                      <button type="button" aria-label={`Delete shipment ${shipment.tracking_number}`} disabled={deletingId === shipment.id} onClick={() => void deleteShipment(shipment)} className="rounded-lg px-2 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">{deletingId === shipment.id ? "Deleting..." : "Delete"}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 bg-gray-50/50 p-3 lg:hidden">{pagination.items.map((shipment) => <article key={shipment.id} className={`rounded-xl border bg-white p-4 shadow-sm ${attentionCardStyle(shipment.shipment_status)}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><button type="button" onClick={() => void openView(shipment)} className="break-all text-left text-sm font-black text-blue-700 hover:underline">{shipment.tracking_number}</button><p className="mt-1 truncate text-sm font-bold text-gray-900">{shipment.receiver_name || shipment.client_name || "Client not provided"}</p></div><ModeBadge mode={shipment.transport_mode}/></div><div className="mt-3 flex flex-wrap items-center gap-2"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(shipment.shipment_status)}`}>{shipment.shipment_status ?? "Shipment Created"}</span><AttentionBadge status={shipment.shipment_status}/></div><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-bold uppercase tracking-wide text-gray-400">Route</dt><dd className="mt-0.5 break-words font-semibold text-gray-700">{shipment.origin_country || "—"} → {shipment.destination_country || "—"}</dd></div><div><dt className="font-bold uppercase tracking-wide text-gray-400">Estimated delivery</dt><dd className="mt-0.5 font-semibold text-gray-700">{displayDate(shipment.estimated_delivery)}</dd></div></dl><div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3"><button type="button" onClick={() => void openView(shipment)} className="flex-1 rounded-lg bg-blue-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-blue-700">View shipment</button><button type="button" onClick={() => openEdit(shipment)} className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-bold text-gray-700 hover:border-blue-300 hover:text-blue-700">Edit</button><button type="button" aria-label={`Delete shipment ${shipment.tracking_number}`} disabled={deletingId === shipment.id} onClick={() => void deleteShipment(shipment)} className="rounded-lg px-2 py-2.5 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button></div></article>)}</div>
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-gray-500">Showing {pagination.start}–{pagination.end} of {filteredShipments.length}</p><div className="flex items-center gap-2"><button type="button" disabled={pagination.page <= 1} onClick={() => setPage(Math.max(1, pagination.page - 1))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="px-2 text-sm font-semibold text-gray-600">Page {pagination.page} of {pagination.totalPages}</span><button type="button" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(Math.min(pagination.totalPages, pagination.page + 1))} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>
          </>}
        </section>
      </div>

      {viewing && <Modal title="Shipment Details" subtitle={viewing.tracking_number} onClose={closeView}>
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
                    {entry.note && <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2"><p className="text-[0.62rem] font-black uppercase tracking-wider text-blue-700">Customer Update</p><p className="mt-1 text-sm text-gray-600">{entry.note}</p></div>}
                    {entry.internal_note && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-[0.62rem] font-black uppercase tracking-wider text-amber-800">Internal Note · Private</p><p className="mt-1 text-sm text-amber-950">{entry.internal_note}</p></div>}
                  </div>
                  <time dateTime={entry.created_at} className="text-xs font-medium text-gray-500 sm:text-right">{displayDateTime(entry.created_at)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </Modal>}

      {editing && editForm && <ShipmentEditor shipment={editing} form={editForm} shipments={shipments} onSwitchShipment={switchEditedShipment} statusOptions={STATUS_OPTIONS} errors={editErrors} saving={saving} success={editSuccess} onChange={updateEditField} onSubmit={saveEdit} onClose={closeEdit} />}
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

function SummaryMetric({ label, value, tone }: { label: string; value: number; tone: "blue" | "slate" | "amber" | "red" | "violet" | "green" }) {
  const tones = { blue: "border-blue-100 bg-blue-50/70 text-blue-700", slate: "border-slate-200 bg-white text-slate-700", amber: "border-amber-100 bg-amber-50/70 text-amber-800", red: "border-red-100 bg-red-50/70 text-red-700", violet: "border-violet-100 bg-violet-50/70 text-violet-700", green: "border-emerald-100 bg-emerald-50/70 text-emerald-700" };
  return <div className={`rounded-xl border px-3 py-3 shadow-sm ${tones[tone]}`}><p className="text-2xl font-black leading-none">{value}</p><p className="mt-1.5 text-[0.68rem] font-bold uppercase tracking-wide">{label}</p></div>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="min-w-0"><span className="mb-1 block text-[0.62rem] font-bold uppercase tracking-wide text-gray-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full min-w-36 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">{options.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}</select></label>;
}

function ModeBadge({ mode }: { mode: string | null }) {
  const value = mode?.trim();
  return <span className="inline-flex whitespace-nowrap rounded-md bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">{value || "Not set"}</span>;
}

function AttentionBadge({ status }: { status: string | null }) {
  const attention = operationalAttention(status);
  if (!attention) return null;
  const labels = { customs: "Customs", exception: "Needs attention", delivery: "Final mile" };
  const styles = { customs: "bg-amber-100 text-amber-800", exception: "bg-red-100 text-red-700", delivery: "bg-violet-100 text-violet-700" };
  return <span className={`rounded-md px-2 py-0.5 text-[0.62rem] font-black uppercase tracking-wide ${styles[attention]}`}>{labels[attention]}</span>;
}

function attentionRowStyle(status: string | null) {
  const attention = operationalAttention(status);
  return attention === "exception" ? "bg-red-50/30" : attention === "customs" ? "bg-amber-50/25" : attention === "delivery" ? "bg-violet-50/20" : "";
}

function attentionCardStyle(status: string | null) {
  const attention = operationalAttention(status);
  return attention === "exception" ? "border-red-200" : attention === "customs" ? "border-amber-200" : attention === "delivery" ? "border-violet-200" : "border-gray-200";
}

function ListEmptyState({ hasShipments, onClear }: { hasShipments: boolean; onClear: () => void }) {
  return <div className="px-5 py-16 text-center"><p className="font-semibold text-gray-800">{hasShipments ? "No shipments match the current filters." : "No shipments found."}</p><p className="mt-1 text-sm text-gray-500">{hasShipments ? "Try another search or clear the filters." : "Created shipments will appear here."}</p>{hasShipments && <button type="button" onClick={onClear} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Clear filters</button>}</div>;
}

function isInternationalPhone(value: string) { return /^\+[1-9]\d{6,14}$/.test(value.replace(/[\s()-]/g, "")); }
