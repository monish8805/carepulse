import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { FileImage, FileUp } from "lucide-react";
import { Alert, Badge, Button, Card } from "@carepulse/ui";

const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png)$/i;
const FORMATS = ["JPG", "JPEG", "PNG"];

export interface SelectedImage {
  file: File;
  // A local object URL — the image never leaves this browser tab.
  url: string;
}

interface PrescriptionUploadProps {
  image: SelectedImage | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Before a file is chosen: a large drop zone. After: the original image with
// Replace/Remove, kept on screen so a future extracted result can be checked
// against the handwriting it came from. Only picks the file — the page owns
// it, and nothing here sends it anywhere.
export default function PrescriptionUpload({ image, onSelect, onRemove }: PrescriptionUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  function choose(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.test(file.name)) {
      setError(`"${file.name}" isn't a JPG, JPEG or PNG image.`);
      return;
    }
    setError("");
    onSelect(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  function remove() {
    if (inputRef.current) inputRef.current.value = "";
    onRemove();
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      aria-label="Prescription image"
      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
      className="sr-only"
      onChange={(event) => choose(event.target.files?.[0])}
    />
  );
  const errorAlert = error && (
    <div className="mt-4">
      <Alert variant="error">{error}</Alert>
    </div>
  );

  if (image) {
    return (
      <Card
        title="Original prescription"
        description="Kept on screen so extracted details can be checked against the handwriting."
        icon={FileImage}
      >
        {input}
        <div className="flex items-center justify-center overflow-hidden rounded-xl border border-cp-border bg-cp-quiet-bg p-2 dark:border-cp-border-dark dark:bg-cp-quiet-bg-dark">
          <img
            src={image.url}
            alt={`Prescription: ${image.file.name}`}
            className="max-h-[560px] w-auto rounded-lg object-contain"
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-cp-text dark:text-cp-text-dark">{image.file.name}</p>
            <p className="font-mono text-xs text-cp-text-subtle dark:text-cp-text-subtle-dark">
              {formatSize(image.file.size)} · stays in this browser, not uploaded or saved
            </p>
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
        {errorAlert}
      </Card>
    );
  }

  return (
    <Card>
      {input}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragging
            ? "border-cp-primary bg-cp-icon-soft dark:border-cp-primary-dark dark:bg-cp-icon-soft-dark"
            : "border-cp-input-border bg-cp-quiet-bg dark:border-cp-input-border-dark dark:bg-cp-quiet-bg-dark"
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-cp-icon-soft text-cp-primary dark:bg-cp-icon-soft-dark dark:text-cp-primary-dark">
          <FileUp className="h-7 w-7" aria-hidden="true" strokeWidth={2} />
        </span>
        <h2 className="text-lg font-semibold text-cp-text dark:text-cp-text-dark">Upload Prescription</h2>
        <p className="max-w-sm text-sm text-cp-text-muted dark:text-cp-text-muted-dark">
          Upload a clear image of the handwritten prescription. Drag it here, or browse for a file.
        </p>
        <Button onClick={() => inputRef.current?.click()}>Browse Files</Button>
        <span className="flex gap-1.5">
          {FORMATS.map((format) => (
            <Badge key={format} tone="info">
              {format}
            </Badge>
          ))}
        </span>
      </div>
      {errorAlert}
    </Card>
  );
}
