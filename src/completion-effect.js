// A finite, renderer-independent spiral celebration. The cork lid is the only
// persistent completion marker; undo and pouring out remove the effect at once.
const timers = new WeakMap();
const SPIRAL = 'M12 226 C-12 195 112 197 88 168 S-12 136 12 108 S112 78 88 50 S-12 19 12 8';
export function setCompletion(slot, complete, animate = false) {
  if (!slot?.el) return;
  const host = slot.el;
  const clear = () => { clearTimeout(timers.get(host)); timers.delete(host); host.querySelector('.completion-effect')?.remove(); };
  if (!complete || !animate) { if (!complete) clear(); return; }
  clear();
  const effect = document.createElement('div');
  effect.className = 'completion-effect'; effect.setAttribute('aria-hidden', 'true');
  effect.innerHTML = `<svg class="completion-spiral" viewBox="0 0 100 240" preserveAspectRatio="none"><path class="spiral-glow" d="${SPIRAL}"/><path class="spiral-sparks" d="${SPIRAL}"/></svg>`;
  host.appendChild(effect);
  void effect.offsetWidth; effect.classList.add('celebrating');
  timers.set(host, setTimeout(clear, 2400));
}
