# ? PULSE — FIFA 2026 AI Crowd Safety & Perimeter Security

PULSE is an offline-first, client-side stadium safety intelligence command center designed for the **FIFA World Cup 2026**. It combines crowd flow analytics, heat risk indices, operations triage, and a real-time **YOLOv8-styled CCTV threat scanner** to safeguard transit hubs and perimeter sectors.

---

## ?? AI CCTV Security Feature (FlowSense Style)

The perimeter dashboard integrates an active client-side object detection pipeline powered by **TensorFlow.js (COCO-SSD)**. It operates in real-time directly through your browser utilizing your laptop webcam:

* **Real-time Inference Throttling**: Decoupled from the video frame rate, running at ~3 FPS (every 300ms) to ensure minimal CPU load and zero thermal throttling.
* **Coordinate Scaling**: Bounding boxes scale dynamically based on your display canvas overlay aspect ratio.
* **Threat Classification Mapping**:
  * `knife` ? `Knife (CRITICAL)`
  * `scissors` ? `Sharp Object (HIGH)`
  * `cell phone` ? `Handgun (Test Proxy)` *(Used for safe, instant testing at your desk!)*
* **Siren & Alarm System**: Flashes a red warning HUD and plays a synthesized sweep alarm using the native browser **Web Audio API**.
* **Memory-Capped Threat Logs**: Captures thumbnails, downscales them to 160x120 pixels, caps log lists to a maximum of 5 entries to preserve `localStorage` limits, and offers **Save Snapshot** and **Delete** actions.
* **Integrated Dispatch Operations**: Automatically routes critical incident records to the operations staff alerts panel.

---

## ?? Tech Stack & Dependencies

* **Core**: HTML5 (Semantic elements) & Vanilla JavaScript (ES6+).
* **Styling**: Vanilla CSS (Fluid Glassmorphic theme + responsive flex-grid layouts).
* **Visuals & Effects**: Three.js (dynamic OLED particle animations in the background).
* **AI Model Engine**: TensorFlow.js + COCO-SSD model.
* **GenAI integration**: Grounded LLM reasoning via OpenRouter.

---

## ?? How to Run Locally

1. Clone or download this repository.
2. In your terminal, navigate to the folder and start a local HTTP server:
   `ash
   npx http-server -p 8080
   `
3. Open **http://localhost:8080/index.html** in your browser.
4. Select the **Perimeter** tab, click **? Connect Live CCTV AI Feed**, and allow camera access.
5. In the **Settings** panel, insert your OpenRouter API key to activate active AI incident advisories!
