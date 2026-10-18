import { ArrowRight, Clock, FileText, Paperclip, Search, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { CATEGORY_LABELS, useDocumentTypes } from '@/features/catalog/api'
import { cn, formatPeso } from '@/lib/utils'

export function feeLabel(doc) {
  if (!doc.requires_payment || Number(doc.base_fee) === 0) return 'Free'
  return `${formatPeso(doc.base_fee)}${doc.fee_per_copy ? ' / copy' : ''}`
}

const TABS = [{ key: 'all', label: 'All' }, ...Object.entries(CATEGORY_LABELS).map(([key, label]) => ({ key, label }))]

export function CatalogPage() {
  const { data, isLoading, error, refetch } = useDocumentTypes()
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data ?? []).filter(
      (d) =>
        (tab === 'all' || d.category === tab) &&
        (!needle || d.name.toLowerCase().includes(needle) || d.description.toLowerCase().includes(needle)),
    )
  }, [data, q, tab])

  return (
    <div className="space-y-6">
      <PageHeader
        title="New request"
        description="Choose the document or form you need. You’ll see the fee, requirements and processing time before you submit."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Document categories" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-muted p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                tab === t.key ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search documents"
            aria-label="Search documents"
            className="pl-9"
          />
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-4 h-8 w-1/3" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No matching documents" description="Try a different search or category." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <li key={doc.id}>
              <DocTypeCard doc={doc} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DocTypeCard({ doc }) {
  const required = doc.required_attachments.filter((a) => a.required).length
  return (
    <Card className="group relative flex h-full flex-col p-5 transition-shadow duration-150 hover:shadow-pop">
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{CATEGORY_LABELS[doc.category]}</p>
      <h2 className="mt-1.5 font-semibold text-fg">
        <Link to={`/requests/new/${doc.slug}`} className="after:absolute after:inset-0 after:rounded-2xl focus:outline-none">
          {doc.name}
        </Link>
      </h2>
      <p className="mt-1.5 line-clamp-2 text-sm text-muted">{doc.description}</p>
      <ul className="mt-4 space-y-1.5 text-[13px] text-muted">
        <li className="flex items-center gap-2">
          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
          About {doc.processing_days} working {doc.processing_days === 1 ? 'day' : 'days'}
        </li>
        <li className="flex items-center gap-2">
          <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
          {required === 0 ? 'No required attachments' : `${required} required ${required === 1 ? 'attachment' : 'attachments'}`}
        </li>
        {doc.allow_courier && (
          <li className="flex items-center gap-2">
            <Truck className="size-3.5 shrink-0" aria-hidden="true" />
            Pick-up or courier
          </li>
        )}
      </ul>
      <div className="mt-auto flex items-center justify-between pt-5">
        <span className={cn('text-base font-semibold', feeLabel(doc) === 'Free' ? 'text-success' : 'text-fg')}>{feeLabel(doc)}</span>
        <span className="flex items-center gap-1 text-sm font-semibold text-link">
          Request <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </Card>
  )
}
