"use client"
import React from 'react'
import ProjectMedia from './ProjectMedia'

type Props = { images: string[]; title?: string }

export default function ProjectMediaWrapper({ images, title }: Props) {
  if (!images || images.length === 0) return null
  return <ProjectMedia images={images} title={title} />
}
