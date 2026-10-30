import assert from 'node:assert/strict'
import { EditHistory } from '../src/renderer/src/lib/editHistory.ts'

const history = new EditHistory(3)
const a = [{ id: 'a' }], b = [{ id: 'a' }, { id: 'b' }], c = [{ id: 'a' }, { id: 'c' }]
history.record(a, b)
history.record(b, c)
assert.deepEqual(history.counts, { undo: 2, redo: 0 })
assert.equal(history.undo(c), b)
assert.equal(history.undo(b), a)
assert.equal(history.redo(a), b)
history.record(b, c)
assert.equal(history.redo(c), null)
history.reset()
assert.deepEqual(history.counts, { undo: 0, redo: 0 })
console.log('Annotation undo/redo and document reset: OK')
