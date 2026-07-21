/* ===== CAR-ENT ROAMING SUV =====
   A single car that autonomously roams around the screen.
   Include after cursor.css:
     <link rel="stylesheet" href="/cursor/cursor.css">
     <script src="/cursor/cursor.js" defer></script>
*/
(function () {
  var isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isTouch || reducedMotion) return;

  var SIZE = 250;
  var SPEED = 90;
  var TURN_SPEED = 1.2;

  function init() {
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

    var wheelFront = cursor.querySelector('.suv-cursor__wheel--front');
    var wheelRear = cursor.querySelector('.suv-cursor__wheel--rear');

    var W = window.innerWidth;
    var H = window.innerHeight;
    window.addEventListener('resize', function () { W = window.innerWidth; H = window.innerHeight; });

    var x = Math.random() * (W - SIZE);
    var y = Math.random() * (H - SIZE);
    var angle = Math.random() * Math.PI * 2;
    var wheelAngle = 0;
    var lastTime = performance.now();

    cursor.classList.add('is-visible');

    function frame(now) {
      var dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      angle += (Math.random() - 0.5) * TURN_SPEED * dt;
      x += Math.cos(angle) * SPEED * dt;
      y += Math.sin(angle) * SPEED * dt;

      var padding = 20;
      if (x < -padding) { x = W - SIZE + padding; angle = Math.random() * Math.PI - Math.PI / 2; }
      if (x > W - SIZE + padding) { x = -padding; angle = Math.PI + (Math.random() * Math.PI - Math.PI / 2); }
      if (y < -padding) { y = H - SIZE + padding; angle = Math.PI / 2 + (Math.random() * Math.PI - Math.PI / 2); }
      if (y > H - SIZE + padding) { y = -padding; angle = -Math.PI / 2 + (Math.random() * Math.PI - Math.PI / 2); }

      wheelAngle += SPEED * dt * 0.6;
      var wheelTf = 'translate(-50%,-50%) rotate(' + wheelAngle + 'deg)';
      wheelFront.style.transform = wheelTf;
      wheelRear.style.transform = wheelTf;

      var facingRight = Math.cos(angle) >= 0;
      var tiltDeg = Math.sin(angle) * 4;

      cursor.style.transform =
        'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + tiltDeg + 'deg) scaleX(' + (facingRight ? 1 : -1) + ')';

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
