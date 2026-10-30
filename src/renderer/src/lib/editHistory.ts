import type { Annotation } from './annotations'

// Session-scoped undo/redo. Reset on every document switch; never cross files.
export class EditHistory {
  private undoItems: Annotation[][] = []
  private redoItems: Annotation[][] = []
  private readonly maxEntries: number
  constructor(maxEntries = 60) { this.maxEntries = maxEntries }

  reset(): void {
    this.undoItems = []
    this.redoItems = []
  }

  record(before: Annotation[], after: Annotation[]): void {
    if (before === after) return
    this.undoItems.push(before)
    if (this.undoItems.length > this.maxEntries) this.undoItems.shift()
    this.redoItems = []
  }

  undo(current: Annotation[]): Annotation[] | null {
    const previous = this.undoItems.pop()
    if (!previous) return null
    this.redoItems.push(current)
    return previous
  }

  redo(current: Annotation[]): Annotation[] | null {
    const next = this.redoItems.pop()
    if (!next) return null
    this.undoItems.push(current)
    return next
  }

  get counts(): { undo: number; redo: number } {
    return { undo: this.undoItems.length, redo: this.redoItems.length }
  }
}
