"use client";

import { FormEvent, useEffect, useMemo } from "react";
import { deriveShipmentState } from "../lib/shipment-state";

export const TRANSPORT_OPTIONS = ["Air", "Sea", "Road", "Rail"] as const;

export type ShipmentEditorRecord = {
  id: number;
  tracking_number: string;
  client_name: string;
  client_email: string | null;
  origin_country: string;
  destination_country: string;
  current_location: string | null;
  courier_name: string | null;
  item_description: string | null;
  estimated_delivery: string | null;
  weight_kg: number | null;
  package_count: number | null;
  package_type: string | null;
  declared_value: number | null;
  transport_mode: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  receiver_email: string | null;
  receiver_address: string | null;
  shipment_status: string | null;
  created_at: string;
};

export type ShipmentEditForm = {
  tracking_number: string;
  client_name: string;
  client_email: string;
  origin_country: string;
  destination_country: string;
  current_location: string;
  courier_name: string;
  item_description: string;
  estimated_delivery: string;
  transport_mode: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_email: string;
  receiver_address: string;
  shipment_status: string;
  update_note: string;
  weight_kg: string;
  package_count: string;
  package_type: string;
  declared_value: string;
};

type Props = {
  shipment: ShipmentEditorRecord;
  form: ShipmentEditForm;
  statusOptions: readonly string[];
  errors: Record<string, string>;
  saving: boolean;
  success: string;
  onChange: (field: keyof ShipmentEditForm, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
};

export function ShipmentEditor({ shipment, form, statusOptions, errors, saving, success, onChange, onSubmit, onClose }: Props) {
  const state = useMemo(() => deriveShipmentState({
    shipmentStatus: form.shipment_status,
    transportMode: form.transport_mode,
    currentLocation: form.current_location,
    originCountry: form.origin_country || shipment.origin_country,
    destinationCountry: form.destination_country || shipment.destination_country,
    receiverAddress: form.receiver_address,
    estimatedDelivery: form.estimated_delivery,
    latestUpdateNote: form.update_note,
  }), [form, shipment.destination_country, shipment.origin_country]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, saving]);

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="shipment-editor-title" className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-white/20 bg-[#f4f7fb] shadow-2xl">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-5 border-b border-blue-950/10 bg-[#071a33] px-5 py-4 text-white sm:px-7">
        <div><p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-yellow-300">Operations workspace</p><h2 id="shipment-editor-title" className="mt-1 text-xl font-black tracking-tight sm:text-2xl">Edit Shipment</h2><p className="mt-1 break-all text-xs font-bold text-blue-200">{shipment.tracking_number}</p></div>
        <button type="button" onClick={onClose} aria-label="Close shipment editor" className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/5 text-xl hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-yellow-300">×</button>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid min-w-0 gap-4">
            {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{success}</p>}
            {errors.form && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{errors.form}</p>}

            <EditorSection number="01" title="Shipment" description="Status is the primary operational control.">
              <ReadOnlyField label="Tracking Number" value={form.tracking_number} />
              <SelectField label="Transport Mode" value={form.transport_mode} options={TRANSPORT_OPTIONS} error={errors.transport_mode} onChange={(value) => onChange("transport_mode", value)} required />
              <InputField label="Courier" value={form.courier_name} onChange={(value) => onChange("courier_name", value)} />
              <InputField label="Shipment Type" value={form.package_type} onChange={(value) => onChange("package_type", value)} placeholder="e.g. Cartons, Pallet, FCL" />
              <div className="sm:col-span-2"><SelectField label="Current Status" value={form.shipment_status} options={statusOptions} error={errors.shipment_status} onChange={(value) => onChange("shipment_status", value)} required emphasis /></div>
            </EditorSection>

            <EditorSection number="02" title="Route" description="Enter real operational locations only when known.">
              <InputField label="Origin" value={form.origin_country} error={errors.origin_country} onChange={(value) => onChange("origin_country", value)} required />
              <InputField label="Current Location" value={form.current_location} onChange={(value) => onChange("current_location", value)} placeholder="Optional real location" />
              <ReadOnlyField label="Next Stop" value={state.nextStop} derived />
              <InputField label="Destination" value={form.destination_country} error={errors.destination_country} onChange={(value) => onChange("destination_country", value)} required />
            </EditorSection>

            <EditorSection number="03" title="Customer" description="Sender, receiver, and delivery contacts.">
              <InputField label="Sender" value={form.client_name} error={errors.client_name} onChange={(value) => onChange("client_name", value)} required />
              <InputField label="Sender Email" type="email" value={form.client_email} error={errors.client_email} onChange={(value) => onChange("client_email", value)} />
              <InputField label="Receiver" value={form.receiver_name} onChange={(value) => onChange("receiver_name", value)} />
              <InputField label="Receiver Phone" type="tel" value={form.receiver_phone} onChange={(value) => onChange("receiver_phone", value)} />
              <InputField label="Receiver Email" type="email" value={form.receiver_email} error={errors.receiver_email} onChange={(value) => onChange("receiver_email", value)} />
              <InputField label="Receiver Address" value={form.receiver_address} onChange={(value) => onChange("receiver_address", value)} />
            </EditorSection>

            <EditorSection number="04" title="Cargo" description="Commercial cargo details already supported by the shipment record.">
              <div className="sm:col-span-2"><TextAreaField label="Description" value={form.item_description} onChange={(value) => onChange("item_description", value)} rows={2} /></div>
              <InputField label="Weight (kg)" type="number" min="0" step="0.01" value={form.weight_kg} error={errors.weight_kg} onChange={(value) => onChange("weight_kg", value)} />
              <InputField label="Quantity" type="number" min="0" step="1" value={form.package_count} error={errors.package_count} onChange={(value) => onChange("package_count", value)} />
              <ReadOnlyField label="Dimensions" value="Not supported by current shipment data" muted />
              <InputField label="Insurance / Declared Value (USD)" type="number" min="0" step="0.01" value={form.declared_value} error={errors.declared_value} onChange={(value) => onChange("declared_value", value)} />
              <ReadOnlyField label="Container Number" value="Not supported by current shipment data" muted />
              <ReadOnlyField label="Seal Number" value="Not supported by current shipment data" muted />
            </EditorSection>

            <EditorSection number="05" title="Operations" description="Customer-visible operational updates are recorded in shipment history.">
              <InputField label="Estimated Delivery" type="date" value={form.estimated_delivery} error={errors.estimated_delivery} onChange={(value) => onChange("estimated_delivery", value)} />
              <ReadOnlyField label="Internal Notes" value="Not supported by current shipment data" muted />
              <div className="sm:col-span-2"><TextAreaField label="Last Update Note" value={form.update_note} onChange={(value) => onChange("update_note", value)} rows={3} placeholder="Optional customer-facing operational note" hint="When the status changes, this note overrides the automatic event description." /></div>
            </EditorSection>
          </div>

          <aside className="h-fit rounded-2xl border border-blue-900/10 bg-[#071a33] p-5 text-white shadow-xl lg:sticky lg:top-24" aria-label="Derived customer-facing shipment state">
            <p className="text-[0.62rem] font-black uppercase tracking-[0.18em] text-yellow-300">Live derived preview</p>
            <div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-xs text-blue-200">Customer progress</p><p className="mt-1 text-lg font-black">{state.displayStatus}</p></div><strong className="text-4xl tracking-tight text-yellow-300">{state.progress}%</strong></div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-yellow-300" style={{ width: `${state.progress}%` }} /></div>
            <dl className="mt-5 grid gap-3">
              <PreviewItem label="Checkpoint" value={state.currentCheckpoint} />
              <PreviewItem label="Current Location" value={state.currentLocation} />
              <PreviewItem label="Next Stop" value={state.nextStop} />
              <PreviewItem label="Transport Stage" value={state.operationalStage} />
              <PreviewItem label="Customer Note" value={state.statusNote} />
            </dl>
            <p className="mt-4 rounded-xl border border-blue-300/15 bg-white/5 p-3 text-xs leading-5 text-blue-100">Progress, checkpoint, timeline state, route wording, and customer status wording are calculated automatically. They are not stored as manual form fields.</p>
          </aside>
        </div>

        <footer className="sticky bottom-0 z-20 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs font-semibold text-slate-500">Real admin data overrides safe derived fallbacks.</p>
          <div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 sm:flex-none">Cancel</button><button type="submit" disabled={saving} className="flex-1 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60 sm:flex-none">{saving ? "Saving shipment…" : "Save Changes"}</button></div>
        </footer>
      </form>
    </div>
  </div>;
}

function EditorSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) { return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_-28px_rgba(15,23,42,.35)]"><div className="flex gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-xs font-black text-white">{number}</span><div><h3 className="font-black text-[#071a33]">{title}</h3><p className="mt-0.5 text-xs text-slate-500">{description}</p></div></div><div className="grid gap-3 p-4 sm:grid-cols-2">{children}</div></section>; }
function labelClass() { return "mb-1.5 block text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500"; }
function inputClass(error?: string, emphasis = false) { return `w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:ring-4 ${error ? "border-red-400 focus:border-red-500 focus:ring-red-100" : emphasis ? "border-blue-500 ring-4 ring-blue-50 focus:ring-blue-100" : "border-slate-200 focus:border-blue-500 focus:ring-blue-100"}`; }
function InputField({ label, value, onChange, error, required, type = "text", placeholder, min, step }: { label: string; value: string; onChange: (value: string) => void; error?: string; required?: boolean; type?: string; placeholder?: string; min?: string; step?: string }) { return <label><span className={labelClass()}>{label}{required && <span className="text-red-500"> *</span>}</span><input type={type} value={value} min={min} step={step} placeholder={placeholder} required={required} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className={inputClass(error)} />{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>; }
function SelectField({ label, value, options, onChange, error, required, emphasis }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; error?: string; required?: boolean; emphasis?: boolean }) { return <label><span className={labelClass()}>{label}{required && <span className="text-red-500"> *</span>}</span><select value={value} required={required} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className={inputClass(error, emphasis)}>{options.map((option) => <option key={option}>{option}</option>)}</select>{error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}</label>; }
function TextAreaField({ label, value, onChange, rows, placeholder, hint }: { label: string; value: string; onChange: (value: string) => void; rows: number; placeholder?: string; hint?: string }) { return <label><span className={labelClass()}>{label}</span><textarea rows={rows} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inputClass()} />{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>; }
function ReadOnlyField({ label, value, derived, muted }: { label: string; value: string; derived?: boolean; muted?: boolean }) { return <div><span className={labelClass()}>{label}{derived && <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[0.55rem] text-blue-700">Derived</span>}</span><div className={`min-h-10 rounded-xl border px-3 py-2.5 text-sm font-semibold ${muted ? "border-dashed border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-slate-100 text-slate-700"}`}>{value}</div></div>; }
function PreviewItem({ label, value }: { label: string; value: string }) { return <div className="border-b border-white/10 pb-3 last:border-0 last:pb-0"><dt className="text-[0.6rem] font-black uppercase tracking-[0.12em] text-blue-300">{label}</dt><dd className="mt-1 break-words text-sm font-bold">{value}</dd></div>; }
