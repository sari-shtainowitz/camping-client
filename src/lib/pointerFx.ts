// Pointer-driven visual effects (presentation only).
//
// One document-level listener tracks the pointer over "glass" surfaces and
// exposes its position as CSS custom properties on the hovered element:
//   --mx / --my : pointer position inside the element, in px (for the spotlight)
//   --px / --py : the same, normalised to -1..1 from the centre (for tilt/parallax)
// The styling that uses them lives in styles.css.

const SELECTOR = '.card, .tent-card, .page-head, .review, .reviews-hero'

let installed = false

export function installPointerFx(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  let current: HTMLElement | null = null
  let frame = 0
  let lastEvent: PointerEvent | null = null

  function reset(el: HTMLElement) {
    el.style.setProperty('--px', '0')
    el.style.setProperty('--py', '0')
  }

  function apply() {
    frame = 0
    const e = lastEvent
    if (!e) return
    const target = e.target instanceof Element ? e.target : null
    const el = (target?.closest(SELECTOR) as HTMLElement | null) ?? null

    if (current && current !== el) reset(current)
    current = el
    if (!el) return

    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    el.style.setProperty('--mx', `${x}px`)
    el.style.setProperty('--my', `${y}px`)
    el.style.setProperty('--px', ((x / r.width) * 2 - 1).toFixed(3))
    el.style.setProperty('--py', ((y / r.height) * 2 - 1).toFixed(3))
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch') return
      lastEvent = e
      if (!frame) frame = requestAnimationFrame(apply)
    },
    { passive: true },
  )

  document.addEventListener('pointerleave', () => {
    if (current) reset(current)
    current = null
  })
}
