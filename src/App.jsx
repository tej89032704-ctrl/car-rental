import { useEffect, useRef, useState } from 'react';

/* ===== WebGL-style dot-matrix background (canvas, breathing pulse + pointer drift) ===== */
function DotField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dots = [];
    const pointer = { x: -9999, y: -9999 };

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gap = 30;
      dots = [];
      for (let x = gap / 2; x < w; x += gap) {
        for (let y = gap / 2; y < h; y += gap) {
          dots.push({ x, y, base: 0.8 + Math.random() * 0.7 });
        }
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);
      const breathe = 0.5 + 0.5 * Math.sin(t / 2200);
      const cx = w / 2;
      const cy = h * 0.42;
      for (const d of dots) {
        const depth = 1 - Math.min(1, Math.hypot(d.x - cx, d.y - cy) / (w * 0.72));
        const dx = d.x - pointer.x;
        const dy = d.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        let ox = 0;
        let oy = 0;
        if (dist < 170 && dist > 0.01) {
          const push = (1 - dist / 170) * 9;
          ox = (dx / dist) * push;
          oy = (dy / dist) * push;
        }
        const r = d.base * (0.75 + 0.4 * breathe) * (0.55 + 0.45 * depth);
        ctx.beginPath();
        ctx.arc(d.x + ox, d.y + oy, Math.max(0.3, r), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.06 + 0.04 * breathe) * (0.4 + 0.6 * depth)})`;
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    }

    function onMove(e) {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
    function onLeave() {
      pointer.x = -9999;
      pointer.y = -9999;
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);
    if (reduce) draw(0);
    else raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className="stage" aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className="stage-vignette" />
    </div>
  );
}

/* ===== Cloth banner with CAR-ENT text (waving in the air) ===== */
function ClothBanner() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const COLS = 22;
    const ROWS = 10;
    let points = [];
    let constraints = [];
    let tex = null;
    let w = 0;
    let h = 0;
    let gapX = 0;
    let gapY = 0;
    let dpr = 1;
    let raf = 0;

    function buildTexture() {
      tex = document.createElement('canvas');
      tex.width = Math.max(2, Math.round(w));
      tex.height = Math.max(2, Math.round(h));
      const tc = tex.getContext('2d');

      // Black woven ground
      const g = tc.createLinearGradient(0, 0, 0, tex.height);
      g.addColorStop(0, '#1d1d1f');
      g.addColorStop(1, '#2d2d2f');
      tc.fillStyle = g;
      tc.fillRect(0, 0, tex.width, tex.height);

      // faint weave
      const s = Math.max(5, Math.round(w * 0.006));
      tc.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      tc.lineWidth = 1;
      for (let wy = s; wy < tex.height; wy += s) {
        tc.beginPath(); tc.moveTo(0, wy); tc.lineTo(tex.width, wy); tc.stroke();
      }
      for (let wx = s; wx < tex.width; wx += s) {
        tc.beginPath(); tc.moveTo(wx, 0); tc.lineTo(wx, tex.height); tc.stroke();
      }

      // white border
      const i1 = w * 0.014;
      const i2 = w * 0.027;
      tc.strokeStyle = '#ffffff';
      tc.lineWidth = Math.max(2, Math.round(w * 0.008));
      tc.strokeRect(i1, i1, tex.width - i1 * 2, tex.height - i1 * 2);
      tc.lineWidth = Math.max(1.5, Math.round(w * 0.004));
      tc.strokeRect(i2, i2, tex.width - i2 * 2, tex.height - i2 * 2);

      const serif = '"Playfair Display", Georgia, "Times New Roman", serif';
      const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const fs = Math.round(w * 0.15);
      const wmY = tex.height * 0.47;
      tc.textAlign = 'center';
      tc.textBaseline = 'middle';

      // top label
      tc.fillStyle = '#ffffff';
      tc.font = '600 ' + Math.max(10, Math.round(w * 0.026)) + 'px ' + sans;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(w * 0.008) + 'px';
      tc.fillText('EST. 2026 · 12 CITIES', tex.width / 2, tex.height * 0.17);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';

      // big serif wordmark
      tc.fillStyle = '#ffffff';
      tc.font = '800 ' + fs + 'px ' + serif;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(fs * 0.04) + 'px';
      tc.fillText('CAR-ENT', tex.width / 2, wmY);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';

      // rule
      tc.fillStyle = 'rgba(255, 255, 255, 0.3)';
      tc.fillRect(tex.width / 2 - fs * 0.9, wmY + fs * 0.6, fs * 1.8, Math.max(1, Math.round(w * 0.0025)));

      // sub label
      tc.fillStyle = '#a1a1a6';
      tc.font = '600 ' + Math.max(10, Math.round(w * 0.03)) + 'px ' + sans;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(w * 0.006) + 'px';
      tc.fillText('CARS · ON DEMAND', tex.width / 2, wmY + fs * 0.82);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';

      // bottom label
      tc.fillStyle = '#ffffff';
      tc.font = '600 ' + Math.max(10, Math.round(w * 0.024)) + 'px ' + sans;
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(w * 0.007) + 'px';
      tc.fillText('PEER-TO-PEER · DRIVE FREE', tex.width / 2, tex.height * 0.9);
      if ('letterSpacing' in tc) tc.letterSpacing = '0px';
    }

    function init() {
      points = [];
      for (let y = 0; y <= ROWS; y++) {
        const row = [];
        for (let x = 0; x <= COLS; x++) {
          const pin = y === 0;
          row.push({ x: x * gapX, y: y * gapY, px: x * gapX, py: y * gapY, pin });
        }
        points.push(row);
      }
      constraints = [];
      for (let yy = 0; yy <= ROWS; yy++) {
        for (let xx = 0; xx <= COLS; xx++) {
          if (xx < COLS) constraints.push({ a: points[yy][xx], b: points[yy][xx + 1], rest: gapX });
          if (yy < ROWS) constraints.push({ a: points[yy][xx], b: points[yy + 1][xx], rest: gapY });
        }
      }
      buildTexture();
    }

    function step(t) {
      for (let y = 0; y <= ROWS; y++) {
        for (let x = 0; x <= COLS; x++) {
          const p = points[y][x];
          if (p.pin) continue;
          const vx = (p.x - p.px) * 0.9;
          const vy = (p.y - p.py) * 0.9;
          p.px = p.x;
          p.py = p.y;
          p.x += vx;
          p.y += vy;
          p.y += 0.6;
          const wind = Math.sin(t * 0.0011 + p.y * 0.03) * 1.7 + Math.sin(t * 0.0017 + p.x * 0.018) * 0.9;
          p.x += wind;
          p.y += Math.sin(t * 0.0019 + p.x * 0.025) * 0.2;
        }
      }
      for (let i = 0; i < 3; i++) {
        for (let c = 0; c < constraints.length; c++) {
          const cn = constraints[c];
          const dx = cn.b.x - cn.a.x;
          const dy = cn.b.y - cn.a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = ((dist - cn.rest) / dist) * 0.5;
          if (!cn.a.pin) { cn.a.x += dx * diff; cn.a.y += dy * diff; }
          if (!cn.b.pin) { cn.b.x -= dx * diff; cn.b.y -= dy * diff; }
        }
      }
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const p0 = points[y][x];
          const p1 = points[y][x + 1];
          const p2 = points[y + 1][x + 1];
          const p3 = points[y + 1][x];
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          ctx.closePath();
          ctx.clip();
          ctx.setTransform(
            (p1.x - p0.x) / tex.width, (p1.y - p0.y) / tex.width,
            (p3.x - p0.x) / tex.height, (p3.y - p0.y) / tex.height,
            p0.x, p0.y
          );
          ctx.drawImage(tex, 0, 0);
          ctx.restore();
        }
      }
    }

    function resize() {
      const parent = canvas.parentElement;
      const cw = Math.min(parent ? parent.clientWidth : 560, 560);
      w = Math.max(280, cw);
      h = Math.round(w * 0.36);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      gapX = w / COLS;
      gapY = h / ROWS;
      init();
    }

    function loop(t) {
      step(t);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener('resize', resize);
    resize();

    if (reduce) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(tex, 0, 0);
    } else {
      raf = requestAnimationFrame(loop);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        buildTexture();
      });
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="cloth-wrap" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

export default function App() {
  const [isRegister, setIsRegister] = useState(false);
  const [currentRole, setCurrentRole] = useState('pick');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const nameRef = useRef(null);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const btnPickRef = useRef(null);
  const btnGiveRef = useRef(null);
  const loginTitleRef = useRef(null);
  const loginSubRef = useRef(null);
  const btnTextRef = useRef(null);

  const API =
    import.meta.env.VITE_API_URL ||
    (window.location.port === '5173' ? 'http://localhost:8081/api/auth' : '/api/auth');

  useEffect(() => {
    updateUI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRegister, currentRole]);

  /* ===== Virtual keyboard (ported from git commit 228c619) ===== */
  useEffect(() => {
    const fields = [nameRef.current, emailRef.current, passwordRef.current].filter(Boolean);
    if (fields.length === 0) return;

    const vkbRows = [
      [
        ['1', 'Digit1', '!', 28], ['2', 'Digit2', '@', 28], ['3', 'Digit3', '#', 28], ['4', 'Digit4', '$', 28],
        ['5', 'Digit5', '%', 28], ['6', 'Digit6', '^', 28], ['7', 'Digit7', '&', 28], ['8', 'Digit8', '*', 28],
        ['9', 'Digit9', '(', 28], ['0', 'Digit0', ')', 28],
      ],
      [
        ['Q', 'KeyQ'], ['W', 'KeyW'], ['E', 'KeyE'], ['R', 'KeyR'], ['T', 'KeyT'],
        ['Y', 'KeyY'], ['U', 'KeyU'], ['I', 'KeyI'], ['O', 'KeyO'], ['P', 'KeyP'],
      ],
      [
        ['Tab', 'Tab', 'tab-key'],
        ['A', 'KeyA'], ['S', 'KeyS'], ['D', 'KeyD'], ['F', 'KeyF'], ['G', 'KeyG'],
        ['H', 'KeyH'], ['J', 'KeyJ'], ['K', 'KeyK'], ['L', 'KeyL'],
      ],
      [
        ['⇪', 'CapsLock', 'caps-key'],
        ['Z', 'KeyZ'], ['X', 'KeyX'], ['C', 'KeyC'], ['V', 'KeyV'], ['B', 'KeyB'],
        ['N', 'KeyN'], ['M', 'KeyM'], ['@', 'At'], ['.', 'Dot'],
        ['⌫', 'Backspace', 'backspace-key'],
      ],
      [
        ['⇧', 'ShiftLeft', 'shift-key'],
        ['Esc', 'Escape', 'esc-key'],
        [' ', 'Space', 'space-key', 4],
        ['⏎', 'Enter', 'enter-key'],
      ],
    ];

    const symbolRow = [
      ['!', 'Digit1'], ['@', 'At'], ['#', 'Digit3'], ['$', 'Digit4'], ['%', 'Digit5'],
      ['^', 'Digit6'], ['&', 'Digit7'], ['*', 'Digit8'], ['(', 'Digit9'], [')', 'Digit0'],
      ['-', 'Minus'], ['_', 'Underscore'], ['=', 'Equal'], ['+', 'Plus'], ['[', 'BracketLeft'],
      [']', 'BracketRight'], ['{', 'BracketLeft'], ['}', 'BracketRight'], ['/', 'Slash'], ['\\', 'Backslash'],
      ['|', 'Backslash'], ['<', 'Comma'], ['>', 'Period'], ['?', 'Slash'],
    ];

    const panel = document.createElement('div');
    panel.className = 'vkb-panel';
    panel.id = 'vkbPanel';

    const topBar = document.createElement('div');
    topBar.className = 'vkb-top';
    const title = document.createElement('span');
    title.className = 'vkb-title';
    title.textContent = 'Keyboard';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'vkb-close';
    closeBtn.textContent = '\u00d7';
    closeBtn.setAttribute('aria-label', 'Close keyboard');
    topBar.appendChild(title);
    topBar.appendChild(closeBtn);
    panel.appendChild(topBar);

    const cursorIndicator = document.createElement('div');
    cursorIndicator.className = 'vkb-cursor-indicator';
    const cursorDot = document.createElement('span');
    cursorDot.className = 'cursor-dot';
    const cursorLabel = document.createElement('span');
    cursorIndicator.appendChild(cursorDot);
    cursorIndicator.appendChild(cursorLabel);
    panel.appendChild(cursorIndicator);

    const symRowDiv = document.createElement('div');
    symRowDiv.className = 'vkb-symbols-row';
    symbolRow.forEach(([ch, code]) => {
      const k = document.createElement('div');
      k.className = 'vkb-key sym-key';
      k.textContent = ch;
      k.dataset.char = ch;
      k.dataset.code = code;
      symRowDiv.appendChild(k);
    });
    panel.appendChild(symRowDiv);

    const vkbKeyEls = {};

    vkbRows.forEach((row) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'vkb-row';
      row.forEach(([label, code, extra, w]) => {
        const k = document.createElement('div');
        k.className = 'vkb-key';
        if (extra && extra.match(/^[a-zA-Z-]+$/)) k.classList.add(extra);
        if (w) k.style.flex = w;

        if (extra === 'shift-key' || extra === 'caps-key' || extra === 'tab-key' || extra === 'esc-key' ||
            extra === 'backspace-key' || extra === 'enter-key') {
          k.textContent = label;
        } else if (extra === 'space-key') {
          k.style.fontSize = '11px';
          k.style.color = '#c7c7cc';
          k.textContent = 'space';
        } else if (w && label === ' ') {
          k.style.flex = w;
        } else {
          if (typeof w === 'number') k.style.flex = w;
          if (extra && !extra.match(/^[a-zA-Z-]+$/) && extra !== label) {
            const s = document.createElement('div');
            s.className = 'vkb-shift';
            s.textContent = extra;
            k.appendChild(s);
          }
          const main = document.createElement('div');
          main.className = 'vkb-main';
          main.textContent = label;
          k.appendChild(main);
        }

        vkbKeyEls[code] = k;
        k.dataset.code = code;
        rowDiv.appendChild(k);
      });
      panel.appendChild(rowDiv);
    });

    const loginHost = document.getElementById('login');
    if (loginHost) loginHost.appendChild(panel);
    else document.body.appendChild(panel);

    function updateCursorLabel(field) {
      if (!field) {
        cursorLabel.textContent = '';
        return;
      }
      const map = { name: 'Name', email: 'Email', password: 'Password' };
      cursorLabel.textContent = map[field.id] || 'Input';
    }

    function vkbFlash(code) {
      const k = vkbKeyEls[code];
      if (!k) return;
      k.classList.remove('active');
      void k.offsetWidth;
      k.classList.add('active');
      clearTimeout(k._t);
      k._t = setTimeout(() => k.classList.remove('active'), 220);
    }

    const CHAR_TO_CODE = {
      '1': 'Digit1', '!': 'Digit1', '2': 'Digit2', '@': 'At', '3': 'Digit3', '#': 'Digit3',
      '4': 'Digit4', '$': 'Digit4', '5': 'Digit5', '%': 'Digit5', '6': 'Digit6', '^': 'Digit6',
      '7': 'Digit7', '&': 'Digit7', '8': 'Digit8', '*': 'Digit8', '9': 'Digit9', '(': 'Digit9',
      '0': 'Digit0', ')': 'Digit0',
      'q': 'KeyQ', 'w': 'KeyW', 'e': 'KeyE', 'r': 'KeyR', 't': 'KeyT', 'y': 'KeyY',
      'u': 'KeyU', 'i': 'KeyI', 'o': 'KeyO', 'p': 'KeyP',
      'a': 'KeyA', 's': 'KeyS', 'd': 'KeyD', 'f': 'KeyF', 'g': 'KeyG', 'h': 'KeyH',
      'j': 'KeyJ', 'k': 'KeyK', 'l': 'KeyL',
      'z': 'KeyZ', 'x': 'KeyX', 'c': 'KeyC', 'v': 'KeyV', 'b': 'KeyB', 'n': 'KeyN',
      'm': 'KeyM', '.': 'Dot', ' ': 'Space',
      '-': 'Minus', '_': 'Underscore', '=': 'Equal', '+': 'Plus', '[': 'BracketLeft', ']': 'BracketRight',
      '{': 'BracketLeft', '}': 'BracketRight', '/': 'Slash', '\\': 'Backslash', '|': 'Backslash',
      '<': 'Comma', '>': 'Period', '?': 'Slash',
    };

    const vkbFields = fields;
    let shiftOn = false;
    let capsOn = false;
    let activeField = null;
    let savedSelStart = 0;
    let savedSelEnd = 0;

    function saveCursor(field) {
      if (!field) return;
      try {
        savedSelStart = field.selectionStart || 0;
      } catch (e) {
        savedSelStart = field.value.length;
      }
      try {
        savedSelEnd = field.selectionEnd || 0;
      } catch (e) {
        savedSelEnd = field.value.length;
      }
    }
    function restoreCursor(field) {
      if (!field) return;
      field.focus();
      try {
        field.selectionStart = savedSelStart;
        field.selectionEnd = savedSelEnd;
      } catch (err) {}
    }

    function toggleShift() {
      shiftOn = !shiftOn;
      const shiftBtn = vkbKeyEls['ShiftLeft'];
      if (shiftBtn) shiftBtn.classList.toggle('on', shiftOn);
    }
    function toggleCaps() {
      capsOn = !capsOn;
      const capsBtn = vkbKeyEls['CapsLock'];
      if (capsBtn) capsBtn.classList.toggle('on', capsOn);
    }

    function insertChar(field, ch) {
      if (!field) return;
      let start = 0;
      let end = 0;
      try {
        start = field.selectionStart;
        end = field.selectionEnd;
      } catch (e) {
        start = end = field.value.length;
      }
      const val = field.value;
      field.value = val.slice(0, start) + ch + val.slice(end);
      try {
        field.selectionStart = field.selectionEnd = start + ch.length;
      } catch (e) {}
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function openPanel() {
      panel.classList.add('open');
    }
    function closePanel() {
      panel.classList.remove('open');
    }

    closeBtn.addEventListener('click', closePanel);

    function onPanelClick(e) {
      const key = e.target.closest('.vkb-key');
      if (!key) return;

      if (key.classList.contains('sym-key')) {
        if (activeField) {
          insertChar(activeField, key.dataset.char);
          vkbFlash(key.dataset.code);
        }
        return;
      }

      const code = key.dataset?.code;
      if (!code) return;

      if (code === 'ShiftLeft') {
        toggleShift();
        return;
      }
      if (code === 'CapsLock') {
        toggleCaps();
        return;
      }
      if (code === 'Escape') {
        closePanel();
        return;
      }

      if (activeField) {
        restoreCursor(activeField);
        if (code === 'Backspace') {
          let start = 0;
          let end = 0;
          try {
            start = activeField.selectionStart;
            end = activeField.selectionEnd;
          } catch (e) {
            start = end = activeField.value.length;
          }
          if (start !== end) {
            activeField.value = activeField.value.slice(0, start) + activeField.value.slice(end);
            try {
              activeField.selectionStart = activeField.selectionEnd = start;
            } catch (e) {}
          } else if (start > 0) {
            activeField.value = activeField.value.slice(0, start - 1) + activeField.value.slice(start);
            try {
              activeField.selectionStart = activeField.selectionEnd = start - 1;
            } catch (e) {}
          }
          activeField.dispatchEvent(new Event('input', { bubbles: true }));
          vkbFlash('Backspace');
          return;
        }

        if (code === 'Tab') {
          const idx = vkbFields.indexOf(activeField);
          const next = vkbFields[(idx + 1) % vkbFields.length];
          if (next) next.focus();
          vkbFlash('Tab');
          return;
        }

        if (code === 'Enter') {
          vkbFlash('Enter');
          activeField.form?.requestSubmit();
          return;
        }

        if (code === 'Space') {
          insertChar(activeField, ' ');
          vkbFlash('Space');
          return;
        }

        const label = key.querySelector('.vkb-main')?.textContent || key.textContent.trim();
        let ch = label;

        if (capsOn) ch = label.length === 1 ? label.toUpperCase() : label;
        else if (shiftOn) {
          const shiftMap = {
            '1': '!', '2': '@', '3': '#', '4': '$', '5': '%', '6': '^', '7': '&',
            '8': '*', '9': '(', '0': ')', '-': '_', '=': '+', '[': '{', ']': '}', '/': '?',
          };
          ch = shiftMap[label] || label.toUpperCase();
        } else {
          ch = label.length === 1 ? label.toLowerCase() : label;
        }

        insertChar(activeField, ch);
        vkbFlash(code);

        if (shiftOn && !capsOn) toggleShift();
      }
    }

    panel.addEventListener('click', onPanelClick);

    const fieldHandlers = [];
    vkbFields.forEach((field) => {
      const onFocus = () => {
        activeField = field;
        saveCursor(field);
        openPanel();
        updateCursorLabel(field);
      };
      const onClick = () => saveCursor(field);
      const onKeyup = () => saveCursor(field);
      const onInput = () => saveCursor(field);
      const onBeforeInput = (e) => {
        if (e.inputType === 'insertText' && e.data) {
          const ch = e.data;
          const code = CHAR_TO_CODE[ch.toLowerCase()];
          if (code) vkbFlash(code);
          if (ch.toLowerCase() !== ch || '!@#$%^&*()_+{}<>?|~'.includes(ch)) vkbFlash('ShiftLeft');
        } else if (e.inputType === 'deleteContentBackward') {
          vkbFlash('Backspace');
        }
      };
      const onKeyDown = (e) => {
        if (e.code === 'Enter') vkbFlash('Enter');
      };
      field.addEventListener('focus', onFocus);
      field.addEventListener('click', onClick);
      field.addEventListener('keyup', onKeyup);
      field.addEventListener('input', onInput);
      field.addEventListener('beforeinput', onBeforeInput);
      field.addEventListener('keydown', onKeyDown);
      fieldHandlers.push([field, onFocus, onClick, onKeyup, onInput, onBeforeInput, onKeyDown]);
    });

    const onDocFocusIn = (e) => {
      if (vkbFields.includes(e.target)) {
        openPanel();
        updateCursorLabel(e.target);
      } else if (!panel.contains(e.target)) {
        closePanel();
      }
    };

    /* Clicking anywhere outside the inputs or the keyboard closes it */
    const onDocPointerDown = (e) => {
      if (panel.contains(e.target)) return;
      if (vkbFields.includes(e.target)) return;
      closePanel();
      if (activeField) activeField.blur();
    };

    const onDocKeyDown = (e) => {
      if (!activeField || activeField !== document.activeElement) return;
      const k = vkbKeyEls[e.code];
      if (k) {
        k.classList.remove('active');
        void k.offsetWidth;
        k.classList.add('active');
        clearTimeout(k._t);
        k._t = setTimeout(() => k.classList.remove('active'), 220);
      }
    };

    document.addEventListener('focusin', onDocFocusIn);
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);

    return () => {
      panel.remove();
      document.removeEventListener('focusin', onDocFocusIn);
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
      fieldHandlers.forEach(([f, f1, f2, f3, f4, f5, f6]) => {
        f.removeEventListener('focus', f1);
        f.removeEventListener('click', f2);
        f.removeEventListener('keyup', f3);
        f.removeEventListener('input', f4);
        f.removeEventListener('beforeinput', f5);
        f.removeEventListener('keydown', f6);
      });
    };
  }, []);

  function updateUI() {
    const isPick = currentRole === 'pick';
    if (isRegister) {
      if (loginTitleRef.current) loginTitleRef.current.textContent = 'Create your account.';
      if (loginSubRef.current)
        loginSubRef.current.textContent = isPick
          ? 'Rent cars for free. No credit card needed.'
          : 'Start earning with your car.';
      if (btnTextRef.current)
        btnTextRef.current.textContent = isPick ? 'Create account' : 'Register as owner';
    } else {
      if (loginTitleRef.current) loginTitleRef.current.textContent = 'Welcome back.';
      if (loginSubRef.current) loginSubRef.current.textContent = 'Sign in to continue.';
      if (btnTextRef.current) btnTextRef.current.textContent = 'Continue';
    }
  }

  function setRole(role) {
    setCurrentRole(role);
    const isPick = role === 'pick';
    btnPickRef.current?.classList.toggle('is-active', isPick);
    btnGiveRef.current?.classList.toggle('is-active', !isPick);
  }

  function toggleMode(e) {
    e.preventDefault();
    setIsRegister((r) => !r);
    setErrorMsg('');
  }

  async function handleSubmit() {
    setErrorMsg('');
    const n = nameRef.current?.value.trim() || '';
    const e = emailRef.current?.value.trim() || '';
    const p = passwordRef.current?.value.trim() || '';
    if (!e || !p || (isRegister && !n)) {
      setErrorMsg('Please fill in all fields.');
      return;
    }
    if (!e.includes('@')) {
      setErrorMsg('Enter a valid email.');
      return;
    }
    if (p.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    if (btnTextRef.current)
      btnTextRef.current.textContent = isRegister ? 'Creating account…' : 'Signing in…';
    try {
      const endpoint = isRegister ? `${API}/register` : `${API}/login`;
      const role = currentRole === 'pick' ? 'customer' : 'owner';
      const body = isRegister
        ? { name: n, email: e, password: p, role }
        : { email: e, password: p, role };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || 'Something went wrong.');
        setSubmitting(false);
        updateUI();
        return;
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data));
      window.location.href =
        data.role === 'owner' ? 'owner-dashboard.html' : 'customer-dashboard.html';
    } catch (_) {
      setErrorMsg('Cannot connect to server.');
      setSubmitting(false);
      updateUI();
    }
  }

  function handleGoogle(r) {
    setErrorMsg('');
    setSubmitting(true);
    if (btnTextRef.current) btnTextRef.current.textContent = 'Signing in…';
    const role = currentRole === 'pick' ? 'customer' : 'owner';
    fetch(`${API}/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: r.credential, role }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data || data.error) {
          setErrorMsg(data?.message || 'Google sign-in failed.');
          setSubmitting(false);
          updateUI();
          return;
        }
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data));
        window.location.href =
          data.role === 'owner' ? 'owner-dashboard.html' : 'customer-dashboard.html';
      })
      .catch(() => {
        setErrorMsg('Cannot connect to server.');
        setSubmitting(false);
        updateUI();
      });
  }

  function googleClick() {
    window.google.accounts.id.initialize({
      client_id: '968585560679-k9f6mnvmd9lkb1s74lbikilotnvb5tgg.apps.googleusercontent.com',
      callback: handleGoogle,
    });
    window.google.accounts.id.prompt();
  }

  return (
    <>
      <DotField />

      <nav>
        <div className="nav-logo">
          CAR<span>-</span>ENT
        </div>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#support">Support</a>
          <a href="#login" className="nav-cta">
            Sign in
          </a>
        </div>
      </nav>

      {/* SPLIT HERO: left = content, right = login card */}
      <section className="hero-split" id="how">
        <div className="hero-left">
          <span className="badge">
            <span className="badge-dot" /> Now in 12 cities across India
          </span>
          <h1>
            Rent verified cars from <em>real owners</em>. Or list yours and earn — simple, transparent, yours.
          </h1>
          <p>No middlemen. No markups. Every car verified, every owner vetted.</p>
          <div className="hero-actions">
            <a href="#login" className="btn btn-primary">
              Start renting
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <a href="#login" className="btn btn-ghost">
              List your car
            </a>
          </div>
          <div className="stats">
            <div>
              <strong>2,500</strong>
              <span>Cars listed</span>
            </div>
            <div>
              <strong>12</strong>
              <span>Cities</span>
            </div>
            <div>
              <strong>98%</strong>
              <span>Satisfaction</span>
            </div>
          </div>
        </div>

        <div className="hero-right" id="login">
          <div className="login-box">
            <div className="login-logo" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <h2 ref={loginTitleRef}>Welcome back.</h2>
            <p className="sub" ref={loginSubRef}>
              Sign in to continue.
            </p>

            <div className="role-row">
              <button type="button" className="role-btn is-active" ref={btnPickRef} onClick={() => setRole('pick')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
                Rent a car
              </button>
              <button type="button" className="role-btn" ref={btnGiveRef} onClick={() => setRole('give')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12" />
                  <path d="M7 8l5-5 5 5" />
                  <rect x="4" y="15" width="16" height="6" rx="1.5" />
                </svg>
                List your car
              </button>
            </div>

            <div className="input-group" style={{ display: isRegister ? 'block' : 'none' }}>
              <input id="name" ref={nameRef} type="text" placeholder="Full name" autoComplete="name" />
            </div>
            <div className="input-group">
              <input id="email" ref={emailRef} type="email" placeholder="Email" autoComplete="email" />
            </div>
            <div className="input-group pwd-field">
              <input
                id="password"
                ref={passwordRef}
                type={showPwd ? 'text' : 'password'}
                placeholder="Password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="Btn"
                aria-label={showPwd ? 'Hide password' : 'Show password'}
                onClick={() => setShowPwd((s) => !s)}
              >
                <div className="BG" />
                <div className="svgContainer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {showPwd ? (
                      <>
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                        <line x1="2" x2="22" y1="2" y2="22" />
                      </>
                    ) : (
                      <>
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </div>
              </button>
            </div>

            <button type="button" className="submit-btn" disabled={submitting} onClick={handleSubmit}>
              <span ref={btnTextRef}>Continue</span>
            </button>

            <div className="or-divider">or continue with</div>

            <button type="button" className="google-btn" disabled={submitting} onClick={googleClick}>
              <svg viewBox="0 0 48 48">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6 29.5 4 24 4c-7.4 0-13.8 4.2-17 10.3z" />
                <path fill="#4CAF50" d="M24 44c5.4 0 10.3-1.8 14.1-5l-6.5-5.3C29.5 35.4 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.9 39.6 16.4 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.3C40.9 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
              </svg>
              Continue with Google
            </button>

            <div className="login-foot">
              Don't have an account?{' '}
              <a href="#" onClick={toggleMode}>
                {isRegister ? 'Sign in' : 'Create one'}
              </a>
            </div>
            <div className="error-msg" role="alert" aria-live="polite">
              {errorMsg}
            </div>

            <div className="login-secure">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Your information is encrypted and never shared.
            </div>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <div className="pricing-card pricing-card--light">
          <div className="label">Renters</div>
          <div className="amount">₹0</div>
          <div className="period">Free, always</div>
          <div className="note">Browse, book, and drive. No subscription. No hidden fees.</div>
          <a href="#login" className="btn btn-dark btn-block">
            Start renting
          </a>
        </div>
        <div className="pricing-card pricing-card--accent">
          <div className="label">Car Owners</div>
          <div className="amount">₹100</div>
          <div className="period">per month</div>
          <div className="note">List your car, earn on your schedule. We handle bookings &amp; payments.</div>
          <a href="#login" className="btn btn-primary btn-block">
            List your car
          </a>
        </div>
      </section>

      <footer id="support">
        <div className="footer-brand">
          <div className="nav-logo">
            CAR<span>-</span>ENT
          </div>
          <p>Peer-to-peer car rental. Verified owners, verified cars, zero markups.</p>
        </div>
        <div className="footer-cols">
          <div>
            <h4>Renters</h4>
            <a href="#how">How it works</a>
            <a href="#pricing">Browse cars</a>
            <a href="#login">Sign in</a>
          </div>
          <div>
            <h4>Car owners</h4>
            <a href="#pricing">List your car</a>
            <a href="#pricing">Pricing</a>
            <a href="#support">Support</a>
          </div>
        </div>
        <div className="footer-bottom">Copyright © 2026 CAR-ENT. All rights reserved.</div>
      </footer>
    </>
  );
}
