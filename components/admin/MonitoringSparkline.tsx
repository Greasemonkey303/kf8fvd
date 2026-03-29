"use client"

import React from 'react'

type MonitoringSparklineProps = {
  values: number[]
  stroke?: string
  fill?: string
  height?: number
}

export default function MonitoringSparkline({
  values,
  stroke = '#60a5fa',
  fill = 'rgba(96,165,250,0.18)',
  height = 56,
}: MonitoringSparklineProps) {
  const normalized = values.length ? values : [0]
  const max = Math.max(...normalized, 1)
  const width = 160
  const step = normalized.length > 1 ? width / (normalized.length - 1) : width
  const points = normalized.map((value, index) => {
    const x = index * step
    const y = height - ((value / max) * (height - 8)) - 4
    return `${x},${Number.isFinite(y) ? y : height - 4}`
  }).join(' ')
  const areaPoints = `0,${height} ${points} ${width},${height}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={areaPoints} fill={fill} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}