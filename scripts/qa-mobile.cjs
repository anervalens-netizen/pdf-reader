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
    for(let i=0;i<200 && !(await evaluate("!!document.querySelector('.welcome')"));i++) await delay(100)
    // Regression: Android/PWA overflow is actionable, not decorative.
    assert(await evaluate("!!document.querySelector('[aria-label=\"Meniu PDF\"]')"), 'mobile menu button missing')
    await evaluate("document.querySelector('[aria-label=\"Meniu PDF\"]').click()")
    assert(await evaluate("document.querySelector('.app-menu__popup--mobile')?.textContent.includes('Preferințe')"), 'mobile menu did not open')
    // Escape uses the exact menu-dismiss callback consulted by Android Back.
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")
    await delay(75)
    assert.equal(await evaluate("!!document.querySelector('.app-menu__popup--mobile')"),false,'Back did not dismiss overflow')
    assert(await evaluate("!!document.querySelector('.welcome')"),'Back exited welcome instead of dismissing menu')
    await evaluate("document.querySelector('[aria-label=\"Meniu PDF\"]').click()")
    await evaluate("[...document.querySelectorAll('.app-menu__item')].find(b=>b.textContent.trim()==='Preferințe…').click()")
    assert(await evaluate("!!document.querySelector('[aria-label=\"Preferințe PDF\"]')"), 'preferences modal missing')
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")
    await delay(75)
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Preferințe PDF\"]')"),false,'Back did not dismiss Preferences')
    assert(await evaluate("!!document.querySelector('.welcome')"),'Back exited welcome instead of dismissing Preferences')
    await evaluate("document.querySelector('[aria-label=\"Meniu PDF\"]').click()")
    await evaluate("[...document.querySelectorAll('.app-menu__item')].find(b=>b.textContent.trim()==='Preferințe…').click()")
    await evaluate("document.querySelectorAll('input[name=pdf-theme]')[2].click()")
    await evaluate("document.querySelector('.app-menu__modal .btn--primary').click()")
    await evaluate("document.querySelector('[aria-label=\"Meniu PDF\"]').click()")
    await evaluate("[...document.querySelectorAll('.app-menu__item')].find(b=>b.textContent.trim()==='Despre PDF').click()")
    assert(await evaluate("document.querySelector('[aria-label=\"Despre PDF\"]')?.textContent.includes('Versiune')"), 'about modal missing')
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")
    await delay(75)
    assert.equal(await evaluate("!!document.querySelector('[aria-label=\"Despre PDF\"]')"),false,'Back did not dismiss About')
    console.log('OK — mobile overflow, Preferences and About dismiss before exiting welcome')
    await evaluate(`(async()=>{const b=await (await fetch('/sample.pdf')).arrayBuffer(); const dt=new DataTransfer();dt.items.add(new File([b],'qa.pdf',{type:'application/pdf'}));window.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))})()`)
    for(let i=0;i<300 && !(await evaluate("!!document.querySelector('.page canvas')"));i++) await delay(100)
    if (!(await evaluate("!!document.querySelector('.page canvas')"))) {
      const state = await evaluate("({welcome:!!document.querySelector('.welcome'),error:document.querySelector('.welcome__card--error')?.textContent,loader:document.querySelector('.loader')?.textContent,preview:document.body.textContent.slice(0,350)})")
      throw new Error('PDF did not render: ' + JSON.stringify(state))
    }
    await evaluate("document.querySelector('[aria-label=\"Meniu PDF\"]').click()")
    await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")
    await delay(75)
    assert.equal(await evaluate("!!document.querySelector('.app-menu__popup--mobile')"),false,'Back did not close menu over PDF')
    assert(await evaluate("!!document.querySelector('.page canvas')"),'Back closed underlying PDF before menu')
    for (const [entry, modal] of [['Preferințe…', 'Preferințe PDF'], ['Despre PDF', 'Despre PDF']]) {
      await evaluate("document.querySelector('[aria-label=\"Meniu PDF\"]').click()")
      await evaluate(`([...document.querySelectorAll('.app-menu__item')].find(b => b.textContent.trim() === ${JSON.stringify(entry)})).click()`)
      assert(await evaluate(`!!document.querySelector('[aria-label=${JSON.stringify(modal)}]')`), `${entry} did not open over PDF`)
      await evaluate("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))")
      await delay(75)
      assert.equal(await evaluate(`!!document.querySelector('[aria-label=${JSON.stringify(modal)}]')`),false, `Back did not close ${modal}`)
      assert(await evaluate("!!document.querySelector('.page canvas')"), `Back closed PDF instead of ${modal}`)
    }
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
    // Codex regression: swapping to photo and back must retain drawn ink.
    await evaluate("document.querySelector('button[aria-label=Semnătură]').click()")
    await delay(120)
    const position = await evaluate("(() => {const r=document.querySelector('.signature-canvas').getBoundingClientRect();return {x:Math.round(r.left+35),y:Math.round(r.top+40)}})()")
    win.webContents.sendInputEvent({type:'mouseDown',x:position.x,y:position.y,button:'left',clickCount:1})
    win.webContents.sendInputEvent({type:'mouseMove',x:position.x+58,y:position.y+10})
    win.webContents.sendInputEvent({type:'mouseUp',x:position.x+58,y:position.y+10,button:'left'})
    await delay(180)
    const savedInk = await evaluate("document.querySelector('.signature-canvas').toDataURL()")
    const switchToPhoto = "(()=>{const b=[...document.querySelectorAll('button')].find(n=>n.textContent?.trim()==='Din fotografie');const f=document.querySelector('input[accept^=image]');f.click=()=>{};b.click();return !!document.querySelector('.signature-photo')})()"
    await evaluate(switchToPhoto)
    await delay(130)
    assert(await evaluate("Boolean(document.querySelector('.signature-photo'))"),'photo tab did not open')
    await evaluate("[...document.querySelectorAll('button')].find(n=>n.textContent?.trim()==='Desenează').click()")
    const restoredInk = await evaluate("document.querySelector('.signature-canvas').toDataURL()")
    assert.equal(restoredInk,savedInk,'drawn signature was destroyed on mode switch')
    assert.equal(await evaluate("!!document.querySelector('[aria-label=Semnătură] .btn--primary')"),true)
    console.log('OK — signature drawing preserved across mode switch')

    // Transparent PNG regression: source alpha=0 must stay transparent.
    await evaluate(switchToPhoto)
    await evaluate("(async()=>{const c=document.createElement('canvas');c.width=100;c.height=75;const g=c.getContext('2d');g.fillStyle='#111';g.fillRect(30,30,40,5);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const input=document.querySelector('input[accept^=image]');Object.defineProperty(input,'files',{value:[new File([blob],'transparent.png',{type:'image/png'})],configurable:true});input.dispatchEvent(new Event('change',{bubbles:true}))})()")
    for(let i=0;i<45;i++) {
      if(await evaluate("Boolean(document.querySelector('.signature-photo__preview'))")) break
      await delay(120)
    }
    assert(await evaluate("Boolean(document.querySelector('.signature-photo__preview'))"),'Signature photo preview missing')
    const alpha = await evaluate("(async()=>{const i=document.querySelector('.signature-photo__preview');await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const g=c.getContext('2d');g.drawImage(i,0,0);return {corner:g.getImageData(0,0,1,1).data[3],center:g.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data[3]}})()")
    assert.equal(alpha.corner,0,'Transparent image background became opaque')
    assert.ok(alpha.center>160,'Signature ink disappeared during cleanup')
    console.log('OK — transparent signature PNG keeps transparent background')

    console.log('OK — mobile sidebar close/backdrop/page selection, zoom and stable page')
  } finally { win.destroy(); server.close() }
}
app.whenReady().then(main).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1)})
