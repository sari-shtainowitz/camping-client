import { useEffect, useRef } from 'react'

const MAX_EMBERS = 40
const MIN_INTERVAL_MS = 35

// Little campfire embers that rise from the mouse pointer and fade out.
// Decorative only: drawn in a fixed, click-through layer with plain DOM nodes
// (no React state per spark). Off for touch input and for reduced motion.
export function EmberTrail() {
  const layerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let last = 0
    function onMove(e: PointerEvent) {
      if (!layer || e.pointerType === 'touch') return
      const now = performance.now()
      if (now - last < MIN_INTERVAL_MS || layer.childElementCount >= MAX_EMBERS) return
      last = now

      const spark = document.createElement('span')
      spark.className = 'ember'
      const size = 3 + Math.random() * 4
      spark.style.left = `${e.clientX}px`
      spark.style.top = `${e.clientY}px`
      spark.style.width = `${size}px`
      spark.style.height = `${size}px`
      spark.style.setProperty('--dx', `${(Math.random() * 2 - 1) * 22}px`)
      spark.style.setProperty('--rise', `${40 + Math.random() * 50}px`)
      spark.addEventListener('animationend', () => spark.remove(), { once: true })
      // Backup: animationend never fires while the tab is hidden, and the
      // MAX_EMBERS cap would then stop the trail for good.
      window.setTimeout(() => spark.remove(), 1200)
      layer.appendChild(spark)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      layer.replaceChildren()
    }
  }, [])

  return <div ref={layerRef} className="ember-layer" aria-hidden="true" />
}
