import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

// Loaded lazily (dynamic import) from TentsPage so jsPDF + html2canvas are only
// downloaded when a guest actually asks for the confirmation PDF.

/** Rasterises the given confirmation node and saves it as an A4 PDF. */
export async function generateConfirmationPdf(node: HTMLElement, reservationId: number): Promise<void> {
  try {
    await document.fonts.ready
  } catch {
    // Font Loading API unavailable - fall back to whatever is already loaded.
  }

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
  })

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const ratio = canvas.height / canvas.width

  let w = pageW
  let h = pageW * ratio
  if (h > pageH) {
    h = pageH
    w = pageH / ratio
  }

  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pageW - w) / 2, 0, w, h)
  pdf.save(`booking-confirmation-${reservationId}.pdf`)
}
