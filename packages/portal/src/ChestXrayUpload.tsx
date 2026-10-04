import { useEffect, useId, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ImageUp, ScanLine } from "lucide-react";
import { Alert, Badge, Button, Card } from "@carepulse/ui";

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png)$/i;

// Placeholder for a future chest X-ray model. Everything happens in this
// browser tab: the chosen image is shown from a local object URL and is never
// sent anywhere or stored — no fetch, no upload, gone on reload. When a model
// exists, its call goes where "Analysis not available yet" is shown.
export default function ChestXrayUpload() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  // Object URLs hold the image in memory until revoked.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.test(file.name)) {
      setError(`"${file.name}" isn't a JPG, JPEG or PNG image.`);
      return;
    }
    setError("");
    setPreview({ url: URL.createObjectURL(file), name: file.name });
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  function remove() {
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <Card
      title="Chest X-ray"
      description="Preview only — the image stays in this browser and isn't uploaded or saved."
      icon={ScanLine}
    >
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".jpg,.jpeg,.png,image/jpeg,image/png"
        className="sr-only"
        onChange={(event) => choose(event.target.files?.[0])}
      />

      {preview ? (
        <div className="space-y-4">
          <div className="flex items-center justify-center overflow-hidden rounded-xl border border-cp-border bg-black dark:border-cp-border-dark">
            <img src={preview.url} alt={`Chest X-ray preview: ${preview.name}`} className="max-h-[420px] w-auto object-contain" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">{preview.name}</p>
              <Badge tone="neutral">Analysis not available yet</Badge>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => inputRef.current?.click()}>
                Replace
              </Button>
              <Button variant="destructive-subtle" onClick={remove}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging
              ? "border-cp-primary bg-cp-icon-soft dark:border-cp-primary-dark dark:bg-cp-icon-soft-dark"
              : "border-cp-input-border bg-cp-quiet-bg hover:border-cp-focus-border dark:border-cp-input-border-dark dark:bg-cp-quiet-bg-dark dark:hover:border-cp-focus-border-dark"
          }`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cp-icon-soft text-cp-primary dark:bg-cp-icon-soft-dark dark:text-cp-primary-dark">
            <ImageUp className="h-6 w-6" aria-hidden="true" strokeWidth={2} />
          </span>
          <span className="text-base font-semibold text-cp-text dark:text-cp-text-dark">Upload Chest X-ray</span>
          <span className="text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
            Drag an image here, or click to choose one
          </span>
          <span className="flex gap-1.5">
            {["JPG", "JPEG", "PNG"].map((format) => (
              <Badge key={format} tone="info">
                {format}
              </Badge>
            ))}
          </span>
        </label>
      )}

      {error && (
        <div className="mt-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
    </Card>
  );
}
