// ColorMotion Recorder
// WNDR-style particles following motion + 3s recording + auto playback

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('artCanvas');
  const startBtn = document.getElementById('startBtn');

  if (!canvas || !startBtn) {
    console.error('Canvas or button not found. Check IDs in HTML.');
    alert('Internal error: missing canvas or button.');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('2D context not available.');
    alert('Your browser does not support Canvas 2D.');
    return;
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const state = {
    mode: 'idle', // 'idle' | 'countdown' | 'recording' | 'playback'
    countdown: 0
  };

  let lastTime = 0;

  // ----------------- Webcam + motion -----------------
  let camStream = null;
  let camVideo = null;

  const motionW = 80;
  const motionH = 60;
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
        video: true,
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

      if (d > 25) {
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

  // ----------------- Particles -----------------
  const particles = [];

  function spawnParticlesFromMotion(points, strength, w, h) {
    if (!points.length) return;
    const step = Math.max(1, Math.floor(points.length / 150));

    for (let i = 0; i < points.length; i += step) {
      const pt = points[i];
      const x = pt.x * w;
      const y = pt.y * h;
      const speed = 80 + 220 * strength;
      const angle = Math.random() * Math.PI * 2;

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 30 + 50 * Math.random()
      });
    }
  }

  function updateAndDrawParticles(dt, strength) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt * 0.9;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.x < -100) p.x = w + 100;
      if (p.x > w + 100) p.x = -100;
      if (p.y < -100) p.y = h + 100;
      if (p.y > h + 100) p.y = -100;

      const t = p.life;
      const r = 200 + 55 * t;
      const g = 60 + 120 * strength;
      const b = 40 + 30 * (1 - t);
      const radius = p.size * (0.5 + 0.7 * t);

      const grad = ctx.createRadialGradient(
        p.x, p.y, 0,
        p.x, p.y, radius
      );
      grad.addColorStop(0, `rgba(${r},${g},${b},${0.9 * t})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  function drawCountdownOverlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, 150, 110);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = '14px system-ui';
    ctx.fillText('Recording in', 20, 20);

    ctx.font = 'bold 64px system-ui';
    const num = Math.max(1, Math.ceil(state.countdown));
    ctx.fillText(String(num), 20, 40);
  }

  // ----------------- Recording / playback -----------------
  let recorder = null;
  let recordedChunks = [];
  let playbackVideo = null;

  function startCanvasRecording() {
    recordedChunks = [];

    const stream = canvas.captureStream(30);
    const track = stream.getVideoTracks()[0];
    const merged = new MediaStream([track]);

    // pick a supported mimeType
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

      playbackVideo.onended = () => {
        URL.revokeObjectURL(url);
        playbackVideo = null;
        state.mode = 'idle';
        startBtn.disabled = false;
        startBtn.textContent = 'Start recording';
      };

      setTimeout(() => {
        if (!playbackVideo) return;
        state.mode = 'playback';
        playbackVideo.play();
      }, 1000);
    };

    recorder.start();
    console.log('Recorder started.');
  }

  function drawPlaybackFrame() {
    if (!playbackVideo) return;
    ctx.drawImage(playbackVideo, 0, 0, canvas.width, canvas.height);
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
      return;
    }

    state.mode = 'countdown';
    state.countdown = 3.0;
    startBtn.disabled = true;
    startBtn.textContent = 'Recording...';
  });

  // ----------------- Main loop -----------------
  function loop(timestamp) {
    const dt = (timestamp - lastTime) * 0.001 || 0;
    lastTime = timestamp;

    if (state.mode === 'playback') {
      drawPlaybackFrame();
    } else {
      const { strength, points } = computeMotionField();
      spawnParticlesFromMotion(points, strength, canvas.width, canvas.height);
      updateAndDrawParticles(dt, strength);

      if (state.mode === 'countdown') {
        state.countdown -= dt;
        drawCountdownOverlay();
        if (state.countdown <= 0) {
          state.mode = 'recording';
          startCanvasRecording();
          setTimeout(() => {
            if (recorder && recorder.state === 'recording') recorder.stop();
          }, 3000);
        }
      }
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});