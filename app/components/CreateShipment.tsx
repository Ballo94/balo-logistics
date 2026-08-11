"use client";

import { useCallback, useState } from "react";
import { supabase } from "../lib/supabase";
import { createTrackingEvent } from "../lib/tracking-events";

const TRANSPORT_MODES = ["Air", "Sea", "Road"] as const;

const emptyForm = {
  tracking_number: "",
  transport_mode: "Air",
  estimated_delivery: "",
  supplier_name: "",
  origin_country: "",
  current_location: "",
  courier_name: "",
  receiver_name: "",
  receiver_phone: "",
  receiver_email: "",
  destination_country: "",
  item_description: "",
  package_count: "",
  weight_kg: "",
  declared_value: "",
};

type Form = typeof emptyForm;

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

  const updateForm = useCallback((field: keyof Form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => current[field] ? { ...current, [field]: "" } : current);
    setSuccess("");
  }, []);

  function validate() {
    const next: Record<string, string> = {};
    if (!TRANSPORT_MODES.includes(form.transport_mode as (typeof TRANSPORT_MODES)[number])) next.transport_mode = "Choose Air, Sea, or Road.";
    if (form.estimated_delivery && new Date(`${form.estimated_delivery}T00:00:00`) < new Date(new Date().toDateString())) next.estimated_delivery = "Estimated delivery cannot be in the past.";
    if (!form.supplier_name.trim()) next.supplier_name = "Enter the supplier or sender name.";
    if (!form.origin_country.trim()) next.origin_country = "Enter the origin country.";
    if (!form.current_location.trim()) next.current_location = "Enter the current or origin location.";
    if (!form.receiver_name.trim()) next.receiver_name = "Enter the receiver or client name.";
    if (!form.receiver_phone.trim()) next.receiver_phone = "Enter the receiver phone number.";
    if (form.receiver_email && !/^\S+@\S+\.\S+$/.test(form.receiver_email)) next.receiver_email = "Enter a valid email address.";
    if (!form.destination_country.trim()) next.destination_country = "Enter the destination country.";
    if (!form.item_description.trim()) next.item_description = "Enter an item description.";
    if (form.package_count && (!Number.isInteger(Number(form.package_count)) || Number(form.package_count) < 1)) next.package_count = "Enter a quantity of at least one.";
    if (form.weight_kg && (Number.isNaN(Number(form.weight_kg)) || Number(form.weight_kg) < 0)) next.weight_kg = "Enter a valid weight.";
    if (form.declared_value && (Number.isNaN(Number(form.declared_value)) || Number(form.declared_value) < 0)) next.declared_value = "Enter a valid declared value.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function createShipment() {
    if (!validate()) return;
    setSaving(true); setErrors({}); setSuccess("");

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
      transport_mode: form.transport_mode,
      estimated_delivery: form.estimated_delivery || null,
      client_name: form.supplier_name.trim(),
      origin_country: form.origin_country.trim(),
      current_location: form.current_location.trim(),
      courier_name: form.courier_name.trim() || null,
      receiver_name: form.receiver_name.trim(),
      receiver_phone: form.receiver_phone.trim(),
      receiver_address: null,
      destination_country: form.destination_country.trim(),
      item_description: form.item_description.trim(),
      package_type: null,
      package_count: form.package_count === "" ? null : Number(form.package_count),
      weight_kg: form.weight_kg === "" ? null : Number(form.weight_kg),
      declared_value: form.declared_value === "" ? null : Number(form.declared_value),
      route_template_id: null,
      shipment_status: "Shipment Created",
    };

    const { data, error } = await supabase.from("shipments").insert([shipmentData]).select("id").single();
    if (error) { setErrors({ form: error.code === "23505" ? "A shipment already uses this tracking number." : error.message }); setSaving(false); return; }

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

  function reset() { setForm(emptyForm); setErrors({}); setSuccess(""); }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="create-shipment-title">
    <header className="border-b border-slate-100 bg-[#071a33] px-5 py-4 text-white sm:px-6"><p className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-yellow-300">Shipment intake</p><h2 id="create-shipment-title" className="mt-1 text-xl font-black">Create Shipment</h2></header>
    <div className="grid gap-4 p-4 sm:p-5">
      {errors.form && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errors.form}</p>}
      {success && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><span>{success}</span><button type="button" onClick={reset} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Create another shipment</button></div>}

      <FormSection number="01" title="Shipment"><div className="grid gap-3 md:grid-cols-3"><Field label="Tracking Number" error={errors.tracking_number}><div className="flex gap-2"><input value={form.tracking_number} onChange={(event) => updateForm("tracking_number", event.target.value.toUpperCase())} placeholder="Generated automatically" className="workflow-field uppercase"/><button type="button" onClick={() => updateForm("tracking_number", generateTrackingNumber())} className="rounded-xl border border-blue-200 px-3 text-xs font-black text-blue-700 hover:bg-blue-50">Generate</button></div></Field><Field label="Transport Mode" error={errors.transport_mode} required><select value={form.transport_mode} onChange={(event) => updateForm("transport_mode", event.target.value)} className="workflow-field">{TRANSPORT_MODES.map((mode) => <option key={mode}>{mode}</option>)}</select></Field><Field label="Estimated Delivery" error={errors.estimated_delivery}><input type="date" value={form.estimated_delivery} onChange={(event) => updateForm("estimated_delivery", event.target.value)} className="workflow-field"/></Field></div></FormSection>

      <FormSection number="02" title="Sender / Supplier"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Supplier / Sender Name" error={errors.supplier_name} required><input value={form.supplier_name} onChange={(event) => updateForm("supplier_name", event.target.value)} className="workflow-field"/></Field><Field label="Origin Country" error={errors.origin_country} required><input value={form.origin_country} onChange={(event) => updateForm("origin_country", event.target.value)} className="workflow-field"/></Field><Field label="Current / Origin Location" error={errors.current_location} required><input value={form.current_location} onChange={(event) => updateForm("current_location", event.target.value)} className="workflow-field"/></Field><Field label="Courier Name"><input value={form.courier_name} onChange={(event) => updateForm("courier_name", event.target.value)} className="workflow-field"/></Field></div></FormSection>

      <FormSection number="03" title="Receiver / Client"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Receiver / Client Name" error={errors.receiver_name} required><input value={form.receiver_name} onChange={(event) => updateForm("receiver_name", event.target.value)} className="workflow-field"/></Field><Field label="Phone Number" error={errors.receiver_phone} required><input type="tel" value={form.receiver_phone} onChange={(event) => updateForm("receiver_phone", event.target.value)} className="workflow-field"/></Field><Field label="Email" error={errors.receiver_email}><input type="email" value={form.receiver_email} onChange={(event) => updateForm("receiver_email", event.target.value)} className="workflow-field"/></Field><Field label="Destination Country" error={errors.destination_country} required><input value={form.destination_country} onChange={(event) => updateForm("destination_country", event.target.value)} className="workflow-field"/></Field></div></FormSection>

      <FormSection number="04" title="Package"><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><Field label="Item Description" error={errors.item_description} required wide><textarea rows={2} value={form.item_description} onChange={(event) => updateForm("item_description", event.target.value)} className="workflow-field h-auto py-2.5"/></Field><Field label="Quantity" error={errors.package_count}><input type="number" min="1" step="1" value={form.package_count} onChange={(event) => updateForm("package_count", event.target.value)} className="workflow-field"/></Field><Field label="Weight (kg)" error={errors.weight_kg}><input type="number" min="0" step="0.01" value={form.weight_kg} onChange={(event) => updateForm("weight_kg", event.target.value)} className="workflow-field"/></Field><Field label="Declared / Insured Value" error={errors.declared_value}><input type="number" min="0" step="0.01" value={form.declared_value} onChange={(event) => updateForm("declared_value", event.target.value)} className="workflow-field"/></Field></div></FormSection>

      <footer className="flex justify-end border-t border-slate-100 pt-4"><button type="button" disabled={saving || Boolean(success)} onClick={() => void createShipment()} className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving shipment…" : "Save Shipment"}</button></footer>
    </div>
  </section>;
}

function FormSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"><div className="mb-3 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-[0.62rem] font-black text-white">{number}</span><h3 className="text-sm font-black uppercase tracking-[0.1em] text-[#071a33]">{title}</h3></div>{children}</section>; }
function Field({ label, error, required, wide, children }: { label: string; error?: string; required?: boolean; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "md:col-span-2 lg:col-span-4" : ""}><span className="mb-1.5 block text-xs font-black text-slate-600">{label}{required && <span className="text-red-500"> *</span>}</span>{children}{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>; }
