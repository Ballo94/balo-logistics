"use client";

import { useState } from "react";
import { supabase } from "../lib/supabase";
import { sendAutomaticNotification } from "../lib/notifications";
import { createTrackingEvent } from "../lib/tracking-events";

const emptyForm = {
  tracking_number: "",
  client_name: "",
  client_email: "",
  origin_country: "",
  destination_country: "",
  current_location: "",
  courier_name: "",
  item_description: "",
  estimated_delivery: "",
  transport_mode: "Air",
  receiver_name: "",
  receiver_phone: "",
  receiver_email: "",
};

export default function CreateShipment() {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  function updateForm(field: keyof typeof emptyForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function saveShipment() {
    if (
      !form.tracking_number.trim() ||
      !form.client_name.trim() ||
      !form.origin_country.trim() ||
      !form.destination_country.trim()
    ) {
      alert(
        "Please enter the tracking number, client name, origin and destination."
      );
      return;
    }

    setSaving(true);

    // Keep this payload explicit and aligned with the live shipments table.
    // Do not spread form state here: UI-only fields must never become columns.
    const shipmentData = {
      tracking_number: form.tracking_number.trim(),
      client_name: form.client_name.trim(),
      client_email: form.client_email.trim() || null,
      origin_country: form.origin_country.trim(),
      destination_country: form.destination_country.trim(),
      current_location: form.current_location.trim() || null,
      courier_name: form.courier_name.trim() || null,
      item_description: form.item_description.trim() || null,
      estimated_delivery: form.estimated_delivery || null,
      transport_mode: form.transport_mode,
      receiver_name: form.receiver_name.trim() || null,
      receiver_phone: form.receiver_phone.trim() || null,
      receiver_email: form.receiver_email.trim() || null,
    };

    const { data, error } = await supabase
      .from("shipments")
      .insert([shipmentData])
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      alert(`Unable to save shipment: ${error.message}`);
      return;
    }

    const { error: eventError } = await createTrackingEvent({
      shipmentId: data.id,
      trackingNumber: shipmentData.tracking_number,
      status: "Shipment Created",
      transportMode: shipmentData.transport_mode,
      currentLocation: shipmentData.current_location,
      originCountry: shipmentData.origin_country,
      destinationCountry: shipmentData.destination_country,
      estimatedDelivery: shipmentData.estimated_delivery,
    });
    setSaving(false);
    if (eventError) {
      alert(`Shipment saved, but its initial tracking event could not be created: ${eventError.message}`);
      return;
    }

    alert("Shipment saved successfully!");

    void sendAutomaticNotification(data.id, "shipment_created");

    setForm(emptyForm);
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-2xl font-bold mb-6">
        Create Shipment
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Tracking Number"
          value={form.tracking_number}
          onChange={(e) =>
            updateForm("tracking_number", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <input
          type="email"
          placeholder="Client Email for Notifications"
          value={form.client_email}
          onChange={(e) => updateForm("client_email", e.target.value)}
          className="border rounded-lg p-3"
        />

        <input
          type="text"
          placeholder="Client Name"
          value={form.client_name}
          onChange={(e) =>
            updateForm("client_name", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <input
          type="text"
          placeholder="Origin Country"
          value={form.origin_country}
          onChange={(e) =>
            updateForm("origin_country", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <input
          type="text"
          placeholder="Destination Country"
          value={form.destination_country}
          onChange={(e) =>
            updateForm("destination_country", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <input
          type="text"
          placeholder="Current Location"
          value={form.current_location}
          onChange={(e) =>
            updateForm("current_location", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <input
          type="text"
          placeholder="Courier Name"
          value={form.courier_name}
          onChange={(e) =>
            updateForm("courier_name", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <textarea
          placeholder="Item Description"
          value={form.item_description}
          onChange={(e) =>
            updateForm("item_description", e.target.value)
          }
          rows={3}
          className="border rounded-lg p-3 md:col-span-2"
        />

        <div>
          <label className="block text-sm font-medium mb-1">
            Estimated Delivery
          </label>

          <input
            type="date"
            value={form.estimated_delivery}
            onChange={(e) =>
              updateForm("estimated_delivery", e.target.value)
            }
            className="border rounded-lg p-3 w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Transport Mode
          </label>

          <select
            value={form.transport_mode}
            onChange={(e) =>
              updateForm("transport_mode", e.target.value)
            }
            className="border rounded-lg p-3 w-full"
          >
            <option value="Air">Air</option>
            <option value="Sea">Sea</option>
            <option value="Road">Road</option>
            <option value="Rail">Rail</option>
          </select>
        </div>

        <div className="md:col-span-2 mt-4">
          <h3 className="text-xl font-bold">
            Receiver Information
          </h3>

          <p className="text-gray-600 text-sm mt-1">
            Enter the person who will receive the shipment.
          </p>
        </div>

        <input
          type="text"
          placeholder="Receiver Name"
          value={form.receiver_name}
          onChange={(e) =>
            updateForm("receiver_name", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <input
          type="tel"
          placeholder="Receiver Phone Number"
          value={form.receiver_phone}
          onChange={(e) =>
            updateForm("receiver_phone", e.target.value)
          }
          className="border rounded-lg p-3"
        />

        <input
          type="email"
          placeholder="Receiver Email for Notifications"
          value={form.receiver_email}
          onChange={(e) => updateForm("receiver_email", e.target.value)}
          className="border rounded-lg p-3"
        />

      </div>

      <button
        type="button"
        onClick={saveShipment}
        disabled={saving}
        className="w-full mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg p-4"
      >
        {saving ? "Saving Shipment..." : "Save Shipment"}
      </button>
    </div>
  );
}
