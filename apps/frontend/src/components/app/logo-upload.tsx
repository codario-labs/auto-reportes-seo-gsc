import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LOGO_ACCEPTED_TYPES, validateLogoFile } from './logo-validation';

interface LogoUploadProps {
  /** URL del logo ya guardado (si existe). */
  currentUrl: string | null;
  /** Archivo seleccionado pendiente de subir. */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** El logo guardado se marcó para eliminarse. */
  removed: boolean;
  onRemove: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function LogoUpload({ currentUrl, file, onFileChange, removed, onRemove, disabled, label = 'Logo', className }: LogoUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const shownUrl = previewUrl ?? (removed ? null : currentUrl);

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-panel border border-dashed border-line-strong bg-subtle p-2">
        {shownUrl ? (
          <img src={shownUrl} alt={`${label} preview`} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="size-5 text-muted" aria-hidden />
        )}
      </div>
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={LOGO_ACCEPTED_TYPES.join(',')}
            className="sr-only"
            disabled={disabled}
            aria-label={`Upload ${label.toLowerCase()}`}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              event.target.value = '';
              if (!selected) return;
              const problem = validateLogoFile(selected);
              setError(problem);
              if (!problem) onFileChange(selected);
            }}
          />
          <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
            <Upload />
            {shownUrl ? 'Replace' : 'Upload'}
          </Button>
          {shownUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setError(null);
                if (file) onFileChange(null);
                else onRemove();
              }}
            >
              <Trash2 />
              Remove
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-ui text-danger">
            {error}
          </p>
        ) : (
          <p className="text-ui text-muted">PNG, JPEG, WebP or SVG, up to 2 MB.</p>
        )}
      </div>
    </div>
  );
}
