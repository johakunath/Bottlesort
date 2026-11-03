import { test, expect } from '@playwright/test';
const boot = async page => { await page.goto('/'); await page.waitForFunction(()=>!!window.__vessel); };
const solution = page => page.evaluate(async()=> (await window.__vessel.requestSolution({state:window.__vessel.state,frozen:window.__vessel.frozen,budget:400000})).solution);
const pour = (page, move) => page.evaluate(([a,b])=>{window.__vessel.onTap(a);window.__vessel.onTap(b);},move);

test('collections, labels, resume, undo, and sharing on mobile', async ({page}) => {
  const errors=[]; page.on('pageerror', e=>errors.push(e.message)); await boot(page);
  await page.click('#btn-settings'); await page.selectOption('#bottle-collection','round'); await page.click('#sw-symbols'); await page.click('#settings-close');
  await page.evaluate(()=>window.__vessel.loadLevel(1));
  expect(await page.evaluate(()=>window.__vessel.shapes.filter(s=>!s.startsWith('tower')).every(s=>s==='round'))).toBe(true);
  const initial = await page.evaluate(()=>JSON.stringify(window.__vessel.state));
  await pour(page,(await solution(page))[0]);
  const after = await page.evaluate(()=>JSON.stringify(window.__vessel.state)); expect(after).not.toBe(initial);
  await page.reload(); await page.click('#btn-resume');
  expect(await page.evaluate(()=>JSON.stringify(window.__vessel.state))).toBe(after);
  await page.click('#btn-undo'); expect(await page.evaluate(()=>JSON.stringify(window.__vessel.state))).toBe(initial);
  await page.click('#btn-share'); await expect(page.locator('#share-link')).toHaveValue(/v=4&level=1&difficulty=normal/);
  expect(errors).toEqual([]);
});

test('both renderers finish queued pours and restore undo state', async ({page}) => {
  for (const renderer of ['canvas2d','svg']) {
    await page.goto('/?renderer='+renderer); await page.waitForFunction(()=>!!window.__vessel);
    await page.evaluate(()=>window.__vessel.loadLevel(1));
    const sol=await solution(page), initial=await page.evaluate(()=>JSON.stringify(window.__vessel.state));
    await pour(page,sol[0]); await page.evaluate(()=>window.__vessel.undo());
    expect(await page.evaluate(()=>JSON.stringify(window.__vessel.state))).toBe(initial);
    for (const move of sol) await pour(page,move);
    await expect(page.locator('#overlay')).toHaveClass(/show/);
    expect(await page.evaluate(()=>window.isSolved(window.__vessel.state))).toBe(true);
  }
});

test('pending hint is discarded when another board opens', async ({page}) => {
  await page.addInitScript(()=>{
    const RealWorker=window.Worker;
    window.Worker=class extends RealWorker { postMessage(message) { setTimeout(()=>super.postMessage(message),250); } };
  });
  await boot(page); await page.evaluate(()=>window.__vessel.loadLevel(1));
  await page.click('#btn-hint'); await page.evaluate(()=>window.__vessel.loadLevel(2));
  await page.waitForTimeout(700);
  await expect(page.locator('.hint-src')).toHaveCount(0);
  await expect(page.locator('#btn-hint')).toBeEnabled();
});

test('fresh-player reset clears achievements, session and progress across reload', async ({page}) => {
  await boot(page); await page.evaluate(()=>window.__vessel.loadLevel(1));
  for (const move of await solution(page)) await pour(page,move);
  await expect(page.locator('#overlay')).toHaveClass(/show/);
  await page.click('#btn-menu'); await page.click('#btn-settings');
  page.on('dialog',d=>d.accept()); await page.click('#btn-reset'); await page.reload();
  const save=await page.evaluate(()=>JSON.parse(localStorage.getItem('vessel_save_v1')));
  expect(save.progress).toEqual({normal:{},relaxed:{},expert:{}}); expect(save.ach).toEqual({});
  await expect(page.locator('#btn-resume')).toBeHidden();
});

test('blocked storage still starts a playable board', async ({page}) => {
  await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Denied','SecurityError');}}));
  const errors=[];page.on('pageerror',e=>errors.push(e.message)); await boot(page);
  await page.evaluate(()=>window.__vessel.loadLevel(1)); await pour(page,(await solution(page))[0]);
  expect(await page.evaluate(()=>window.__vessel.moves)).toBe(1); expect(errors).toEqual([]);
});

test('seeded challenge links reproduce the board without classic progress rewards', async ({page,context}) => {
  await boot(page); await page.click('#btn-challenge'); await expect(page.locator('#game')).toBeVisible();
  const original=await page.evaluate(()=>JSON.stringify(window.__vessel.state));
  await page.click('#btn-share');const link=await page.inputValue('#share-link');
  const other=await context.newPage(); await other.goto(link); await expect(other.locator('#game')).toBeVisible();
  expect(await other.evaluate(()=>JSON.stringify(window.__vessel.state))).toBe(original);
  const first = (await solution(other))[0]; await pour(other,first);
  const partial = await other.evaluate(()=>JSON.stringify(window.__vessel.state));
  await other.reload(); await other.click('#btn-resume');
  expect(await other.evaluate(()=>JSON.stringify(window.__vessel.state))).toBe(partial);
  for(const move of await solution(other)) await pour(other,move);
  await expect(other.locator('#win-title')).toHaveText('Challenge complete!');
  expect(await other.evaluate(()=>JSON.parse(localStorage.getItem('vessel_save_v1')||'{}').progress?.normal || {})).toEqual({});
});

test('SVG labels respect hidden expert layers; tall collection fits mobile', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('vessel_save_v1',JSON.stringify({symbols:true,bottleCollection:'tall',difficulty:'expert'})));
  await page.goto('/?renderer=svg');await page.waitForFunction(()=>!!window.__vessel);
  await page.evaluate(()=>window.__vessel.loadLevel(14));
  expect(await page.evaluate(()=>window.__vessel.shapes.filter(s=>!s.startsWith('tower')).every(s=>s==='tall'))).toBe(true);
  expect(await page.evaluate(()=>window.__vessel.slots.every(({btn})=>{const r=btn.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}))).toBe(true);
  const labels=await page.evaluate(()=>window.__vessel.slots.map((slot,i)=>({hidden:window.__vessel.hiddenDepth[i],size:window.__vessel.state[i].length,text:[...slot.svg.querySelectorAll('text')].map(t=>t.textContent)})));
  for(const item of labels) if(item.hidden===item.size&&item.size) expect(item.text.some(t=>/^[1-9]$/.test(t))).toBe(false);
});

test('installed cache supports reload and worker hints while offline', async ({page,context}) => {
  await boot(page); await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true); await page.reload(); await page.waitForFunction(()=>!!window.__vessel);
  await page.evaluate(()=>window.__vessel.loadLevel(12));
  expect((await solution(page)).length).toBeGreaterThan(0);
  await expect(page.locator('#game')).toBeVisible(); await context.setOffline(false);
});

test('Daily and Rush generate asynchronously and resume the same board', async ({page}) => {
  await boot(page);
  for (const [button,mode] of [['#card-daily','daily'],['#card-rush','rush']]) {
    await page.click(button); await expect(page.locator('#game')).toBeVisible();
    await page.waitForFunction(mode=>window.__vessel.mode===mode,mode);
    const before=await page.evaluate(()=>JSON.stringify(window.__vessel.state));
    await page.reload(); await page.click('#btn-resume');
    expect(await page.evaluate(()=>window.__vessel.mode)).toBe(mode);
    expect(await page.evaluate(()=>JSON.stringify(window.__vessel.state))).toBe(before);
    await page.click('#btn-back'); await expect(page.locator('#menu')).toBeVisible();
  }
});

test('worker initialization failure is recoverable and never traps controls', async ({page}) => {
  await page.addInitScript(()=>{window.Worker=class {constructor(){throw new Error('Unavailable');}};});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await boot(page);
  await page.click('#btn-challenge'); await expect(page.locator('#loading-status')).toContainText('unavailable');
  await page.evaluate(()=>window.__vessel.loadLevel(1));await page.click('#btn-hint');
  await expect(page.locator('#btn-hint')).toBeEnabled();
  await page.click('#btn-back');await expect(page.locator('#menu')).toBeVisible();expect(errors).toEqual([]);
});

test('towers stand beside the grid at the same scale across phone and tablet sizes', async ({page}) => {
  await page.addInitScript(()=>localStorage.setItem('vessel_save_v1',JSON.stringify({bottleCollection:'tower'})));
  await boot(page); await page.evaluate(()=>window.__vessel.loadLevel(14));
  for (const viewport of [{width:390,height:844},{width:320,height:740},{width:844,height:390},{width:820,height:1180},{width:1180,height:820}]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    const bounds=await page.evaluate(()=>{
      const stage=document.querySelector('#stage').getBoundingClientRect();
      const boxes=window.__vessel.slots.map((s,i)=>{const r=s.btn.getBoundingClientRect();return {shape:window.__vessel.shapes[i],left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height};});
      const c=document.querySelector('.fabs').getBoundingClientRect();
      return {boxes,height:stage.height,screen:innerHeight,width:innerWidth,controls:{left:c.left,right:c.right,top:c.top,bottom:c.bottom}};
    });
    const towers=bounds.boxes.filter(b=>b.shape==='tower');expect(towers).toHaveLength(2);
    const small=bounds.boxes.filter(b=>b.shape!=='tower'), round=small.find(b=>b.shape==='round'), bw=round.right-round.left;
    const gridLeft=Math.min(...small.map(b=>b.left)), gridRight=Math.max(...small.map(b=>b.right));
    const [left,right]=[...towers].sort((a,b)=>a.left-b.left);
    expect(gridLeft-left.right).toBeLessThan(bw*0.6); expect(right.left-gridRight).toBeLessThan(bw*0.6);
    expect(gridLeft-left.right).toBeGreaterThan(0); expect(right.left-gridRight).toBeGreaterThan(0);
    for(const b of towers) {
      expect(Math.abs((b.right-b.left)-bw)).toBeLessThanOrEqual(1);
      expect(Math.abs(b.height/bw-5.84)).toBeLessThan(0.05);
      expect(b.top).toBeGreaterThanOrEqual(0);expect(b.bottom).toBeLessThanOrEqual(bounds.screen);
      const c=bounds.controls;expect(b.right<=c.left || b.left>=c.right || b.bottom<=c.top || b.top>=c.bottom).toBe(true);
    }
    for(const f of small.filter(b=>b.shape==='flask')) expect(Math.abs((f.right-f.left)/bw-1.313)).toBeLessThan(0.05);
    for(const b of bounds.boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(bounds.width);
      expect(b.top).toBeGreaterThanOrEqual(0);expect(b.bottom).toBeLessThanOrEqual(bounds.screen);
    }
  }
});

test('animated tower transfer stays aligned and restores its full height in both renderers', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const renderer of ['canvas2d','svg']) {
    await page.goto('/?renderer='+renderer+'&slowmo=3');await page.waitForFunction(()=>!!window.__vessel);
    await page.evaluate(()=>window.__vessel.loadLevel(1));
    await page.waitForTimeout(800);
    const before=await page.evaluate(()=>JSON.stringify(window.__vessel.state));
    await page.evaluate(()=>{const v=window.__vessel;v.onTap(1);v.onTap(0);v.onTap(0);v.onTap(v.state.length-1);});
    await page.waitForFunction(()=>window.__vessel.jobs.some(j=>j.snS.startsWith('tower')&&j.streamOrigin));
    const sample=await page.evaluate(()=>{
      const j=window.__vessel.jobs.find(j=>j.snS.startsWith('tower')),p=j.pose,h=j.hs;
      const lx=((50+j.s*j.gS.rimHalf)*j.baseKS-h.w/2)*p.scale;
      const ly=(j.gS.rimBot*j.baseKS-h.h/2)*p.scale;
      const x=h.x+p.tx+h.w/2+lx*Math.cos(p.a)-ly*Math.sin(p.a);
      const y=h.y+p.ty+h.h/2+lx*Math.sin(p.a)+ly*Math.cos(p.a);
      return {scale:p.scale,error:Math.hypot(x-j.streamOrigin.x,y-j.streamOrigin.y)};
    });
    expect(sample.scale).toBeLessThan(1);expect(sample.error).toBeLessThan(.01);
    await page.waitForFunction(()=>window.__vessel.activePours===0);
    expect(await page.evaluate(()=>window.__vessel.slots.every(s=>!s.btn.style.transform))).toBe(true);
    await page.evaluate(()=>{window.__vessel.undo();window.__vessel.undo();});
    expect(await page.evaluate(()=>JSON.stringify(window.__vessel.state))).toBe(before);
  }
});

test('towers are permanent across styles; early levels use 8-segment towers', async ({page}) => {
  await boot(page);await page.click('#btn-settings');
  await expect(page.locator('#bottle-collection option[value="tower"]')).toHaveCount(0);
  await page.selectOption('#bottle-collection','round');await page.click('#settings-close');
  await page.evaluate(()=>window.__vessel.loadLevel(1));
  expect(await page.evaluate(()=>window.__vessel.state.filter(b=>b.capacity===8).length)).toBe(2);
  await expect(page.locator('.capacity-label').first()).toHaveText('0 / 8');
  for(const move of await solution(page)) await pour(page,move);
  await expect(page.locator('#overlay')).toHaveClass(/show/);
  await expect(page.locator('.capacity-label').first()).toHaveText('8 / 8');
  await expect(page.locator('.capacity-label').last()).toHaveText('8 / 8');
  await page.evaluate(()=>window.__vessel.loadLevel(5));
  await expect(page.locator('.capacity-label').first()).toHaveText('0 / 12');
  await expect(page.locator('.completion-badge')).toHaveCount(0);
});

test('completion sparkles finish cleanly and leave only the cork as a marker', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});await boot(page);
  await page.evaluate(()=>window.__vessel.loadLevel(1));
  const prefix=await page.evaluate(async()=>{
    const v=window.__vessel, sol=(await v.requestSolution({state:v.state,frozen:v.frozen,budget:400000})).solution;
    const copy=window.cloneState(v.state), moves=[];
    for(const move of sol) {window.applyPour(copy,...move);moves.push(move);if(window.isBottleComplete(copy[move[1]])) return {moves,target:move[1]};}
  });
  for(const move of prefix.moves) await pour(page,move);
  const effect=page.locator('.slot').filter({has:page.locator('.completion-effect.celebrating')});
  await expect(effect).not.toHaveCount(0,{timeout:20000});
  await expect(page.locator('.completion-effect.celebrating .splash-drop')).not.toHaveCount(0);
  await page.waitForFunction(()=>window.__vessel.activePours===0);
  await expect(page.locator('.completion-effect.celebrating')).toHaveCount(0,{timeout:5000});
  expect(await page.evaluate(i=>!!window.__vessel.slots[i].el.querySelector('.completion-effect'),prefix.target)).toBe(false);
  await page.evaluate(()=>window.__vessel.undo());
  expect(await page.evaluate(i=>!!window.__vessel.slots[i].el.querySelector('.completion-effect'),prefix.target)).toBe(false);
});
