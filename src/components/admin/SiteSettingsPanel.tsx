"use client";

import { useEffect, useState } from "react";
import {
  Bot,
  KeyRound,
  Loader2,
  Megaphone,
  Save,
  Settings,
  X,
  Image as ImageIcon,
} from "lucide-react";

interface SiteSettingsForm {
  siteName: string;
  heroText: string;
  whatsappNumber: string;
  logoFilename: string | null;
  metaPixelId: string;
  googleAdsTagId: string;
  tiktokPixelId: string;
  botEnabled: boolean;
  botProvider: string;
  botModel: string;
  botSystemNote: string;
  botApiKeySet: boolean;
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
    metaPixelId: "",
    googleAdsTagId: "",
    tiktokPixelId: "",
    botEnabled: false,
    botProvider: "openai",
    botModel: "",
    botSystemNote: "",
    botApiKeySet: false,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [clearMetaAccessToken, setClearMetaAccessToken] = useState(false);
  const [botApiKey, setBotApiKey] = useState("");
  const [clearBotApiKey, setClearBotApiKey] = useState(false);

  const modelOptions =
    form.botProvider === "claude"
      ? ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"]
      : form.botProvider === "deepseek"
        ? ["deepseek-chat", "deepseek-reasoner"]
        : ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"];

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
          metaPixelId: data.metaPixelId || "",
          googleAdsTagId: data.googleAdsTagId || "",
          tiktokPixelId: data.tiktokPixelId || "",
          botEnabled: Boolean(data.botEnabled),
          botProvider: data.botProvider || "openai",
          botModel: data.botModel || "",
          botSystemNote: data.botSystemNote || "",
          botApiKeySet: Boolean(data.botApiKeySet),
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
    formData.append("metaPixelId", form.metaPixelId);
    formData.append("googleAdsTagId", form.googleAdsTagId);
    formData.append("tiktokPixelId", form.tiktokPixelId);
    formData.append("botEnabled", String(form.botEnabled));
    formData.append("botProvider", form.botProvider);
    formData.append("botModel", form.botModel);
    formData.append("botSystemNote", form.botSystemNote);
    if (metaAccessToken.trim()) formData.append("metaAccessToken", metaAccessToken.trim());
    if (clearMetaAccessToken) formData.append("clearMetaAccessToken", "true");
    if (botApiKey.trim()) formData.append("botApiKey", botApiKey.trim());
    if (clearBotApiKey) formData.append("clearBotApiKey", "true");
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
        metaPixelId: data.metaPixelId || "",
        googleAdsTagId: data.googleAdsTagId || "",
        tiktokPixelId: data.tiktokPixelId || "",
        botEnabled: Boolean(data.botEnabled),
        botProvider: data.botProvider || "openai",
        botModel: data.botModel || "",
        botSystemNote: data.botSystemNote || "",
        botApiKeySet: Boolean(data.botApiKeySet),
      });
      setLogoFile(null);
      setRemoveLogo(false);
      setMetaAccessToken("");
      setClearMetaAccessToken(false);
      setBotApiKey("");
      setClearBotApiKey(false);
      onMessage("Website settings save ho gayi!");
    } else {
      onMessage("Settings save nahi ho saki");
    }
    setSaving(false);
  }

  if (open && loading && !loaded) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 border-b border-slate-100 hover:bg-slate-50"
      >
        <span className="font-bold text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary-500" />
          Website Settings (Logo, Hero Text)
        </span>
        <span className="text-sm text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Site Name / Logo Text
              </label>
              <input
                type="text"
                value={form.siteName}
                onChange={(e) => setForm({ ...form, siteName: e.target.value })}
                placeholder="Alfarooq Services"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none urdu-text"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                WhatsApp Number (optional)
              </label>
              <input
                type="text"
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                placeholder="+92 300 1234567"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Hero Section Text (single line — center aligned)
            </label>
            <textarea
              value={form.heroText}
              onChange={(e) => setForm({ ...form, heroText: e.target.value })}
              rows={2}
              placeholder="Apni hero line yahan likhein..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none resize-none urdu-text leading-loose"
            />
            <p className="text-xs text-slate-400 mt-1">
              Khali chhorne par hero section hide ho jayega
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Logo Image
            </label>
            <div className="flex flex-wrap items-center gap-4">
              {(form.logoFilename && !removeLogo) || logoFile ? (
                <div className="w-16 h-16 rounded-xl border border-slate-200 overflow-hidden bg-slate-50 flex items-center justify-center">
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
                    <ImageIcon className="w-6 h-6 text-slate-300" />
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
                className="text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700"
              />
              {form.logoFilename && !removeLogo && (
                <button
                  type="button"
                  onClick={() => {
                    setRemoveLogo(true);
                    setLogoFile(null);
                  }}
                  className="text-sm text-red-600 hover:underline flex items-center gap-1"
                >
                  <X className="w-4 h-4" /> Remove logo
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-primary-600" />
              Advertisement Tracking
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Meta Pixel ID
                </label>
                <input
                  type="text"
                  value={form.metaPixelId}
                  onChange={(e) => setForm({ ...form, metaPixelId: e.target.value })}
                  placeholder="1234567890"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Google Ads / GTM ID
                </label>
                <input
                  type="text"
                  value={form.googleAdsTagId}
                  onChange={(e) => setForm({ ...form, googleAdsTagId: e.target.value })}
                  placeholder="G-... / AW-..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  TikTok Pixel ID
                </label>
                <input
                  type="text"
                  value={form.tiktokPixelId}
                  onChange={(e) => setForm({ ...form, tiktokPixelId: e.target.value })}
                  placeholder="C..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Meta Conversions API Token
                </label>
                <input
                  type="password"
                  value={metaAccessToken}
                  onChange={(e) => {
                    setMetaAccessToken(e.target.value);
                    setClearMetaAccessToken(false);
                  }}
                  placeholder="Blank rakhein to existing token save rahega"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
                <input
                  type="checkbox"
                  checked={clearMetaAccessToken}
                  onChange={(e) => setClearMetaAccessToken(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600"
                />
                Clear token
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Bot className="w-4 h-4 text-accent-600" />
              AI Bot Settings
            </h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.botEnabled}
                onChange={(e) => setForm({ ...form, botEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-primary-600"
              />
              <span className="text-sm text-slate-700">
                Frontend par سوال پوچھیں bot show karein
              </span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Provider
                </label>
                <select
                  value={form.botProvider}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      botProvider: e.target.value,
                      botModel: "",
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                >
                  <option value="openai">GPT / OpenAI</option>
                  <option value="claude">Claude</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Model
                </label>
                <select
                  value={form.botModel}
                  onChange={(e) => setForm({ ...form, botModel: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                >
                  <option value="">Model select karein</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  API Key {form.botApiKeySet ? "(saved)" : ""}
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={botApiKey}
                    onChange={(e) => {
                      setBotApiKey(e.target.value);
                      setClearBotApiKey(false);
                    }}
                    placeholder="Blank rakhein to existing key save rahegi"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
                <input
                  type="checkbox"
                  checked={clearBotApiKey}
                  onChange={(e) => setClearBotApiKey(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600"
                />
                Clear key
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Extra Bot Instruction (optional)
              </label>
              <textarea
                value={form.botSystemNote}
                onChange={(e) => setForm({ ...form, botSystemNote: e.target.value })}
                rows={2}
                placeholder="Example: jawab Roman Urdu mein short rakhna"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none resize-y scroll-field urdu-text"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !form.siteName.trim()}
            className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
}
