"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COMMUNICATION_TYPES, loadAdminCommunications, type CommunicationType, type ShipmentCommunication } from "../lib/shipment-communications";
import { supabase } from "../lib/supabase";
import { buildSmartCommunicationTemplate, COMMUNICATION_SITUATIONS, defaultCommunicationSituation, hasEditedCommunication, type CommunicationSituation, type SituationCategory, type SmartCommunicationShipment } from "../lib/communication-template-engine";
import type { CommunicationTemplateShipment } from "../lib/notification-templates";
import { inferWhatsAppMessageType, publicTrackingUrl, WHATSAPP_MESSAGE_TYPES, type WhatsAppMessageType } from "../lib/whatsapp-message";

const FILTERS = ["All", "Visible", "Hidden", "Delivered", "Delay", "Customs"] as const;
type Filter = (typeof FILTERS)[number];

export default function ShipmentCommunicationsManager({ shipmentId, shipment }: { shipmentId: number; shipment: CommunicationTemplateShipment }) {
  const initialMessageType = inferWhatsAppMessageType(shipment.shipment_status);
  const initialSuggestion = buildSmartCommunicationTemplate(initialMessageType, templateContext(shipment));
  const [items, setItems] = useState<ShipmentCommunication[]>([]);
  const [title, setTitle] = useState(initialSuggestion.title);
  const [message, setMessage] = useState(initialSuggestion.message);
  const [type, setType] = useState<CommunicationType>(initialSuggestion.category);
  const [messageType, setMessageType] = useState<WhatsAppMessageType>(initialMessageType);
  const [situation, setSituation] = useState<CommunicationSituation | null>(initialSuggestion.situation);
  const [visible, setVisible] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [providerConfigured, setProviderConfigured] = useState<boolean | null>(null);
  const [contextNeedsReview, setContextNeedsReview] = useState(false);
  const contextSignature = JSON.stringify(templateContext(shipment));
  const previousContext = useRef({ signature: contextSignature, suggestion: initialSuggestion });

  const refresh = useCallback(async () => { const { data, error: loadError } = await loadAdminCommunications(shipmentId); if (loadError) setError(loadError.message); else setItems((data ?? []) as ShipmentCommunication[]); }, [shipmentId]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/communications/whatsapp/send", { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ configured?: boolean }> : null)
      .then((result) => setProviderConfigured(Boolean(result?.configured)))
      .catch((loadError: unknown) => { if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setProviderConfigured(false); });
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return items.filter((item) => {
    const matchesSearch = !query || item.title.toLowerCase().includes(query) || item.message.toLowerCase().includes(query) || item.type.toLowerCase().includes(query);
    const matchesFilter = filter === "All" || (filter === "Visible" ? item.visible_to_customer : filter === "Hidden" ? !item.visible_to_customer : filter === "Delivered" ? item.type === "Delivery" || item.type === "Success" : item.type === filter);
    return matchesSearch && matchesFilter;
  }); }, [filter, items, search]);
  const smartSuggestion = useMemo(() => buildSmartCommunicationTemplate(messageType, templateContext(shipment), { category: type, situation }), [messageType, shipment, situation, type]);
  const generalSuggestion = useMemo(() => buildSmartCommunicationTemplate("General Information", templateContext(shipment), { forceNeutral: true, category: "Information" }), [shipment]);
  const whatsappSuggestion = smartSuggestion.whatsappMessage;
  const situationOptions = type in COMMUNICATION_SITUATIONS ? COMMUNICATION_SITUATIONS[type as SituationCategory] : null;
  useEffect(() => {
    if (previousContext.current.signature === contextSignature) return;
    const previousSuggestion = previousContext.current.suggestion;
    previousContext.current = { signature: contextSignature, suggestion: smartSuggestion };
    const timer = window.setTimeout(() => {
      if (editingId === null && title === previousSuggestion.title && (message === previousSuggestion.message || message === previousSuggestion.whatsappMessage)) {
        setTitle(smartSuggestion.title);
        setMessage(message === previousSuggestion.whatsappMessage ? smartSuggestion.whatsappMessage : smartSuggestion.message);
        setContextNeedsReview(false);
      } else {
        setContextNeedsReview(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [contextSignature, editingId, message, smartSuggestion, title]);

  function reset() { const nextType = inferWhatsAppMessageType(shipment.shipment_status); const suggestion = buildSmartCommunicationTemplate(nextType, templateContext(shipment)); previousContext.current = { signature: contextSignature, suggestion }; setEditingId(null); setTitle(suggestion.title); setMessage(suggestion.message); setType(suggestion.category); setSituation(suggestion.situation); setMessageType(nextType); setVisible(true); setContextNeedsReview(false); setError(""); }
  function edit(item: ShipmentCommunication) { setEditingId(item.id); setTitle(item.title); setMessage(item.message); setType(item.type); setSituation(defaultCommunicationSituation(item.type, messageType)); setVisible(item.visible_to_customer); setError(""); setStatus(""); }
  function applySuggestion(nextType: WhatsAppMessageType, nextCategory: CommunicationType, nextSituation: CommunicationSituation | null) {
    const suggestion = buildSmartCommunicationTemplate(nextType, templateContext(shipment), { category: nextCategory, situation: nextSituation });
    if (hasEditedCommunication(title, message, smartSuggestion, editingId !== null) && !window.confirm("Replace the edited title and message with the new suggestion? Cancel keeps your current text and selection.")) return;
    previousContext.current = { signature: contextSignature, suggestion };
    setMessageType(nextType); setType(nextCategory); setSituation(suggestion.situation); setTitle(suggestion.title); setMessage(suggestion.message);
    setContextNeedsReview(false); setStatus("Smart template prepared. You can edit any field."); setError("");
  }
  function selectUpdateType(nextType: WhatsAppMessageType) { const next = buildSmartCommunicationTemplate(nextType, templateContext(shipment)); applySuggestion(nextType, next.category, next.situation); }
  function selectCategory(nextCategory: CommunicationType) { applySuggestion(messageType, nextCategory, defaultCommunicationSituation(nextCategory, messageType)); }
  function selectSituation(nextSituation: CommunicationSituation) { applySuggestion(messageType, type, nextSituation); }
  function prepareWhatsApp() { previousContext.current = { signature: contextSignature, suggestion: smartSuggestion }; setTitle(smartSuggestion.title); setMessage(whatsappSuggestion); setVisible(true); setContextNeedsReview(false); setStatus("WhatsApp message prepared. Review it before sending."); setError(""); }
  function useGeneralWording() { if (hasEditedCommunication(title, message, smartSuggestion, editingId !== null) && !window.confirm("Replace the edited title and message with general wording?")) return; previousContext.current = { signature: contextSignature, suggestion: generalSuggestion }; setMessageType("General Information"); setTitle(generalSuggestion.title); setType(generalSuggestion.category); setSituation(null); setMessage(generalSuggestion.message); setContextNeedsReview(false); setStatus("Transport-neutral wording prepared. You can edit any field."); setError(""); }

  async function save() {
    if (contextNeedsReview) { setError("Review the message after the shipment details changed."); return; }
    if (!title.trim() || !message.trim()) { setError("Title and message are required."); return; }
    setBusy(true); setError(""); setStatus("");
    const payload = { title: title.trim(), message: message.trim(), type, visible_to_customer: visible, viewed_at: null };
    if (editingId) {
      const { error: updateError } = await supabase.from("shipment_communications").update(payload).eq("id", editingId);
      if (updateError) setError(updateError.message); else { setStatus("Communication updated."); reset(); await refresh(); }
    } else {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) setError("Your admin session could not be verified.");
      else { const { error: insertError } = await supabase.from("shipment_communications").insert({ shipment_id: shipmentId, ...payload, created_by: userData.user.id }); if (insertError) setError(insertError.message); else { setStatus("Communication created."); reset(); await refresh(); } }
    }
    setBusy(false);
  }

  async function sendWhatsApp() {
    if (contextNeedsReview) { setError("Review the message after the shipment details changed."); return; }
    if (!visible) { setError("Make this communication visible to the customer before sending it by WhatsApp."); return; }
    if (!message.trim()) { setError("Prepare or enter a WhatsApp message before sending."); return; }
    setBusy(true); setError(""); setStatus("");
    const response = await fetch("/api/communications/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shipmentId, communicationId: editingId, title: title.trim() || `${messageType} - ${shipment.tracking_number}`, message: message.trim(), type }) });
    const result = await response.json() as { status?: string; error?: string; communicationId?: number };
    if (!response.ok) { setError(result.error || "WhatsApp delivery could not be started."); if (result.communicationId) { setEditingId(result.communicationId); await refresh(); } }
    else { setStatus(result.status === "Sent" ? "WhatsApp message sent." : "WhatsApp message accepted by the provider."); reset(); await refresh(); }
    setBusy(false);
  }

  async function openWhatsApp() {
    if (contextNeedsReview) { setError("Review the message after the shipment details changed."); return; }
    if (!visible) { setError("Make this communication visible to the customer before opening it in WhatsApp."); return; }
    if (!message.trim()) { setError("Prepare or enter a WhatsApp message first."); return; }
    const whatsappWindow = window.open("", "_blank");
    if (!whatsappWindow) { setError("Allow pop-ups for this page, then try again."); return; }
    whatsappWindow.opener = null;
    whatsappWindow.document.title = "Opening WhatsApp…";
    whatsappWindow.document.body.textContent = "Opening WhatsApp…";

    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/communications/whatsapp/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId, communicationId: editingId, title: title.trim() || `${messageType} - ${shipment.tracking_number}`, message: message.trim(), type }),
      });
      const result = await response.json() as { error?: string; communicationId?: number; whatsappUrl?: string };
      if (!response.ok || !result.whatsappUrl) {
        whatsappWindow.close();
        setError(result.error || "WhatsApp could not be opened.");
      } else {
        if (result.communicationId) setEditingId(result.communicationId);
        whatsappWindow.location.replace(result.whatsappUrl);
        setStatus("Opened in WhatsApp for manual review. Delivery has not been confirmed.");
        await refresh();
      }
    } catch {
      whatsappWindow.close();
      setError("WhatsApp could not be opened. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: ShipmentCommunication) { setBusy(true); const next = !item.visible_to_customer; const { error: updateError } = await supabase.from("shipment_communications").update({ visible_to_customer: next, ...(next ? { viewed_at: null } : {}) }).eq("id", item.id); if (updateError) setError(updateError.message); else { setStatus(next ? "Communication shown to customer." : "Communication hidden from customer."); await refresh(); } setBusy(false); }
  async function remove(item: ShipmentCommunication) { if (!window.confirm(`Delete “${item.title}”?`)) return; setBusy(true); const { error: deleteError } = await supabase.from("shipment_communications").delete().eq("id", item.id); if (deleteError) setError(deleteError.message); else { setStatus("Communication deleted."); await refresh(); } setBusy(false); }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_-28px_rgba(15,23,42,.35)]"><div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-blue-600">Customer care</p><h3 className="font-black text-[#071a33]">Communication Center</h3><p className="mt-0.5 text-xs text-slate-500">Prepare, publish, and audit shipment-specific customer updates.</p></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">{items.length}</span></div><div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)]">
    <div className="grid content-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="grid gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs"><p><span className="font-black text-slate-500">Recipient:</span> <span className="font-black text-slate-800">{shipment.receiver_name || "Customer"}</span></p><p className="font-semibold text-slate-600">{shipment.receiver_phone || "Phone number not provided"}</p><p><span className="font-black text-slate-500">Channel:</span> <span className="font-black text-emerald-700">WhatsApp</span></p><p><span className="font-black text-slate-500">Related shipment:</span> <span className="font-black text-blue-700">{shipment.tracking_number}</span></p></div>
      <label><span className={labelClass}>Update type</span><select value={messageType} onChange={(event) => selectUpdateType(event.target.value as WhatsAppMessageType)} className={inputClass}>{WHATSAPP_MESSAGE_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label>
      <label><span className={labelClass}>Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></label>
      <label><span className={labelClass}>Category *</span><select value={type} onChange={(event) => selectCategory(event.target.value as CommunicationType)} className={inputClass}>{COMMUNICATION_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label>
      {situationOptions && <label><span className={labelClass}>Situation</span><select value={situation ?? situationOptions[0]} onChange={(event) => selectSituation(event.target.value as CommunicationSituation)} className={inputClass}>{situationOptions.map((option) => <option key={option}>{option}</option>)}</select></label>}
      <div className="rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5"><p className="text-[0.62rem] font-black uppercase tracking-wider text-blue-700">Suggested WhatsApp message</p><p className="mt-1 line-clamp-3 whitespace-pre-line text-[0.68rem] leading-4 text-slate-600">{whatsappSuggestion}</p><div className="mt-2 flex flex-wrap gap-1.5"><button type="button" onClick={prepareWhatsApp} className="rounded-lg bg-white px-2.5 py-1.5 text-[0.65rem] font-black text-blue-700 ring-1 ring-blue-200">Prepare WhatsApp</button><button type="button" onClick={prepareWhatsApp} className="rounded-lg px-2.5 py-1.5 text-[0.65rem] font-black text-slate-600">Reset to suggested message</button><button type="button" onClick={useGeneralWording} className="rounded-lg px-2.5 py-1.5 text-[0.65rem] font-black text-slate-600">Use general wording</button></div></div>
      <label><span className={labelClass}>Message *</span><textarea rows={8} value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} /></label>
      {contextNeedsReview && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"><p>Shipment details changed. Review your wording before publishing or opening WhatsApp.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={prepareWhatsApp} className="rounded-md bg-white px-2 py-1 font-bold ring-1 ring-amber-200">Use updated suggestion</button><button type="button" onClick={() => setContextNeedsReview(false)} className="rounded-md bg-white px-2 py-1 font-bold ring-1 ring-amber-200">Keep my wording</button></div></div>}
      <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="text-xs font-black text-slate-700">Visible to Customer</span><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}{status && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{status}</p>}
      <div className="flex flex-wrap gap-2">{editingId && <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>}<button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : editingId ? "Update Message" : "Create Message"}</button><button type="button" disabled={busy || !visible || !message.trim()} onClick={() => void openWhatsApp()} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">Open in WhatsApp (manual)</button><button type="button" disabled={busy || !visible || !message.trim() || providerConfigured !== true} onClick={() => void sendWhatsApp()} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 text-xs font-black text-emerald-700 disabled:border-slate-200 disabled:text-slate-400 disabled:opacity-70">Send automatically (provider)</button></div>
      {providerConfigured === false && <p className="text-[0.66rem] font-semibold text-slate-500">Automatic sending is not configured yet. Use the manual WhatsApp option.</p>}
    </div>
    <div className="min-w-0"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search communications" className={`${inputClass} h-10`} /><div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">{FILTERS.map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[0.66rem] font-black ${filter === option ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{option}</button>)}</div><div className="mt-2 overflow-hidden rounded-xl border border-slate-200">{!filtered.length ? <p className="px-4 py-8 text-center text-xs font-semibold text-slate-500">No matching communications.</p> : <ul className="divide-y divide-slate-100">{filtered.map((item) => <li key={item.id} className="px-3 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[0.58rem] font-black uppercase ${tone(item.type)}`}>{item.type}</span><span className={`text-[0.62rem] font-bold ${item.visible_to_customer ? "text-emerald-700" : "text-amber-700"}`}>{item.visible_to_customer ? "Visible" : "Hidden"}</span><span className={`text-[0.62rem] font-bold ${item.viewed_at ? "text-blue-700" : "text-slate-400"}`}>{item.viewed_at ? `Viewed ${formatDate(item.viewed_at)}` : "Not viewed"}</span></div><p className="mt-1 text-xs font-black text-slate-800">{item.title}</p><p className="mt-1 whitespace-pre-line text-[0.68rem] leading-4 text-slate-600">{item.message}</p><time className="mt-1 block text-[0.62rem] text-slate-400">{formatDate(item.created_at)}</time></div><div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => edit(item)} className={actionClass}>Edit</button><button type="button" disabled={busy} onClick={() => void toggle(item)} className={actionClass}>{item.visible_to_customer ? "Hide" : "Show"}</button><button type="button" disabled={busy} onClick={() => void remove(item)} className={`${actionClass} text-red-700`}>Delete</button></div></div></li>)}</ul>}</div></div>
  </div></section>;
}

const labelClass = "mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.12em] text-slate-500";
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const actionClass = "rounded-lg bg-slate-100 px-2.5 py-1.5 text-[0.64rem] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40";
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function tone(type: CommunicationType) { if (type === "Delay") return "bg-orange-100 text-orange-800"; if (type === "Warning") return "bg-red-100 text-red-800"; if (type === "Customs") return "bg-purple-100 text-purple-800"; if (type === "Delivery" || type === "Success" || type === "Arrival") return "bg-emerald-100 text-emerald-800"; return "bg-blue-100 text-blue-800"; }

function templateContext(shipment: CommunicationTemplateShipment): SmartCommunicationShipment {
  return {
    receiverName: shipment.receiver_name ?? shipment.client_name,
    trackingNumber: shipment.tracking_number,
    transportMode: shipment.transport_mode,
    shipmentStatus: shipment.shipment_status,
    currentCheckpoint: shipment.current_checkpoint,
    currentLocation: shipment.current_location,
    nextCheckpoint: shipment.next_checkpoint,
    nextLocation: shipment.next_location,
    origin: shipment.origin_country,
    destination: shipment.destination_country,
    estimatedDelivery: shipment.estimated_delivery,
    courier: shipment.courier_name,
    trackingUrl: publicTrackingUrl(process.env.NEXT_PUBLIC_SITE_URL, shipment.tracking_number),
  };
}
