import React from 'react'
import About from '@/containers/about/about'

export const metadata = {
  title: 'About — KF8FVD',
  description: 'About Zachary (KF8FVD) — ham radio operator, maker, and technician in Kentwood, MI.',
  openGraph: { images: ['/apts.jpg'], title: 'About — KF8FVD' }
}

export default function Page() {
  return <About />
}