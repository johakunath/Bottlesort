// A finite, renderer-independent spiral celebration plus a persistent full badge.
// Undo and moving liquid out remove the effect immediately.
const timers = new WeakMap();
export function setCompletion(slot, complete, animate = false) {
  if (!slot?.el) return;
  const host = slot.el;
  let effect = host.querySelector('.completion-effect');
  if (!complete) {
    clearTimeout(timers.get(host)); timers.delete(host); effect?.remove(); return;
  }
  if (!effect) {
    effect = document.createElement('div'); effect.className = 'completion-effect'; effect.setAttribute('aria-hidden', 'true');
    effect.innerHTML = '<svg class="completion-spiral" viewBox="0 0 100 240" preserveAspectRatio="none"><path class="spiral-glow" d="M12 226 C-12 195 112 197 88 168 S-12 136 12 108 S112 78 88 50 S-12 19 12 8"/><path class="spiral-sparks" d="M12 226 C-12 195 112 197 88 168 S-12 136 12 108 S112 78 88 50 S-12 19 12 8"/></svg><span class="completion-badge">✓ Full</span>';
    host.appendChild(effect);
  }
  if (animate) {
    clearTimeout(timers.get(host)); effect.classList.remove('celebrating');
    void effect.offsetWidth; effect.classList.add('celebrating');
    timers.set(host, setTimeout(() => { effect.classList.remove('celebrating'); timers.delete(host); }, 2400));
  }
}
