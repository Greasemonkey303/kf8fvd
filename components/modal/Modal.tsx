"use client"

import React, { useEffect, useRef } from 'react'

type Props = {
  children: React.ReactNode
  onClose?: () => void
  overlayClassName?: string
  contentClassName?: string
  initialFocusRef?: React.RefObject<HTMLElement>
  titleId?: string
  descriptionId?: string
}

export default function Modal({ children, onClose, overlayClassName, contentClassName, initialFocusRef, titleId, descriptionId }: Props) {
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const focusableSelector = 'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

  useEffect(() => {
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : undefined
    try { if (typeof document !== 'undefined') document.body.style.overflow = 'hidden' } catch {}
    const content = contentRef.current
    const previouslyFocused = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null

    // move focus into the modal
    setTimeout(() => {
      if (initialFocusRef && initialFocusRef.current) {
        try { initialFocusRef.current.focus() } catch {}
      } else if (content) {
        const node = content.querySelector(focusableSelector) as HTMLElement | null
        if (node) node.focus()
        else content.focus()
      }
    }, 0)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose?.()
        return
      }
      if (e.key === 'Tab') {
        if (!content) return
        const focusable = Array.from(content.querySelectorAll(focusableSelector)) as HTMLElement[]
        if (focusable.length === 0) {
          e.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      try { if (typeof document !== 'undefined') document.body.style.overflow = prevOverflow || '' } catch {}
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        try { previouslyFocused.focus() } catch {}
      }
    }
  }, [initialFocusRef, onClose])

  return (
    <div ref={overlayRef} className={overlayClassName || ''} onClick={() => onClose && onClose()} role="presentation">
      <div ref={contentRef} className={contentClassName || ''} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
        {children}
      </div>
    </div>
  )
}
