// ColorMotion Recorder - Silhouette Edition
// Webcam → NO real image, only a colored human silhouette.
// 3s recording with countdown, timer, and replay of the color-only video.

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
    mode: 'idle',          // 'idle' | 'countdown' | 'recording' | 'transition' | 'playback'
    countdown: 0,
    transition: 0,         // 1 → 0 during REPLAY fade
    recordRemaining: 0     // seconds left in current recording
  };

  let lastTime = 0;

  // ----------------- Webcam + motion -----------------
  let camStream = null;
  let camVideo = null;

  // Higher resolution mask → better finger detail
  const motionW = 160;
  const motionH = 120;
  const motionCanvas = document.createElement('canvas');
  motionCanvas.width = motionW;
  motionCanvas.height = motionH;
  const motionCtx = motionCanvas.getContext('2d');
  let prevLuma = null;

  async function setupCamera() {
    if (camStream) return; // already set up

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera not supported in this browser.');
      return;
    }

    try {
      camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
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

  // Compute motion mask (difference vs previous frame)
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

      // Motion threshold – these pixels are where things changed
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

  // Color-annotate motion points based on distance from center-of-mass
  function computeMotionColor(points) {
    if (points.length === 0) return [];

    // Center of motion (roughly body center)
    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    const colored = [];
    for (const p of points) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy); // 0..~0.7

      // Normalize distance to 0..1
      const t = Math.min(1, dist * 4); // torso small, hand further

      // Map distance to hue: center warm, edges cool
      // t=0 → hue≈300 (magenta), t=1 → hue≈0 (red) OR reverse; we choose:
      const hue = (1 - t) * 260; // 260=blue/purple, 0=red

      colored.push({
        x: p.x,
        y: p.y,
        distNorm: t,
        hue
      });
    }
    return colored;
  }

  // ----------------- Silhouette rendering -----------------
  function drawSilhouette(points) {
    const w = artCanvas.width;
    const h = artCanvas.height;

    // Clear completely → crisp camera-like movement (no trails)
    artCtx.fillStyle = 'black';
    artCtx.fillRect(0, 0, w, h);

    if (!points.length) return;

    const coloredPoints = computeMotionColor(points);
    if (!coloredPoints.length) return;

    // Downsample points so it doesn’t get too heavy
    const maxDraw = 4000;
    const step = Math.max(1, Math.floor(coloredPoints.length / maxDraw));

    const baseRadius = Math.min(w, h) * 0.015; // base blob size

    artCtx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < coloredPoints.length; i += step) {
      const cp = coloredPoints[i];

      const sx = cp.x * w;
      const sy = cp.y * h;

      // Fingers (far from center) slightly larger and brighter
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

  // ----------------- UI Overlays (only on uiCanvas) -----------------
  function clearUI() {
    uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  }

  // Countdown: "Record in" + big fading 3/2/1 in center
  function drawCountdownOverlay() {
    const w = uiCanvas.width;
    const h = uiCanvas.height;

    uiCtx.fillStyle = 'rgba(0,0,0,0.35)';
    uiCtx.fillRect(0, 0, w, h);

    const sec = Math.max(0, state.countdown);
    const num = Math.max(1, Math.ceil(sec));      // 3,2,1
    const phase = sec - Math.floor(sec);          // 0..1 within each second
    const alpha = 1 - phase;                      // fade OUT each second

    // "Record in" label
    uiCtx.fillStyle = '#ffffff';
    uiCtx.textAlign = 'center';
    uiCtx.textBaseline = 'middle';
    uiCtx.font = `${Math.floor(w * 0.04)}px system-ui`;
    uiCtx.fillText('Record in', w / 2, h / 2 - w * 0.09);

    // Big number that fades out
    uiCtx.save();
    uiCtx.globalAlpha = alpha;
    uiCtx.font = `bold ${Math.floor(w * 0.25)}px system-ui`;
    uiCtx.fillText(String(num), w / 2, h / 2 + w * 0.02);
    uiCtx.restore();
  }

  // Recording timer overlay: top-right, gradient like Start button
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

  // ----------------- Recording / playback -----------------
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

  // ----------------- Button -----------------
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
  });

  // ----------------- Main loop -----------------
  function loop(timestamp) {
    const dt = (timestamp - lastTime) * 0.001 || 0;
    lastTime = timestamp;

    // always clear UI first
    clearUI();

    if (state.mode === 'playback') {
      // only the recorded silhouette video
      drawPlaybackFrame();
    } else {
      // live silhouette
      const { strength, points } = computeMotionField();
      drawSilhouette(points);

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
});