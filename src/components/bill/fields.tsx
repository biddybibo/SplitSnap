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
  /** Bordered at rest (item prices in the mockup) instead of borderless until hovered. */
  boxed?: boolean
  className?: string
}

export function MoneyField({ cents, onSave, label, allowEmpty, placeholder, disabled, boxed, className }: MoneyFieldProps) {
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
      className={cn(
        inputBase,
        'w-24 text-right font-mono tabular-nums',
        boxed && 'border-border bg-card',
        invalid && 'border-destructive',
        className,
      )}
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

interface HandleFieldProps {
  value: string
  onSave: (value: string) => void
  label: string
  prefix: string
  placeholder: string
}

/**
 * A pay handle without its prefix: "@maya-r" and "venmo.com/maya-r" both save as "maya-r".
 * Only letters, digits and - _ . survive, so a handle can't smuggle anything into a pay link.
 */
export function cleanHandle(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?(venmo\.com\/(u\/)?|cash\.app\/|paypal\.me\/)/i, '')
    .replace(/^[@$]/, '')
    .replace(/[^A-Za-z0-9_.-]/g, '')
    .slice(0, 30)
}

export function HandleField({ value, onSave, label, prefix, placeholder }: HandleFieldProps) {
  const [draft, setDraft] = useState(value)
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value)
  }, [value])

  function commit() {
    focused.current = false
    const next = cleanHandle(draft)
    setDraft(next)
    if (next !== value) onSave(next)
  }

  return (
    <label className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm font-medium">{label}</span>
      <span className="flex min-w-0 flex-1 items-center rounded-md border border-border bg-card focus-within:border-ring">
        <span className="pl-3 text-muted-foreground">{prefix}</span>
        <input
          aria-label={`${label} handle`}
          value={draft}
          placeholder={placeholder}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onFocus={() => {
            focused.current = true
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="min-w-0 flex-1 bg-transparent py-2 pr-3 text-base outline-none"
        />
      </span>
    </label>
  )
}
