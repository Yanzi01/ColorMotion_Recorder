# 🎨 ColorMotion Recorder

**ColorMotion Recorder** is an interactive, web-based digital art installation that transforms live movement into a **real-time colored silhouette**.

## Demo Video
** [record/demo/demo_video.mp4](record/demo/demo_video.mp4)

---

## ✨ Features

- **Gesture-controlled interaction**
  - **Wave LEFT ↔ RIGHT** → Start a 3-second recording
  - **Wave UP ↕ DOWN** → Change color palette (10 variations)

- **Human-centered motion design**
  - Emphasizes **hands, arms, and fingers**
  - Filters out small movements such as breathing and lighting noise
  - Prevents accidental triggers from people walking past the camera

- **Automatic playback**
  - After recording, the silhouette animation replays automatically

- **Button fallback**
  - A visible **Start Recording** button is always available
  - Ensures accessibility if gesture detection fails

---

## 🧠 How It Works

### 1. Camera Access (WebRTC)
The browser requests webcam access using `getUserMedia`.  
The video stream is processed internally and **never displayed**.

### 2. Motion Detection
Consecutive video frames are compared using pixel-level luminance differences.  
Only significant changes are treated as motion, filtering out camera noise.

### 3. Silhouette Generation
Motion pixels are rendered as glowing color particles using the Canvas 2D API.  
Colors are mapped by distance from the motion center, naturally highlighting hands and fingers.

### 4. Gesture Recognition
- **Horizontal hand waves** start recording
- **Vertical hand waves** change color palettes

### 5. Recording & Playback
- Only the **art canvas** is recorded using the MediaRecorder API
- UI overlays are rendered on a separate canvas and excluded from recordings
- Playback runs at normal speed

---

### 🖼 Screenshot

**Live Color Silhouette**

![Live silhouette screenshot](record/demo/screenshot.png)

---

### 🧭 Instruction Panel

**Idle screen showing gesture instructions**

![Instruction panel](record/demo/instruction.png)

---

### 🎬 Demo Videos

> GitHub does not embed videos inline in README files.  
> Click the links below to view each demo.

- **🎥 Recording*  
  [record/demo/record.mp4](record/demo/record.gif

- **👋 Wave LEFT ↔ RIGHT to Start Recording**  
  ![Wave left to start](record/demo/wave_left.gif)

- **🎨 Wave UP ↕ DOWN to Change Color Palette**  
  ![Wave up to change color](record/demo/wave_up.gif)

---

## 🛠 Technologies Used

- **JavaScript** — core logic and gesture detection  
- **HTML / CSS** — layout and UI  
- **Canvas 2D API** — real-time silhouette rendering  
- **WebRTC (`getUserMedia`)** — webcam access  
- **MediaRecorder API** — recording and playback  
---

## 🚀 How to Run Locally

Camera access requires **HTTPS or localhost**.

### Start a local server

```bash
python3 -m http.server 8000

Then open the project in your browser:

http://localhost:8000/record/index.html

Allow camera access when prompted.

⸻

🕹 How to Use
	1.	Stand in front of the camera
	2.	Move your hand close to the camera
	3.	Wave LEFT ↔ RIGHT to start recording
	4.	Wave UP ↕ DOWN to change color palettes
	5.	A 3-second countdown begins
	6.	Perform gestures during recording
	7.	Watch your motion replay as abstract color art
	8.	Repeat and explore

⸻

🎓 Project Context

This project was created as an interactive digital art / creative coding experiment, inspired by motion based installations found in WNDR Museum.

The goal is to explore how human movement can become a visual language, transforming everyday movement into digital artwork.

⸻

📄 License

This project is intended for educational and artistic purposes.

---

