import {
  BadgeCheck,
  Ban,
  CircleCheck,
  CircleX,
  FilePen,
  LoaderCircle,
  PackageCheck,
  RotateCcw,
  Search,
  Send,
  TriangleAlert,
  Truck,
  Wallet,
} from 'lucide-react'

/**
 * Single source of truth for request statuses. Colors come from --status-* tokens (tokens.css)
 * via the data-status attribute, so badges, timeline, stepper and charts always match.
 */
export const STATUS = {
  draft: { label: 'Draft', icon: FilePen, hint: 'Not yet submitted.' },
  submitted: { label: 'Submitted', icon: Send, hint: 'Waiting for the Registrar to review.' },
  under_review: { label: 'Under Review', icon: Search, hint: 'The Registrar is checking your request.' },
  needs_correction: { label: 'Needs Correction', icon: TriangleAlert, hint: 'Please fix the items noted and resubmit.' },
  resubmitted: { label: 'Resubmitted', icon: RotateCcw, hint: 'Your corrections are waiting for review.' },
  awaiting_payment: { label: 'Awaiting Payment', icon: Wallet, hint: 'Approved. Please pay the fee.' },
  payment_verified: { label: 'Payment Verified', icon: BadgeCheck, hint: 'Payment received. Queued for processing.' },
  processing: { label: 'Processing', icon: LoaderCircle, hint: 'Your document is being prepared.' },
  ready_for_pickup: { label: 'Ready for Pick-up', icon: PackageCheck, hint: 'Claim it at the Registrar’s Office.' },
  shipped: { label: 'Shipped', icon: Truck, hint: 'On its way by courier.' },
  completed: { label: 'Completed', icon: CircleCheck, hint: 'Released. All done!' },
  rejected: { label: 'Rejected', icon: CircleX, hint: 'This request was not approved.' },
  cancelled: { label: 'Cancelled', icon: Ban, hint: 'This request was cancelled.' },
}

export const STATUS_ORDER = Object.keys(STATUS)
export const TERMINAL = ['completed', 'rejected', 'cancelled']
export const NEEDS_STUDENT_ACTION = ['draft', 'needs_correction', 'awaiting_payment', 'ready_for_pickup']
export const IN_PROGRESS = ['submitted', 'under_review', 'resubmitted', 'payment_verified', 'processing', 'shipped']

/** Simplified stages shown to students. */
export const STAGES = [
  { key: 'submitted', label: 'Submitted', statuses: ['submitted'] },
  { key: 'review', label: 'Review', statuses: ['under_review', 'needs_correction', 'resubmitted'] },
  { key: 'payment', label: 'Payment', statuses: ['awaiting_payment', 'payment_verified'] },
  { key: 'processing', label: 'Processing', statuses: ['processing'] },
  { key: 'ready', label: 'Ready', statuses: ['ready_for_pickup', 'shipped'] },
  { key: 'completed', label: 'Completed', statuses: ['completed'] },
]

export function stagesFor(requiresPayment) {
  return requiresPayment ? STAGES : STAGES.filter((s) => s.key !== 'payment')
}

/** Index of the current stage, or -1 for drafts. For rejected/cancelled, uses the last stage reached. */
export function stageIndex(status, stages, history = []) {
  let effective = status
  if (status === 'rejected' || status === 'cancelled') {
    const before = [...history].reverse().find((h) => !TERMINAL.includes(h.to_status) && h.to_status !== 'draft')
    effective = before?.to_status ?? 'submitted'
  }
  return stages.findIndex((s) => s.statuses.includes(effective))
}

export function statusColor(status) {
  if (typeof window === 'undefined') return '#64748b'
  return getComputedStyle(document.documentElement).getPropertyValue(`--status-${status}`).trim()
}

/** How each staff action (keyed by target status) is presented. */
export const STAFF_ACTIONS = {
  under_review: { label: 'Start review', variant: 'primary' },
  needs_correction: {
    label: 'Return for correction',
    variant: 'secondary',
    remarksLabel: 'What should the student fix?',
    remarksHelp: 'The student sees this message and gets an email.',
  },
  awaiting_payment: { label: 'Approve', variant: 'primary', hint: 'The student will be asked to pay the fee.' },
  payment_verified: { label: 'Mark payment verified', variant: 'primary' },
  processing: { label: 'Start processing', variant: 'primary' },
  ready_for_pickup: {
    label: 'Ready for pick-up',
    variant: 'primary',
    remarksLabel: 'Note for the student',
    remarksHelp: 'e.g., claim window or what to bring.',
  },
  shipped: { label: 'Mark shipped', variant: 'primary', remarksLabel: 'Courier and tracking number' },
  completed: { label: 'Mark released', variant: 'primary', hint: 'Use when the document was claimed or delivered.' },
  rejected: {
    label: 'Reject',
    variant: 'danger-outline',
    remarksLabel: 'Reason for rejecting',
    remarksHelp: 'The student sees this reason.',
  },
}

/** "Approve" from Under Review goes to Processing when no fee is due. */
export function staffActionLabel(toStatus, fromStatus) {
  if (toStatus === 'processing' && fromStatus === 'under_review') return 'Approve (no fee)'
  return STAFF_ACTIONS[toStatus]?.label ?? STATUS[toStatus]?.label
}

/** Queue presets shown as tabs. */
export const QUEUE_VIEWS = [
  { key: 'open', label: 'All open', statuses: ['submitted', 'resubmitted', 'under_review', 'needs_correction', 'awaiting_payment', 'payment_verified', 'processing', 'ready_for_pickup', 'shipped'] },
  { key: 'new', label: 'To review', statuses: ['submitted', 'resubmitted'] },
  { key: 'review', label: 'In review', statuses: ['under_review', 'needs_correction'] },
  { key: 'payment', label: 'Payment', statuses: ['awaiting_payment', 'payment_verified'] },
  { key: 'processing', label: 'Processing', statuses: ['processing'] },
  { key: 'release', label: 'For release', statuses: ['ready_for_pickup', 'shipped'] },
  { key: 'closed', label: 'Closed', statuses: ['completed', 'rejected', 'cancelled'] },
  { key: 'all', label: 'All', statuses: [] },
]
