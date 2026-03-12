"use client"

import React, { useEffect, useRef } from 'react'

type Props = {
  length?: number
  value?: string
  onChange: (v: string) => void
  autoFocus?: boolean
  disabled?: boolean
  inputClassName?: string
  ariaLabel?: string
}

export default function SegmentedOtp({ length = 6, value = '', onChange, autoFocus = false, disabled = false, inputClassName = '', ariaLabel = 'Verification code' }: Props) {
  const digits = (value || '').replace(/\D/g, '').slice(0, length).split('')
  while (digits.length < length) digits.push('')

  const refs = useRef<Array<HTMLInputElement | null>>(Array(length).fill(null))

  useEffect(() => {
    refs.current = refs.current.slice(0, length)
  }, [length])

  useEffect(() => {
    if (autoFocus && refs.current[0]) refs.current[0].focus()
  }, [autoFocus])

  const setAt = (i: number, ch: string) => {
    const arr = digits.slice()
    arr[i] = ch
    onChange(arr.join(''))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, i: number) => {
    if (disabled) return
    const v = e.target.value.replace(/\D/g, '').slice(0, 1)
    setAt(i, v)
    if (v && i < length - 1) refs.current[i + 1]?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => {
    if (disabled) return
    const key = e.key
    if (key === 'Backspace') {
      if (digits[i]) {
        setAt(i, '')
      } else if (i > 0) {
        refs.current[i - 1]?.focus()
        setAt(i - 1, '')
      }
    } else if (key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus()
    } else if (key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (disabled) return
    e.preventDefault()
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, length)
    const arr = pasted.split('')
    while (arr.length < length) arr.push('')
    onChange(arr.join(''))
    const focusIndex = Math.min(pasted.length, length - 1)
    refs.current[focusIndex]?.focus()
  }

  return (
    <div role="group" aria-label={ariaLabel} onPaste={handlePaste} style={{display:'flex', justifyContent:'center'}}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          inputMode="numeric"
          pattern="\d*"
          maxLength={1}
          aria-label={`Digit ${i + 1}`}
          value={digits[i] || ''}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKeyDown(e, i)}
          disabled={disabled}
          className={inputClassName}
        />
      ))}
    </div>
  )
}
