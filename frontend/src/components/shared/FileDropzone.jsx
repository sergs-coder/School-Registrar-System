import { FileText, LoaderCircle, Trash2, UploadCloud } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn, formatBytes } from '@/lib/utils'

const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png' }
const MAGIC_EXT = { jpeg: 'jpg' }

/** Drag-and-drop single-file upload with client-side type/size checks (the server re-checks). */
export function FileDropzone({ spec, file, onUpload, onRemove, onView, uploading, error, disabled }) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [localError, setLocalError] = useState(null)
  const accept = spec.accept ?? ['pdf', 'jpg', 'png']
  const maxMb = spec.max_mb ?? 5
  const shownError = localError || error

  function handle(f) {
    if (!f) return
    const ext = f.name.split('.').pop()?.toLowerCase()
    const normalized = MAGIC_EXT[ext] ?? ext
    if (!accept.includes(normalized)) {
      setLocalError(`Only ${accept.map((a) => a.toUpperCase()).join(', ')} files are accepted.`)
      return
    }
    if (f.size > maxMb * 1024 * 1024) {
      setLocalError(`This file is ${formatBytes(f.size)}. The limit is ${maxMb} MB.`)
      return
    }
    setLocalError(null)
    onUpload(f)
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary dark:text-primary-300">
          <FileText className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onView}
            className="block max-w-full truncate text-left text-sm font-medium text-link hover:underline"
          >
            {file.original_filename}
          </button>
          <p className="text-xs text-muted">{formatBytes(file.size_bytes)} · Uploaded</p>
        </div>
        {!disabled && (
          <div className="flex shrink-0 gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemove}
              disabled={uploading}
              aria-label={`Remove ${file.original_filename}`}
            >
              <Trash2 className="text-danger" />
            </Button>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={accept.map((a) => MIME[a]).join(',')}
          onChange={(e) => {
            handle(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>
    )
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) handle(e.dataTransfer.files?.[0])
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
          dragging ? 'border-primary bg-primary-soft' : 'border-border-strong hover:border-primary-300 hover:bg-surface-muted',
          shownError && 'border-danger/60',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {uploading ? (
          <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden="true" />
        ) : (
          <UploadCloud className="size-6 text-muted" aria-hidden="true" />
        )}
        <span className="text-sm">
          <span className="font-semibold text-link">{uploading ? 'Uploading…' : 'Choose a file'}</span>
          {!uploading && <span className="text-muted"> or drag it here</span>}
        </span>
        <span className="text-xs text-subtle">
          {accept.map((a) => a.toUpperCase()).join(', ')} · up to {maxMb} MB
        </span>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          disabled={disabled || uploading}
          accept={accept.map((a) => MIME[a]).join(',')}
          aria-label={`Upload ${spec.label}`}
          aria-invalid={shownError ? true : undefined}
          onChange={(e) => {
            handle(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </label>
      {shownError && <p className="mt-1.5 text-[13px] font-medium text-danger">{shownError}</p>}
    </div>
  )
}
