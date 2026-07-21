(function () {
  var video = document.getElementById('greenscreenVideo');
  var canvas = document.getElementById('greenscreenCanvas');
  if (!video || !canvas) return;
  var ctx = canvas.getContext('2d', { willReadFrequently: true });

  function resize() {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  video.addEventListener('loadedmetadata', resize);

  var KEY_R = 0, KEY_G = 180, KEY_B = 0;
  var THRESHOLD = 90;
  var SOFTNESS = 40;

  function dist(r, g, b) {
    var dr = r - KEY_R, dg = g - KEY_G, db = b - KEY_B;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  function process() {
    if (video.paused || video.ended) { requestAnimationFrame(process); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    var data = frame.data;
    for (var i = 0; i < data.length; i += 4) {
      var d = dist(data[i], data[i + 1], data[i + 2]);
      if (d < THRESHOLD) {
        data[i + 3] = 0;
      } else if (d < THRESHOLD + SOFTNESS) {
        data[i + 3] = Math.round(((d - THRESHOLD) / SOFTNESS) * data[i + 3]);
      }
    }
    ctx.putImageData(frame, 0, 0);
    requestAnimationFrame(process);
  }

  video.play().then(function () { requestAnimationFrame(process); }).catch(function () {});
})();
