"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Settings, X, Image as ImageIcon } from "lucide-react";

interface SiteSettingsForm {
  siteName: string;
  heroText: string;
  whatsappNumber: string;
  logoFilename: string | null;
}

interface SiteSettingsPanelProps {
  onMessage: (msg: string) => void;
}

export default function SiteSettingsPanel({ onMessage }: SiteSettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SiteSettingsForm>({
    siteName: "Alfarooq Services",
    heroText: "",
    whatsappNumber: "",
    logoFilename: null,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;

    setLoading(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setForm({
          siteName: data.siteName || "Alfarooq Services",
          heroText: data.heroText || "",
          whatsappNumber: data.whatsappNumber || "",
          logoFilename: data.logoFilename || null,
        });
        setLoaded(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, loaded]);

  async function handleSave() {
    setSaving(true);

    const formData = new FormData();
    formData.append("siteName", form.siteName);
    formData.append("heroText", form.heroText);
    formData.append("whatsappNumber", form.whatsappNumber);
    if (removeLogo) formData.append("removeLogo", "true");
    if (logoFile) formData.append("logo", logoFile);

    const res = await fetch("/api/settings", {
      method: "PUT",
      body: formData,
    });

    if (res.ok) {
      const data = await res.json();
      setForm({
        siteName: data.siteName,
        heroText: data.heroText,
        whatsappNumber: data.whatsappNumber,
        logoFilename: data.logoFilename,
      });
      setLogoFile(null);
      setRemoveLogo(false);
      onMessage("Website settings save ho gayi!");
    } else {
      onMessage("Settings save nahi ho saki");
    }
    setSaving(false);
  }

  if (open && loading && !loaded) {
    return (
      <div className="bg-app-surface rounded-2xl border border-app-border p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-app-primary" />
      </div>
    );
  }

  return (
    <div className="bg-app-surface rounded-2xl border border-app-border shadow-sm overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 border-b border-app-border hover:bg-app-elevated"
      >
        <span className="font-bold text-app-text flex items-center gap-2">
          <Settings className="w-5 h-5 text-app-primary" />
          Website Settings (Logo, Hero Text)
        </span>
        <span className="text-sm text-app-text-muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-app-text-secondary mb-1">
                Site Name / Logo Text
              </label>
              <input
                type="text"
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                placeholder="Alfarooq Services"
                className="input-app urdu-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-app-text-secondary mb-1">
                WhatsApp Number (optional)
              </label>
              <input
                type="text"
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                placeholder="+92 300 1234567"
                className="input-app"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-app-text-secondary mb-1">
              Hero Section Text (single line — center aligned)
            </label>
            <textarea
              value={form.heroText}
              onChange={(e) => setForm({ ...form, heroText: e.target.value })}
              rows={2}
              placeholder="Apni hero line yahan likhein..."
              className="input-app resize-none urdu-text leading-loose"
            />
            <p className="text-xs text-app-text-muted mt-1">
              Khali chhorne par hero section hide ho jayega
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-app-text-secondary mb-2">
              Logo Image
            </label>
            <div className="flex flex-wrap items-center gap-4">
              {(form.logoFilename && !removeLogo) || logoFile ? (
                <div className="w-16 h-16 rounded-xl border border-app-border overflow-hidden bg-app-secondary flex items-center justify-center">
                  {logoFile ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={URL.createObjectURL(logoFile)}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  ) : form.logoFilename ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/media/${encodeURIComponent(form.logoFilename)}`}
                      alt="Logo"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-app-text-muted" />
                  )}
                </div>
              ) : null}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setLogoFile(e.target.files?.[0] || null);
                  setRemoveLogo(false);
                }}
                className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-app-primary/15 file:text-app-primary"
              />
              {form.logoFilename && !removeLogo && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveLogo(true);
                    setLogoFile(null);
                  }}
                  className="text-sm text-app-error hover:underline flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Remove logo
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !form.siteName.trim()}
            className="px-6 py-2.5 rounded-xl btn-primary disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
}
