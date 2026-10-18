import { useQuery } from '@tanstack/react-query'
import { Info, PackageCheck, ScanLine, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { DefinitionList } from '@/components/shared/misc'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { verifyCode } from '@/features/requests/api'
import { apiError } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/utils'
import { PublicShell } from '@/pages/PublicPages'

const RESULT = {
  valid: { tone: 'success', icon: ShieldCheck, title: 'Authentic' },
  claimed: { tone: 'info', icon: PackageCheck, title: 'Already claimed' },
  not_claimable: { tone: 'warning', icon: ShieldAlert, title: 'Not valid right now' },
  revoked: { tone: 'danger', icon: ShieldX, title: 'Withdrawn' },
}
const KIND = { e_document: 'E-document', pickup_slip: 'Pick-up slip' }

/** Public page behind the QR codes on pick-up slips and e-documents. No login needed. */
export function VerifyPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [value, setValue] = useState(code ?? '')
  useEffect(() => setValue(code ?? ''), [code])

  const { data, error, isFetching } = useQuery({
    queryKey: ['verify', code],
    queryFn: () => verifyCode(code),
    enabled: Boolean(code),
    retry: false,
    staleTime: 0,
  })

  return (
    <PublicShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px] sm:leading-9">Verify a document</h1>
          <p className="text-[15px] text-muted">
            Check a pick-up slip or e-document issued by the Office of the University Registrar. Scan its QR code, or type
            the code printed beside it.
          </p>
        </div>

        <Card className="p-4 sm:p-6">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              const cleaned = value.trim()
              if (cleaned) navigate(`/verify/${encodeURIComponent(cleaned.toUpperCase())}`)
            }}
          >
            <label htmlFor="verify-code" className="sr-only">
              Verification code
            </label>
            <Input
              id="verify-code"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              className="font-mono uppercase tracking-wider"
            />
            <Button type="submit" className="h-11 shrink-0" loading={isFetching}>
              {!isFetching && <ScanLine />} Verify
            </Button>
          </form>
        </Card>

        {code && isFetching && !data && <Skeleton className="h-64 rounded-2xl" />}
        {code && error && <VerifyError error={error} />}
        {code && data && !isFetching && <VerifyResult result={data} />}
      </div>
    </PublicShell>
  )
}

function VerifyError({ error }) {
  const e = apiError(error)
  if (e.code === 'NOT_FOUND') {
    return (
      <Alert tone="danger" icon={ShieldX} title="No matching document">
        {e.message} If you received this document from someone, it may not be genuine. Contact the Registrar’s Office to
        confirm.
      </Alert>
    )
  }
  return <Alert tone="warning" title="We couldn’t check this code">{e.message}</Alert>
}

function VerifyResult({ result: r }) {
  const meta = RESULT[r.state]
  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-6">
        <Alert tone={meta.tone} icon={meta.icon} title={`${meta.title} · ${KIND[r.kind]}`}>
          {r.message}
        </Alert>
        <DefinitionList
          className="mt-4"
          items={[
            { label: 'Document', value: r.document_name },
            { label: 'Issued to', value: r.holder_name },
            { label: 'Student no.', value: <span className="font-mono">{r.student_no_masked}</span> },
            { label: 'Reference no.', value: <span className="font-mono">{r.reference_no}</span> },
            { label: 'Copies', value: String(r.copies) },
            { label: 'Issued', value: formatDateTime(r.issued_at) },
            r.revoked_at && { label: 'Withdrawn', value: formatDate(r.revoked_at) },
            { label: 'Code', value: <span className="font-mono">{r.code}</span> },
          ]}
        />
      </div>
      {r.kind === 'e_document' && r.state === 'valid' && (
        <p className="flex gap-2 border-t border-border bg-surface-muted px-4 py-3 text-[13px] text-muted sm:px-6">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Check that the name, reference number and code printed on the copy you received match the details above. If they
          don’t, the copy may have been altered.
        </p>
      )}
    </Card>
  )
}
