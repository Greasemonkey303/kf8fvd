import { describe, expect, it } from 'vitest'
import { parseByteRange } from '@/app/api/uploads/get/[...key]/route'

describe('media byte ranges', () => {
  it('parses bounded and open-ended ranges', () => {
    expect(parseByteRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19, length: 10 })
    expect(parseByteRange('bytes=90-', 100)).toEqual({ start: 90, end: 99, length: 10 })
  })

  it('parses suffix ranges', () => {
    expect(parseByteRange('bytes=-10', 100)).toEqual({ start: 90, end: 99, length: 10 })
  })

  it('rejects malformed and unsatisfiable ranges', () => {
    expect(parseByteRange('bytes=100-110', 100)).toBeNull()
    expect(parseByteRange('bytes=20-10', 100)).toBeNull()
    expect(parseByteRange('bytes=0-1,4-5', 100)).toBeNull()
  })
})
