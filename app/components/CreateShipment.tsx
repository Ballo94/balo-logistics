"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { loadRouteTemplates, loadSavedRoute, type SavedRouteTemplate } from "../lib/saved-routes";
import type { RouteJourney } from "../lib/route-intelligence";
import { loadShipmentRouteSnapshot, snapshotShipmentRoute } from "../lib/shipment-route-snapshots";
import { createTrackingEvent } from "../lib/tracking-events";
import { convertWeightDisplay, PACKAGE_HELPERS, PACKAGE_TYPE_OPTIONS, WEIGHT_UNITS, weightHelper, weightToKilograms, type WeightUnit } from "../lib/package-fields";
import RouteBuilder from "./RouteBuilder";

const TRANSPORT_MODES = ["Air", "Sea", "Road", "Multimodal"] as const;

const emptyForm = {
  tracking_number: "",
  transport_mode: "Air",
  estimated_delivery: "",
  vessel_name: "",
  supplier_name: "",
  supplier_company_name: "",
  supplier_phone: "",
  supplier_email: "",
  supplier_address: "",
  supplier_receive_updates: "false",
  origin_country: "",
  current_location: "",
  courier_name: "",
  receiver_name: "",
  receiver_company_name: "",
  receiver_phone: "",
  receiver_email: "",
  receiver_address: "",
  receiver_receive_updates: "false",
  destination_country: "",
  item_description: "",
  package_type: "",
  package_count: "",
  weight_kg: "",
  weight_unit: "KG" as WeightUnit,
  dimensions: "",
  container_number: "",
  seal_number: "",
  declared_value: "",
};

type Form = typeof emptyForm;
type RouteChoice = "new" | "saved";

function generateTrackingNumber() {
  const digits = "0123456789";
  const values = new Uint32Array(12);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => digits[value % digits.length]).join("");
}

export default function CreateShipment() {
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [routeTemplates, setRouteTemplates] = useState<SavedRouteTemplate[]>([]);
  const [routeChoice, setRouteChoice] = useState<RouteChoice>("new");
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedRouteName, setSelectedRouteName] = useState("");
  const [loadingRoute, setLoadingRoute] = useState(false);

  useEffect(() => {
    let active = true;
    void loadRouteTemplates().then(({ data, error }) => {
      if (!active) return;
      if (error) setErrors((current) => ({ ...current, route_template_id: error.message }));
      else setRouteTemplates((data ?? []) as SavedRouteTemplate[]);
    });
    return () => { active = false; };
  }, []);

  const updateForm = useCallback((field: keyof Form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => current[field] ? { ...current, [field]: "" } : current);
    setSuccess("");
  }, []);

  function changeWeightUnit(unit: WeightUnit) {
    setForm((current) => ({
      ...current,
      weight_kg: convertWeightDisplay(current.weight_kg, current.weight_unit, unit),
      weight_unit: unit,
    }));
    setErrors((current) => current.weight_kg ? { ...current, weight_kg: "" } : current);
    setSuccess("");
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!selectedRouteId) next.route_template_id = routeChoice === "saved" ? "Select a saved route from the Route Library." : "Build, save, and assign the new route before creating the shipment.";
    if (!TRANSPORT_MODES.includes(form.transport_mode as (typeof TRANSPORT_MODES)[number])) next.transport_mode = "Choose a valid transport mode.";
    if (form.estimated_delivery && new Date(`${form.estimated_delivery}T00:00:00`) < new Date(new Date().toDateString())) next.estimated_delivery = "Estimated delivery cannot be in the past.";
    if (!form.supplier_name.trim()) next.supplier_name = "Enter the supplier or sender name.";
    if (form.supplier_phone && !isInternationalPhone(form.supplier_phone)) next.supplier_phone = "Use international format, for example +264 81 123 4567.";
    if (form.supplier_email && !/^\S+@\S+\.\S+$/.test(form.supplier_email)) next.supplier_email = "Enter a valid email address.";
    if (!form.origin_country.trim()) next.origin_country = "Enter the origin country.";
    if (!form.current_location.trim()) next.current_location = "Enter the current or origin location.";
    if (!form.receiver_name.trim()) next.receiver_name = "Enter the receiver or client name.";
    if (form.receiver_phone && !isInternationalPhone(form.receiver_phone)) next.receiver_phone = "Use international format, for example +264 81 123 4567.";
    if (form.receiver_email && !/^\S+@\S+\.\S+$/.test(form.receiver_email)) next.receiver_email = "Enter a valid email address.";
    if (!form.destination_country.trim()) next.destination_country = "Enter the destination country.";
    if (!form.item_description.trim()) next.item_description = "Enter an item description.";
    if (form.package_count && (!Number.isInteger(Number(form.package_count)) || Number(form.package_count) < 1)) next.package_count = "Enter a quantity of at least one.";
    if (form.weight_kg && (!Number.isFinite(Number(form.weight_kg)) || Number(form.weight_kg) < 0)) next.weight_kg = "Enter a valid non-negative weight.";
    if (form.declared_value && (Number.isNaN(Number(form.declared_value)) || Number(form.declared_value) < 0)) next.declared_value = "Enter a valid declared value.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function selectRoute(routeId: string) {
    setSelectedRouteId(routeId);
    setSelectedRouteName("");
    setSuccess("");
    setErrors((current) => ({ ...current, route_template_id: "" }));
    if (!routeId) return;
    setLoadingRoute(true);
    const { template, journey, error } = await loadSavedRoute(routeId);
    if (error || !template || !journey) {
      setSelectedRouteId("");
      setErrors((current) => ({ ...current, route_template_id: error?.message ?? "This route needs at least an origin and destination." }));
      setLoadingRoute(false);
      return;
    }
    setSelectedRouteName(template.name);
    setForm((current) => ({
      ...current,
      transport_mode: template.transport_mode,
      origin_country: journey.origin.country,
      destination_country: journey.destination.country,
    }));
    setLoadingRoute(false);
  }

  function chooseRouteSource(choice: RouteChoice) {
    setRouteChoice(choice);
    setSelectedRouteId("");
    setSelectedRouteName("");
    setErrors((current) => ({ ...current, route_template_id: "" }));
    setSuccess("");
  }

  const handleNewRouteJourney = useCallback((journey: RouteJourney | null) => {
    if (!journey) return;
    setForm((current) => ({
      ...current,
      origin_country: journey.origin.country,
      destination_country: journey.destination.country,
    }));
  }, []);

  async function createShipment() {
    if (!validate()) return;
    setSaving(true); setErrors({}); setSuccess("");

    const selectedRoute = await loadSavedRoute(selectedRouteId);
    if (selectedRoute.error || !selectedRoute.template || !selectedRoute.journey) {
      setErrors({ route_template_id: selectedRoute.error?.message ?? "The selected route is no longer available or is incomplete." });
      setSaving(false); return;
    }
    const routeOrigin = selectedRoute.journey.origin.country;
    const routeDestination = selectedRoute.journey.destination.country;
    const routeTransportMode = selectedRoute.template.transport_mode;

    let trackingNumber = form.tracking_number.trim().toUpperCase() || generateTrackingNumber();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: existing, error } = await supabase.from("shipments").select("id").eq("tracking_number", trackingNumber).maybeSingle();
      if (error) { setErrors({ form: error.message }); setSaving(false); return; }
      if (!existing) break;
      if (form.tracking_number.trim()) { setErrors({ tracking_number: "A shipment already uses this tracking number." }); setSaving(false); return; }
      trackingNumber = generateTrackingNumber();
      if (attempt === 4) { setErrors({ form: "Unable to generate a unique tracking number. Please try again." }); setSaving(false); return; }
    }

    const shipmentData = {
      tracking_number: trackingNumber,
      transport_mode: routeTransportMode,
      estimated_delivery: form.estimated_delivery || null,
      vessel_name: routeTransportMode === "Sea" ? form.vessel_name.trim() || null : null,
      client_name: form.supplier_name.trim(),
      client_company_name: form.supplier_company_name.trim() || null,
      client_phone: form.supplier_phone.trim() || null,
      client_email: form.supplier_email.trim() || null,
      client_address: form.supplier_address.trim() || null,
      client_receive_updates: form.supplier_receive_updates === "true",
      origin_country: routeOrigin,
      current_location: form.current_location.trim(),
      courier_name: form.courier_name.trim() || null,
      receiver_name: form.receiver_name.trim(),
      receiver_company_name: form.receiver_company_name.trim() || null,
      receiver_phone: form.receiver_phone.trim() || null,
      receiver_email: form.receiver_email.trim() || null,
      receiver_address: form.receiver_address.trim() || null,
      receiver_receive_updates: form.receiver_receive_updates === "true",
      destination_country: routeDestination,
      item_description: form.item_description.trim(),
      package_type: form.package_type.trim() || null,
      package_count: form.package_count === "" ? null : Number(form.package_count),
      weight_kg: weightToKilograms(form.weight_kg, form.weight_unit),
      dimensions: form.dimensions.trim() || null,
      container_number: form.container_number.trim() || null,
      seal_number: form.seal_number.trim() || null,
      declared_value: form.declared_value === "" ? null : Number(form.declared_value),
      route_template_id: selectedRoute.template.id,
      shipment_status: "Shipment Created",
    };

    const { data, error } = await supabase.from("shipments").insert([shipmentData]).select("id").single();
    if (error) { setErrors({ form: error.code === "23505" ? "A shipment already uses this tracking number." : error.message }); setSaving(false); return; }

    const { error: snapshotError } = await snapshotShipmentRoute(data.id, selectedRoute.template.id);
    if (snapshotError) {
      await supabase.from("shipments").delete().eq("id", data.id);
      setErrors({ form: `Creation was rolled back because the selected route could not be preserved: ${snapshotError.message}` });
      setSaving(false); return;
    }

    const savedJourney = await loadShipmentRouteSnapshot(data.id);
    const initialCheckpoint = savedJourney.journey?.checkpoints.find((checkpoint) => checkpoint.kind === "shipment_created");
    if (!initialCheckpoint) {
      await supabase.from("shipments").delete().eq("id", data.id);
      setErrors({ form: "Creation was rolled back because the saved route checkpoint identity could not be loaded." });
      setSaving(false); return;
    }
    const { error: checkpointError } = await supabase.from("shipments").update({ current_route_checkpoint_id: initialCheckpoint.id }).eq("id", data.id);
    if (checkpointError) {
      await supabase.from("shipments").delete().eq("id", data.id);
      setErrors({ form: `Creation was rolled back because route progression could not be initialized: ${checkpointError.message}` });
      setSaving(false); return;
    }

    const { error: eventError } = await createTrackingEvent({
      shipmentId: data.id,
      trackingNumber,
      status: "Shipment Created",
      transportMode: shipmentData.transport_mode,
      currentLocation: shipmentData.current_location,
      originCountry: shipmentData.origin_country,
      destinationCountry: shipmentData.destination_country,
      receiverAddress: null,
      estimatedDelivery: shipmentData.estimated_delivery,
      customNote: null,
      routeCheckpointId: initialCheckpoint.id,
    });
    if (eventError) {
      await supabase.from("shipments").delete().eq("id", data.id);
      setErrors({ form: `Creation was rolled back because the initial tracking event could not be generated: ${eventError.message}` });
      setSaving(false); return;
    }

    setForm((current) => ({ ...current, tracking_number: trackingNumber }));
    setSuccess(`Shipment ${trackingNumber} was created successfully.`);
    setSaving(false);
  }

  function reset() { setForm(emptyForm); setRouteChoice("new"); setSelectedRouteId(""); setSelectedRouteName(""); setErrors({}); setSuccess(""); }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="create-shipment-title">
    <header className="border-b border-slate-100 bg-[#071a33] px-5 py-4 text-white sm:px-6"><p className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-yellow-300">Shipment intake</p><h2 id="create-shipment-title" className="mt-1 text-xl font-black">Create Shipment</h2></header>
    <div className="grid gap-4 p-4 sm:p-5">
      {errors.form && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errors.form}</p>}
      {success && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><span>{success}</span><button type="button" onClick={reset} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Create another shipment</button></div>}

      <FormSection number="01" title="Shipment">
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <RouteChoiceButton active={routeChoice === "new"} title="Create New Route" description="Build a new ordered route for this shipment." onClick={() => chooseRouteSource("new")}/>
          <RouteChoiceButton active={routeChoice === "saved"} title="Use Saved Route" description="Assign an existing verified Route Library template." onClick={() => chooseRouteSource("saved")}/>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Tracking Number" error={errors.tracking_number}><div className="flex gap-2"><input value={form.tracking_number} onChange={(event) => updateForm("tracking_number", event.target.value.toUpperCase())} placeholder="Generated automatically" className="workflow-field uppercase"/><button type="button" onClick={() => updateForm("tracking_number", generateTrackingNumber())} className="rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50">Generate</button></div></Field>
          {routeChoice === "saved" && <Field label="Saved Route" error={errors.route_template_id} required><select value={selectedRouteId} disabled={loadingRoute} onChange={(event) => void selectRoute(event.target.value)} className="workflow-field"><option value="">Select Route Library template</option>{routeTemplates.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></Field>}
          <Field label="Transport Mode" error={errors.transport_mode} required><select value={form.transport_mode} disabled={Boolean(selectedRouteId)} onChange={(event) => updateForm("transport_mode", event.target.value)} className="workflow-field disabled:bg-slate-100 disabled:text-slate-600">{TRANSPORT_MODES.map((mode) => <option key={mode}>{mode}</option>)}</select></Field>
          <Field label="Estimated Delivery" error={errors.estimated_delivery}><input type="date" value={form.estimated_delivery} onChange={(event) => updateForm("estimated_delivery", event.target.value)} className="workflow-field"/></Field>
          {form.transport_mode === "Sea" && <Field label="Vessel Name"><input value={form.vessel_name} onChange={(event) => updateForm("vessel_name", event.target.value)} placeholder="Enter vessel name" className="workflow-field"/></Field>}
        </div>
        {selectedRouteName && <p className="mt-3 text-xs font-bold text-blue-700">Selected manual route: {selectedRouteName}. Its exact ordered stops will be preserved with this shipment.</p>}
        {errors.route_template_id && routeChoice === "new" && <p className="mt-3 text-xs font-semibold text-red-600">{errors.route_template_id}</p>}
      </FormSection>

      {routeChoice === "new" && <RouteBuilder value={selectedRouteId || null} onChange={(routeId) => void selectRoute(routeId ?? "")} onJourneyChange={handleNewRouteJourney} transportMode={form.transport_mode as SavedRouteTemplate["transport_mode"]} compact showTemplateLibrary={false} showModeSelector={false}/>}

      <FormSection number="02" title="Sender / Supplier"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Sender / Supplier Name" error={errors.supplier_name} required><input value={form.supplier_name} onChange={(event) => updateForm("supplier_name", event.target.value)} className="workflow-field"/></Field><Field label="Company Name"><input value={form.supplier_company_name} onChange={(event) => updateForm("supplier_company_name", event.target.value)} className="workflow-field"/></Field><Field label="Phone Number" helper="International format, for example +264 81 123 4567." error={errors.supplier_phone}><input type="tel" value={form.supplier_phone} onChange={(event) => updateForm("supplier_phone", event.target.value)} placeholder="+264 81 123 4567" className="workflow-field"/></Field><Field label="Email Address" error={errors.supplier_email}><input type="email" value={form.supplier_email} onChange={(event) => updateForm("supplier_email", event.target.value)} className="workflow-field"/></Field><Field label="Pickup / Origin Address" wide><textarea rows={2} value={form.supplier_address} onChange={(event) => updateForm("supplier_address", event.target.value)} className="workflow-field h-auto py-2.5"/></Field><ToggleField label="Receive Shipment Updates" checked={form.supplier_receive_updates === "true"} onChange={(checked) => updateForm("supplier_receive_updates", String(checked))}/><Field label="Origin Country" error={errors.origin_country} required><input value={form.origin_country} disabled={Boolean(selectedRouteId)} onChange={(event) => updateForm("origin_country", event.target.value)} className="workflow-field disabled:bg-slate-100 disabled:text-slate-600"/></Field><Field label="Current / Origin Location" error={errors.current_location} required><input value={form.current_location} onChange={(event) => updateForm("current_location", event.target.value)} className="workflow-field"/></Field><Field label="Courier Name"><input value={form.courier_name} onChange={(event) => updateForm("courier_name", event.target.value)} className="workflow-field"/></Field></div></FormSection>

      <FormSection number="03" title="Receiver / Client"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Receiver / Client Name" error={errors.receiver_name} required><input value={form.receiver_name} onChange={(event) => updateForm("receiver_name", event.target.value)} className="workflow-field"/></Field><Field label="Company Name"><input value={form.receiver_company_name} onChange={(event) => updateForm("receiver_company_name", event.target.value)} className="workflow-field"/></Field><Field label="Phone Number" helper="International format, for example +264 81 123 4567." error={errors.receiver_phone}><input type="tel" value={form.receiver_phone} onChange={(event) => updateForm("receiver_phone", event.target.value)} placeholder="+264 81 123 4567" className="workflow-field"/></Field><Field label="Email Address" error={errors.receiver_email}><input type="email" value={form.receiver_email} onChange={(event) => updateForm("receiver_email", event.target.value)} className="workflow-field"/></Field><Field label="Delivery Address" wide><textarea rows={2} value={form.receiver_address} onChange={(event) => updateForm("receiver_address", event.target.value)} className="workflow-field h-auto py-2.5"/></Field><ToggleField label="Receive Shipment Updates" checked={form.receiver_receive_updates === "true"} onChange={(checked) => updateForm("receiver_receive_updates", String(checked))}/><Field label="Destination Country" error={errors.destination_country} required><input value={form.destination_country} disabled={Boolean(selectedRouteId)} onChange={(event) => updateForm("destination_country", event.target.value)} className="workflow-field disabled:bg-slate-100 disabled:text-slate-600"/></Field></div></FormSection>

      <FormSection number="04" title="Package"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><Field label="Description" helper={PACKAGE_HELPERS.itemDescription} error={errors.item_description} required wide><textarea rows={2} value={form.item_description} onChange={(event) => updateForm("item_description", event.target.value)} className="workflow-field h-auto py-2.5"/></Field><Field label="Package Type" helper={PACKAGE_HELPERS.packageType}><input list="create-package-types" value={form.package_type} onChange={(event) => updateForm("package_type", event.target.value)} placeholder="Select or enter a type" className="workflow-field"/><datalist id="create-package-types">{PACKAGE_TYPE_OPTIONS.map((option) => <option key={option} value={option}/>)}</datalist></Field><Field label="Quantity / Package Count" helper={PACKAGE_HELPERS.packageQuantity} error={errors.package_count}><input type="number" min="1" step="1" value={form.package_count} onChange={(event) => updateForm("package_count", event.target.value)} className="workflow-field"/></Field><Field label="Weight" helper={weightHelper(form.weight_unit)} error={errors.weight_kg}><div className="flex"><input type="number" min="0" step="any" value={form.weight_kg} onChange={(event) => updateForm("weight_kg", event.target.value)} className="workflow-field rounded-r-none"/><select aria-label="Weight unit" value={form.weight_unit} onChange={(event) => changeWeightUnit(event.target.value as WeightUnit)} className="w-20 rounded-r-xl border border-l-0 border-slate-200 bg-slate-50 px-2 text-xs font-black text-slate-700 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">{WEIGHT_UNITS.map((unit) => <option key={unit}>{unit}</option>)}</select></div></Field><Field label="Dimensions"><input value={form.dimensions} onChange={(event) => updateForm("dimensions", event.target.value)} placeholder="120 × 80 × 100 cm" className="workflow-field"/></Field><Field label="Container Number"><input value={form.container_number} onChange={(event) => updateForm("container_number", event.target.value)} placeholder="MSCU1234567" className="workflow-field"/></Field><Field label="Seal Number"><input value={form.seal_number} onChange={(event) => updateForm("seal_number", event.target.value)} placeholder="ABC123456" className="workflow-field"/></Field><Field label="Declared / Insured Value" error={errors.declared_value}><input type="number" min="0" step="0.01" value={form.declared_value} onChange={(event) => updateForm("declared_value", event.target.value)} className="workflow-field"/></Field></div></FormSection>

      <footer className="flex justify-end border-t border-slate-100 pt-4"><button type="button" disabled={saving || Boolean(success)} onClick={() => void createShipment()} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving shipment…" : "Save Shipment"}</button></footer>
    </div>
  </section>;
}

function FormSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-[0.62rem] font-black text-white">{number}</span><h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#071a33]">{title}</h3></div>{children}</section>; }
function Field({ label, helper, error, required, wide, children }: { label: string; helper?: string; error?: string; required?: boolean; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "md:col-span-2 lg:col-span-4" : ""}><span className="mb-1.5 block text-xs font-black text-slate-600">{label}{required && <span className="text-red-500"> *</span>}</span>{children}{helper && <span className="mt-1 block text-[0.68rem] leading-4 text-slate-500">{helper}</span>}{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>; }
function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) { return <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span><span className="block text-xs font-black text-slate-700">{label}</span><span className="mt-0.5 block text-[0.65rem] text-slate-500">Admin-controlled preference</span></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-blue-600"/></label>; }
function RouteChoiceButton({ active, title, description, onClick }: { active: boolean; title: string; description: string; onClick: () => void }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-xl border px-4 py-3 text-left transition ${active ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-blue-300"}`}><span className={`block text-sm font-black ${active ? "text-blue-800" : "text-slate-700"}`}>{title}</span><span className="mt-0.5 block text-[0.68rem] leading-4 text-slate-500">{description}</span></button>; }
function isInternationalPhone(value: string) { return /^\+[1-9]\d{6,14}$/.test(value.replace(/[\s()-]/g, "")); }
