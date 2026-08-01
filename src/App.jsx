import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    const API =
      import.meta.env.VITE_API_URL ||
      (window.location.port === '5173' ? 'http://localhost:8081/api/auth' : '/api/auth');
    let isRegister = false;
    let currentRole = 'pick';
    let counted = false;

    const $ = (id) => document.getElementById(id);
    const btnPick = $('btnPick');
    const btnGive = $('btnGive');
    const signinBtn = $('signinBtn');
    const btnText = $('btnText');
    const nameField = $('nameField');
    const nameInput = $('name');
    const email = $('email');
    const password = $('password');
    const errorMsg = $('errorMsg');
    const toggleLink = $('toggleLink');
    const loginTitle = $('loginTitle');
    const loginSub = $('loginSub');
    const nav = $('nav');
    if (!signinBtn || !email || !password) return;

    /* Nav shadow on scroll */
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 10);
    window.addEventListener('scroll', onScroll);

    /* Reveal-on-scroll + stat count-up */
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('is-visible');
          if (e.target.closest('.stats')) countUp();
        });
      },
      { threshold: 0.2 },
    );
    document.querySelectorAll('.reveal').forEach((el) => obs.observe(el));
    const revealFallback = setTimeout(() => {
      document.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => el.classList.add('is-visible'));
    }, 1500);

    function countUp() {
      if (counted) return;
      counted = true;
      document.querySelectorAll('[data-n]').forEach((el) => {
        const target = parseInt(el.dataset.n, 10);
        let cur = 0;
        const step = Math.max(1, Math.floor(target / 40));
        const t = setInterval(() => {
          cur = Math.min(cur + step, target);
          el.textContent = target === 98 ? cur + '%' : cur.toLocaleString();
          if (cur >= target) clearInterval(t);
        }, 30);
      });
    }

    /* Smooth in-page anchors */
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const el = document.querySelector(a.getAttribute('href'));
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      });
    });

    /* Button ripple */
    function ripple(e, el) {
      const r = el.getBoundingClientRect();
      const d = Math.max(r.width, r.height);
      const span = document.createElement('span');
      span.style.cssText =
        `position:absolute;border-radius:50%;background:rgba(255,255,255,0.2);width:${d}px;height:${d}px;` +
        `left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px;transform:scale(0);` +
        `animation:rip .5s forwards;pointer-events:none`;
      el.style.position = 'relative';
      el.style.overflow = 'hidden';
      el.appendChild(span);
      setTimeout(() => span.remove(), 600);
    }
    document.querySelectorAll('.btn-pri,.subbtn,.gbtn').forEach((b) =>
      b.addEventListener('click', function (e) {
        if (!this.disabled) ripple(e, this);
      }),
    );

    /* Role toggle (Rent a car / List your car) */
    function setRole(role) {
      currentRole = role;
      const p = role === 'pick';
      btnPick.classList.toggle('is-active', p);
      btnGive.classList.toggle('is-active', !p);
      up();
    }
    function up() {
      const p = currentRole === 'pick';
      if (isRegister) {
        loginTitle.textContent = 'Create your account.';
        loginSub.textContent = p ? 'Free for renters. No credit card needed.' : 'Start earning with your car.';
        btnText.textContent = p ? 'Create account' : 'Register as owner';
      } else {
        loginTitle.textContent = 'Welcome back.';
        loginSub.textContent = 'Sign in to continue.';
        btnText.textContent = 'Continue';
      }
    }
    btnPick.addEventListener('click', () => setRole('pick'));
    btnGive.addEventListener('click', () => setRole('give'));

    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      isRegister = !isRegister;
      nameField.style.display = isRegister ? 'block' : 'none';
      toggleLink.textContent = isRegister ? 'Sign in' : 'Create one';
      errorMsg.textContent = '';
      up();
    });

    function showErr(m) {
      errorMsg.textContent = m;
    }

    /* Email/password auth */
    signinBtn.addEventListener('click', async () => {
      errorMsg.textContent = '';
      const n = nameInput.value.trim();
      const e = email.value.trim();
      const p = password.value.trim();
      if (!e || !p || (isRegister && !n)) {
        showErr('Please fill in all fields.');
        return;
      }
      if (!e.includes('@')) {
        showErr('Enter a valid email.');
        return;
      }
      if (p.length < 6) {
        showErr('Password must be at least 6 characters.');
        return;
      }
      signinBtn.disabled = true;
      btnText.textContent = isRegister ? 'Creating account…' : 'Signing in…';
      try {
        const ep = isRegister ? `${API}/register` : `${API}/login`;
        const role = currentRole === 'pick' ? 'customer' : 'owner';
        const body = isRegister
          ? { name: n, email: e, password: p, role }
          : { email: e, password: p, role };
        const res = await fetch(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await res.json();
        if (!res.ok) {
          showErr(d.message || 'Something went wrong.');
          signinBtn.disabled = false;
          up();
          return;
        }
        localStorage.setItem('token', d.token);
        localStorage.setItem('user', JSON.stringify(d));
        window.location.href = d.role === 'owner' ? 'dashboard.html' : 'customer-dashboard.html';
      } catch (_) {
        showErr('Cannot connect to server.');
        signinBtn.disabled = false;
        up();
      }
    });

    /* Google sign-in */
    const googleBtn = $('googleBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => {
        const role = currentRole === 'pick' ? 'customer' : 'owner';
        window.google.accounts.id.initialize({
          client_id: '968585560679-k9f6mnvmd9lkb1s74lbikilotnvb5tgg.apps.googleusercontent.com',
          callback: (r) => handleGoogle(r, role),
        });
        window.google.accounts.id.prompt();
      });
    }

    async function handleGoogle(r, role) {
      errorMsg.textContent = '';
      signinBtn.disabled = true;
      btnText.textContent = 'Signing in…';
      try {
        const res = await fetch(`${API}/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: r.credential, role }),
        });
        const d = await res.json();
        if (!res.ok) {
          showErr(d.message || 'Google sign-in failed.');
          signinBtn.disabled = false;
          up();
          return;
        }
        localStorage.setItem('token', d.token);
        localStorage.setItem('user', JSON.stringify(d));
        window.location.href = d.role === 'owner' ? 'dashboard.html' : 'customer-dashboard.html';
      } catch (_) {
        showErr('Cannot connect to server.');
        signinBtn.disabled = false;
        up();
      }
    }

    /* Car facts rotation */
    const facts = [
      "The first speeding ticket was issued in 1896 — the driver was going just 8 mph. Even the horse next door was unimpressed.",
      "Cruise control was invented by a blind engineer. He couldn't see the road, but he definitely saw the bigger picture.",
      "Car horns are tuned to the note F. So when someone honks at you, they're technically singing a very angry song.",
      "Most cars spend about 95% of their life parked. Yours is basically an expensive nap pod with wheels.",
      "'New car smell' is 50+ chemicals off-gassing. You're not smelling freshness — you're sniffing science.",
      "Volkswagen once sold more currywurst sausages than cars in a single year. The car factory doubles as a deli.",
      "White is the most popular car color — it stays cooler in the sun and hides our parking-lot shame best.",
      "A modern car has roughly 30,000 parts. As a Lego set, the instructions would be banned in 40 countries.",
      "EV tires wear out 20–30% faster because battery packs are heavy. Tires on an electric car are basically a gym membership.",
      "Dubai's police fleet includes a Bugatti Veyron that tops 253 mph. The local speed limit is 80 km/h — it's the world's most expensive paperweight.",
      "A Formula 1 car can generate enough downforce to drive upside down at 120 mph. Physics is the only thing keeping it honest.",
      "The VW Beetle was in production for 65+ years. It outlived several entire music genres.",
      "Early cars steered with tillers — like a boat. Then drivers realized boats belong in the water.",
      "Some modern cars play fake engine sounds through speakers. Your car is not a car, it's an actor.",
      "Your dashboard clock flickering can predict battery failure. That's the car's way of saying 'I'm dying, call my people.'",
      "Braking too gently can actually glaze your rotors. Being too polite to your brakes is a mechanical crime.",
      "The first car accident happened in 1891, and the culprit was a tree. Trees have hated cars since day one.",
      "Over 60% of all Rolls-Royces ever built are still on the road. The rest are in garages being gently breathed on.",
      "The Bugatti Chiron has a second key that unlocks a 420 km/h top speed. It's the adult version of a cheat code.",
      "A road trip to the moon at highway speed would take about six months. Pack snacks.",
      "Windshields were added to cars partly because people kept catching bugs with their teeth.",
      "Electric cars existed decades before gasoline ones. The 1900s saw the future and said 'nah, give me the loud one.'",
      "The average person spends about 4.3 years of their life driving. Make it count — or at least make it funny.",
      "The Koenigsegg Gemera hits 248 mph and still comes with cup holders, because priorities.",
    ];
    const heroFact = document.getElementById('heroFact');
    let factsTimer = null;
    if (heroFact) {
      let idx = Math.floor(Math.random() * facts.length);
      factsTimer = setInterval(() => {
        heroFact.style.opacity = 0;
        setTimeout(() => {
          idx = (idx + 1) % facts.length;
          heroFact.textContent = facts[idx];
          heroFact.style.opacity = 1;
        }, 500);
      }, 12000);
    }

    /* Butterfly password visibility toggle */
    const pwBtn = document.getElementById('pwToggle');
    if (pwBtn) {
      pwBtn.addEventListener('click', () => {
        const show = password.type === 'password';
        password.type = show ? 'text' : 'password';
        pwBtn.classList.toggle('visible', show);
      });
    }

    /* ===== Virtual keyboard (ported from the static page) ===== */
    (function () {
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

      document.body.appendChild(panel);

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

      const vkbFields = [nameInput, email, password].filter(Boolean);
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

      panel.addEventListener('click', (e) => {
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
      });

      vkbFields.forEach((field) => {
        field.addEventListener('focus', () => {
          activeField = field;
          saveCursor(field);
          openPanel();
          updateCursorLabel(field);
        });
        field.addEventListener('click', () => saveCursor(field));
        field.addEventListener('keyup', () => saveCursor(field));
        field.addEventListener('input', () => saveCursor(field));
        field.addEventListener('beforeinput', (e) => {
          if (e.inputType === 'insertText' && e.data) {
            const ch = e.data;
            const code = CHAR_TO_CODE[ch.toLowerCase()];
            if (code) vkbFlash(code);
            if (ch.toLowerCase() !== ch || '!@#$%^&*()_+{}<>?|~'.includes(ch)) vkbFlash('ShiftLeft');
          } else if (e.inputType === 'deleteContentBackward') {
            vkbFlash('Backspace');
          }
        });
        field.addEventListener('keydown', (e) => {
          if (e.code === 'Enter') vkbFlash('Enter');
        });
      });

      document.addEventListener('focusin', (e) => {
        if (vkbFields.includes(e.target)) {
          openPanel();
          updateCursorLabel(e.target);
        } else if (!panel.contains(e.target)) {
          closePanel();
        }
      });

      document.addEventListener('keydown', (e) => {
        if (!activeField || activeField !== document.activeElement) return;
        const k = vkbKeyEls[e.code];
        if (k) {
          k.classList.remove('active');
          void k.offsetWidth;
          k.classList.add('active');
          clearTimeout(k._t);
          k._t = setTimeout(() => k.classList.remove('active'), 220);
        }
      });
    })();

    return () => {
      window.removeEventListener('scroll', onScroll);
      obs.disconnect();
      clearTimeout(revealFallback);
      if (factsTimer) clearInterval(factsTimer);
    };
  }, []);

  return (
    <>
      <div className="noise" aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />
      <div className="ambient-bg" aria-hidden="true">
        <span className="blob" />
        <span className="blob" />
        <span className="blob" />
        <span className="blob" />
        <span className="blob" />
      </div>

      <nav id="nav">
        <div className="nav-logo">
          <span className="dot" /> CAR-ENT
        </div>
        <div className="nav-links">
          <a href="#">How it works</a>
          <a href="#">Pricing</a>
          <a href="#">Support</a>
          <a href="#" className="nav-cta">
            Sign in
          </a>
        </div>
      </nav>

      <section className="top">
        <div className="hero">
          <div className="hero-badge reveal reveal-down reveal-d1">
            <span className="pulse" /> Now in 12 cities across India
          </div>
          <p
            id="heroFact"
            className="reveal reveal-up reveal-d2"
            style={{
              transition: 'opacity 0.5s',
              fontSize: 'clamp(1.8rem,3.5vw,2.8rem)',
              color: '#1d1d1f',
              fontWeight: 700,
              lineHeight: 1.2,
              maxWidth: 520,
              letterSpacing: '-0.03em',
              background: 'rgba(0,0,0,0.04)',
              padding: '1.2rem 1.6rem',
              borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.06)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            Rent verified cars from real owners. Or list yours and earn. Simple, transparent, yours.
          </p>
          <div className="hero-actions reveal reveal-up reveal-d3">
            <a href="#login" className="btn-pri">
              Start renting
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </a>
            <a href="#" className="btn-sec">
              List your car
            </a>
          </div>
          <div className="hero-car" aria-hidden="true">
            <div className="hero-car-body">
              <div className="car-top" />
              <div className="car-bottom" />
              <div className="car-wheel-l" />
              <div className="car-wheel-r" />
              <div className="car-headlight" />
            </div>
          </div>
        </div>

        <section className="login-section" id="login">
          <div className="login-box reveal reveal-up reveal-d2">
            <div className="lb-brand">
              <span className="lb-brand-dot" />
              <span className="lb-brand-name">CAR-ENT</span>
            </div>
            <h2 id="loginTitle">Welcome back.</h2>
            <p className="sub" id="loginSub">
              Sign in to continue.
            </p>

            <div className="row">
              <button type="button" className="rbtn is-active" id="btnPick">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
                Rent a car
              </button>
              <button type="button" className="rbtn" id="btnGive">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12" />
                  <path d="M7 8l5-5 5 5" />
                  <rect x="4" y="15" width="16" height="6" rx="1.5" />
                </svg>
                List your car
              </button>
            </div>

            <div className="ig" id="nameField" style={{ display: 'none' }}>
              <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-3.5 3.6-5.5 8-5.5s8 2 8 5.5" />
              </svg>
              <input id="name" type="text" placeholder="Full name" autoComplete="name" />
            </div>
            <div className="ig">
              <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="m3 7 9 6 9-6" />
              </svg>
              <input id="email" type="email" placeholder="Email" autoComplete="email" />
            </div>
            <div className="ig pw-wrap">
              <svg className="ig-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <input id="password" type="password" placeholder="Password" autoComplete="current-password" />
              <button type="button" className="pw-toggle" id="pwToggle" aria-label="Toggle password visibility">
                <svg className="bf-closed" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C9.5 2 7.5 4 7.5 6.5c0 1.5.7 2.8 1.8 3.7L12 12l2.7-1.8c1.1-.9 1.8-2.2 1.8-3.7C16.5 4 14.5 2 12 2zM12 14c-3 0-5.5 1.5-5.5 3.5S9 21 12 21s5.5-1.5 5.5-3.5S15 14 12 14z" />
                  <line x1="12" y1="2" x2="12" y2="21" stroke="currentColor" strokeWidth="0.5" />
                </svg>
                <svg className="bf-open" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 11c-4.5 0-8-3-8-6.5S7.5 2 12 2s8 1.5 8 4.5S16.5 11 12 11z" opacity="0.85" />
                  <path d="M12 13c-4.5 0-8 2.5-8 5.5S7.5 22 12 22s8-2.5 8-5.5S16.5 13 12 13z" opacity="0.85" />
                  <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1" />
                  <path d="M12 2c-1-2-3-3-4-3" fill="none" stroke="currentColor" strokeWidth="0.8" />
                  <path d="M12 2c1-2 3-3 4-3" fill="none" stroke="currentColor" strokeWidth="0.8" />
                </svg>
              </button>
            </div>

            <button type="button" className="subbtn" id="signinBtn">
              <span id="btnText">Continue</span>
              <svg className="subbtn-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </button>

            <div className="or">or continue with</div>

            <button type="button" className="gbtn" id="googleBtn">
              <svg viewBox="0 0 48 48">
                <path
                  fill="#FFC107"
                  d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3 0 5.8 1.1 7.9 2.9l5.7-5.7C34.5 6 29.5 4 24 4c-7.4 0-13.8 4.2-17 10.3z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.4 0 10.3-1.8 14.1-5l-6.5-5.3C29.5 35.4 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.9 39.6 16.4 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.5 5.3C40.9 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"
                />
              </svg>
              Google
            </button>

            <div className="foot">
              Don't have an account?{' '}
              <a href="#" id="toggleLink">
                Create one
              </a>
            </div>
            <div className="err" id="errorMsg" role="alert" aria-live="polite" />
          </div>
        </section>
      </section>

      <div className="stats reveal reveal-up reveal-d5">
        <div className="stat">
          <div className="num" data-n="2500">
            0
          </div>
          <div className="label">Cars listed</div>
        </div>
        <div className="stat">
          <div className="num" data-n="12">
            0
          </div>
          <div className="label">Cities</div>
        </div>
        <div className="stat">
          <div className="num" data-n="98">
            0<span style={{ fontSize: '1rem' }}>%</span>
          </div>
          <div className="label">Satisfaction</div>
        </div>
      </div>

      <section className="pricing">
        <div className="pricing-card reveal reveal-left reveal-d3">
          <div className="label">Renters</div>
          <div className="amount">₹0</div>
          <div className="period">Free, always</div>
          <div className="note">Browse, book, and drive. No subscription. No hidden fees. Pay only for what you drive.</div>
        </div>
        <div className="pricing-card pricing-card--dark reveal reveal-right reveal-d4">
          <div className="label">Car Owners</div>
          <div className="amount">₹100</div>
          <div className="period">per month</div>
          <div className="note">List your car, set your price, earn on your schedule. We handle bookings and payments.</div>
        </div>
      </section>

      <div className="features reveal reveal-up reveal-d5">
        <div className="chip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
          Verified cars
        </div>
        <div className="chip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="m16 10-4 4-4-4" />
          </svg>
          Transparent pricing
        </div>
        <div className="chip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
          24x7 support
        </div>
        <div className="chip">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          Flexible pickup
        </div>
      </div>

      <footer>
        <div>© 2026 CAR-ENT. All rights reserved.</div>
        <div className="flinks">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Sitemap</a>
        </div>
      </footer>
    </>
  );
}
