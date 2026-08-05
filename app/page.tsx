"use client";

    import { useState } from "react";
import Navbar from "./components/Navbar";
import { supabase } from "./lib/supabase";

type Shipment = {
  tracking_number: string;
  shipment_status: string | null;
  current_location: string | null;
  origin_country: string;
  destination_country: string;
  courier_name: string | null;
  estimated_delivery: string | null;
  transport_mode: string | null;
  cargo_type?: string | null;
  commodity?: string | null;
  quantity?: number | null;
  unit?: string | null;
  container_number?: string | null;
  next_checkpoint?: string | null;
};

export default function Home() {
  
  const [trackingNumber, setTrackingNumber] = useState("");
const [shipment, setShipment] = useState<Shipment | null>(null);
const [loading, setLoading] = useState(false);
  
const searchShipment = async () => {
  setLoading(true);

  const { data, error } = await supabase
    .from("shipments")
    .select("*")
    .eq("tracking_number", trackingNumber)
    .single();

  if (error) {
    console.error(error);
    setShipment(null);
  } else {
    setShipment(data);
  }

  setLoading(false);
};

return (

    <main className="min-h-screen bg-gray-100">
<Navbar />
      

      {/* Hero Section */}
      <section className="text-center py-20">

        <h2 className="text-5xl font-bold text-gray-800">
          Worldwide Shipping Made Simple
        </h2>

        <p className="mt-6 text-xl text-gray-600">
          Fast • Secure • Reliable
        </p>

        {/* Tracking Card */}

        <div className="mt-12 max-w-xl mx-auto bg-white rounded-2xl shadow-xl p-8">

          <h3 className="text-2xl font-bold mb-6">
            Track Your Shipment
          </h3>

          <input
  type="text"
  placeholder="Enter Tracking Number"
  value={trackingNumber}
  onChange={(e) => setTrackingNumber(e.target.value)}
  className="w-full border rounded-lg p-4 mb-4"
/>

          <button
  onClick={searchShipment}
  disabled={loading}
  className="w-full bg-blue-700 hover:bg-blue-800 text-white p-4 rounded-lg"
>
  {loading ? "Searching..." : "Track Package"}
</button>

{shipment && (
  <div className="mt-6 text-left border-t pt-6">

    <p><strong>Tracking Number:</strong> {shipment.tracking_number}</p>

    <p><strong>Status:</strong> {shipment.shipment_status}</p>

    <p><strong>Current Location:</strong> {shipment.current_location}</p>

    <p><strong>Origin:</strong> {shipment.origin_country}</p>

    <p><strong>Destination:</strong> {shipment.destination_country}</p>

    <p><strong>Courier:</strong> {shipment.courier_name}</p>

    <p><strong>Estimated Arrival:</strong> {shipment.estimated_delivery}</p>
<p><strong>Transport Mode:</strong> {shipment.transport_mode}</p>

<p><strong>Cargo Type:</strong> {shipment.cargo_type}</p>

<p><strong>Commodity:</strong> {shipment.commodity}</p>

<p><strong>Quantity:</strong> {shipment.quantity} {shipment.unit}</p>

<p><strong>Container:</strong> {shipment.container_number}</p>

<p><strong>Current Checkpoint:</strong> {shipment.next_checkpoint}</p>
  </div>
)}

        </div>

      </section>

    </main>
  );
}
