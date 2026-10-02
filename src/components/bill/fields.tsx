/**
 * Inline-edit fields for the review screen. They save on blur or Enter and
 * revert on Escape or an invalid entry. Inputs are 16px so iOS doesn't zoom.
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { formatCents, parseDollars } from '@/lib/money'

const inputBase =
  'rounded-md border border-transparent bg-transparent px-2 py-1.5 text-base outline-none transition-colors ' +
  'hover:border-input focus:border-ring focus:bg-card disabled:hover:border-transparent'

interface MoneyFieldProps {
  cents: number | null
  onSave: (cents: number | null) => void
  label: string
  /** Empty input saves null (used for the optional "amount charged"). */
  allowEmpty?: boolean
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function MoneyField({ cents, onSave, label, allowEmpty, placeholder, disabled, className }: MoneyFieldProps) {
  const shown = cents === null ? '' : formatCents(cents)
  const [draft, setDraft] = useState(shown)
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  // Follow live updates (another device, or a save landing) unless the host is mid-edit.
  useEffect(() => {
    if (!focused.current) setDraft(shown)
  }, [shown])

  function commit() {
    focused.current = false
    const trimmed = draft.trim()
    if (trimmed === '' && allowEmpty) {
      setInvalid(false)
      if (cents !== null) onSave(null)
      return
    }
    const parsed = parseDollars(trimmed)
    if (parsed === null) {
      setInvalid(true)
      setDraft(shown)
      return
    }
    setInvalid(false)
    setDraft(formatCents(parsed))
    if (parsed !== cents) onSave(parsed)
  }

  return (
    <input
      aria-label={label}
      aria-invalid={invalid || undefined}
      inputMode="decimal"
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onFocus={(e) => {
        focused.current = true
        e.target.select()
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(shown)
          focused.current = false
          e.currentTarget.blur()
        }
      }}
      className={cn(inputBase, 'w-28 text-right font-mono tabular-nums', invalid && 'border-destructive', className)}
    />
  )
}

interface TextFieldProps {
  value: string
  onSave: (value: string) => void
  label: string
  disabled?: boolean
  className?: string
}

export function TextField({ value, onSave, label, disabled, className }: TextFieldProps) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  function commit() {
    focused.current = false
    const next = draft.trim()
    if (next === '' || next.length > 120) {
      setDraft(value)
      return
    }
    if (next !== value) onSave(next)
  }

  return (
    <input
      aria-label={label}
      value={draft}
      disabled={disabled}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(value)
          focused.current = false
          e.currentTarget.blur()
        }
      }}
      className={cn(inputBase, 'min-w-0 flex-1', className)}
    />
  )
}
