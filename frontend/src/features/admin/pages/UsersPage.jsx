import { Download, FileUp, KeyRound, Lock, MoreHorizontal, Pencil, Power, Search, ShieldCheck, Unlock, UserPlus, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { FormField } from '@/components/shared/FormField'
import { EmptyState, ErrorState, PageHeader } from '@/components/shared/misc'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Alert } from '@/components/ui/alert'
import { Input, Select } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog, Pager, SetupLinkNotice } from '@/features/admin/components'
import { useCreateStaff, useImportStudents, useSendPasswordLink, useUnlockUser, useUpdateUser, useUsers } from '@/features/admin/api'
import { useAuth } from '@/lib/auth'
import { apiError, errorMessage } from '@/lib/errors'
import { cn, formatDateTime, timeAgo } from '@/lib/utils'

const ROLE = {
  admin: { label: 'Admin', className: 'bg-accent-soft text-accent-800 dark:text-accent-200' },
  staff: { label: 'Staff', className: 'bg-primary-soft text-link' },
  student: { label: 'Student', className: 'bg-surface-muted text-muted' },
}

export function UsersPage() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)
  const [dialog, setDialog] = useState(null) // { type: 'create' | 'edit' | 'deactivate' | 'import', user? }
  const [link, setLink] = useState(null)
  const pageSize = 20

  useEffect(() => {
    const id = setTimeout(() => {
      setQ(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(id)
  }, [search])

  const { data, isLoading, error, refetch } = useUsers({ q: q || undefined, role: role || undefined, state: state || undefined, page, page_size: pageSize })
  const unlock = useUnlockUser()
  const sendLink = useSendPasswordLink()
  const update = useUpdateUser()

  async function run(promise, success) {
    try {
      const out = await promise
      toast.success(success)
      if (out?.setup_link) setLink(out.setup_link)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Staff and admin accounts, plus student sign-in status. Student names and numbers come from the Registrar’s records."
        actions={
          <>
            <Button variant="secondary" onClick={() => setDialog({ type: 'import' })}>
              <FileUp /> Import students
            </Button>
            <Button onClick={() => setDialog({ type: 'create' })}>
              <UserPlus /> Add staff
            </Button>
          </>
        }
      />

      <SetupLinkNotice link={link} />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search users"
            placeholder="Name, email, student or employee no."
            className="h-10 pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select aria-label="Role" className="h-10 w-36" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
          <option value="">All roles</option>
          <option value="admin">Admins</option>
          <option value="staff">Staff</option>
          <option value="student">Students</option>
        </Select>
        <Select aria-label="Status" className="h-10 w-36" value={state} onChange={(e) => { setState(e.target.value); setPage(1) }}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
          <option value="locked">Locked out</option>
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Card className="overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Users</caption>
              <thead className="border-b border-border bg-surface-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Name</th>
                  <th scope="col" className="px-3 py-3">Role</th>
                  <th scope="col" className="px-3 py-3">ID</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Last sign-in</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading
                  ? Array.from({ length: 8 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <Skeleton className="h-9" />
                        </td>
                      </tr>
                    ))
                  : data.items.map((u) => (
                      <tr key={u.id} className={cn(!u.is_active && 'text-muted')}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-fg">
                            {u.display_name}
                            {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                          </p>
                          <p className="text-xs text-muted">{u.email}</p>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', ROLE[u.role].className)}>
                            {ROLE[u.role].label}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-mono text-xs text-fg">{u.student_no ?? u.employee_no ?? '—'}</p>
                          <p className="text-xs text-muted">{u.program ?? u.position ?? ''}</p>
                        </td>
                        <td className="px-3 py-3">
                          {!u.is_active ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted">
                              <Power className="size-3.5" aria-hidden="true" /> Deactivated
                            </span>
                          ) : u.is_locked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-danger">
                              <Lock className="size-3.5" aria-hidden="true" /> Locked out
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                              <ShieldCheck className="size-3.5" aria-hidden="true" /> Active
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted" title={u.last_login_at ? formatDateTime(u.last_login_at) : undefined}>
                          {u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.display_name}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {u.role !== 'student' && (
                                <DropdownMenuItem onSelect={() => setDialog({ type: 'edit', user: u })}>
                                  <Pencil /> Edit
                                </DropdownMenuItem>
                              )}
                              {u.is_locked && (
                                <DropdownMenuItem onSelect={() => run(unlock.mutateAsync(u.id), `${u.display_name} can sign in again`)}>
                                  <Unlock /> Unlock sign-in
                                </DropdownMenuItem>
                              )}
                              {u.is_active && (
                                <DropdownMenuItem onSelect={() => run(sendLink.mutateAsync(u.id), `Password link sent to ${u.email}`)}>
                                  <KeyRound /> Send password link
                                </DropdownMenuItem>
                              )}
                              {u.id !== me.id && (
                                <>
                                  <DropdownMenuSeparator />
                                  {u.is_active ? (
                                    <DropdownMenuItem className="text-danger [&_svg]:text-danger" onSelect={() => setDialog({ type: 'deactivate', user: u })}>
                                      <Power /> Deactivate
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onSelect={() => run(update.mutateAsync({ id: u.id, body: { is_active: true } }), `${u.display_name} reactivated`)}>
                                      <Power /> Reactivate
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          {!isLoading && data.items.length === 0 && (
            <EmptyState icon={Users} className="m-4 border-none" title="No users match" description="Try a different search or filter." />
          )}
          {data && <Pager page={page} pageSize={pageSize} total={data.total} onPage={setPage} />}
        </Card>
      )}

      <StaffDialog
        open={dialog?.type === 'create' || dialog?.type === 'edit'}
        user={dialog?.type === 'edit' ? dialog.user : null}
        isSelf={dialog?.user?.id === me.id}
        onClose={() => setDialog(null)}
        onCreated={(out) => setLink(out.setup_link)}
      />
      <StudentImportDialog open={dialog?.type === 'import'} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog?.type === 'deactivate'}
        title={`Deactivate ${dialog?.user?.display_name ?? ''}?`}
        description="They’re signed out everywhere and can’t sign in until reactivated. Their requests and history stay as they are."
        confirmLabel="Deactivate"
        danger
        pending={update.isPending}
        onCancel={() => setDialog(null)}
        onConfirm={async () => {
          await run(update.mutateAsync({ id: dialog.user.id, body: { is_active: false } }), `${dialog.user.display_name} deactivated`)
          setDialog(null)
        }}
      />
    </div>
  )
}

function StaffDialog({ open, user, isSelf, onClose, onCreated }) {
  const create = useCreateStaff()
  const update = useUpdateUser()
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setForm(
      user
        ? { first_name: user.first_name ?? '', last_name: user.last_name ?? '', position: user.position ?? '', role: user.role }
        : { email: '', first_name: '', last_name: '', employee_no: '', position: '', role: 'staff' },
    )
  }, [open, user])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const pending = create.isPending || update.isPending

  async function onSubmit(e) {
    e.preventDefault()
    try {
      if (user) {
        await update.mutateAsync({ id: user.id, body: isSelf ? { ...form, role: undefined } : form })
        toast.success('Changes saved')
      } else {
        const out = await create.mutateAsync({ ...form, position: form.position || null })
        toast.success(`Account created. A link to set a password was emailed to ${out.user.email}.`)
        onCreated(out)
      }
      onClose()
    } catch (err) {
      const { details = [], message } = apiError(err)
      const byField = Object.fromEntries(details.filter((d) => d.field).map((d) => [d.field, d.message]))
      setErrors(byField)
      if (!Object.keys(byField).length) toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>{user ? `Edit ${user.display_name}` : 'Add a staff member'}</DialogTitle>
        <DialogDescription>
          {user ? user.email : 'They’ll get an email with a link to set their password (valid for 72 hours).'}
        </DialogDescription>
        <form id="staff-form" onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
          {!user && (
            <FormField label="University email" required error={errors.email}>
              <Input type="email" autoComplete="off" value={form.email ?? ''} onChange={(e) => set({ email: e.target.value })} />
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" required error={errors.first_name}>
              <Input value={form.first_name ?? ''} maxLength={100} onChange={(e) => set({ first_name: e.target.value })} />
            </FormField>
            <FormField label="Last name" required error={errors.last_name}>
              <Input value={form.last_name ?? ''} maxLength={100} onChange={(e) => set({ last_name: e.target.value })} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {!user && (
              <FormField label="Employee no." required error={errors.employee_no}>
                <Input value={form.employee_no ?? ''} maxLength={20} className="font-mono" onChange={(e) => set({ employee_no: e.target.value })} />
              </FormField>
            )}
            <FormField label="Position" error={errors.position}>
              <Input value={form.position ?? ''} maxLength={100} onChange={(e) => set({ position: e.target.value })} />
            </FormField>
          </div>
          <FormField
            label="Access"
            required
            help={isSelf ? 'You can’t change your own access.' : 'Admins can also manage settings, users, reports and audit logs.'}
          >
            <Select value={form.role ?? 'staff'} disabled={isSelf} onChange={(e) => set({ role: e.target.value })}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </Select>
          </FormField>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="staff-form" loading={pending}>
            {user ? 'Save changes' : 'Create account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const IMPORT_TEMPLATE =
  'student_no,email,first_name,middle_name,last_name,suffix,program,year_level,birthdate,contact_no\n' +
  '2026-10001,juan.santos@tua.edu.ph,Juan,Reyes,Santos,,BSIT,1,2007-05-21,09171234567\n'
const IMPORT_STATUS = {
  create: { label: 'New', className: 'bg-success-soft text-success' },
  skip: { label: 'Already registered', className: 'bg-surface-muted text-muted' },
  error: { label: 'Fix needed', className: 'bg-danger-soft text-danger' },
}
const IMPORT_ORDER = { error: 0, skip: 1, create: 2 }
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: 'student-import-template.csv' })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Upload an enrollment list, check the preview, then create the accounts. */
function StudentImportDialog({ open, onClose }) {
  const importer = useImportStudents()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setPreview(null)
    setError(null)
  }, [open])

  async function choose(f) {
    if (!f) return
    setFile(f)
    setPreview(null)
    setError(null)
    try {
      setPreview(await importer.mutateAsync({ file: f, confirm: false }))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  async function confirm() {
    try {
      const out = await importer.mutateAsync({ file, confirm: true })
      toast.success(`${plural(out.to_create, 'student account', 'student accounts')} created. Each student was emailed a link to set a password.`)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  // Problems first, so the admin sees what needs fixing without scrolling.
  const rows = preview ? [...preview.rows].sort((a, b) => IMPORT_ORDER[a.status] - IMPORT_ORDER[b.status] || a.line - b.line) : []

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Import students</DialogTitle>
        <DialogDescription>
          Upload the enrollment list as a CSV file. Each new student gets an email with a link to set their password (valid
          for 72 hours). Students who already have an account are skipped, so you can upload the same list again.
        </DialogDescription>

        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-border bg-surface-muted/50 p-4 text-sm">
            <p className="text-fg">
              Required columns: <code className="font-mono text-xs">student_no, email, first_name, last_name</code>
            </p>
            <p className="mt-1 text-muted">
              Optional: <code className="font-mono text-xs">middle_name, suffix, program, year_level, birthdate, contact_no</code>.
              Program is the code from the catalog (for example BSIT). Write birth dates as YYYY-MM-DD.
            </p>
            <Button variant="ghost" size="sm" className="-ml-2 mt-2" onClick={downloadTemplate}>
              <Download /> Download template
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                choose(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Button variant="secondary" loading={importer.isPending && !preview} onClick={() => inputRef.current?.click()}>
              <FileUp /> {file ? 'Choose another file' : 'Choose CSV file'}
            </Button>
            {file && <span className="min-w-0 truncate text-sm text-muted">{file.name}</span>}
          </div>

          {error && (
            <Alert tone="danger" title="Couldn’t import this file">
              {error}
            </Alert>
          )}

          {preview && (
            <>
              <p className="text-sm text-fg" role="status">
                <strong>{plural(preview.to_create, 'new account', 'new accounts')}</strong> · {preview.skipped} already
                registered · {plural(preview.errors, 'row needs', 'rows need')} fixing
              </p>
              {preview.errors > 0 && (
                <Alert tone="warning" title="Some rows have problems">
                  You can create the other accounts now, then fix those rows in the file and upload it again.
                </Alert>
              )}
              {rows.length > 0 && (
                <div className="max-h-72 overflow-auto rounded-xl border border-border">
                  <table className="w-full min-w-[560px] text-sm">
                    <caption className="sr-only">Rows in the file</caption>
                    <thead className="sticky top-0 border-b border-border bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2">Line</th>
                        <th scope="col" className="px-3 py-2">Student</th>
                        <th scope="col" className="px-3 py-2">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rows.map((r) => (
                        <tr key={r.line}>
                          <td className="px-3 py-2 align-top font-mono text-xs text-muted">{r.line}</td>
                          <td className="px-3 py-2 align-top">
                            <p className="font-medium text-fg">{r.name || '—'}</p>
                            <p className="text-xs text-muted">
                              <span className="font-mono">{r.student_no || '—'}</span> · {r.email || '—'}
                            </p>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', IMPORT_STATUS[r.status].className)}>
                              {IMPORT_STATUS[r.status].label}
                            </span>
                            {r.messages.map((m) => (
                              <p key={m} className="mt-1 text-xs text-muted">
                                {m}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!preview?.to_create} loading={importer.isPending && Boolean(preview)} onClick={confirm}>
            {preview?.to_create ? `Create ${plural(preview.to_create, 'account', 'accounts')}` : 'Create accounts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
