'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import styles from './HamRadioHeroScene.module.css'

type DisplaySurface = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
}

type DisplayState = {
  frequencyMHz: number
  volume: number
  signalLevel: number
  fineOffsetKhz: number
}

function getDisplayKey(state: DisplayState) {
  return [
    state.frequencyMHz.toFixed(3),
    String(state.volume),
    state.signalLevel.toFixed(2),
    state.fineOffsetKhz.toFixed(2),
  ].join('|')
}

function createDisplaySurface(): DisplaySurface {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512

  return {
    canvas,
    ctx: canvas.getContext('2d'),
  }
}

function renderDisplay(surface: DisplaySurface, state: DisplayState) {
  const { canvas, ctx } = surface
  if (!ctx) return

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  background.addColorStop(0, '#03111f')
  background.addColorStop(0.52, '#083049')
  background.addColorStop(1, '#041421')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(70, 210, 255, 0.16)'
  ctx.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += 42) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }
  for (let y = 0; y <= canvas.height; y += 32) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(canvas.width, y)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(0, 255, 153, 0.9)'
  ctx.font = '700 34px Courier New, monospace'
  ctx.fillText('VFO A  KF8FVD', 58, 66)

  ctx.fillStyle = 'rgba(173, 245, 255, 0.96)'
  ctx.font = '700 30px Inter, Arial, sans-serif'
  ctx.fillText('ACTIVE FREQUENCY', 62, 110)

  ctx.shadowColor = 'rgba(91, 226, 255, 0.35)'
  ctx.shadowBlur = 22
  ctx.strokeStyle = 'rgba(2, 17, 31, 0.95)'
  ctx.lineWidth = 16
  ctx.fillStyle = '#b7f7ff'
  ctx.font = '700 170px Courier New, monospace'
  ctx.strokeText(state.frequencyMHz.toFixed(3), 50, 258)
  ctx.fillText(state.frequencyMHz.toFixed(3), 50, 258)
  ctx.shadowBlur = 0

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = '600 48px Inter, Arial, sans-serif'
  ctx.fillText('MHz  FT8 / SSB', 62, 328)

  ctx.fillStyle = 'rgba(144,255,208,0.95)'
  ctx.font = '600 34px Inter, Arial, sans-serif'
  ctx.fillText('QTH  KENTWOOD, MI', 62, 396)
  ctx.fillText('GRID EN72', 62, 440)

  ctx.fillStyle = 'rgba(188, 239, 255, 0.94)'
  ctx.font = '700 34px Courier New, monospace'
  ctx.fillText(`RIT ${state.fineOffsetKhz >= 0 ? '+' : '-'}${Math.abs(state.fineOffsetKhz).toFixed(2)} kHz`, 476, 394)

  ctx.fillStyle = 'rgba(0, 140, 255, 0.95)'
  ctx.fillText(`VOL ${String(state.volume).padStart(2, '0')}`, 758, 82)

  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.font = '600 24px Inter, Arial, sans-serif'
  ctx.fillText('AF GAIN', 760, 118)

  const base = 0.18 + state.signalLevel * 0.56
  const bars = [0.38, 0.52, 0.64, 0.82, 0.74, 0.9, 0.62, 0.48].map((value, index) => {
    const ripple = Math.sin(index * 0.82 + state.signalLevel * Math.PI) * 0.08
    return Math.min(1, Math.max(0.12, value * base + ripple))
  })
  bars.forEach((bar, index) => {
    const x = 736 + index * 30
    const height = 118 * bar
    ctx.fillRect(x, 218 - height, 18, height)
  })

  ctx.strokeStyle = 'rgba(0, 255, 153, 0.45)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(62, 470)
  ctx.bezierCurveTo(170, 430 - state.signalLevel * 12, 248, 502 + state.signalLevel * 8, 348, 458 - state.signalLevel * 18)
  ctx.bezierCurveTo(450, 414 + state.signalLevel * 10, 546, 496 - state.signalLevel * 10, 650, 444 + state.signalLevel * 6)
  ctx.bezierCurveTo(734, 402 - state.signalLevel * 12, 812, 458 + state.signalLevel * 7, 940, 392 - state.signalLevel * 16)
  ctx.stroke()
}

export default function HamRadioHeroScene() {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const shell = shellRef.current
    const canvas = canvasRef.current
    if (!shell || !canvas) return

    const disposables: Array<{ dispose: () => void }> = []
    const track = <T extends { dispose: () => void }>(resource: T) => {
      disposables.push(resource)
      return resource
    }

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x020b14, 7.5, 18)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 44)
    camera.position.set(0, 1.56, 7.65)

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06

    const root = new THREE.Group()
    root.position.set(0, -0.34, -0.08)
    root.rotation.set(-0.08, -0.2, 0)
    root.scale.setScalar(0.92)
    scene.add(root)

    const layout = {
      cameraFov: 38,
      cameraBaseY: 1.56,
      cameraBaseZ: 7.65,
      cameraOffsetX: 0.42,
      cameraOffsetY: -0.18,
      lookAtY: 0.42,
      lookAtZ: 0.18,
      rootBasePitch: -0.08,
      rootBaseYaw: -0.2,
      rootY: -0.34,
      rootScale: 0.92,
      floatAmplitude: 0.06,
      rootYawRange: 0.22,
      rootPitchRange: -0.1,
    }

    const resize = () => {
      const width = Math.max(shell.clientWidth, 300)
      const height = Math.max(shell.clientHeight, 220)
      const isPhone = width < 680
      const isTablet = width < 1100

      if (isPhone) {
        Object.assign(layout, {
          cameraFov: 48,
          cameraBaseY: 1.28,
          cameraBaseZ: 9.35,
          cameraOffsetX: 0.18,
          cameraOffsetY: -0.08,
          lookAtY: 0.24,
          lookAtZ: 0.14,
          rootY: -0.14,
          rootScale: 0.76,
          floatAmplitude: 0.03,
          rootYawRange: 0.12,
          rootPitchRange: -0.05,
        })
      } else if (isTablet) {
        Object.assign(layout, {
          cameraFov: 42,
          cameraBaseY: 1.42,
          cameraBaseZ: 8.4,
          cameraOffsetX: 0.3,
          cameraOffsetY: -0.12,
          lookAtY: 0.32,
          lookAtZ: 0.16,
          rootY: -0.22,
          rootScale: 0.84,
          floatAmplitude: 0.045,
          rootYawRange: 0.16,
          rootPitchRange: -0.07,
        })
      } else {
        Object.assign(layout, {
          cameraFov: 38,
          cameraBaseY: 1.56,
          cameraBaseZ: 7.65,
          cameraOffsetX: 0.42,
          cameraOffsetY: -0.18,
          lookAtY: 0.42,
          lookAtZ: 0.18,
          rootY: -0.34,
          rootScale: 0.92,
          floatAmplitude: 0.06,
          rootYawRange: 0.22,
          rootPitchRange: -0.1,
        })
      }

      camera.fov = layout.cameraFov
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      root.position.set(0, layout.rootY, -0.08)
      root.scale.setScalar(layout.rootScale)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2))
      renderer.setSize(width, height, false)
    }
    resize()

    const ambient = new THREE.HemisphereLight(0x8fe7ff, 0x02060e, 1.45)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.9)
    keyLight.position.set(5.2, 6.2, 6.5)
    scene.add(keyLight)

    const blueFill = new THREE.PointLight(0x008cff, 8, 24, 2)
    blueFill.position.set(3.8, 1.4, 2.8)
    scene.add(blueFill)

    const greenFill = new THREE.PointLight(0x00ff9d, 7.5, 22, 2)
    greenFill.position.set(-3.5, 2.4, 3.4)
    scene.add(greenFill)

    const floorPlate = new THREE.Mesh(
      track(new THREE.CylinderGeometry(3.95, 4.38, 0.18, 64)),
      track(new THREE.MeshStandardMaterial({
        color: 0x071321,
        emissive: 0x031d33,
        emissiveIntensity: 0.52,
        metalness: 0.58,
        roughness: 0.34,
      }))
    )
    floorPlate.position.set(0, -1.38, 0)
    root.add(floorPlate)

    const floorInset = new THREE.Mesh(
      track(new THREE.CylinderGeometry(3.18, 3.42, 0.04, 56)),
      track(new THREE.MeshStandardMaterial({
        color: 0x0a1624,
        emissive: 0x07253d,
        emissiveIntensity: 0.24,
        metalness: 0.42,
        roughness: 0.4,
      }))
    )
    floorInset.position.set(0, -1.255, 0)
    root.add(floorInset)

    const grid = new THREE.PolarGridHelper(3.7, 12, 5, 48, 0x1674b3, 0x10344b)
    grid.position.set(0, -1.232, 0)
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
    gridMaterials.forEach((material, index) => {
      material.transparent = true
      material.opacity = index === 0 ? 0.18 : 0.11
      material.depthWrite = false
      track(material)
    })
    track(grid.geometry)
    root.add(grid)

    const floorRing = new THREE.Mesh(
      track(new THREE.RingGeometry(3.48, 3.66, 72)),
      track(new THREE.MeshBasicMaterial({
        color: 0x67c8ff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      }))
    )
    floorRing.rotation.x = -Math.PI / 2
    floorRing.position.set(0, -1.228, 0)
    root.add(floorRing)

    const chassisMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x07101c,
      metalness: 0.72,
      roughness: 0.34,
    }))
    const panelMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x101a2f,
      metalness: 0.45,
      roughness: 0.22,
    }))
    const metalMaterial = track(new THREE.MeshStandardMaterial({
      color: 0xa8b5c6,
      metalness: 0.94,
      roughness: 0.22,
    }))
    const accentMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x1e7eff,
      emissive: 0x0d2c55,
      emissiveIntensity: 1.05,
      metalness: 0.36,
      roughness: 0.18,
    }))
    const signalButtonMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x5dffbb,
      emissive: 0x006d41,
      emissiveIntensity: 1.2,
      metalness: 0.3,
      roughness: 0.2,
    }))

    const rig = new THREE.Group()
    rig.position.set(0.12, -0.18, 0.34)
    root.add(rig)

    const rigShadow = new THREE.Mesh(
      track(new THREE.CircleGeometry(2.95, 48)),
      track(new THREE.MeshBasicMaterial({
        color: 0x02060e,
        transparent: true,
        opacity: 0.38,
      }))
    )
    rigShadow.rotation.x = -Math.PI / 2
    rigShadow.position.set(0, -0.74, 0.3)
    root.add(rigShadow)

    const chassis = new THREE.Mesh(track(new THREE.BoxGeometry(4.25, 1.45, 2.55)), chassisMaterial)
    rig.add(chassis)

    const topCap = new THREE.Mesh(track(new THREE.BoxGeometry(4.45, 0.12, 2.72)), panelMaterial)
    topCap.position.set(0, 0.78, 0)
    rig.add(topCap)

    const frontPlate = new THREE.Mesh(track(new THREE.BoxGeometry(3.7, 1.04, 0.18)), panelMaterial)
    frontPlate.position.set(-0.02, 0.02, 1.36)
    rig.add(frontPlate)

    const faceTrim = new THREE.Mesh(
      track(new THREE.BoxGeometry(3.98, 1.18, 0.06)),
      track(new THREE.MeshStandardMaterial({
        color: 0x1a2740,
        emissive: 0x06111c,
        emissiveIntensity: 0.38,
        metalness: 0.62,
        roughness: 0.24,
      }))
    )
    faceTrim.position.set(-0.02, 0.02, 1.45)
    rig.add(faceTrim)

    const displaySurface = createDisplaySurface()
    const initialDisplayState: DisplayState = {
      frequencyMHz: 14.074,
      volume: 42,
      signalLevel: 0.58,
      fineOffsetKhz: 0.14,
    }
    renderDisplay(displaySurface, initialDisplayState)
    let lastDisplayKey = getDisplayKey(initialDisplayState)

    const displayTexture = track(new THREE.CanvasTexture(displaySurface.canvas))
    displayTexture.colorSpace = THREE.SRGBColorSpace
    displayTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    displayTexture.needsUpdate = true

    const displayPanel = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.82, 0.74)),
      track(new THREE.MeshBasicMaterial({
        map: displayTexture,
        color: 0xffffff,
        toneMapped: false,
      }))
    )
    displayPanel.position.set(-0.74, 0.22, 1.54)
    rig.add(displayPanel)

    const displayGlass = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.93, 0.84)),
      track(new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.08,
        roughness: 0.03,
        transparent: true,
        opacity: 0.14,
        transmission: 0.16,
      }))
    )
    displayGlass.position.set(-0.74, 0.22, 1.57)
    rig.add(displayGlass)

    const meterGroup = new THREE.Group()
    meterGroup.position.set(-1.76, 0.64, 1.52)
    rig.add(meterGroup)

    const meterBars: THREE.Mesh[] = []
    const meterGeometry = track(new THREE.BoxGeometry(0.1, 0.18, 0.08))
    for (let index = 0; index < 9; index += 1) {
      const meter = new THREE.Mesh(meterGeometry, signalButtonMaterial)
      meter.position.set(index * 0.15, 0.18, 0)
      meter.scale.y = 0.75 + index * 0.04
      meterGroup.add(meter)
      meterBars.push(meter)
    }

    const knobRidgeGeometry = track(new THREE.BoxGeometry(0.032, 0.09, 0.068))

    const buildKnob = (radius: number, depth: number, capRadius: number, pointerLength: number, ridges: number) => {
      const knobGroup = new THREE.Group()

      const knobBody = new THREE.Mesh(
        track(new THREE.CylinderGeometry(radius * 0.92, radius, depth, 56, 1)),
        metalMaterial
      )
      knobBody.rotation.x = Math.PI / 2
      knobGroup.add(knobBody)

      const knobCap = new THREE.Mesh(
        track(new THREE.CylinderGeometry(capRadius, capRadius * 1.05, depth * 0.42, 42)),
        panelMaterial
      )
      knobCap.rotation.x = Math.PI / 2
      knobCap.position.z = depth * 0.42
      knobGroup.add(knobCap)

      const highlightRing = new THREE.Mesh(
        track(new THREE.TorusGeometry(radius * 0.82, 0.022, 12, 64)),
        track(new THREE.MeshStandardMaterial({
          color: 0xdbe9f5,
          metalness: 0.95,
          roughness: 0.12,
          emissive: 0x071521,
          emissiveIntensity: 0.2,
        }))
      )
      highlightRing.position.z = depth * 0.24
      knobGroup.add(highlightRing)

      for (let index = 0; index < ridges; index += 1) {
        const ridge = new THREE.Mesh(knobRidgeGeometry, metalMaterial)
        const angle = (index / ridges) * Math.PI * 2
        ridge.position.set(Math.cos(angle) * radius * 0.94, Math.sin(angle) * radius * 0.94, 0)
        ridge.rotation.z = angle
        ridge.rotation.x = 0.08
        knobGroup.add(ridge)
      }

      const marker = new THREE.Mesh(
        track(new THREE.BoxGeometry(0.032, pointerLength, 0.046)),
        track(new THREE.MeshStandardMaterial({
          color: 0xf8fbff,
          emissive: 0x2b78ff,
          emissiveIntensity: 0.35,
          metalness: 0.08,
          roughness: 0.16,
        }))
      )
      marker.position.set(0, pointerLength * 0.5 - radius * 0.02, depth * 0.64)
      knobGroup.add(marker)

      const markerHub = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 18)),
        accentMaterial
      )
      markerHub.rotation.x = Math.PI / 2
      markerHub.position.z = depth * 0.66
      knobGroup.add(markerHub)

      return knobGroup
    }

    const mainKnobGroup = buildKnob(0.47, 0.38, 0.18, 0.42, 26)
    mainKnobGroup.position.set(1.36, 0.1, 1.44)
    rig.add(mainKnobGroup)

    const fineKnobGroup = buildKnob(0.265, 0.3, 0.1, 0.24, 20)
    fineKnobGroup.position.set(0.8, -0.18, 1.44)
    rig.add(fineKnobGroup)

    const subKnobGroup = buildKnob(0.16, 0.24, 0.06, 0.14, 16)
    subKnobGroup.position.set(1.9, -0.22, 1.43)
    rig.add(subKnobGroup)

    const knobTickGeometry = track(new THREE.BoxGeometry(0.02, 0.07, 0.032))
    const addDialTicks = (count: number, radius: number, x: number, y: number) => {
      const dial = new THREE.Group()
      dial.position.set(x, y, 1.39)
      for (let index = 0; index < count; index += 1) {
        const tick = new THREE.Mesh(knobTickGeometry, accentMaterial)
        const angle = (index / count) * Math.PI * 1.62 - Math.PI * 0.81
        tick.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
        tick.rotation.z = angle
        dial.add(tick)
      }
      rig.add(dial)
    }

    addDialTicks(18, 0.66, 1.36, 0.1)
    addDialTicks(12, 0.4, 0.8, -0.18)

    const buttonGeometry = track(new THREE.BoxGeometry(0.14, 0.08, 0.12))
    for (let index = 0; index < 6; index += 1) {
      const button = new THREE.Mesh(buttonGeometry, signalButtonMaterial)
      button.position.set(-1.5 + index * 0.26, -0.44, 1.43)
      rig.add(button)
    }

    const sideRailGeometry = track(new THREE.BoxGeometry(0.18, 1.5, 2.5))
    const leftRail = new THREE.Mesh(sideRailGeometry, metalMaterial)
    leftRail.position.set(-2.12, 0, 0)
    rig.add(leftRail)
    const rightRail = leftRail.clone()
    rightRail.position.set(2.12, 0, 0)
    rig.add(rightRail)

    const mastGroup = new THREE.Group()
    mastGroup.position.set(-1.55, 0.5, -0.74)
    root.add(mastGroup)

    const mast = new THREE.Mesh(track(new THREE.CylinderGeometry(0.06, 0.08, 3.1, 18)), metalMaterial)
    mast.position.set(0, 1.44, 0)
    mastGroup.add(mast)

    const boom = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, 1.8, 16)), metalMaterial)
    boom.position.set(0, 2.72, 0)
    boom.rotation.z = Math.PI / 2
    mastGroup.add(boom)

    const antennaGeometry = track(new THREE.CylinderGeometry(0.018, 0.018, 0.74, 12))
    ;[-0.58, -0.2, 0.18, 0.54].forEach((x, index) => {
      const element = new THREE.Mesh(antennaGeometry, index % 2 === 0 ? accentMaterial : metalMaterial)
      element.position.set(x, 2.72, 0)
      mastGroup.add(element)
    })

    const ringGroup = new THREE.Group()
    ringGroup.position.set(0, 2.72, 0)
    mastGroup.add(ringGroup)

    const signalRings: THREE.Mesh[] = []
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(
        track(new THREE.TorusGeometry(0.62 + index * 0.28, 0.02, 14, 92)),
        track(new THREE.MeshBasicMaterial({
          color: index === 1 ? 0x6ed1ff : 0x00ff99,
          transparent: true,
          opacity: 0.22 - index * 0.03,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
        }))
      )
      ring.rotation.x = Math.PI / 2
      ring.rotation.y = 0.18 + index * 0.28
      ringGroup.add(ring)
      signalRings.push(ring)
    }

    const particles = new Float32Array(144 * 3)
    for (let index = 0; index < 144; index += 1) {
      const stride = index * 3
      const radius = 0.28 + Math.random() * 1.45
      const angle = Math.random() * Math.PI * 2
      const height = (Math.random() - 0.5) * 1.4
      particles[stride] = Math.cos(angle) * radius
      particles[stride + 1] = height
      particles[stride + 2] = Math.sin(angle) * radius
    }

    const particleGeometry = track(new THREE.BufferGeometry())
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particles, 3))

    const particleField = new THREE.Points(
      particleGeometry,
      track(new THREE.PointsMaterial({
        color: 0x8fe7ff,
        size: 0.06,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }))
    )
    particleField.position.set(0, 2.72, 0)
    mastGroup.add(particleField)

    const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0 }
    const onPointerMove = (event: PointerEvent) => {
      const bounds = shell.getBoundingClientRect()
      const nextX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
      const nextY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
      pointer.targetX = THREE.MathUtils.clamp(nextX, -1, 1)
      pointer.targetY = THREE.MathUtils.clamp(nextY, -1, 1)
    }
    const onPointerLeave = () => {
      pointer.targetX = 0
      pointer.targetY = 0
    }

    shell.addEventListener('pointermove', onPointerMove)
    shell.addEventListener('pointerleave', onPointerLeave)
    window.addEventListener('resize', resize)

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = reducedMotionQuery.matches
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches
    }
    reducedMotionQuery.addEventListener('change', onReducedMotionChange)

    const clock = new THREE.Clock()
    let frameId = 0
    const knobState = {
      main: 0.22,
      fine: -0.16,
      sub: 0.08,
    }

    const animate = () => {
      const elapsed = clock.getElapsedTime()
      const easing = reducedMotion ? 0.04 : 0.085

      pointer.currentX = THREE.MathUtils.lerp(pointer.currentX, pointer.targetX, easing)
      pointer.currentY = THREE.MathUtils.lerp(pointer.currentY, pointer.targetY, easing)

      root.rotation.y = layout.rootBaseYaw + pointer.currentX * layout.rootYawRange
      root.rotation.x = layout.rootBasePitch + pointer.currentY * layout.rootPitchRange
      root.position.y = reducedMotion ? layout.rootY : layout.rootY + Math.sin(elapsed * 0.8) * layout.floatAmplitude

      camera.position.x = pointer.currentX * layout.cameraOffsetX
      camera.position.y = layout.cameraBaseY + pointer.currentY * layout.cameraOffsetY
      camera.position.z = layout.cameraBaseZ
      camera.lookAt(0, layout.lookAtY, layout.lookAtZ)

      knobState.main = THREE.MathUtils.lerp(knobState.main, 0.14 + pointer.currentX * 0.5 + Math.sin(elapsed * 0.42) * 0.05, 0.045)
      knobState.fine = THREE.MathUtils.lerp(knobState.fine, -0.1 + pointer.currentX * 0.18 + Math.sin(elapsed * 0.78) * 0.04, 0.06)
      knobState.sub = THREE.MathUtils.lerp(knobState.sub, 0.06 - pointer.currentY * 0.16 + Math.sin(elapsed * 0.96) * 0.03, 0.05)

      const volumeLevel = THREE.MathUtils.clamp((knobState.main + 0.24) / 0.74, 0, 1)
      const volumeValue = Math.round(volumeLevel * 100)
      const frequencyValue = 14.074 + knobState.fine * 0.11
      const fineOffsetKhz = knobState.fine * 2.8
      const signalLevel = THREE.MathUtils.clamp(0.32 + volumeLevel * 0.46 + Math.abs(knobState.sub) * 0.52, 0, 1)

      const displayState: DisplayState = {
        frequencyMHz: Number(frequencyValue.toFixed(3)),
        volume: volumeValue,
        signalLevel: Number(signalLevel.toFixed(2)),
        fineOffsetKhz: Number(fineOffsetKhz.toFixed(2)),
      }
      const nextDisplayKey = getDisplayKey(displayState)
      if (nextDisplayKey !== lastDisplayKey) {
        renderDisplay(displaySurface, displayState)
        displayTexture.needsUpdate = true
        lastDisplayKey = nextDisplayKey
      }

      mainKnobGroup.rotation.z = knobState.main
      fineKnobGroup.rotation.z = knobState.fine
      subKnobGroup.rotation.z = knobState.sub
      mastGroup.rotation.y = -0.04 + Math.sin(elapsed * 0.45) * 0.06

      meterBars.forEach((bar, index) => {
        const strength = 0.48 + volumeLevel * 0.92 + Math.max(0, Math.sin(elapsed * 2.2 + index * 0.58)) * (0.5 + volumeLevel * 0.28)
        bar.scale.y = strength
        bar.position.y = 0.12 + strength * 0.08
      })

      signalRings.forEach((ring, index) => {
        const material = ring.material as THREE.MeshBasicMaterial
        const pulse = 1 + Math.sin(elapsed * 1.45 - index * 0.72) * 0.14
        ring.scale.setScalar(pulse + index * 0.05)
        ring.rotation.z += reducedMotion ? 0.001 : 0.0045 + index * 0.0008
        material.opacity = 0.12 + Math.max(0, Math.sin(elapsed * 1.45 - index * 0.72)) * 0.16
      })

      particleField.rotation.y += reducedMotion ? 0.001 : 0.0038
      particleField.rotation.x = Math.sin(elapsed * 0.44) * 0.12
      rigShadow.scale.x = 1 + Math.sin(elapsed * 0.8) * 0.015
      rigShadow.scale.y = 1 + Math.sin(elapsed * 0.8 + 0.4) * 0.02

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      shell.removeEventListener('pointermove', onPointerMove)
      shell.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', resize)
      reducedMotionQuery.removeEventListener('change', onReducedMotionChange)
      renderer.dispose()
      disposables.forEach((resource) => resource.dispose())
      scene.clear()
    }
  }, [])

  return (
    <div
      ref={shellRef}
      className={styles.shell}
      role="img"
      aria-label="Three-dimensional ham radio transceiver, mast, and signal field illustration"
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  )
}