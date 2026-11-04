// Finish effect for a completed bottle: droplets in the liquid's colour jump
// out of the mouth and rain down beside the bottle, with a ripple on the
// surface. Finite; the cork lid is the only persistent completion marker.
// Undo and pouring out remove the effect immediately.
const timers = new WeakMap();
const DROPS = 12, DURATION_MS = 2000;
const rnd = (a, b) => a + Math.random() * (b - a);
export function setCompletion(slot, complete, animate = false, look = {}) {
  if (!slot?.el) return;
  const host = slot.el;
  const clear = () => { clearTimeout(timers.get(host)); timers.delete(host); host.querySelector('.completion-effect')?.remove(); };
  if (!complete || !animate) { if (!complete) clear(); return; }
  clear();
  const w = host.offsetWidth || 40, h = host.offsetHeight || 96;
  const [light, dark] = look.color || ['#ffd1ee', '#d63f97'];
  const mouthY = (look.mouth ?? 0.07) * h, surfaceY = (look.surface ?? 0.22) * h;
  const effect = document.createElement('div');
  effect.className = 'completion-effect'; effect.setAttribute('aria-hidden', 'true');
  const ripple = document.createElement('span');
  ripple.className = 'splash-ripple';
  Object.assign(ripple.style, { top: surfaceY + 'px', width: w * 0.62 + 'px', height: w * 0.16 + 'px' });
  effect.appendChild(ripple);
  for (let i = 0; i < DROPS; i++) {
    const drop = document.createElement('span'), size = w * rnd(0.09, 0.15), side = i % 2 ? 1 : -1;
    drop.className = 'splash-drop';
    Object.assign(drop.style, { top: mouthY + 'px', width: size + 'px', height: size + 'px',
      background: `radial-gradient(circle at 35% 30%, #fff 0 12%, ${light} 30%, ${dark})` });
    drop.style.setProperty('--x', side * w * rnd(0.35, 0.9) + 'px');
    drop.style.setProperty('--peak', -w * rnd(0.4, 0.95) + 'px');
    drop.style.setProperty('--y', (h - mouthY) * rnd(0.55, 0.9) + 'px');
    drop.style.setProperty('--d', (0.03 * i).toFixed(2) + 's');
    effect.appendChild(drop);
  }
  host.appendChild(effect);
  void effect.offsetWidth; effect.classList.add('celebrating');
  timers.set(host, setTimeout(clear, DURATION_MS));
}
