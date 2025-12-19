// - Wave LEFT/RIGHT to start recording
// - Wave UP/DOWN to change color palette 
// - 3s recording with countdown, timer, and replay of the recording

window.addEventListener('DOMContentLoaded', () => {
  const artCanvas = document.getElementById('artCanvas');
  const uiCanvas = document.getElementById('uiCanvas');
  const startBtn = document.getElementById('startBtn');

  if (!artCanvas || !uiCanvas || !startBtn) {
    console.error('Canvas or button not found. Check IDs in HTML.');
    alert('Internal error: missing canvas or button.');
    return;
  }

  const artCtx = artCanvas.getContext('2d');
  const uiCtx = uiCanvas.getContext('2d');
  if (!artCtx || !uiCtx) {
    console.error('2D context not available.');
    alert('Your browser does not support Canvas 2D.');
    return;
  }

  function resize() {
    artCanvas.width = window.innerWidth;
    artCanvas.height = window.innerHeight;
    uiCanvas.width = window.innerWidth;
    uiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const state = {
    mode: 'idle',          // idle | countdown | recording | transition | playback
    countdown: 0,
    transition: 0,         // 1 → 0 during "REPLAY" fade
    recordRemaining: 0,    // seconds left in current recording

    // gesture & hints
    horizontalHistory: [],
    verticalHistory: [],
    lastWaveStart: 0,
    hintTime: 0,

    // color palettes
    paletteIndex: 0,
    lastPaletteChange: 0
  };

  let lastTime = 0;

  // Color Palettes 
  // 10 palette ranges 
  const colorPalettes = [
    { startHue: 0, endHue: 60 },  // red yellow
    { startHue: 40, endHue: 140 },  // orange  green
    { startHue: 120, endHue: 220 },  // green blue
    { startHue: 200, endHue: 300 },  // blue  magenta
    { startHue: 260, endHue: 360 },  // purple  red
    { startHue: 300, endHue: 60 },  // magenta  yellow 
    { startHue: 180, endHue: 300 },  // cyan  magenta
    { startHue: 20, endHue: 200 },  // warm cool
    { startHue: 80, endHue: 260 },  // lime purple
    { startHue: 330, endHue: 90 }   // pink orange
  ];

  function pickRandomPalette() {
    const now = performance.now();
    // cooldown to avoid the palette changing too fast, which might be hard to control
    if (now - state.lastPaletteChange < 400) return;

    const old = state.paletteIndex;
    let idx = old;
    while (idx === old) {
      idx = Math.floor(Math.random() * colorPalettes.length);
    }
    state.paletteIndex = idx;
    state.lastPaletteChange = now;
    console.log('Palette changed to', idx);
  }

  //  Webcam + motion detection
  let camStream = null;
  let camVideo = null;

  // Motion detection canvas 
  const motionW = 240;
  const motionH = 180;
  const motionCanvas = document.createElement('canvas');
  motionCanvas.width = motionW;
  motionCanvas.height = motionH;
  const motionCtx = motionCanvas.getContext('2d');
  let prevLuma = null;

  async function setupCamera() {
    if (camStream) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera not supported in this browser.');
      return;
    }

    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
          frameRate: { ideal: 60 },
          latency: { ideal: 0 },
          facingMode: "user"
        },
        audio: false
      });
    } catch (err) {
      console.error('getUserMedia failed:', err);
      alert('Could not access camera: ' + err.message);
      return;
    }

    camVideo = document.createElement('video');
    camVideo.srcObject = camStream;
    camVideo.muted = true;
    camVideo.playsInline = true;

    await camVideo.play();
    console.log('Camera started.');
  }

  // Compute motion mask (difference vs previous frame) so we can detect motion points
  function computeMotionField() {
    if (!camVideo || camVideo.readyState < 2) {
      return { strength: 0, points: [] };
    }

    motionCtx.drawImage(camVideo, 0, 0, motionW, motionH);
    const img = motionCtx.getImageData(0, 0, motionW, motionH).data;

    if (!prevLuma) {
      prevLuma = new Float32Array(motionW * motionH);
    }

    const points = [];
    let diffSum = 0;

    for (let i = 0, p = 0; i < img.length; i += 4, p++) {
      const r = img[i];
      const g = img[i + 1];
      const b = img[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      const d = Math.abs(lum - prevLuma[p]);
      diffSum += d;

      // Motion threshold
      if (d > 18) {
        const x = (p % motionW) / motionW;
        const y = Math.floor(p / motionW) / motionH;
        points.push({ x, y });
      }

      prevLuma[p] = lum;
    }

    let strength = diffSum / (motionW * motionH * 255);
    strength = Math.max(0, Math.min(1, strength));

    return { strength, points };
  }

  // LEFT/RIGHT wave to start recording 
  function detectHorizontalWave(points, strength) {
    // Hard gate: ignore tiny/no movement
    if (strength < 0.12) return false;      // raise if still too sensitive so user can control better
    if (points.length < 220) return false;  // require enough motion pixels

    // Compute centroid X
    let sumX = 0;
    for (const p of points) sumX += p.x;
    const cx = sumX / points.length;

    const now = performance.now();
    state.horizontalHistory.push({ time: now, x: cx });

    // keep last ~800ms
    const cutoff = now - 800;
    state.horizontalHistory = state.horizontalHistory.filter(e => e.time > cutoff);

    if (state.horizontalHistory.length < 10) return false;

    // Range is maxX - minX
    let minX = Infinity, maxX = -Infinity;
    for (const e of state.horizontalHistory) {
      if (e.x < minX) minX = e.x;
      if (e.x > maxX) maxX = e.x;
    }
    const range = maxX - minX;

    // Direction changes (ignore tiny jitter) so it doesn't accidentally trigger
    let lastX = state.horizontalHistory[0].x;
    let lastSign = 0;
    let dirChanges = 0;

    for (let i = 1; i < state.horizontalHistory.length; i++) {
      const x = state.horizontalHistory[i].x;
      const dx = x - lastX;

      if (Math.abs(dx) < 0.03) { // ignore <3% width jitter
        lastX = x;
        continue;
      }

      const sign = dx > 0 ? 1 : -1;
      if (lastSign !== 0 && sign !== lastSign) dirChanges++;
      lastSign = sign;
      lastX = x;
    }

    const minRange = 0.6;     // big wave
    const minDirChanges = 4;   // left right left right
    const cooldownMs = 1800;

    if (range > minRange && dirChanges >= minDirChanges && (now - state.lastWaveStart > cooldownMs)) {
      state.lastWaveStart = now;
      console.log('Horizontal wave detected (gated)');
      return true;
    }
    return false;
  }

  // UP/DOWN wave to change colors
  function detectVerticalWave(points, strength) {
    if (strength < 0.10) return false;
    if (points.length < 180) return false;

    let sumY = 0;
    for (const p of points) sumY += p.y;
    const cy = sumY / points.length;

    const now = performance.now();
    state.verticalHistory.push({ time: now, y: cy });

    const cutoff = now - 700;
    state.verticalHistory = state.verticalHistory.filter(e => e.time > cutoff);

    if (state.verticalHistory.length < 8) return false;

    let minY = Infinity, maxY = -Infinity;
    for (const e of state.verticalHistory) {
      if (e.y < minY) minY = e.y;
      if (e.y > maxY) maxY = e.y;
    }

    return (maxY - minY) > 0.22;
  }

  // turn motion points into colored silhouette points
  //center of body = one color, hands/fingers = other colors
  function computeMotionColor(points) {
    if (!points.length) return [];

    // find rough center of motion (body center)
    let cx = 0, cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    const palette = colorPalettes[state.paletteIndex];
    let startHue = palette.startHue;
    let endHue = palette.endHue;

    // handle hue wrap around 360
    let range = endHue - startHue;
    if (range > 180) range -= 360;
    if (range < -180) range += 360;

    // color each motion point
    return points.map(p => {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // farther from center = more hand/finger
      const t = Math.min(1, dist * 6);

      return {
        x: p.x,
        y: p.y,
        distNorm: t,
        hue: (startHue + (1 - t) * range + 360) % 360
      };
    });
  }
  function drawSilhouette(points) {
    const w = artCanvas.width;
    const h = artCanvas.height;

    // clear crisp camera-like motion 
    artCtx.fillStyle = 'black';
    artCtx.fillRect(0, 0, w, h);

    if (!points.length) return;

    const coloredPoints = computeMotionColor(points);
    if (!coloredPoints.length) return;

    const maxDraw = 1000;
    const step = Math.max(1, Math.floor(coloredPoints.length / maxDraw));

    const baseRadius = Math.min(w, h) * 0.012;

    artCtx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < coloredPoints.length; i += step) {
      const cp = coloredPoints[i];

      const sx = cp.x * w;
      const sy = cp.y * h;

      const radius = baseRadius * (0.6 + 1.2 * cp.distNorm);
      const centerColor = `hsla(${cp.hue}, 100%, 60%, 0.9)`;

      const grad = artCtx.createRadialGradient(
        sx, sy, 0,
        sx, sy, radius
      );
      grad.addColorStop(0, centerColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      artCtx.fillStyle = grad;
      artCtx.beginPath();
      artCtx.arc(sx, sy, radius, 0, Math.PI * 2);
      artCtx.fill();
    }

    artCtx.globalCompositeOperation = 'source-over';
  }

  //  UI Overlays 
  function clearUI() {
    uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  }

  // Instructions on how to use
  function drawIdleHintsWithFade(t) {
    const w = uiCanvas.width;
    const h = uiCanvas.height;

    let alpha = Math.min(1, t * 0.6); // fade in ~1.5s

    uiCtx.save();
    uiCtx.globalAlpha = alpha;
    uiCtx.fillStyle = '#ffffff';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';

    uiCtx.font = `${Math.floor(w * 0.025)}px system-ui`;
    uiCtx.fillText("Wave LEFT ↔ RIGHT to Start Recording", w / 2, h * 0.85);

    uiCtx.font = `${Math.floor(w * 0.022)}px system-ui`;
    uiCtx.fillText("Wave UP ↕ DOWN to Change Colors", w / 2, h * 0.90);

    uiCtx.restore();
  }

  // Countdown: "Record in" + 3/2/1 in center
  function drawCountdownOverlay() {
    const w = uiCanvas.width;
    const h = uiCanvas.height;

    uiCtx.fillStyle = 'rgba(0,0,0,0.35)';
    uiCtx.fillRect(0, 0, w, h);

    const sec = Math.max(0, state.countdown);
    const num = Math.max(1, Math.ceil(sec));
    const phase = sec - Math.floor(sec);
    const alpha = 1 - phase;             // fade out

    uiCtx.fillStyle = '#ffffff';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.font = `${Math.floor(w * 0.04)}px system-ui`;
    uiCtx.fillText('Record in', w / 2, h / 2 - w * 0.09);

    uiCtx.save();
    uiCtx.globalAlpha = alpha;
    uiCtx.font = `bold ${Math.floor(w * 0.25)}px system-ui`;
    uiCtx.fillText(String(num), w / 2, h / 2 + w * 0.02);
    uiCtx.restore();
  }

  // Recording timer overlay: top-right
  function drawRecordingOverlay() {
    const w = uiCanvas.width;
    const h = uiCanvas.height;

    const t = Math.max(0, state.recordRemaining);
    const text = `Recording: ${t.toFixed(1)}s`;

    const margin = 16;
    const boxWidth = 220;
    const boxHeight = 40;
    const x = w - boxWidth - margin;
    const y = margin;

    uiCtx.save();

    const grad = uiCtx.createLinearGradient(x, y, x + boxWidth, y + boxHeight);
    grad.addColorStop(0, '#ff3366');
    grad.addColorStop(1, '#ffcc33');

    uiCtx.fillStyle = grad;
    uiCtx.beginPath();
    const radius = boxHeight / 2;
    uiCtx.moveTo(x + radius, y);
    uiCtx.lineTo(x + boxWidth - radius, y);
    uiCtx.quadraticCurveTo(x + boxWidth, y, x + boxWidth, y + radius);
    uiCtx.lineTo(x + boxWidth, y + boxHeight - radius);
    uiCtx.quadraticCurveTo(x + boxWidth, y + boxHeight, x + boxWidth - radius, y + boxHeight);
    uiCtx.lineTo(x + radius, y + boxHeight);
    uiCtx.quadraticCurveTo(x, y + boxHeight, x, y + boxHeight - radius);
    uiCtx.lineTo(x, y + radius);
    uiCtx.quadraticCurveTo(x, y, x + radius, y);
    uiCtx.closePath();
    uiCtx.fill();

    uiCtx.textAlign = 'left';
    uiCtx.textBaseline = 'middle';
    uiCtx.font = '14px system-ui';

    uiCtx.fillStyle = '#ffffff';
    uiCtx.fillText('●', x + 14, y + boxHeight / 2);
    uiCtx.fillText(text, x + 32, y + boxHeight / 2);

    uiCtx.restore();
  }

  // Transition overlay: "REPLAY" fade-out
  function drawPlaybackTransitionOverlay() {
    const w = uiCanvas.width;
    const h = uiCanvas.height;

    const t = Math.max(0, Math.min(1, state.transition)); // 1 → 0

    uiCtx.save();

    uiCtx.fillStyle = `rgba(0,0,0,${0.5 * t})`;
    uiCtx.fillRect(0, 0, w, h);

    uiCtx.fillStyle = `rgba(255,255,255,${t})`;
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.font = `bold ${Math.floor(w * 0.08)}px system-ui`;
    uiCtx.fillText('REPLAY', w / 2, h / 2);

    uiCtx.restore();
  }

  // Recording / playback 
  let recorder = null;
  let recordedChunks = [];
  let playbackVideo = null;

  function startCanvasRecording() {
    recordedChunks = [];

    // record only the art canvas (no UI)
    const stream = artCanvas.captureStream();
    const track = stream.getVideoTracks()[0];
    const merged = new MediaStream([track]);

    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm;codecs=vp8' };
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }

    try {
      recorder = new MediaRecorder(merged, options);
    } catch (err) {
      console.error('MediaRecorder creation failed:', err);
      alert('Recording not supported in this browser.');
      state.mode = 'idle';
      startBtn.disabled = false;
      startBtn.textContent = 'Start recording';
      startBtn.style.display = '';
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);

      playbackVideo = document.createElement('video');
      playbackVideo.src = url;
      playbackVideo.muted = true;
      playbackVideo.playsInline = true;

      playbackVideo.onloadedmetadata = () => {
        playbackVideo.playbackRate = 1.0;
      };

      playbackVideo.onended = () => {
        URL.revokeObjectURL(url);
        playbackVideo = null;
        state.mode = 'idle';
        startBtn.disabled = false;
        startBtn.textContent = 'Start recording';
        startBtn.style.display = '';

        // reset hint + histories so user can wave again
        state.hintTime = 0;
        state.horizontalHistory = [];
        state.verticalHistory = [];
      };

      state.mode = 'transition';
      state.transition = 1;
    };

    recorder.start();
    console.log('Recorder started.');
  }

  function drawPlaybackFrame() {
    if (!playbackVideo) return;
    artCtx.drawImage(playbackVideo, 0, 0, artCanvas.width, artCanvas.height);
  }

  //  Button (optional backup) 
  // Clicking still works as an alternative to waving
  startBtn.addEventListener('click', async () => {
    if (state.mode !== 'idle') return;
    console.log('Start button clicked.');

    await setupCamera();
    if (!camStream) {
      console.warn('Camera not ready, cannot record.');
      startBtn.disabled = false;
      startBtn.textContent = 'Start recording';
      startBtn.style.display = '';
      return;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Recording...';
    startBtn.style.display = 'none';

    state.mode = 'countdown';
    state.countdown = 3.0;
    state.hintTime = 0;
  });

  // Main loop 
  function loop(timestamp) {
    const dt = (timestamp - lastTime) * 0.001 || 0;
    lastTime = timestamp;

    clearUI();

    if (state.mode === 'playback') {
      // only the recorded silhouette video
      drawPlaybackFrame();
    } else {
      const { strength, points } = computeMotionField();

      // always show live silhouette when not in playback
      drawSilhouette(points);

      // vertical wave  change palette (allowed in idle, countdown, recording)
      if (detectVerticalWave(points, strength)) {
        pickRandomPalette();
      }

      if (state.mode === 'idle') {
        state.hintTime += dt;
        drawIdleHintsWithFade(state.hintTime);

        // gesture: horizontal wave start countdown
        if (detectHorizontalWave(points, strength)) {
          state.mode = 'countdown';
          state.countdown = 3.0;
          state.hintTime = 0;
          startBtn.disabled = true;
          startBtn.textContent = 'Recording...';
          startBtn.style.display = 'none';
        }
      }

      if (state.mode === 'recording') {
        state.recordRemaining -= dt;
        if (state.recordRemaining < 0) state.recordRemaining = 0;
        drawRecordingOverlay();

        if (state.recordRemaining <= 0 && recorder && recorder.state === 'recording') {
          recorder.stop();
        }
      }

      if (state.mode === 'transition') {
        state.transition -= dt / 0.8;
        drawPlaybackTransitionOverlay();

        if (state.transition <= 0) {
          state.mode = 'playback';
          if (playbackVideo) {
            playbackVideo.currentTime = 0;
            playbackVideo.play();
          }
        }
      }

      if (state.mode === 'countdown') {
        state.countdown -= dt;
        drawCountdownOverlay();
        if (state.countdown <= 0) {
          state.mode = 'recording';
          state.recordRemaining = 3.0;
          startCanvasRecording();
        }
      }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
  // start camera immediately on load for better user experience
  (async () => {
    try {
      await setupCamera();
      console.log('Camera ready on load.');
      startBtn.style.display = 'none';
    } catch (err) {
      console.error('Auto camera setup failed:', err);
      // show button as fallback so user can click to retry
      startBtn.style.display = '';
      startBtn.textContent = 'Enable camera';
    }
  })();
});
