# 🎨 ColorMotion Recorder

**ColorMotion Recorder** is an interactive web-based art installation that transforms live human movement into a **real-time colored silhouette**.  
Instead of showing the real camera image, the system visualizes motion using abstract colors, allowing gestures like waving hands and fingers to become expressive digital artwork.

---

## ✨ Features

- **No real camera footage shown**  
  Only motion-based color silhouettes are rendered.

- **Gesture-controlled interaction**
  - **Wave LEFT ↔ RIGHT** → Start a 3-second recording
  - **Wave UP ↕ DOWN** → Change color palette (10 styles)

- **Human-centered motion**
  - Designed to highlight **hands, arms, and fingers**
  - Ignores background noise and small movements like breathing

- **Automatic playback**
  - After recording, the silhouette animation is replayed automatically
  - UI elements are hidden during playback

- **Button fallback**
  - A visible **Start Recording** button is always available
  - Ensures accessibility if gesture detection fails

---

## 🧠 How It Works

1. **Camera Access (WebRTC)**  
   The browser requests webcam access using `getUserMedia`.  
   The camera image is never displayed.

2. **Motion Detection**  
   Consecutive video frames are compared to detect pixel-level brightness changes.  
   These differences reveal the user’s silhouette and motion.

3. **Silhouette Generation**  
   Motion pixels are converted into glowing color blobs using the Canvas 2D API.  
   Colors are mapped based on distance from the body center, making hands and fingers stand out.

4. **Gesture Recognition**
   - Horizontal motion of a **small cluster** is interpreted as a hand wave
   - Vertical motion changes color palettes
   - Large full-body movement is ignored to prevent false triggers

5. **Recording & Playback**
   - Only the artwork canvas is recorded using the MediaRecorder API
   - UI overlays are drawn on a separate canvas and never recorded

---

## 📸 Screenshots

### Live Color Silhouette
![Live silhouette showing hands and body](screenshots/live-silhouette.png)

### Gesture Interaction
![Wave gesture starting the recording](screenshots/wave-start.png)

### Color Palette Change
![Vertical wave changing color palette](screenshots/color-change.png)

### Recording & Replay
![Replay of recorded motion artwork](screenshots/replay.png)

---

## 🛠 Technologies Used

- **JavaScript** – core logic and gesture detection  
- **HTML / CSS** – layout and UI  
- **Canvas 2D API** – real-time silhouette rendering  
- **WebRTC (`getUserMedia`)** – webcam access  
- **MediaRecorder API** – recording and replaying the artwork  

---

## 🚀 How to Run Locally

> Camera access requires `https` or `localhost`.

```bash
python3 -m http.server 8000

Then open:
http://localhost:8000
Allow camera access when prompted.


 How to Use
	1.	Stand in front of the camera
	2.	Move your hand close to the camera
	3.	Wave LEFT ↔ RIGHT to start recording
	4.	Wave UP ↕ DOWN to change colors
    5.  Countdown 3 seconds then it start to record
	6.	Watch your motion replay as abstract color art
    7.  Repeat

⸻

🎓 Project Context

This project was created as an interactive digital art / creative coding experiment, inspired by motion-based installations such as those found in immersive museums ( WNDR Museum).

⸻

📄 License

This project is for educational and artistic purposes.