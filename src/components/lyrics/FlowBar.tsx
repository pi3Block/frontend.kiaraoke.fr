/**
 * @fileoverview Canvas-based vocal energy waveform — "flow bar".
 *
 * Renders a breathing waveform visualization from the singer's vocal energy.
 * Placed between the lyrics header and ScrollArea in LyricsDisplayPro.
 *
 * Visual design:
 * - Centered waveform (mirrored top/bottom) from energyHistory ring buffer
 * - Primary green color with opacity proportional to energy
 * - Left→right gradient: old data fades out, current data is bright
 * - Smooth curves via quadraticCurveTo
 * - Faint center baseline always visible (heartbeat feel)
 * - Glow effect on energy peaks (CSS box-shadow)
 *
 * Reduced motion: static horizontal bar with CSS width transition.
 * Accessibility: role="img" with descriptive aria-label.
 */

import { memo, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { FlowVisualizationState } from '@/hooks/useFlowVisualization'

interface FlowBarProps {
  flow: FlowVisualizationState
  className?: string
  reducedMotion?: boolean
}

// Drawing constants
const BAR_HEIGHT = 40
const LINE_WIDTH = 2
// oklch(0.55 0.2 145) ≈ rgb(0, 160, 60) — app's primary green
const WAVE_R = 0
const WAVE_G = 160
const WAVE_B = 60

export const FlowBar = memo(function FlowBar({
  flow,
  className,
  reducedMotion = false,
}: FlowBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const sizeRef = useRef({ w: 0, h: BAR_HEIGHT })

  // Resize canvas to match container width (pixel-perfect)
  const resizeCanvas = useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const w = rect.width
    canvas.width = w * dpr
    canvas.height = BAR_HEIGHT * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${BAR_HEIGHT}px`
    sizeRef.current = { w, h: BAR_HEIGHT }
  }, [])

  useEffect(() => {
    resizeCanvas()
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => resizeCanvas())
    observer.observe(container)
    return () => observer.disconnect()
  }, [resizeCanvas])

  // Draw waveform
  useEffect(() => {
    if (reducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const { w, h } = sizeRef.current
    if (w === 0) return

    const centerY = h / 2

    // Reset transform to avoid stacking scales
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Clear
    ctx.clearRect(0, 0, w, h)

    // Always draw a faint center baseline (visible even at 0 energy)
    ctx.strokeStyle = `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.15)`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(w, centerY)
    ctx.stroke()

    const history = flow.energyHistory
    if (history.length === 0) return

    const len = history.length
    const segW = w / len

    // Gradient: left fades → right bright
    const grad = ctx.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.05)`)
    grad.addColorStop(0.5, `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.35)`)
    grad.addColorStop(0.85, `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.7)`)
    grad.addColorStop(1, `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.95)`)

    ctx.lineWidth = LINE_WIDTH
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    const maxAmp = centerY - 2

    // Helper: draw one half of the mirrored waveform
    const drawHalf = (sign: 1 | -1) => {
      ctx.strokeStyle = grad
      ctx.beginPath()
      ctx.moveTo(0, centerY)
      for (let i = 0; i < len; i++) {
        const x = i * segW
        const y = centerY + sign * history[i] * maxAmp
        if (i === 0) {
          ctx.lineTo(x, y)
        } else {
          const px = (i - 1) * segW
          ctx.quadraticCurveTo((px + x) / 2, centerY + sign * history[i - 1] * maxAmp, x, y)
        }
      }
      ctx.stroke()
    }

    drawHalf(-1) // top
    drawHalf(1)  // bottom

    // Fill between curves (subtle glow area)
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    // Top edge
    for (let i = 0; i < len; i++) {
      const x = i * segW
      const y = centerY - history[i] * maxAmp
      if (i === 0) ctx.lineTo(x, y)
      else {
        const px = (i - 1) * segW
        ctx.quadraticCurveTo((px + x) / 2, centerY - history[i - 1] * maxAmp, x, y)
      }
    }
    // Bottom edge (reverse)
    for (let i = len - 1; i >= 0; i--) {
      const x = i * segW
      const y = centerY + history[i] * maxAmp
      if (i === len - 1) ctx.lineTo(x, y)
      else {
        const nx = (i + 1) * segW
        ctx.quadraticCurveTo((nx + x) / 2, centerY + history[i + 1] * maxAmp, x, y)
      }
    }
    ctx.closePath()

    const fill = ctx.createLinearGradient(0, 0, w, 0)
    fill.addColorStop(0, `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.02)`)
    fill.addColorStop(0.6, `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.1)`)
    fill.addColorStop(1, `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.2)`)
    ctx.fillStyle = fill
    ctx.fill()
  }, [flow.energyHistory, reducedMotion])

  // Glow intensity based on current smooth energy
  const glowIntensity = Math.round(flow.smoothEnergy * 15)

  if (reducedMotion) {
    return (
      <div
        className={cn('relative h-[40px] overflow-hidden bg-muted/10', className)}
        role="img"
        aria-label="Visualisation de l'énergie vocale"
      >
        <div
          className="absolute inset-y-1 left-0 rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${Math.round(flow.smoothEnergy * 100)}%`,
            backgroundColor: `rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.5)`,
          }}
        />
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative h-[40px] overflow-hidden bg-muted/5', className)}
      role="img"
      aria-label="Visualisation de l'énergie vocale"
      style={{
        boxShadow: glowIntensity > 3
          ? `inset 0 0 ${glowIntensity}px rgba(${WAVE_R},${WAVE_G},${WAVE_B}, 0.2)`
          : 'none',
      }}
    >
      <canvas ref={canvasRef} className="block" />
    </div>
  )
})
