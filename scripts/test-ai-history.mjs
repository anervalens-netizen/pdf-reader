import assert from 'node:assert/strict'
import { MAX_PRIOR_MESSAGES, MAX_PRIOR_CHARS, selectAiHistory, aiEventMatchesDocument } from '../src/renderer/src/lib/aiHistory.ts'
const history=[]
for (let i=0; i<45; i++) {
  history.push({role:'user', content:'Question #'+i})
  history.push({role:'assistant', content:'Answer #'+i})
}
const selected=selectAiHistory(history)
assert.equal(selected.length,MAX_PRIOR_MESSAGES)
assert.equal(selected[0].content,'Question #36')
assert.equal(selected[selected.length-1].content,'Answer #44')
// Add 2 messages for document text and current user question: max IPC 20.
assert.ok(selected.length+2<=20)
assert.ok(selected.reduce((n,m)=>n+m.content.length,0)<=MAX_PRIOR_CHARS)
history.push({role:'user',content:'Incomplete'})
history.push({role:'assistant',content:''})
const incomplete=selectAiHistory(history)
assert.deepEqual(incomplete.slice(-2),[{role:'user',content:'Question #44'},{role:'assistant',content:'Answer #44'}])
const long=[
  {role:'user',content:'x'.repeat(20000)},
  {role:'assistant',content:'x'.repeat(20000)}
]
assert.equal(selectAiHistory(long).length,0)
console.log('OK — AI history bounded by IPC message and character limits, incomplete answers excluded')
assert.equal(aiEventMatchesDocument('jobA','jobA','pdf:first','pdf:first'),true)
assert.equal(aiEventMatchesDocument('jobA','jobA','pdf:first','pdf:second'),false)
assert.equal(aiEventMatchesDocument('jobA','jobB','pdf:first','pdf:first'),false)
assert.equal(aiEventMatchesDocument('jobA',null,'pdf:first','pdf:first'),false)
console.log('OK — stale stream deltas cannot bind to a different document')
