const { app, BrowserWindow } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const dist = path.join(root, 'dist-web')
const sample = path.join(root, 'samples/pdf-sample.pdf')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.png':'image/png', '.ttf':'font/ttf', '.woff2':'font/woff2', '.pdf':'application/pdf', '.json':'application/json' }
async function main() {
  const server = http.createServer((req,res) => {
    const name = (req.url || '/').split('?')[0]
    const file = name === '/sample.pdf' ? sample : path.join(dist, name === '/' ? 'index.html' : name.slice(1))
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
    fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  const win = new BrowserWindow({width:390,height:844,show:true,webPreferences:{partition:`mobile-qa-${process.pid}`}})
  const evaluate = js => win.webContents.executeJavaScript(js, true)
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/`)
    for(let i=0;i<100 && !(await evaluate("!!document.querySelector('.welcome')"));i++) await delay(100)
    await evaluate(`(async()=>{const b=await (await fetch('/sample.pdf')).arrayBuffer(); const dt=new DataTransfer();dt.items.add(new File([b],'qa.pdf',{type:'application/pdf'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))})()`)
    for(let i=0;i<100 && !(await evaluate("!!document.querySelector('.page canvas')"));i++) await delay(100)
    assert(await evaluate("!!document.querySelector('.page canvas')"), 'PDF did not render')
    assert.equal(await evaluate("!!document.querySelector('.sidebar')"),false,'sidebar initially covers document')
    await evaluate("document.querySelector('[aria-label=\"Comută panoul lateral\"]').click()")
    await delay(150)
    assert(await evaluate("!!document.querySelector('.sidebar__close')"),'close button missing')
    await evaluate("document.querySelector('.sidebar__close').click()")
    await delay(150)
    assert.equal(await evaluate("!!document.querySelector('.sidebar')"),false,'close button did not close sidebar')
    await evaluate("document.querySelector('[aria-label=\"Comută panoul lateral\"]').click()")
    await delay(150)
    await evaluate("document.querySelector('.sidebar-backdrop').click()")
    await delay(150)
    assert.equal(await evaluate("!!document.querySelector('.sidebar')"),false,'backdrop did not close sidebar')
    const before=await evaluate("Number(document.querySelector('.mobile-zoom button:nth-child(2)').textContent.replace('%',''))")
    await evaluate("document.querySelector('.mobile-zoom [aria-label=\"Mărește\"]').click()")
    await delay(250)
    const after=await evaluate("Number(document.querySelector('.mobile-zoom button:nth-child(2)').textContent.replace('%',''))")
    assert(after>before,'zoom in failed')
    await evaluate(`(() => {
      const el=document.querySelector('.pagearea__scroll');
      const touch=(id,x,y)=>new Touch({identifier:id,target:el,clientX:x,clientY:y});
      const fire=(type,touches)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches,targetTouches:touches,changedTouches:touches}));
      fire('touchstart',[touch(1,100,200),touch(2,200,200)]);
      fire('touchmove',[touch(1,80,200),touch(2,220,200)]);
      fire('touchend',[]);
    })()`)
    await delay(250)
    const pinch=await evaluate("Number(document.querySelector('.mobile-zoom button:nth-child(2)').textContent.replace('%',''))")
    assert(pinch>after,'two-finger zoom failed')
    await evaluate("document.querySelector('.mobile-zoom [aria-label=\"Potrivește lățimea\"]').click()")
    await delay(250)
    const fit=await evaluate("Number(document.querySelector('.mobile-zoom button:nth-child(2)').textContent.replace('%',''))")
    assert(Math.abs(fit-before)<=1,`fit width failed: ${before}, ${fit}`)
    await evaluate("document.querySelector('[aria-label=\"Comută panoul lateral\"]').click()")
    await delay(150)
    await evaluate("document.querySelectorAll('.thumb')[3].click()")
    await delay(600)
    assert.equal(await evaluate("!!document.querySelector('.sidebar')"),false,'selecting page did not close sidebar')
    const page1=await evaluate("document.querySelector('.page-indicator__input').value")
    await delay(1200)
    const page2=await evaluate("document.querySelector('.page-indicator__input').value")
    assert.equal(page1,'4','selected page not active')
    assert.equal(page2,page1,'page changed without user interaction')
    console.log('OK — mobile sidebar close/backdrop/page selection, zoom and stable page')
  } finally { win.destroy(); server.close() }
}
app.whenReady().then(main).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)})
