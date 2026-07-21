/* ===== CAR-ENT MINI-SUV CURSOR =====
   Drop this file at: frontend/public/cursor/cursor.js
   Include AFTER cursor.css, anywhere in the page (defer is fine):
     <link rel="stylesheet" href="/cursor/cursor.css">
     <script src="/cursor/cursor.js" defer></script>

   Opt an element into the "hover-card" glow state without editing this
   file by adding: data-cursor="card"
   Opt an element into the "hover-input" blink state with: data-cursor="input"
*/
(function () {
  var isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // On touch devices or when the user prefers reduced motion, do nothing
  // and leave the native cursor exactly as it was.
  if (isTouch || reducedMotion) return;

  var CURSOR_SIZE = 96;

  function init() {
    document.documentElement.classList.add('has-suv-cursor');

    var cursor = document.createElement('div');
    cursor.className = 'suv-cursor';
    cursor.id = 'suvCursor';
    cursor.innerHTML =
      '<div class="suv-cursor__ambient"></div>' +
      '<img class="suv-cursor__img" src="cursor/mini-suv.png" alt="">' +
      '<div class="suv-cursor__wheel suv-cursor__wheel--front"></div>' +
      '<div class="suv-cursor__wheel suv-cursor__wheel--rear"></div>' +
      '<div class="suv-cursor__headlight"></div>' +
      '<div class="suv-cursor__foglight"></div>';
    document.body.appendChild(cursor);

    var img = cursor.querySelector('.suv-cursor__img');
    var wheelFront = cursor.querySelector('.suv-cursor__wheel--front');
    var wheelRear = cursor.querySelector('.suv-cursor__wheel--rear');

    var mouseX = window.innerWidth / 2;
    var mouseY = window.innerHeight / 2;
    var posX = mouseX, posY = mouseY;
    var velX = 0, velY = 0;
    var wheelAngle = 0;
    var tiltDeg = 0;
    var idleTimer = null;
    var scrollTimer = null;
    var lastScrollY = window.scrollY;
    var lastTime = performance.now();

    // Spring physics: stiffness/damping change per state so the SUV
    // "accelerates" (snappier catch-up) on hover and "slows" (lazier,
    // softer settle) when idle.
    var BASE_STIFFNESS = 320, BASE_DAMPING = 28;
    var HOVER_STIFFNESS = 480, HOVER_DAMPING = 30;
    var IDLE_STIFFNESS = 160, IDLE_DAMPING = 24;
    var MASS = 0.6;
    var WHEEL_ROTATION_FACTOR = 0.9; // deg of wheel spin per (px/s) of speed

    var stiffness = BASE_STIFFNESS, damping = BASE_DAMPING;

    function show() { cursor.classList.add('is-visible'); }
    function hide() { cursor.classList.remove('is-visible'); }

    function setIdle(isIdle) {
      cursor.classList.toggle('idle', isIdle);
      if (isIdle) { stiffness = IDLE_STIFFNESS; damping = IDLE_DAMPING; }
      else if (!cursor.classList.contains('hover-btn')) { stiffness = BASE_STIFFNESS; damping = BASE_DAMPING; }
    }

    document.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      show();
      setIdle(false);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { setIdle(true); }, 2000);
    });
    document.addEventListener('mouseleave', hide);

    // rAF spring loop — also drives wheel spin from real cursor speed,
    // so wheels naturally spin fast while moving and stop at idle.
    function frame(now) {
      var dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      var fx = -stiffness * (posX - mouseX) - damping * velX;
      var fy = -stiffness * (posY - mouseY) - damping * velY;
      velX += (fx / MASS) * dt;
      velY += (fy / MASS) * dt;
      posX += velX * dt;
      posY += velY * dt;

      var speed = Math.hypot(velX, velY);
      wheelAngle += speed * dt * WHEEL_ROTATION_FACTOR;
      var wheelTf = 'translate(-50%,-50%) rotate(' + wheelAngle + 'deg)';
      wheelFront.style.transform = wheelTf;
      wheelRear.style.transform = wheelTf;

      cursor.style.transform =
        'translate3d(' + (posX - CURSOR_SIZE / 2) + 'px,' + (posY - CURSOR_SIZE / 2) + 'px,0) rotate(' + tiltDeg + 'deg)';

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // ---- hover states (event delegation so it works with dynamic content) ----
    var BTN_SEL = 'a, button, [role="button"], input[type="submit"], input[type="button"], label[for], [data-cursor="button"]';
    var CARD_SEL = '.feature-card, .trust-item, .owner-card, .card, [data-cursor="card"]';
    var INPUT_SEL = 'input:not([type="submit"]):not([type="button"]), textarea, select, [data-cursor="input"]';

    function closestMatch(el, sel) { return el && el.closest ? el.closest(sel) : null; }

    document.addEventListener('mouseover', function (e) {
      if (closestMatch(e.target, BTN_SEL)) {
        cursor.classList.remove('hover-card', 'hover-input');
        cursor.classList.add('hover-btn');
        stiffness = HOVER_STIFFNESS; damping = HOVER_DAMPING;
      } else if (closestMatch(e.target, CARD_SEL)) {
        cursor.classList.remove('hover-btn', 'hover-input');
        cursor.classList.add('hover-card');
      } else if (closestMatch(e.target, INPUT_SEL)) {
        cursor.classList.remove('hover-btn', 'hover-card');
        cursor.classList.add('hover-input');
      }
    });

    document.addEventListener('mouseout', function (e) {
      var to = e.relatedTarget;
      if (closestMatch(e.target, BTN_SEL) && !closestMatch(to, BTN_SEL)) {
        cursor.classList.remove('hover-btn');
        if (!cursor.classList.contains('idle')) { stiffness = BASE_STIFFNESS; damping = BASE_DAMPING; }
      }
      if (closestMatch(e.target, CARD_SEL) && !closestMatch(to, CARD_SEL)) cursor.classList.remove('hover-card');
      if (closestMatch(e.target, INPUT_SEL) && !closestMatch(to, INPUT_SEL)) cursor.classList.remove('hover-input');
    });

    // ---- click bounce ----
    document.addEventListener('mousedown', function () {
      img.classList.add('clicked');
      setTimeout(function () { img.classList.remove('clicked'); }, 150);
    });

    // ---- scroll tilt ----
    window.addEventListener('scroll', function () {
      var currentY = window.scrollY;
      if (currentY > lastScrollY) tiltDeg = 6;
      else if (currentY < lastScrollY) tiltDeg = -6;
      lastScrollY = currentY;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(function () { tiltDeg = 0; }, 150);
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
