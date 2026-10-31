// End-to-end encrypted PDF print regression. Fixture password: test-qa.
const { app, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const { PDFDocument } = require('pdf-lib')
const root=path.resolve(__dirname,'..')
const dist=path.join(root,'dist-web')
const encrypted=path.join(root,'scripts/fixtures/encrypted-qa.pdf')
const pause=ms=>new Promise(r=>setTimeout(r,ms))
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.pdf':'application/pdf','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.bcmap':'application/octet-stream','.pfb':'application/octet-stream'}
async function run(){
  const server=http.createServer((req,res)=>{
    const name=(req.url||'/').split('?')[0]
    const file=name==='/protected.pdf'?encrypted:path.join(dist,name==='/'?'index.html':name.slice(1))
    if(file!==encrypted&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return}
    res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const win=new BrowserWindow({width:1000,height:760,show:true,webPreferences:{partition:'encrypted-qa-'+process.pid}})
  const js=source=>win.webContents.executeJavaScript(source,true)
  const until=async source=>{
    for(let i=0;i<110;i++){const v=await js(source);if(v)return v;await pause(130)}
    throw Error('Timed out: '+source)
  }
  try{
    await win.loadURL('http://127.0.0.1:'+server.address().port+'/')
    await until("Boolean(document.querySelector('.welcome'))")
    const open="(async()=>{const b=await(await fetch('/protected.pdf')).arrayBuffer();const tr=new DataTransfer();tr.items.add(new File([b],'protected.pdf',{type:'application/pdf'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:tr,bubbles:true,cancelable:true}))})()"
    await js(open)
    await until("Boolean(document.querySelector('input[aria-label=\"Parola documentului\"]'))")
    // A protected PDF previously read on page 2 must not lose its session
    // while the password prompt is displayed for over one second.
    const encryptedKey = await js("document.querySelector('.titlebar__subtitle')?.textContent")
    assert.ok(encryptedKey && encryptedKey.startsWith('web:sha256:'), 'No pending encrypted document key')
    await js("(async()=>{const key="+JSON.stringify(encryptedKey)+";const db=await new Promise((ok,fail)=>{const r=indexedDB.open('pdf');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});await new Promise((ok,fail)=>{const tx=db.transaction('sessions','readwrite');tx.objectStore('sessions').put({path:key,page:2,zoom:1.25,zoomMode:'custom',scrollTop:0,updatedAt:1234});tx.oncomplete=ok;tx.onerror=()=>fail(tx.error)});db.close()})()")
    await pause(1400)
    const preserved = await js("(async()=>{const key="+JSON.stringify(encryptedKey)+";const db=await new Promise((ok,fail)=>{const r=indexedDB.open('pdf');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});const row=await new Promise((ok,fail)=>{const r=db.transaction('sessions','readonly').objectStore('sessions').get(key);r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});db.close();return row?.page===2&&row?.zoom===1.25&&row?.updatedAt===1234})()")
    assert.ok(preserved,'Password prompt overwrote previous page and zoom')
    console.log('OK: prior reading session untouched during password prompt')
    const unlock="(()=>{const n=document.querySelector('input[aria-label=\"Parola documentului\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,'test-qa');n.dispatchEvent(new Event('input',{bubbles:true}))})()"
    await js(unlock);await pause(100)
    await js("document.querySelector('.password-prompt button').click()")
    await until("Boolean(document.querySelector('.page__canvas'))")
    await until("document.querySelector('.page-indicator__input')?.value === '2'")
    assert.equal((await js("document.querySelector('.page-indicator__total')?.textContent")).trim(),'/ 3')
    console.log('OK: prior reading position restored after password unlock')
    await js("document.querySelector('button[aria-label=\"Tipărește\"]').click()")
    const printData=await until("(async()=>{const f=document.querySelector('iframe[aria-hidden=true][src^=\"blob:\"]');if(!f)return null;return [...new Uint8Array(await(await fetch(f.src)).arrayBuffer())]})()")
    const doc=await PDFDocument.load(Uint8Array.from(printData))
    assert.equal(doc.getPageCount(),3)
    console.log('OK: encrypted PDF with password raster-printed into valid 3-page unencrypted PDF')
    // Regression from Codex PR #7: PDF A must not stay bound while PDF B requests a password.
    const plain = await PDFDocument.create()
    plain.addPage([330,440])
    const encoded=Buffer.from(await plain.save()).toString('base64')
    await js("(()=>{const data=Uint8Array.from(atob('"+encoded+"'),c=>c.charCodeAt(0));const tr=new DataTransfer();tr.items.add(new File([data],'plain-a.pdf',{type:'application/pdf'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:tr,bubbles:true,cancelable:true}))})()")
    await until("document.querySelector('.page-indicator__total')?.textContent?.trim() === '/ 1'")
    await js(open)
    await until("Boolean(document.querySelector('input[aria-label=\"Parola documentului\"]'))")
    const safePending = await js("document.querySelector('button[aria-label=\"Salvează o copie\"]').disabled && document.querySelector('button[aria-label=\"Tipărește\"]').disabled && !document.querySelector('.page__canvas')")
    assert.ok(safePending,'Pending encrypted B still exposes A for save/print')
    console.log('OK: previous document invalidated before protected-file password prompt')
    const before=await js("document.querySelectorAll('iframe[aria-hidden=true][src^=\"blob:\"]').length")
    await js(unlock);await pause(100)
    await js("document.querySelector('.password-prompt button').click()")
    await until("Boolean(document.querySelector('.page__canvas'))")
    await js("document.querySelector('button[aria-label=\"Tipărește\"]').click(); document.querySelector('button[aria-label=\"Acasă\"]')?.click()")
    // Replace immediately using another protected file to invalidate the epoch.
    await js(open)
    await pause(1700)
    const after=await js("document.querySelectorAll('iframe[aria-hidden=true][src^=\"blob:\"]').length")
    assert.ok(after <= before, 'stale encrypted print continued after document change')
    console.log('OK: encrypted print cancelled on document change')
  }finally{win.destroy();server.close()}
}
app.whenReady().then(run).then(()=>app.exit(0)).catch(e=>{console.error(e);app.exit(1)})
