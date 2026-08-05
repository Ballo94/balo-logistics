"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const emptySettings = {
  company_name: "Balo",
  company_phone: "",
  company_email: "",
  company_address: "",
  company_website: "",
  primary_color: "#2563eb",
  secondary_color: "#1e40af",
  logo_url: "",
};

export default function SettingsPage() {
  const [settingsId, setSettingsId] = useState<number | null>(null);
  const [form, setForm] = useState(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Loading on mount intentionally synchronizes this client view with Supabase.
    // eslint-disable-next-line react-hooks/immutability
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);

    const { data, error } = await supabase
      .from("company_settings")
      .select("*")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) {
      alert(`Unable to load settings: ${error.message}`);
      setLoading(false);
      return;
    }

    if (data) {
      setSettingsId(data.id);

      setForm({
        company_name: data.company_name || "Balo",
        company_phone: data.company_phone || "",
        company_email: data.company_email || "",
        company_address: data.company_address || "",
        company_website: data.company_website || "",
        primary_color: data.primary_color || "#2563eb",
        secondary_color: data.secondary_color || "#1e40af",
        logo_url: data.logo_url || "",
      });
    }

    setLoading(false);
  }

  function updateForm(
    field: keyof typeof emptySettings,
    value: string
  ) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value,
    }));
  }

  async function saveSettings() {
    if (!form.company_name.trim()) {
      alert("Please enter the company name.");
      return;
    }

    setSaving(true);

    const settingsData = {
      ...form,
      updated_at: new Date().toISOString(),
    };

    if (settingsId) {
      const { error } = await supabase
        .from("company_settings")
        .update(settingsData)
        .eq("id", settingsId);

      setSaving(false);

      if (error) {
        alert(`Unable to save settings: ${error.message}`);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("company_settings")
        .insert([settingsData])
        .select("id")
        .single();

      setSaving(false);

      if (error) {
        alert(`Unable to save settings: ${error.message}`);
        return;
      }

      setSettingsId(data.id);
    }

    alert("Company settings saved successfully!");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-100 p-10">
        <p className="text-lg">Loading settings...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">
          Company Settings
        </h1>

        <p className="text-gray-600 mb-8">
          Change your company branding and contact information.
        </p>

        <div className="bg-white rounded-2xl shadow-lg p-6 md:p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <input
              type="text"
              placeholder="Company Name"
              value={form.company_name}
              onChange={(e) =>
                updateForm("company_name", e.target.value)
              }
              className="border rounded-lg p-3"
            />

            <input
              type="tel"
              placeholder="Company Phone"
              value={form.company_phone}
              onChange={(e) =>
                updateForm("company_phone", e.target.value)
              }
              className="border rounded-lg p-3"
            />

            <input
              type="email"
              placeholder="Company Email"
              value={form.company_email}
              onChange={(e) =>
                updateForm("company_email", e.target.value)
              }
              className="border rounded-lg p-3"
            />

            <input
              type="text"
              placeholder="Company Website"
              value={form.company_website}
              onChange={(e) =>
                updateForm("company_website", e.target.value)
              }
              className="border rounded-lg p-3"
            />

            <textarea
              placeholder="Company Address"
              value={form.company_address}
              onChange={(e) =>
                updateForm("company_address", e.target.value)
              }
              rows={3}
              className="border rounded-lg p-3 md:col-span-2"
            />

            <input
              type="text"
              placeholder="Logo URL"
              value={form.logo_url}
              onChange={(e) =>
                updateForm("logo_url", e.target.value)
              }
              className="border rounded-lg p-3 md:col-span-2"
            />

            <div>
              <label className="block font-semibold mb-2">
                Primary Colour
              </label>

              <div className="flex gap-3">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) =>
                    updateForm("primary_color", e.target.value)
                  }
                  className="w-16 h-12 border rounded-lg"
                />

                <input
                  type="text"
                  value={form.primary_color}
                  onChange={(e) =>
                    updateForm("primary_color", e.target.value)
                  }
                  className="flex-1 border rounded-lg p-3"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-2">
                Secondary Colour
              </label>

              <div className="flex gap-3">
                <input
                  type="color"
                  value={form.secondary_color}
                  onChange={(e) =>
                    updateForm("secondary_color", e.target.value)
                  }
                  className="w-16 h-12 border rounded-lg"
                />

                <input
                  type="text"
                  value={form.secondary_color}
                  onChange={(e) =>
                    updateForm("secondary_color", e.target.value)
                  }
                  className="flex-1 border rounded-lg p-3"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 border rounded-xl p-5">
            <h2 className="text-xl font-bold mb-4">
              Branding Preview
            </h2>

            <div
              className="rounded-xl p-6 text-white"
              style={{
                backgroundColor: form.primary_color,
              }}
            >
              <div className="flex items-center gap-4">
                {form.logo_url && (
                  // The URL is user-configurable, so it cannot use a fixed Next Image host.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logo_url}
                    alt="Company logo"
                    className="w-16 h-16 rounded-lg bg-white object-contain"
                  />
                )}

                <div>
                  <h3 className="text-2xl font-bold">
                    {form.company_name || "Company Name"}
                  </h3>

                  <p>
                    Professional Shipment Tracking
                  </p>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={saveSettings}
            disabled={saving}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-lg p-4"
          >
            {saving ? "Saving Settings..." : "Save Settings"}
          </button>
        </div>
      </div>
    </main>
  );
}
