# 🎙️ EchoRoom — See a Room with Your Ears

> An accessible, spatial-audio room exploration tool purpose-built for blind and low-vision users to build accurate mental maps of spaces they cannot see.

---

## 🌟 Overview

**EchoRoom** transforms plain-language descriptions of rooms and scenes (e.g., *"A 5 by 4 meter kitchen with a wooden table in the center, a fridge in the corner, and a window on the north wall"*) into fully explorable 3D audio environments.

The entire product experience is focused on **spatial audio immersion** and **spatial reasoning**:
- **Invisible 3D Coordinate Logic**: Web Audio API HRTF panner nodes dynamically position object sound cues in 3D space around the listener.
- **Audio Feedback**: Footsteps match floor materials (wood, tile, carpet, concrete, grass), continuous object audio cues, and ambient acoustic profiles.
- **Accessible Design**: Built strictly adhering to WCAG 2.1 AAA guidelines — high contrast dark mode, full keyboard accessibility, screen reader ARIA live region support, and non-visual feedback.
- **Spatial Q&A**: Ask natural language questions like *"What's near me?"*, *"What's to my left?"*, or request a complete room recap at any time.

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### 1. Start the Backend Server
```bash
cd backend
npm install
npm start
```
The backend server will run on `http://localhost:4000`.

### 2. Start the Frontend Application
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## ⌨️ Keyboard Controls

Navigation in EchoRoom is designed to be effortless using standard keyboard controls:

| Key | Action | Description |
|---|---|---|
| **W** / **Up Arrow** | Move Forward | Advance 0.5 meters in facing direction + trigger step sound |
| **S** / **Down Arrow** | Move Backward | Step 0.5 meters backward + trigger step sound |
| **A** / **Left Arrow** | Turn Left | Rotate listener orientation counter-clockwise (22.5°) |
| **D** / **Right Arrow** | Turn Right | Rotate listener orientation clockwise (22.5°) |
| **Q** | Proximity Check | Speaks objects within 3 meters relative to current orientation |
| **E** | Free-text Q&A | Open text input to ask custom spatial questions |
| **R** | Room Recap | Recount room dimensions, floor type, and position of all items |
| **Escape** | Close Dialog | Close free-text question modal |

---

## 🏗️ Architecture & Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Pure CSS design system with WCAG AAA high-contrast theme, glassmorphism UI, custom CSS variables, and reduced-motion support
- **Spatial Audio**: Web Audio API with `AudioListener` HRTF (`PannerNode`), proximity attenuation (`inverse` distance model), synthesized procedural sound cues, and ambient soundscapes
- **Text-to-Speech**: SpeechSynthesis API with queue handling and interrupt management
- **State Management**: Centralized React Context + `useReducer` with immutable state updates

### Backend
- **Framework**: Node.js + Express
- **Validation**: Zod schema validation
- **Spatial Logic**: Procedural scene generator with overlap detection & boundary nudging algorithm
- **Spatial Q&A Engine**: Rule-based & LLM-ready spatial reasoning backend for directional and proximity queries

---

## ♿ Accessibility (a11y) Features
- **Screen-Reader First**: Built using semantic HTML5 elements, explicit `aria-live="polite"` regions, and `role="status"` elements.
- **High-Contrast Dark Theme**: AAA-compliant text-to-background contrast ratios (> 7:1).
- **Visible Focus Rings**: Glowing, high-contrast focus indicators on all interactive controls.
- **Decorative 2D Visual Canvas**: Top-down 2D canvas strictly marked `aria-hidden="true"` and `tabIndex={-1}` for optional developer/sighted observer monitoring.

---

## 📄 License
MIT
