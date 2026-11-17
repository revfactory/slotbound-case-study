/* motion-deck 런타임 — 장 이동, 등장 모션 트리거, 숫자 카운트업, 영상 재생 제어, 발표 노트, 정적·인쇄 모드.
   사례마다 고치지 않는다. 장 고유 동작은 document.addEventListener('slideenter', e => …) 로 붙인다.
   e.detail = { index, slide, id }  ·  검수 스크립트용 API: window.__deck = { count, go(i), index(), settle() } */
(() => {
  const W = 1920, H = 1080;
  const qs = new URLSearchParams(location.search);
  const PRINT = qs.has('print');
  const STATIC = PRINT || qs.has('static');
  const root = document.documentElement;
  if (PRINT) root.classList.add('print', 'static');
  else if (STATIC) root.classList.add('static');

  const deck = document.querySelector('.deck');
  const slides = [...deck.querySelectorAll(':scope > .slide')];
  let cur = -1, step = 0;

  // data-delay → --d
  deck.querySelectorAll('[data-delay]').forEach(el => el.style.setProperty('--d', `${parseInt(el.dataset.delay, 10) || 0}ms`));
  deck.querySelectorAll('[data-dur]').forEach(el => { if (!el.hasAttribute('data-count')) el.style.setProperty('--dur', `${parseInt(el.dataset.dur, 10)}ms`); });

  // UI
  const ui = document.createElement('div'); ui.className = 'deck-ui'; ui.innerHTML = '<div class="bar"></div>';
  const counter = document.createElement('div'); counter.className = 'deck-count';
  const notes = document.createElement('div'); notes.className = 'deck-notes';
  document.body.append(ui, counter, notes);

  function fit() {
    if (PRINT) return;
    deck.style.setProperty('--s', Math.min(innerWidth / W, innerHeight / H));
  }
  addEventListener('resize', fit); fit();

  // 숫자 카운트업: <span data-count data-to="470000000" data-from="0" data-decimals="0" data-prefix="₩" data-suffix="" data-dur="1800" data-delay="200" data-format="comma|man|raw">
  const fmt = (v, el) => {
    const dec = parseInt(el.dataset.decimals || '0', 10);
    const mode = el.dataset.format || 'comma';
    let s;
    if (mode === 'man') { // 한국식: 4억 7,000만
      const n = Math.round(v); const eok = Math.floor(n / 1e8); const man = Math.floor((n % 1e8) / 1e4);
      s = (eok ? `${eok}억` : '') + (man ? `${eok ? ' ' : ''}${man.toLocaleString('ko-KR')}만` : (eok ? '' : '0'));
    } else if (mode === 'raw') s = v.toFixed(dec);
    else s = v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return (el.dataset.prefix || '') + s + (el.dataset.suffix || '');
  };
  const easeOut = x => 1 - Math.pow(1 - x, 4);
  function runCounts(slide) {
    slide.querySelectorAll('[data-count]').forEach(el => {
      const to = parseFloat(el.dataset.to), from = parseFloat(el.dataset.from || '0');
      if (STATIC) { el.textContent = fmt(to, el); return; }
      const dur = parseInt(el.dataset.dur || '1800', 10), delay = parseInt(el.dataset.delay || '0', 10) + 180;
      const t0 = performance.now() + delay; el.textContent = fmt(from, el);
      const tick = now => {
        if (!slide.classList.contains('is-active')) return;
        const p = Math.min(1, Math.max(0, (now - t0) / dur));
        el.textContent = fmt(from + (to - from) * easeOut(p), el);
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // 영상: <video data-play muted loop playsinline poster="…"> 는 장에 들어오면 재생, 나가면 정지
  function media(slide, on) {
    slide.querySelectorAll('video').forEach(v => {
      if (PRINT) return;
      if (on && v.hasAttribute('data-play')) { if (v.hasAttribute('data-restart')) v.currentTime = 0; v.play().catch(() => {}); }
      if (!on) { v.pause(); if (v.hasAttribute('data-restart')) v.currentTime = 0; }
    });
  }
  if (PRINT) { // 인쇄: 영상은 포스터 이미지로 바꾼다
    deck.querySelectorAll('video').forEach(v => {
      if (!v.poster) return;
      const im = document.createElement('img'); im.src = v.poster; im.className = v.className; im.style.cssText = v.style.cssText;
      im.style.objectFit = getComputedStyle(v).objectFit || 'cover'; v.replaceWith(im);
    });
  }

  const stepsOf = s => [...s.querySelectorAll('[data-step]')].sort((a, b) => a.dataset.step - b.dataset.step);
  function showSteps(slide, n) { stepsOf(slide).forEach((el, i) => el.classList.toggle('step-on', STATIC || i < n)); }

  function go(i, viaStep = false) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur && !viaStep) return;
    const prev = slides[cur];
    slides.forEach(s => s.classList.remove('is-prev'));
    if (prev && prev !== slides[i]) { prev.classList.remove('is-active'); prev.classList.add('is-prev'); media(prev, false);
      setTimeout(() => prev.classList.remove('is-prev'), 750); }
    const s = slides[i]; cur = i; step = 0; showSteps(s, 0);
    // 리플로우 뒤 활성화해야 등장 전환이 처음 상태부터 시작한다
    void s.offsetWidth; s.classList.add('is-active');
    runCounts(s); media(s, true);
    ui.style.setProperty('--p', slides.length > 1 ? i / (slides.length - 1) : 1);
    counter.textContent = `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
    const n = s.querySelector('.notes'); notes.innerHTML = n ? `<b>${i + 1}.</b> ${n.innerHTML}` : '';
    if (!PRINT && location.hash !== `#${i + 1}`) history.replaceState(null, '', `#${i + 1}`);
    document.dispatchEvent(new CustomEvent('slideenter', { detail: { index: i, slide: s, id: s.id } }));
  }
  function next() { const st = stepsOf(slides[cur]); if (!STATIC && step < st.length) { step++; showSteps(slides[cur], step); return; } go(cur + 1); }
  function prev() { go(cur - 1); }

  if (PRINT) {
    slides.forEach(s => { s.classList.add('is-active'); runCounts(s); showSteps(s, 999); });
    document.dispatchEvent(new CustomEvent('deckprint'));
  } else {
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); prev(); }
      else if (k === 'Home') go(0);
      else if (k === 'End') go(slides.length - 1);
      else if (k === 'f' || k === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); }
      else if (k === 'n' || k === 'N') root.classList.toggle('show-notes');
    });
    addEventListener('click', e => {
      if (e.target.closest('a, button, video[controls], .no-nav')) return;
      (e.clientX > innerWidth * 0.33 ? next : prev)();
    });
    let tx = null;
    addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
    addEventListener('touchend', e => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 50) (dx < 0 ? next : prev)(); tx = null; });
    addEventListener('hashchange', () => { const n = parseInt(location.hash.slice(1), 10); if (n) go(n - 1); });
    const start = parseInt(location.hash.slice(1), 10);
    go(Number.isFinite(start) && start > 0 ? start - 1 : 0);
  }

  // 검수용 API: settle() 은 현재 장의 가장 늦은 등장 모션이 끝날 때까지 기다린다
  window.__deck = {
    count: slides.length, go: i => go(i), index: () => cur,
    settle() {
      if (STATIC) return Promise.resolve();
      const s = slides[cur]; let max = 0;
      s.querySelectorAll('[data-anim],[data-count]').forEach(el => {
        const d = parseInt(el.dataset.delay || '0', 10) + parseInt(el.dataset.dur || (el.dataset.anim === 'draw' ? '1600' : '950'), 10);
        max = Math.max(max, d);
      });
      return new Promise(r => setTimeout(r, max + 400));
    },
  };
})();
