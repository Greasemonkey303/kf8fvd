'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import styles from './HandheldRadioScene.module.css'

type DisplaySurface = {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D | null
}

type DisplayState = {
  frequencyMHz: number
  signal: number
  battery: number
  memoryLabel: string
  modeLabel: string
}

function createDisplaySurface(): DisplaySurface {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 832

  return {
    canvas,
    ctx: canvas.getContext('2d'),
  }
}

function getDisplayKey(state: DisplayState) {
  return [
    state.frequencyMHz.toFixed(3),
    state.signal.toFixed(2),
    state.battery.toFixed(2),
    state.memoryLabel,
    state.modeLabel,
  ].join('|')
}

function renderDisplay(surface: DisplaySurface, state: DisplayState) {
  const { canvas, ctx } = surface
  if (!ctx) return

  const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
  background.addColorStop(0, '#041019')
  background.addColorStop(0.58, '#0d3247')
  background.addColorStop(1, '#071521')
  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(137, 225, 255, 0.12)'
  ctx.lineWidth = 1
  for (let x = 0; x <= canvas.width; x += 38) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, canvas.height)
    ctx.stroke()
  }

  ctx.fillStyle = 'rgba(186, 242, 255, 0.9)'
  ctx.font = '700 28px Inter, Arial, sans-serif'
  ctx.fillText('V/U DUAL WATCH', 32, 52)

  ctx.fillStyle = '#b9f8ff'
  ctx.font = '700 74px Courier New, monospace'
  ctx.fillText(state.frequencyMHz.toFixed(3), 28, 164)

  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)'
  ctx.font = '600 26px Inter, Arial, sans-serif'
  ctx.fillText(`MHz   ${state.modeLabel}`, 32, 204)

  ctx.fillStyle = 'rgba(151, 255, 206, 0.96)'
  ctx.font = '700 24px Inter, Arial, sans-serif'
  ctx.fillText(`MEM ${state.memoryLabel}`, 32, 254)

  ctx.fillStyle = 'rgba(188, 239, 255, 0.88)'
  ctx.font = '600 20px Inter, Arial, sans-serif'
  ctx.fillText('KF8FVD  GRAND RAPIDS', 32, 302)

  ctx.strokeStyle = 'rgba(100, 228, 255, 0.32)'
  ctx.lineWidth = 4
  ctx.strokeRect(30, 334, 452, 148)

  ctx.fillStyle = 'rgba(0, 140, 255, 0.94)'
  ctx.font = '700 20px Inter, Arial, sans-serif'
  ctx.fillText('SIGNAL', 34, 362)

  const barCount = 7
  for (let index = 0; index < barCount; index += 1) {
    const strength = (index + 1) / barCount
    const isActive = state.signal >= strength - 0.04
    ctx.fillStyle = isActive ? 'rgba(110, 255, 170, 0.92)' : 'rgba(255, 255, 255, 0.12)'
    const height = 18 + index * 12
    ctx.fillRect(38 + index * 28, 446 - height, 18, height)
  }

  ctx.fillStyle = 'rgba(186, 242, 255, 0.94)'
  ctx.font = '700 20px Inter, Arial, sans-serif'
  ctx.fillText('BAT', 356, 362)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 4
  ctx.strokeRect(394, 338, 70, 26)
  ctx.fillStyle = 'rgba(110, 255, 170, 0.94)'
  ctx.fillRect(398, 342, Math.max(10, state.battery * 62), 18)
  ctx.fillRect(466, 346, 8, 10)

  ctx.strokeStyle = 'rgba(0, 255, 153, 0.36)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(32, 548)
  ctx.bezierCurveTo(110, 510 - state.signal * 18, 168, 576 + state.signal * 10, 246, 540 - state.signal * 12)
  ctx.bezierCurveTo(324, 500 + state.signal * 18, 384, 580 - state.signal * 14, 476, 526 + state.signal * 6)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
  ctx.font = '600 18px Inter, Arial, sans-serif'
  ctx.fillText('GPS READY', 34, 624)
  ctx.fillText('D-STAR RX STANDBY', 34, 662)

  ctx.fillStyle = 'rgba(144, 255, 208, 0.94)'
  ctx.fillText('145.670 -600', 34, 724)
  ctx.fillStyle = 'rgba(186, 242, 255, 0.88)'
  ctx.fillText('DV / FM FIELD MONITOR', 34, 764)
}

export default function HandheldRadioScene() {
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
    scene.fog = new THREE.Fog(0x071019, 5.4, 12.5)

    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 24)
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.02

    const root = new THREE.Group()
    root.rotation.set(-0.18, -0.46, 0.06)
    scene.add(root)

    const layout = {
      cameraFov: 36,
      cameraBaseY: 0.12,
      cameraBaseZ: 7.2,
      cameraOffsetX: 0.28,
      cameraOffsetY: -0.1,
      lookAtY: 0.08,
      rootScale: 0.88,
      rootBaseY: 0.02,
      floatAmplitude: 0.04,
      basePitch: -0.14,
      baseYaw: -0.34,
      yawRange: 0.2,
      pitchRange: -0.1,
    }

    const resize = () => {
      const width = Math.max(shell.clientWidth, 280)
      const height = Math.max(shell.clientHeight, 240)
      const isPhone = width < 520
      const isTablet = width < 860

      if (isPhone) {
        Object.assign(layout, {
          cameraFov: 43,
          cameraBaseY: 0.06,
          cameraBaseZ: 8.3,
          cameraOffsetX: 0.14,
          cameraOffsetY: -0.05,
          lookAtY: 0.02,
          rootScale: 0.74,
          rootBaseY: -0.02,
          floatAmplitude: 0.025,
          yawRange: 0.12,
          pitchRange: -0.06,
        })
      } else if (isTablet) {
        Object.assign(layout, {
          cameraFov: 39,
          cameraBaseY: 0.09,
          cameraBaseZ: 7.7,
          cameraOffsetX: 0.2,
          cameraOffsetY: -0.07,
          lookAtY: 0.05,
          rootScale: 0.8,
          rootBaseY: 0,
          floatAmplitude: 0.032,
          yawRange: 0.16,
          pitchRange: -0.08,
        })
      } else {
        Object.assign(layout, {
          cameraFov: 36,
          cameraBaseY: 0.12,
          cameraBaseZ: 7.2,
          cameraOffsetX: 0.28,
          cameraOffsetY: -0.1,
          lookAtY: 0.08,
          rootScale: 0.88,
          rootBaseY: 0.02,
          floatAmplitude: 0.04,
          yawRange: 0.2,
          pitchRange: -0.1,
        })
      }

      camera.fov = layout.cameraFov
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      root.scale.setScalar(layout.rootScale)
      root.position.y = layout.rootBaseY
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2))
      renderer.setSize(width, height, false)
    }
    resize()

    const ambient = new THREE.HemisphereLight(0xb8ecff, 0x091018, 1.35)
    scene.add(ambient)

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.8)
    keyLight.position.set(4.2, 5.2, 4.8)
    scene.add(keyLight)

    const rimLight = new THREE.PointLight(0x3db9ff, 7, 18, 2)
    rimLight.position.set(-2.8, 1.8, 2.4)
    scene.add(rimLight)

    const greenLight = new THREE.PointLight(0x00ff8a, 5.5, 16, 2)
    greenLight.position.set(2.2, -0.4, 3.8)
    scene.add(greenLight)

    const pedestal = new THREE.Mesh(
      track(new THREE.CylinderGeometry(1.72, 2.08, 0.16, 56)),
      track(new THREE.MeshStandardMaterial({
        color: 0x081321,
        emissive: 0x04182b,
        emissiveIntensity: 0.44,
        metalness: 0.54,
        roughness: 0.38,
      }))
    )
    pedestal.position.set(0, -1.64, 0.18)
    root.add(pedestal)

    const pedestalHalo = new THREE.Mesh(
      track(new THREE.RingGeometry(1.42, 1.62, 72)),
      track(new THREE.MeshBasicMaterial({
        color: 0x69cbff,
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
      }))
    )
    pedestalHalo.rotation.x = -Math.PI / 2
    pedestalHalo.position.set(0, -1.555, 0.18)
    root.add(pedestalHalo)

    const deviceShadow = new THREE.Mesh(
      track(new THREE.CircleGeometry(1.3, 48)),
      track(new THREE.MeshBasicMaterial({
        color: 0x02060d,
        transparent: true,
        opacity: 0.3,
      }))
    )
    deviceShadow.rotation.x = -Math.PI / 2
    deviceShadow.position.set(0, -1.54, 0.2)
    root.add(deviceShadow)

    const bodyMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x111a23,
      metalness: 0.34,
      roughness: 0.68,
    }))
    const faceMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x1c2834,
      metalness: 0.22,
      roughness: 0.48,
    }))
    const trimMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x9eb0bc,
      metalness: 0.9,
      roughness: 0.22,
    }))
    const gripMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x0d131a,
      metalness: 0.18,
      roughness: 0.8,
    }))
    const buttonMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x202d38,
      emissive: 0x09131d,
      emissiveIntensity: 0.28,
      metalness: 0.22,
      roughness: 0.58,
    }))
    const accentButtonMaterial = track(new THREE.MeshStandardMaterial({
      color: 0xf28c28,
      emissive: 0x8b3d08,
      emissiveIntensity: 0.38,
      metalness: 0.18,
      roughness: 0.32,
    }))
    const antennaMaterial = track(new THREE.MeshStandardMaterial({
      color: 0x303841,
      metalness: 0.76,
      roughness: 0.4,
    }))

    const body = new THREE.Mesh(track(new THREE.BoxGeometry(1.44, 3.04, 0.5)), bodyMaterial)
    body.position.y = -0.02
    root.add(body)

    const batteryPack = new THREE.Mesh(track(new THREE.BoxGeometry(1.14, 0.68, 0.56)), bodyMaterial)
    batteryPack.position.set(0, -1.2, -0.02)
    root.add(batteryPack)

    const shoulderCap = new THREE.Mesh(track(new THREE.BoxGeometry(1.04, 0.22, 0.42)), faceMaterial)
    shoulderCap.position.set(0, 1.5, -0.01)
    root.add(shoulderCap)

    const leftGrip = new THREE.Mesh(track(new THREE.BoxGeometry(0.09, 2.2, 0.18)), gripMaterial)
    leftGrip.position.set(-0.73, -0.04, 0.04)
    leftGrip.rotation.y = 0.09
    root.add(leftGrip)

    const rightGrip = new THREE.Mesh(track(new THREE.BoxGeometry(0.09, 2.2, 0.18)), gripMaterial)
    rightGrip.position.set(0.73, -0.04, 0.04)
    rightGrip.rotation.y = -0.09
    root.add(rightGrip)

    const frontFrame = new THREE.Mesh(track(new THREE.BoxGeometry(1.12, 2.54, 0.08)), faceMaterial)
    frontFrame.position.set(0, 0.1, 0.23)
    root.add(frontFrame)

    const frontInset = new THREE.Mesh(track(new THREE.BoxGeometry(1.02, 2.4, 0.04)), gripMaterial)
    frontInset.position.set(0, 0.08, 0.27)
    root.add(frontInset)

    const accentStrip = new THREE.Mesh(track(new THREE.BoxGeometry(0.84, 0.05, 0.02)), accentButtonMaterial)
    accentStrip.position.set(0, 1.08, 0.295)
    root.add(accentStrip)

    const displaySurface = createDisplaySurface()
    const initialDisplayState: DisplayState = {
      frequencyMHz: 146.520,
      signal: 0.66,
      battery: 0.82,
      memoryLabel: 'REF030C',
      modeLabel: 'D-STAR',
    }
    renderDisplay(displaySurface, initialDisplayState)
    let lastDisplayKey = getDisplayKey(initialDisplayState)

    const displayTexture = track(new THREE.CanvasTexture(displaySurface.canvas))
    displayTexture.colorSpace = THREE.SRGBColorSpace
    displayTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
    displayTexture.needsUpdate = true

    const displayBezel = new THREE.Mesh(track(new THREE.BoxGeometry(0.98, 1.22, 0.05)), trimMaterial)
    displayBezel.position.set(0, 0.54, 0.286)
    root.add(displayBezel)

    const displayPanel = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.86, 1.08)),
      track(new THREE.MeshBasicMaterial({
        map: displayTexture,
        color: 0xffffff,
        toneMapped: false,
      }))
    )
    displayPanel.position.set(0, 0.54, 0.318)
    root.add(displayPanel)

    const displayGlass = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.92, 1.14)),
      track(new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.06,
        roughness: 0.03,
        transparent: true,
        opacity: 0.12,
        transmission: 0.16,
      }))
    )
    displayGlass.position.set(0, 0.54, 0.332)
    root.add(displayGlass)

    const speakerGroup = new THREE.Group()
    speakerGroup.position.set(0, 1.27, 0.286)
    root.add(speakerGroup)
    const speakerBarGeometry = track(new THREE.BoxGeometry(0.09, 0.016, 0.032))
    for (let index = 0; index < 8; index += 1) {
      const bar = new THREE.Mesh(speakerBarGeometry, trimMaterial)
      bar.position.set(-0.31 + index * 0.088, 0, 0)
      speakerGroup.add(bar)
    }

    const functionKeyGeometry = track(new THREE.BoxGeometry(0.14, 0.08, 0.05))
    for (let index = 0; index < 4; index += 1) {
      const key = new THREE.Mesh(functionKeyGeometry, index === 1 ? accentButtonMaterial : buttonMaterial)
      key.position.set(-0.27 + index * 0.18, -0.16, 0.285)
      root.add(key)
    }

    const navPad = new THREE.Mesh(track(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 28)), buttonMaterial)
    navPad.rotation.x = Math.PI / 2
    navPad.position.set(0, -0.56, 0.29)
    root.add(navPad)

    const navPadAccent = new THREE.Mesh(track(new THREE.TorusGeometry(0.15, 0.018, 10, 40)), trimMaterial)
    navPadAccent.position.set(0, -0.56, 0.334)
    root.add(navPadAccent)

    const navPadCore = new THREE.Mesh(track(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 22)), accentButtonMaterial)
    navPadCore.rotation.x = Math.PI / 2
    navPadCore.position.set(0, -0.56, 0.338)
    root.add(navPadCore)

    const keypadGeometry = track(new THREE.BoxGeometry(0.15, 0.11, 0.08))
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        const isAccent = row === 0 && column === 1
        const button = new THREE.Mesh(keypadGeometry, isAccent ? accentButtonMaterial : buttonMaterial)
        button.position.set(-0.23 + column * 0.23, -0.96 - row * 0.19, 0.29)
        root.add(button)
      }
    }

    const lowerMicGeometry = track(new THREE.BoxGeometry(0.06, 0.02, 0.035))
    for (let index = 0; index < 5; index += 1) {
      const vent = new THREE.Mesh(lowerMicGeometry, trimMaterial)
      vent.position.set(-0.12 + index * 0.06, -1.44, 0.285)
      root.add(vent)
    }

    const topKnobGeometry = track(new THREE.CylinderGeometry(0.075, 0.085, 0.18, 22))
    const mainKnob = new THREE.Mesh(topKnobGeometry, trimMaterial)
    mainKnob.position.set(0.28, 1.65, 0.02)
    root.add(mainKnob)

    const mainKnobCap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 20)), gripMaterial)
    mainKnobCap.position.set(0.28, 1.74, 0.02)
    root.add(mainKnobCap)

    const subKnob = new THREE.Mesh(track(new THREE.CylinderGeometry(0.052, 0.062, 0.16, 20)), trimMaterial)
    subKnob.position.set(0.02, 1.62, 0)
    root.add(subKnob)

    const antennaGroup = new THREE.Group()
    antennaGroup.position.set(-0.43, 1.63, -0.02)
    antennaGroup.rotation.z = -0.06
    root.add(antennaGroup)

    const antennaBase = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.068, 0.22, 18)), trimMaterial)
    antennaBase.position.y = 0.08
    antennaGroup.add(antennaBase)

    const antennaMid = new THREE.Mesh(track(new THREE.CylinderGeometry(0.028, 0.036, 1.18, 16)), antennaMaterial)
    antennaMid.position.y = 0.78
    antennaGroup.add(antennaMid)

    const antennaTip = new THREE.Mesh(track(new THREE.CylinderGeometry(0.016, 0.02, 0.66, 14)), antennaMaterial)
    antennaTip.position.y = 1.72
    antennaGroup.add(antennaTip)

    const sideButtonGeometry = track(new THREE.BoxGeometry(0.075, 0.34, 0.14))
    const sideButtonUpper = new THREE.Mesh(sideButtonGeometry, accentButtonMaterial)
    sideButtonUpper.position.set(-0.79, 0.24, 0.05)
    sideButtonUpper.rotation.y = 0.14
    root.add(sideButtonUpper)

    const sideButtonLower = new THREE.Mesh(track(new THREE.BoxGeometry(0.055, 0.22, 0.1)), buttonMaterial)
    sideButtonLower.position.set(-0.77, -0.14, 0.02)
    sideButtonLower.rotation.y = 0.14
    root.add(sideButtonLower)

    const pointer = { currentX: 0, currentY: 0, targetX: 0, targetY: 0 }
    const interaction = {
      currentX: 0,
      currentY: 0,
      targetX: 0,
      targetY: 0,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0,
      dragging: false,
      pointerId: null as number | null,
    }

    const resetInteraction = () => {
      interaction.targetX = 0
      interaction.targetY = 0
    }

    const clampInteraction = (value: number, limit: number) => THREE.MathUtils.clamp(value, -limit, limit)

    const onPointerDown = (event: PointerEvent) => {
      interaction.dragging = true
      interaction.pointerId = event.pointerId
      interaction.startX = event.clientX
      interaction.startY = event.clientY
      interaction.originX = interaction.targetX
      interaction.originY = interaction.targetY
      pointer.targetX = 0
      pointer.targetY = 0
      shell.focus()
      event.preventDefault()
    }

    const onPointerMove = (event: PointerEvent) => {
      const bounds = shell.getBoundingClientRect()
      if (interaction.dragging) {
        return
      }
      const nextX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2
      const nextY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2
      pointer.targetX = THREE.MathUtils.clamp(nextX, -1, 1)
      pointer.targetY = THREE.MathUtils.clamp(nextY, -1, 1)
    }

    const onWindowPointerMove = (event: PointerEvent) => {
      if (!interaction.dragging || interaction.pointerId !== event.pointerId) {
        return
      }

      const bounds = shell.getBoundingClientRect()
      const deltaX = (event.clientX - interaction.startX) / bounds.width
      const deltaY = (event.clientY - interaction.startY) / bounds.height
      interaction.targetX = clampInteraction(interaction.originX + deltaX * 5.6, 1.6)
      interaction.targetY = clampInteraction(interaction.originY + deltaY * 3.6, 1.15)
      interaction.currentX = interaction.targetX
      interaction.currentY = interaction.targetY
    }

    const endDrag = () => {
      interaction.dragging = false
      interaction.pointerId = null
    }

    const onPointerUp = (event: PointerEvent) => {
      if (interaction.pointerId === event.pointerId) {
        endDrag()
      }
    }

    const onPointerCancel = (event: PointerEvent) => {
      if (interaction.pointerId === event.pointerId) {
        endDrag()
      }
    }

    const onPointerLeave = () => {
      if (!interaction.dragging) {
        pointer.targetX = 0
        pointer.targetY = 0
      }
    }

    const onDoubleClick = () => {
      resetInteraction()
      pointer.targetX = 0
      pointer.targetX = 0
      pointer.targetY = 0
    }

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft':
          interaction.targetX = clampInteraction(interaction.targetX - 0.24, 1.6)
          event.preventDefault()
          break
        case 'ArrowRight':
          interaction.targetX = clampInteraction(interaction.targetX + 0.24, 1.6)
          event.preventDefault()
          break
        case 'ArrowUp':
          interaction.targetY = clampInteraction(interaction.targetY - 0.2, 1.15)
          event.preventDefault()
          break
        case 'ArrowDown':
          interaction.targetY = clampInteraction(interaction.targetY + 0.2, 1.15)
          event.preventDefault()
          break
        case 'Home':
        case '0':
          resetInteraction()
          event.preventDefault()
          break
        default:
          break
      }
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    shell.addEventListener('pointermove', onPointerMove)
    shell.addEventListener('pointerleave', onPointerLeave)
    shell.addEventListener('dblclick', onDoubleClick)
    shell.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('resize', resize)

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = reducedMotionQuery.matches
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches
    }
    reducedMotionQuery.addEventListener('change', onReducedMotionChange)

    const clock = new THREE.Clock()
    let frameId = 0
    const animate = () => {
      const elapsed = clock.getElapsedTime()
      const easing = reducedMotion ? 0.04 : 0.08

      pointer.currentX = THREE.MathUtils.lerp(pointer.currentX, pointer.targetX, easing)
      pointer.currentY = THREE.MathUtils.lerp(pointer.currentY, pointer.targetY, easing)
      interaction.currentX = THREE.MathUtils.lerp(interaction.currentX, interaction.targetX, easing)
      interaction.currentY = THREE.MathUtils.lerp(interaction.currentY, interaction.targetY, easing)

      const combinedX = interaction.currentX * 1.85 + pointer.currentX * 0.24
      const combinedY = interaction.currentY * 1.55 + pointer.currentY * 0.22

      root.rotation.y = layout.baseYaw + combinedX * layout.yawRange + Math.sin(elapsed * 0.48) * 0.03
      root.rotation.x = layout.basePitch + combinedY * layout.pitchRange
      root.rotation.z = 0.06 - combinedX * 0.075
      root.position.y = reducedMotion ? layout.rootBaseY : layout.rootBaseY + Math.sin(elapsed * 0.88) * layout.floatAmplitude

      camera.position.x = combinedX * layout.cameraOffsetX * 1.22
      camera.position.y = layout.cameraBaseY + combinedY * layout.cameraOffsetY * 1.14
      camera.position.z = layout.cameraBaseZ
      camera.lookAt(0, layout.lookAtY, 0.16)

      const signal = THREE.MathUtils.clamp(0.42 + Math.max(0, Math.sin(elapsed * 1.2)) * 0.34 + Math.abs(combinedX) * 0.12, 0, 1)
      const battery = THREE.MathUtils.clamp(0.78 + Math.sin(elapsed * 0.26) * 0.06, 0.6, 1)
      const frequencyMHz = 146.52 + Math.sin(elapsed * 0.2) * 0.018 + combinedY * 0.02
      const displayState: DisplayState = {
        frequencyMHz: Number(frequencyMHz.toFixed(3)),
        signal: Number(signal.toFixed(2)),
        battery: Number(battery.toFixed(2)),
        memoryLabel: signal > 0.58 ? 'REF030C' : 'LOCAL 2M',
        modeLabel: signal > 0.52 ? 'D-STAR' : 'FM',
      }
      const nextDisplayKey = getDisplayKey(displayState)
      if (nextDisplayKey !== lastDisplayKey) {
        renderDisplay(displaySurface, displayState)
        displayTexture.needsUpdate = true
        lastDisplayKey = nextDisplayKey
      }

      mainKnob.rotation.y = elapsed * 0.36
      subKnob.rotation.y = -elapsed * 0.28
      antennaGroup.rotation.z = -0.08 + Math.sin(elapsed * 0.62) * 0.018 + combinedX * 0.016
      pedestalHalo.material.opacity = 0.1 + Math.max(0, Math.sin(elapsed * 1.2)) * 0.08
      deviceShadow.scale.x = 1 + Math.sin(elapsed * 0.88) * 0.015
      deviceShadow.scale.y = 1 + Math.sin(elapsed * 0.88 + 0.5) * 0.02

      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.cancelAnimationFrame(frameId)
      canvas.removeEventListener('pointerdown', onPointerDown)
      shell.removeEventListener('pointermove', onPointerMove)
      shell.removeEventListener('pointerleave', onPointerLeave)
      shell.removeEventListener('dblclick', onDoubleClick)
      shell.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
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
      tabIndex={0}
      role="group"
      aria-label="Interactive three-dimensional handheld radio illustration. Drag to rotate, or use arrow keys. Double-click or press Home to reset."
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </div>
  )
}