/**
 * Extract dark ink from a paper signature. Runs entirely on device.
 * File bytes are never sent to a service or stored persistently.
 */
export async function cleanSignaturePhoto(file: File, threshold: number): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size === 0 || file.size > 8 * 1024 * 1024) {
    throw new Error('Folosește o fotografie PNG, JPEG sau WebP de maximum 8 MB.')
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight ||
        image.naturalWidth * image.naturalHeight > 25000000) {
      throw new Error('Imaginea are dimensiuni prea mari.')
    }
    const scale = Math.min(1, 1200 / image.naturalWidth, 750 / image.naturalHeight)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Procesarea fotografiei nu este disponibilă.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1
    const safeThreshold = Math.max(70, Math.min(225, threshold))
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4
        const lum = pixels.data[i] * 0.2126 + pixels.data[i+1] * 0.7152 + pixels.data[i+2] * 0.0722
        const alpha = Math.max(0, Math.min(255, (safeThreshold - lum) * 5))
        pixels.data[i] = 30
        pixels.data[i + 1] = 31
        pixels.data[i + 2] = 33
        pixels.data[i + 3] = alpha
        if (alpha > 45) {
          minX = Math.min(minX, x); minY = Math.min(minY, y)
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
        }
      }
    }
    if (maxX - minX < 8 || maxY - minY < 3) {
      throw new Error('Nu am detectat o semnătură. Decupează mai aproape sau mărește sensibilitatea.')
    }
    context.putImageData(pixels, 0, 0)
    const margin = 8
    const left = Math.max(0, minX - margin), top = Math.max(0, minY - margin)
    const width = Math.min(canvas.width - left, maxX - minX + margin * 2)
    const height = Math.min(canvas.height - top, maxY - minY + margin * 2)
    const trimmed = document.createElement('canvas')
    trimmed.width = width
    trimmed.height = height
    trimmed.getContext('2d')?.drawImage(canvas, left, top, width, height, 0, 0, width, height)
    return trimmed.toDataURL('image/png')
  } finally {
    URL.revokeObjectURL(url)
  }
}
