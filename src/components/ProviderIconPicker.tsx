import { useState, type ChangeEvent } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { api, useStore, type InstanceInfo } from "@/state/store";
import {
  PROVIDER_ICON_LABELS,
  PROVIDER_ICON_MAX_DIMENSION,
  PROVIDER_ICON_MAX_BYTES,
  PROVIDER_ICON_MEDIA_TYPES,
  PROVIDER_ICON_PRESETS,
  providerIconError,
  type ProviderIcon,
} from "../../shared/provider-icon";
import { InstanceProviderMark } from "./ProviderIcons";

type ImageDimensions = { width: number; height: number };

function decodeBrowserImage(dataUrl: string): Promise<ImageDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("OpenMausBot could not decode that image."));
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = dataUrl;
  });
}

export async function providerIconFromFile(
  file: Pick<File, "type" | "size" | "arrayBuffer">,
  decodeImage: (dataUrl: string) => Promise<ImageDimensions> = decodeBrowserImage,
): Promise<ProviderIcon> {
  if (!(PROVIDER_ICON_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Upload a PNG, JPEG, or WebP image.");
  }
  if (file.size > PROVIDER_ICON_MAX_BYTES) throw new Error("Provider icons must be 128 KB or smaller.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  const icon = { kind: "custom", dataUrl: `data:${file.type};base64,${btoa(binary)}` } as const;
  const invalid = providerIconError(icon);
  if (invalid) throw new Error(invalid);
  const dimensions = await decodeImage(icon.dataUrl);
  if (dimensions.width < 1 || dimensions.height < 1 || dimensions.width > PROVIDER_ICON_MAX_DIMENSION || dimensions.height > PROVIDER_ICON_MAX_DIMENSION) {
    throw new Error(`Provider icons must be at most ${PROVIDER_ICON_MAX_DIMENSION} × ${PROVIDER_ICON_MAX_DIMENSION} pixels.`);
  }
  return icon;
}

export function ProviderIconPicker({ instance }: { instance: InstanceInfo }) {
  const { refreshInstances } = useStore();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (icon: ProviderIcon | null) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/instances/${encodeURIComponent(instance.instanceId)}/icon`, {
        method: "PATCH",
        body: JSON.stringify({ icon }),
      });
      await refreshInstances();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError(null);
    void providerIconFromFile(file)
      .then((icon) => save(icon))
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => { input.value = ""; });
  };

  const value = instance.icon?.kind === "preset" ? instance.icon.preset
    : instance.icon?.kind === "custom" ? "custom" : "default";
  return <section aria-label="Provider icon" className="mb-3 rounded-xl border border-hairline/40 p-3">
    <div className="flex flex-wrap items-center gap-3">
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-hairline/30 bg-panel">
        <InstanceProviderMark instance={instance} size={24} />
      </span>
      <label className="min-w-40 flex-1 text-[12px] font-medium text-ink">
        Provider icon
        <select aria-label={`Provider icon for ${instance.displayName}`} value={value} disabled={saving}
          onChange={(event) => {
            if (event.target.value === "default") void save(null);
            else if (event.target.value !== "custom") void save({ kind: "preset", preset: event.target.value as typeof PROVIDER_ICON_PRESETS[number] });
          }}
          className="mt-1 block w-full rounded-lg border border-hairline/40 bg-inset px-2.5 py-2 text-[12px] text-ink focus:border-accent/60 focus:outline-none disabled:opacity-50">
          <option value="default">Default icon</option>
          {instance.icon?.kind === "custom" && <option value="custom">Custom image</option>}
          {PROVIDER_ICON_PRESETS.map((preset) => <option key={preset} value={preset}>{PROVIDER_ICON_LABELS[preset]}</option>)}
        </select>
      </label>
      {saving && <Loader2 size={15} aria-label="Saving provider icon" className="animate-spin text-ink-secondary" />}
      {instance.icon && <button type="button" disabled={saving} onClick={() => void save(null)}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-[12px] text-ink-secondary hover:bg-control hover:text-ink disabled:opacity-50">
        <RotateCcw size={13} aria-hidden="true" />Reset
      </button>}
    </div>
    <p className="mt-2 text-[11px] leading-relaxed text-ink-secondary">Choose a provider or upload a square PNG, JPEG, or WebP image up to 128 KB. This changes only this engine instance.</p>
    <input type="file" accept={PROVIDER_ICON_MEDIA_TYPES.join(",")} disabled={saving} onChange={upload}
      aria-label={`Upload a custom provider icon for ${instance.displayName}`}
      className="mt-2 block w-full text-[11px] text-ink-secondary file:mr-2 file:rounded-lg file:border-0 file:bg-control file:px-2.5 file:py-1.5 file:text-[11px] file:font-medium file:text-ink hover:file:bg-raised-hover disabled:opacity-50" />
    {error && <p role="alert" className="mt-2 text-[12px] text-danger">{error}</p>}
  </section>;
}
