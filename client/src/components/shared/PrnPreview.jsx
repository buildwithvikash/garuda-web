import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";
import { ready } from "zpl-renderer-js";

export default function PrnPreview({ command }) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generatePreview() {
    if (!command?.trim()) {
      setError("Enter a ZPL/PRN command to preview.");
      setPreviewUrl("");
      return;
    }

    setLoading(true);
    setError("");
    setPreviewUrl("");

    try {
      const { api } = await ready;

      // Adjust dimensions to match your actual label size.
      const dpi = 8;

      // Extract dimensions from the ZPL command when available.
      const widthMatch = command.match(/\^PW\s*(\d+)/i);
      const lengthMatch = command.match(/\^LL\s*(\d+)/i);

      const labelWidthMm = widthMatch ? Number(widthMatch[1]) / dpi : 148;

      const labelHeightMm = lengthMatch ? Number(lengthMatch[1]) / dpi : 185;

      const base64 = await api.zplToBase64Async(
        command,
        labelWidthMm,
        labelHeightMm,
        dpi,
      );

      if (!base64) {
        throw new Error("The renderer returned an empty image.");
      }

      setPreviewUrl(`data:image/png;base64,${base64}`);
    } catch (err) {
      console.error("PRN preview error:", err);
      setError(err?.message || "Unable to render this ZPL command.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPreviewUrl("");
    setError("");

    if (!command?.trim()) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const { api } = await ready;

        const dpi = 8;
        const widthMatch = command.match(/\^PW\s*(\d+)/i);
        const lengthMatch = command.match(/\^LL\s*(\d+)/i);

        const labelWidthMm = widthMatch ? Number(widthMatch[1]) / dpi : 148;

        const labelHeightMm = lengthMatch ? Number(lengthMatch[1]) / dpi : 185;

        const base64 = await api.zplToBase64Async(
          command,
          labelWidthMm,
          labelHeightMm,
          dpi,
        );

        if (!base64) {
          throw new Error("The renderer returned an empty image.");
        }

        if (!cancelled) {
          setPreviewUrl(`data:image/png;base64,${base64}`);
        }
      } catch (err) {
        console.error("PRN preview error:", err);

        if (!cancelled) {
          setError(err?.message || "Unable to render this ZPL command.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [command]);

  return (
    <section className="w-full min-w-0 overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h3 className="font-semibold">PRN Preview</h3>
        </div>

        <div>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Generating preview..."
              : previewUrl
                ? "Preview updated automatically."
                : error || "Enter a PRN command to generate a preview."}
          </p>
        </div>
      </div>

      <div className="flex h-187.5 w-full min-w-0 items-center justify-center overflow-hidden bg-muted/40 p-4">
        {previewUrl ? (
          <div className="flex h-full w-full min-w-0 items-center justify-center overflow-hidden">
            <img
              src={previewUrl}
              alt="PRN label preview"
              className="block max-h-full max-w-full rounded border bg-white shadow-md"
              style={{
                width: "auto",
                height: "auto",
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            {error || "Click Generate Preview to view the label."}
          </p>
        )}
      </div>
    </section>
  );
}
