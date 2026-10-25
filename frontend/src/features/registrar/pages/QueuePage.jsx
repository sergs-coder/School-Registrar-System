import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Package,
  Search,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CATEGORY_LABELS, useDocumentTypes } from '@/features/catalog/api'
import { useBulkTransition, useQueue } from '@/features/registrar/api'
import { RequestPanel } from '@/features/registrar/components/RequestPanel'
import { TransitionDialog } from '@/features/registrar/components/TransitionDialog'
import { initials } from '@/components/layout/UserMenu'
import { errorMessage } from '@/lib/errors'
import { QUEUE_VIEWS } from '@/lib/status'
import { cn, formatDate, timeAgo } from '@/lib/utils'

const PROGRAMS = ['BSIT', 'BSCS', 'BSN', 'BSMT', 'BSPSY', 'ABCOMM', 'BSED-ENG', 'BSA', 'BSBA-MM', 'BSHM', 'BSTM', 'BSCE']

const BULK_ACTIONS = [
  { toStatus: 'under_review', label: 'Start review' },
  { toStatus: 'approve', label: 'Approve' },
  { toStatus: 'ready_for_pickup', label: 'Ready for pick-up' },
  { toStatus: 'completed', label: 'Mark released' },
  { toStatus: 'rejected', label: 'Reject', requiresRemarks: true, variant: 'danger-outline' },
]

const COLUMNS = [
  { key: 'reference_no', label: 'Reference', sortable: true },
  { key: 'student', label: 'Student', sortable: true },
  { key: 'document', label: 'Document', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'submitted_at', label: 'Submitted', sortable: true },
  { key: 'estimated_release_date', label: 'Est. release', sortable: true },
  { key: 'assignee', label: 'Assigned' },
]

/** URL is the source of truth for filters, so views are shareable and survive refresh. */
function useQueueParams() {
  const [params, setParams] = useSearchParams()
  const get = (k) => params.get(k) ?? ''
  const update = (patch, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null || v === false) next.delete(k)
      else next.set(k, String(v))
    }
    if (resetPage && !('page' in patch)) next.delete('page')
    setParams(next, { replace: !('view' in patch) })
  }
  return { params, get, update }
}

export function QueuePage() {
  const { get, update } = useQueueParams()
  const view = QUEUE_VIEWS.find((v) => v.key === get('tab')) ?? QUEUE_VIEWS[0]
  const sort = get('sort') || '-submitted_at'
  const page = Math.max(1, Number(get('page')) || 1)
  const pageSize = Number(get('size')) || 20
  const [search, setSearch] = useState(get('q'))
  const [selected, setSelected] = useState(() => new Set())
  const [bulk, setBulk] = useState(null)
  const bulkMutation = useBulkTransition()
  const { data: docTypes } = useDocumentTypes()

  useEffect(() => {
    const id = setTimeout(() => search !== get('q') && update({ q: search }), 300)
    return () => clearTimeout(id)
  }, [search]) // eslint-disable-line react-hooks/exhaustive-deps

  const query = {
    status: view.statuses,
    q: get('q') || undefined,
    document_type: get('doc') ? [Number(get('doc'))] : undefined,
    program: get('program') ? [get('program')] : undefined,
    date_from: get('from') || undefined,
    date_to: get('to') || undefined,
    overdue: get('overdue') === '1' || undefined,
    assigned: get('assigned') || undefined,
    payment: get('payment') || undefined,
    sort,
    page,
    page_size: pageSize,
  }
  const { data, isLoading, isFetching, error, refetch } = useQueue(query)
  const items = data?.items ?? []
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  // Selection only spans the current page; clear it when the result set changes.
  const pageKey = JSON.stringify(query)
  useEffect(() => setSelected(new Set()), [pageKey])

  const allChecked = items.length > 0 && items.every((i) => selected.has(i.reference_no))
  const someChecked = items.some((i) => selected.has(i.reference_no))
  const activeFilters = ['q', 'doc', 'program', 'from', 'to', 'overdue', 'assigned', 'payment'].filter((k) => get(k)).length

  function toggleSort(key) {
    update({ sort: sort === key ? `-${key}` : sort === `-${key}` ? key : `-${key}` })
  }

  async function runBulk(remarks) {
    const refs = [...selected]
    try {
      const results = await bulkMutation.mutateAsync({ refs, to_status: bulk.apiStatus, remarks })
      const ok = results.filter((r) => r.ok).length
      const failed = results.filter((r) => !r.ok)
      if (ok) toast.success(`${ok} ${ok === 1 ? 'request' : 'requests'} updated`)
      if (failed.length) {
        toast.warning(`${failed.length} skipped`, {
          description: failed.slice(0, 4).map((f) => `${f.reference_no}: ${f.error}`).join('\n'),
          duration: 8000,
        })
      }
      setSelected(new Set())
      setBulk(null)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const viewRef = get('view')

  return (
    <div className="space-y-5">
      <PageHeader title="Request queue" description="Review, process and release student requests." />

      <div role="tablist" aria-label="Queue views" className="-mx-4 flex gap-1 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0">
        {QUEUE_VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view.key === v.key}
            onClick={() => update({ tab: v.key === 'open' ? '' : v.key })}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              view.key === v.key ? 'border-primary text-link' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      <Filters get={get} update={update} search={search} setSearch={setSearch} docTypes={docTypes} activeFilters={activeFilters} />

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          {/* Desktop table */}
          <div className="relative hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Requests, {data?.total ?? 0} results. Column headers with buttons can be sorted.
              </caption>
              <thead className="border-b border-border bg-surface-muted/60 text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="w-10 py-3 pl-4">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allChecked}
                      ref={(el) => el && (el.indeterminate = someChecked && !allChecked)}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(items.map((i) => i.reference_no)) : new Set())
                      }
                    />
                  </th>
                  {COLUMNS.map((c) => {
                    const dir = sort === c.key ? 'ascending' : sort === `-${c.key}` ? 'descending' : 'none'
                    const Icon = dir === 'ascending' ? ArrowUp : dir === 'descending' ? ArrowDown : ArrowUpDown
                    return (
                      <th key={c.key} scope="col" aria-sort={c.sortable ? dir : undefined} className="px-3 py-3 whitespace-nowrap">
                        {c.sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn('inline-flex items-center gap-1 uppercase hover:text-fg', dir !== 'none' && 'text-fg')}
                          >
                            {c.label}
                            <Icon className={cn('size-3.5', dir === 'none' && 'opacity-40')} aria-hidden="true" />
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className={cn('divide-y divide-border', isFetching && !isLoading && 'opacity-70 transition-opacity')}>
                {isLoading
                  ? Array.from({ length: 8 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={COLUMNS.length + 1} className="px-4 py-3">
                          <Skeleton className="h-9 w-full" />
                        </td>
                      </tr>
                    ))
                  : items.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => update({ view: r.reference_no }, { resetPage: false })}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-surface-muted',
                          selected.has(r.reference_no) && 'bg-primary-soft hover:bg-primary-soft',
                          viewRef === r.reference_no && 'bg-primary-soft',
                        )}
                      >
                        <td className="py-3 pl-4" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label={`Select ${r.reference_no}`}
                            checked={selected.has(r.reference_no)}
                            onChange={(e) => {
                              const next = new Set(selected)
                              e.target.checked ? next.add(r.reference_no) : next.delete(r.reference_no)
                              setSelected(next)
                            }}
                          />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            className="font-mono text-[13px] font-medium text-link hover:underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              update({ view: r.reference_no }, { resetPage: false })
                            }}
                          >
                            {r.reference_no}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-fg">{r.student.full_name}</p>
                          <p className="text-xs text-muted">
                            {r.student.student_no} · {r.student.program?.code ?? '—'}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="max-w-56 truncate text-fg" title={r.document_type.name}>
                            {r.document_type.name}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted">
                            {r.copies}× ·{' '}
                            {r.delivery_method === 'courier' ? (
                              <>
                                <Truck className="size-3" aria-hidden="true" /> Courier
                              </>
                            ) : (
                              <>
                                <Package className="size-3" aria-hidden="true" /> Pick-up
                              </>
                            )}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={r.status} size="sm" />
                          {r.payment_pending && <PaymentPendingTag />}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <p className="text-fg">{formatDate(r.submitted_at)}</p>
                          <p className="text-xs text-muted">{timeAgo(r.submitted_at)}</p>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={cn('inline-flex items-center gap-1', r.is_overdue ? 'font-semibold text-danger' : 'text-fg')}>
                            {r.is_overdue && <AlarmClock className="size-3.5" aria-hidden="true" />}
                            {formatDate(r.estimated_release_date)}
                            {r.is_overdue && <span className="sr-only"> (overdue)</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {r.assigned_to ? (
                            <span
                              title={r.assigned_to.full_name}
                              className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-[11px] font-bold text-muted"
                            >
                              {initials(r.assigned_to.full_name)}
                              <span className="sr-only">{r.assigned_to.full_name}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-subtle">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="divide-y divide-border md:hidden">
            {isLoading
              ? Array.from({ length: 5 }, (_, i) => (
                  <li key={i} className="p-4">
                    <Skeleton className="h-16 w-full" />
                  </li>
                ))
              : items.map((r) => (
                  <li key={r.id} className="flex gap-3 p-4">
                    <Checkbox
                      className="mt-1"
                      aria-label={`Select ${r.reference_no}`}
                      checked={selected.has(r.reference_no)}
                      onChange={(e) => {
                        const next = new Set(selected)
                        e.target.checked ? next.add(r.reference_no) : next.delete(r.reference_no)
                        setSelected(next)
                      }}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 space-y-1.5 text-left"
                      onClick={() => update({ view: r.reference_no }, { resetPage: false })}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-[13px] font-medium text-link">{r.reference_no}</span>
                        <StatusBadge status={r.status} size="sm" />
                      </div>
                      {r.payment_pending && <PaymentPendingTag />}
                      <p className="font-medium text-fg">{r.student.full_name}</p>
                      <p className="truncate text-sm text-muted">{r.document_type.name}</p>
                      <p className={cn('text-xs', r.is_overdue ? 'font-semibold text-danger' : 'text-muted')}>
                        {r.is_overdue ? 'Overdue · ' : ''}Est. {formatDate(r.estimated_release_date)} · Submitted {timeAgo(r.submitted_at)}
                      </p>
                    </button>
                  </li>
                ))}
          </ul>

          {!isLoading && items.length === 0 && (
            <EmptyState
              icon={Inbox}
              className="m-4 border-none"
              title="Nothing here"
              description={activeFilters ? 'No requests match these filters.' : 'This queue is clear.'}
            />
          )}

          {data && data.total > 0 && (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted" aria-live="polite">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-muted">
                  Rows
                  <Select className="h-8 w-20 text-sm" value={pageSize} onChange={(e) => update({ size: e.target.value })}>
                    {[20, 50, 100].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </Select>
                </label>
                <Button variant="secondary" size="icon-sm" disabled={page <= 1} onClick={() => update({ page: page - 1 })} aria-label="Previous page">
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums text-muted">
                  {page} / {pages}
                </span>
                <Button variant="secondary" size="icon-sm" disabled={page >= pages} onClick={() => update({ page: page + 1 })} aria-label="Next page">
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-4xl rounded-2xl border border-border bg-surface p-3 shadow-pop lg:left-[276px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-auto pl-1 text-sm font-semibold text-fg">{selected.size} selected</span>
            {BULK_ACTIONS.map((a) => (
              <Button
                key={a.toStatus}
                size="sm"
                variant={a.variant ?? 'secondary'}
                onClick={() =>
                  setBulk({
                    toStatus: a.toStatus === 'approve' ? 'awaiting_payment' : a.toStatus,
                    apiStatus: a.toStatus,
                    requiresRemarks: a.requiresRemarks,
                    count: selected.size,
                    description:
                      a.toStatus === 'approve'
                        ? 'Requests with a fee move to Awaiting Payment; free ones go straight to Processing.'
                        : null,
                  })
                }
              >
                {a.label}
              </Button>
            ))}
            <Button size="icon-sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        </div>
      )}

      <TransitionDialog
        action={bulk}
        onClose={() => setBulk(null)}
        onConfirm={(remarks) => runBulk(remarks)}
        pending={bulkMutation.isPending}
      />

      <RequestPanel reference={viewRef || null} onClose={() => update({ view: '' }, { resetPage: false })} />
    </div>
  )
}

function Filters({ get, update, search, setSearch, docTypes, activeFilters }) {
  const grouped = useMemo(() => {
    const g = {}
    for (const d of docTypes ?? []) (g[d.category] ??= []).push(d)
    return g
  }, [docTypes])

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative w-full sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Reference, name, student no."
          aria-label="Search requests"
          className="h-10 pl-9"
        />
      </div>
      <Select aria-label="Document type" className="h-10 w-full sm:w-56" value={get('doc')} onChange={(e) => update({ doc: e.target.value })}>
        <option value="">All documents</option>
        {Object.entries(grouped).map(([cat, docs]) => (
          <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <Select aria-label="Program" className="h-10 w-[calc(50%-4px)] sm:w-36" value={get('program')} onChange={(e) => update({ program: e.target.value })}>
        <option value="">All programs</option>
        {PROGRAMS.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </Select>
      <Select aria-label="Assignment" className="h-10 w-[calc(50%-4px)] sm:w-40" value={get('assigned')} onChange={(e) => update({ assigned: e.target.value })}>
        <option value="">Anyone</option>
        <option value="me">Assigned to me</option>
        <option value="unassigned">Unassigned</option>
      </Select>
      <div className="flex items-center gap-1.5">
        <Input type="date" aria-label="Submitted from" className="h-10 w-[150px]" value={get('from')} onChange={(e) => update({ from: e.target.value })} />
        <span className="text-muted" aria-hidden="true">–</span>
        <Input type="date" aria-label="Submitted to" className="h-10 w-[150px]" value={get('to')} onChange={(e) => update({ to: e.target.value })} />
      </div>
      <Button
        variant={get('overdue') ? 'primary' : 'secondary'}
        className="h-10"
        aria-pressed={Boolean(get('overdue'))}
        onClick={() => update({ overdue: get('overdue') ? '' : '1' })}
      >
        <AlarmClock /> Overdue
      </Button>
      <Button
        variant={get('payment') ? 'primary' : 'secondary'}
        className="h-10"
        aria-pressed={Boolean(get('payment'))}
        onClick={() => update({ payment: get('payment') ? '' : 'pending' })}
      >
        <Wallet /> Proof to check
      </Button>
      {activeFilters > 0 && (
        <Button
          variant="ghost"
          className="h-10"
          onClick={() => {
            setSearch('')
            update({ q: '', doc: '', program: '', from: '', to: '', overdue: '', assigned: '', payment: '' })
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  )
}

function PaymentPendingTag() {
  return (
    <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-info">
      <Wallet className="size-3.5" aria-hidden="true" /> Proof to check
    </p>
  )
}
