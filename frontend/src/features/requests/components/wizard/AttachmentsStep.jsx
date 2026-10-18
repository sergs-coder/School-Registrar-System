import { useState } from 'react'
import { toast } from 'sonner'

import { FileDropzone } from '@/components/shared/FileDropzone'
import { Alert } from '@/components/ui/alert'
import { openAttachment, useDeleteAttachment, useUploadAttachment } from '@/features/requests/api'
import { StepActions } from '@/features/requests/components/wizard/StepShell'
import { errorMessage } from '@/lib/errors'

export function AttachmentsStep({ docType, request, onBack, onNext }) {
  const upload = useUploadAttachment(request.reference_no)
  const remove = useDeleteAttachment(request.reference_no)
  const [busyKey, setBusyKey] = useState(null)
  const [errors, setErrors] = useState({})

  const fileFor = (key) => request.attachments.find((a) => a.kind === 'requirement' && a.requirement_key === key)

  async function handleUpload(key, file) {
    setBusyKey(key)
    setErrors((e) => ({ ...e, [key]: null }))
    try {
      await upload.mutateAsync({ requirementKey: key, file })
      toast.success('File uploaded')
    } catch (err) {
      setErrors((e) => ({ ...e, [key]: errorMessage(err) }))
    } finally {
      setBusyKey(null)
    }
  }

  async function handleRemove(key, id) {
    setBusyKey(key)
    try {
      await remove.mutateAsync(id)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusyKey(null)
    }
  }

  function next() {
    const missing = {}
    for (const spec of docType.required_attachments) {
      if (spec.required && !fileFor(spec.key)) missing[spec.key] = `Please upload: ${spec.label}.`
    }
    setErrors(missing)
    if (Object.keys(missing).length === 0) onNext()
    else document.getElementById(`att-${Object.keys(missing)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <div className="space-y-7">
      <Alert tone="info">
        Upload clear scans or photos. Files are encrypted and only Registrar staff handling your request can open
        them.
      </Alert>
      <ul className="space-y-6">
        {docType.required_attachments.map((spec) => (
          <li key={spec.key} id={`att-${spec.key}`} className="space-y-2 scroll-mt-24">
            <div>
              <p className="text-sm font-medium text-fg">
                {spec.label}
                {spec.required ? (
                  <span className="text-danger"> *</span>
                ) : (
                  <span className="font-normal text-subtle"> (optional)</span>
                )}
              </p>
              {spec.help && <p className="text-[13px] text-muted">{spec.help}</p>}
            </div>
            <FileDropzone
              spec={spec}
              file={fileFor(spec.key)}
              uploading={busyKey === spec.key}
              error={errors[spec.key]}
              onUpload={(f) => handleUpload(spec.key, f)}
              onRemove={() => handleRemove(spec.key, fileFor(spec.key).id)}
              onView={() => openAttachment(fileFor(spec.key).id).catch((e) => toast.error(errorMessage(e)))}
            />
          </li>
        ))}
      </ul>
      <StepActions onBack={onBack} nextType="button" onNext={next} nextLabel="Save and continue" disabled={busyKey !== null} />
    </div>
  )
}
