import { ChevronDown, Download, ScrollText, Search } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { downloadCsv, useAuditActions, useAuditLogs } from '@/features/admin/api'
import { Pager } from '@/features/admin/components'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime } from '@/lib/utils'

const humanize = (action) => action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const TONE = {
  login_failed: 'text-danger',
  refresh_token_reuse: 'text-danger',
  report_exported: 'text-warning',
  audit_log_exported: 'text-warning',
  attachment_downloaded: 'text-warning',
  e_document_downloaded: 'text-warning',
}

export function AuditLogPage() {
  const [filters, setFilters] = useState({ action: '', actor: '', entity: '', date_from: '', date_to: '' })
  const [typed, setTyped] = useState({ actor: '', entity: '' })
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const [exporting, setExporting] = useState(false)
  const pageSize = 50
  const { data: actions } = useAuditActions()

  useEffect(() => {
    const id = setTimeout(() => {
      setFilters((f) => (f.actor === typed.actor.trim() && f.entity === typed.entity.trim() ? f : { ...f, actor: typed.actor.trim(), entity: typed.entity.trim() }))
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [typed])

  const query = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
  const { data, isLoading, isFetching, error, refetch } = useAuditLogs({ ...query, page, page_size: pageSize })
  const set = (patch) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadCsv('/admin/audit-logs.csv', query, 'audit_log.csv')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Sign-ins, record views, downloads, exports and every admin change (RA 10173). Entries can’t be edited or deleted. Exports cover the chosen dates, or the last 30 days if none are set."
        actions={
          <Button variant="secondary" loading={exporting} onClick={exportCsv}>
            {!exporting && <Download />} Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Select aria-label="Action" className="h-10 w-52" value={filters.action} onChange={(e) => set({ action: e.target.value })}>
          <option value="">All actions</option>
          {actions?.map((a) => (
            <option key={a} value={a}>{humanize(a)}</option>
          ))}
        </Select>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input type="search" aria-label="Who" placeholder="Who: name, email or student no." className="h-10 pl-9"
            value={typed.actor} onChange={(e) => setTyped((t) => ({ ...t, actor: e.target.value }))} />
        </div>
        <Input type="search" aria-label="Record" placeholder="Record, e.g. SRM-2026-000123" className="h-10 w-60"
          value={typed.entity} onChange={(e) => setTyped((t) => ({ ...t, entity: e.target.value }))} />
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="From" className="h-10 w-[150px]" value={filters.date_from} onChange={(e) => set({ date_from: e.target.value })} />
          <span className="text-muted" aria-hidden="true">–</span>
          <Input type="date" aria-label="To" className="h-10 w-[150px]" value={filters.date_to} onChange={(e) => set({ date_to: e.target.value })} />
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Card className={cn('overflow-hidden transition-opacity', isFetching && !isLoading && 'opacity-70')}>
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Audit log entries, newest first</caption>
              <thead className="border-b border-border bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">When</th>
                  <th scope="col" className="px-3 py-3">Action</th>
                  <th scope="col" className="px-3 py-3">Who</th>
                  <th scope="col" className="px-3 py-3">Record</th>
                  <th scope="col" className="px-3 py-3">IP address</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 10 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-2.5">
                          <Skeleton className="h-7" />
                        </td>
                      </tr>
                    ))
                  : data.items.map((a) => {
                      const expanded = open === a.id
                      return (
                        <Fragment key={a.id}>
                          <tr>
                            <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted">{formatDateTime(a.created_at)}</td>
                            <td className={cn('px-3 py-2.5 font-medium', TONE[a.action] ?? 'text-fg')}>{humanize(a.action)}</td>
                            <td className="px-3 py-2.5">
                              {a.actor_name ? (
                                <>
                                  <p className="text-fg">{a.actor_name}</p>
                                  <p className="text-xs capitalize text-muted">{a.actor_role}</p>
                                </>
                              ) : (
                                <span className="text-muted">System / public</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {a.entity_id ? (
                                <>
                                  <span className="font-mono text-xs text-fg">{a.entity_id}</span>
                                  <span className="block text-xs text-muted">{a.entity_type?.replace(/_/g, ' ')}</span>
                                </>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-muted">{a.ip ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-expanded={expanded}
                                aria-controls={`audit-${a.id}`}
                                onClick={() => setOpen(expanded ? null : a.id)}
                              >
                                Details <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
                              </Button>
                            </td>
                          </tr>
                          {expanded && (
                            <tr id={`audit-${a.id}`} className="bg-surface-muted/50">
                              <td colSpan={6} className="px-4 py-3">
                                <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[120px_1fr]">
                                  <dt className="text-muted">Email</dt>
                                  <dd className="text-fg">{a.actor_email ?? '—'}</dd>
                                  <dt className="text-muted">Browser</dt>
                                  <dd className="break-all text-fg">{a.user_agent || '—'}</dd>
                                  <dt className="text-muted">Details</dt>
                                  <dd>
                                    {Object.keys(a.meta).length ? (
                                      <pre className="whitespace-pre-wrap break-all font-mono text-fg">{JSON.stringify(a.meta, null, 2)}</pre>
                                    ) : (
                                      <span className="text-fg">—</span>
                                    )}
                                  </dd>
                                </dl>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
              </tbody>
            </table>
          </div>
          {!isLoading && data.items.length === 0 && (
            <EmptyState icon={ScrollText} className="m-4 border-none" title="No entries match" description="Try a wider date range or fewer filters." />
          )}
          {data && <Pager page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
        </Card>
      )}
    </div>
  )
}
