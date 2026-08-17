"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ShipmentDocumentsManager from "../components/ShipmentDocumentsManager";
import { automateShipmentOperations } from "../lib/operations-automation";

export const TRANSPORT_OPTIONS = ["Air", "Sea", "Road", "Multimodal", "Rail"] as const;

export type ShipmentEditorRecord = {
  id: number; tracking_number: string; client_name: string; client_email: string | null;
  origin_country: string; destination_country: string; current_location: string | null;
  courier_name: string | null; item_description: string | null; estimated_delivery: string | null;
  weight_kg: number | null; package_count: number | null; package_type: string | null;
  declared_value: number | null; transport_mode: string | null; receiver_name: string | null;
  receiver_phone: string | null; receiver_email: string | null; receiver_address: string | null;
  shipment_status: string | null; created_at: string; route_template_id: string | null;
};

export type ShipmentEditForm = {
  tracking_number: string; client_name: string; client_email: string; origin_country: string;
  destination_country: string; current_location: string; courier_name: string; item_description: string;
  estimated_delivery: string; transport_mode: string; receiver_name: string; receiver_phone: string;
  receiver_email: string; receiver_address: string; shipment_status: string; update_note: string;
  weight_kg: string; package_count: string; package_type: string; declared_value: string; route_template_id: string;
};

type Props = {
  shipment: ShipmentEditorRecord; form: ShipmentEditForm; statusOptions: readonly string[];
  errors: Record<string, string>; saving: boolean; success: string;
  onChange: (field: keyof ShipmentEditForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; onClose: () => void;
};

export function ShipmentEditor({ shipment, form, statusOptions, errors, saving, success, onChange, onSubmit, onClose }: Props) {
  const automation = useMemo(() => automateShipmentOperations({ shipmentStatus: form.shipment_status, transportMode: form.transport_mode, origin: form.origin_country || shipment.origin_country, destination: form.destination_country || shipment.destination_country, journey: null, receiverAddress: form.receiver_address, estimatedDelivery: form.estimated_delivery, operationalNote: form.update_note }), [form, shipment.destination_country, shipment.origin_country]);
  const availableStatusOptions = automation.statusOptions.length ? [...new Set([form.shipment_status, ...automation.statusOptions])] : [...statusOptions];

  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [onClose, saving]);

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="shipment-editor-title" className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-white/20 bg-[#f4f7fb] shadow-2xl">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-5 border-b border-blue-950/10 bg-[#071a33] px-5 py-3.5 text-white sm:px-6"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-yellow-300">Shipment management</p><h2 id="shipment-editor-title" className="mt-0.5 text-xl font-black">Edit Shipment</h2><p className="mt-0.5 break-all text-xs font-bold text-blue-200">{shipment.tracking_number}</p></div><button type="button" onClick={onClose} aria-label="Close shipment editor" className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/5 text-xl hover:bg-white/10">×</button></header>

      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-3 p-4 sm:p-5">
          {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800">{success}</p>}
          {errors.form && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700">{errors.form}</p>}
          <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm" aria-labelledby="quick-update-title"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-blue-600">Daily operations</p><h3 id="quick-update-title" className="text-lg font-black text-[#071a33]">Quick Update</h3></div><button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 disabled:opacity-50">{saving ? "Saving…" : "Save Update"}</button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SelectField label="Shipment Status" value={form.shipment_status} options={availableStatusOptions} error={errors.shipment_status} onChange={(value) => onChange("shipment_status", value)} required emphasis/><InputField label="Current Location" value={form.current_location} error={errors.current_location} onChange={(value) => onChange("current_location", value)}/><InputField label="Estimated Delivery" type="date" value={form.estimated_delivery} error={errors.estimated_delivery} onChange={(value) => onChange("estimated_delivery", value)}/><div className="sm:col-span-2 lg:col-span-1"><TextAreaField label="Update Note" value={form.update_note} onChange={(value) => onChange("update_note", value)} rows={1} placeholder="Optional when status changes" error={errors.update_note}/></div></div></section>

          <div className="grid min-w-0 gap-3">
            <EditorSection number="01" title="Shipment"><ReadOnlyField label="Tracking Number" value={form.tracking_number}/><SelectField label="Transport Mode" value={form.transport_mode} options={TRANSPORT_OPTIONS} error={errors.transport_mode} onChange={(value) => onChange("transport_mode", value)} required/><InputField label="Courier" value={form.courier_name} onChange={(value) => onChange("courier_name", value)}/></EditorSection>
            <EditorSection number="02" title="Sender / Supplier"><InputField label="Sender / Supplier Name" value={form.client_name} error={errors.client_name} onChange={(value) => onChange("client_name", value)} required/></EditorSection>
            <EditorSection number="03" title="Receiver / Client"><InputField label="Receiver / Client Name" value={form.receiver_name} onChange={(value) => onChange("receiver_name", value)}/><InputField label="Phone Number" type="tel" value={form.receiver_phone} onChange={(value) => onChange("receiver_phone", value)}/><div className="sm:col-span-2"><InputField label="Delivery Address" value={form.receiver_address} onChange={(value) => onChange("receiver_address", value)}/></div></EditorSection>
            <EditorSection number="04" title="Package"><div className="sm:col-span-2"><TextAreaField label="Item Description" value={form.item_description} onChange={(value) => onChange("item_description", value)} rows={2}/></div><InputField label="Package Type" value={form.package_type} onChange={(value) => onChange("package_type", value)} placeholder="Cartons, pallet, container…"/><InputField label="Quantity" type="number" min="0" step="1" value={form.package_count} error={errors.package_count} onChange={(value) => onChange("package_count", value)}/><InputField label="Weight (kg)" type="number" min="0" step="0.01" value={form.weight_kg} error={errors.weight_kg} onChange={(value) => onChange("weight_kg", value)}/><InputField label="Declared / Insured Value" type="number" min="0" step="0.01" value={form.declared_value} error={errors.declared_value} onChange={(value) => onChange("declared_value", value)}/></EditorSection>
            <EditorSection number="05" title="Route / Delivery"><InputField label="Origin" value={form.origin_country} error={errors.origin_country} onChange={(value) => onChange("origin_country", value)} required/><InputField label="Destination" value={form.destination_country} error={errors.destination_country} onChange={(value) => onChange("destination_country", value)} required/><ReadOnlyField label="Next Checkpoint" value={automation.nextCheckpoint} derived/><ReadOnlyField label="Next Location" value={automation.nextLocation} derived/></EditorSection>
            <EditorSection number="06" title="Documents"><div className="sm:col-span-2"><ShipmentDocumentsManager shipmentId={shipment.id} transportMode={form.transport_mode} cargoDescription={form.item_description}/></div></EditorSection>
          </div>
        </div>

        <footer className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-5"><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? "Saving…" : "Save All Changes"}</button></footer>
      </form>
    </div>
  </div>;
}

function EditorSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { const [open, setOpen] = useState(false); const panelId = `shipment-editor-section-${number}`; return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls={panelId} className="flex w-full items-center gap-2 bg-slate-50/80 px-3.5 py-2.5 text-left hover:bg-slate-100"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-[0.62rem] font-black text-white">{number}</span><h3 className="flex-1 text-sm font-black text-[#071a33]">{title}</h3><span aria-hidden="true" className={`text-sm font-black text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}>⌄</span></button>{open && <div id={panelId} className="grid gap-3 border-t border-slate-100 p-3.5 sm:grid-cols-2">{children}</div>}</section>; }
function labelClass() { return "mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.1em] text-slate-500"; }
function inputClass(error?: string, emphasis = false) { return `w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:ring-4 ${error ? "border-red-400 focus:ring-red-100" : emphasis ? "border-blue-500 ring-4 ring-blue-50 focus:ring-blue-100" : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"}`; }
function InputField({ label, value, onChange, error, required, type = "text", placeholder, min, step }: { label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; type?: string; placeholder?: string; min?: string; step?: string }) { return <label><span className={labelClass()}>{label}{required && <span className="text-red-500"> *</span>}</span><input type={type} value={value} min={min} step={step} placeholder={placeholder} required={required} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className={inputClass(error)}/>{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>; }
function SelectField({ label, value, options, onChange, error, required, emphasis }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; error?: string; required?: boolean; emphasis?: boolean }) { return <label><span className={labelClass()}>{label}{required && <span className="text-red-500"> *</span>}</span><select value={value} required={required} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className={inputClass(error, emphasis)}>{options.map((option) => <option key={option}>{option}</option>)}</select>{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>; }
function TextAreaField({ label, value, onChange, rows, placeholder, error }: { label: string; value: string; onChange: (value: string) => void; rows: number; placeholder?: string; error?: string }) { return <label><span className={labelClass()}>{label}</span><textarea rows={rows} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className={inputClass(error)}/>{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>; }
function ReadOnlyField({ label, value, derived }: { label: string; value: string; derived?: boolean }) { return <div><span className={labelClass()}>{label}{derived && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[0.55rem] text-blue-700">Derived</span>}</span><div className="min-h-10 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-700">{value}</div></div>; }
