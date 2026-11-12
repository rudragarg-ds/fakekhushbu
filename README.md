# फेकsmell

> **Smell, translated.**

फेकsmell is a hackathon-ready electronic-nose experience that turns invisible scent signals into a visual, understandable profile. The current prototype runs entirely in the browser with a deterministic sensor simulation, so it is reliable to demo without special hardware.

## Why it matters

People understand smells intuitively, but machines usually expose them as raw voltage readings or sensor charts. फेकsmell creates a friendly translation layer:

1. **Capture** a scent signal from an electronic-nose sensor array.
2. **Compare** it with known scent fingerprints.
3. **Describe** the result using a name, confidence score, and sensory notes.

For the hackathon demo, the first step is simulated so the experience works on any laptop. The UI and data model are ready for a real sensor adapter later.

## Live demo

Try the deployed prototype at <https://rudragarg-ds.github.io/fakekhushbu/>.

## Demo features

- One-click scan animation with clear sensor status feedback.
- Four sample profiles: roasted coffee, fresh citrus, after the rain, and crushed mint.
- Confidence score plus four interpretable scent dimensions.
- Recent scan history stored in `localStorage`.
- Responsive layout for laptops, tablets, and phones.
- Accessible buttons, labels, live result updates, and reduced visual complexity on small screens.
- No framework, build step, database, or API key required.

## Run locally

### Option 1: open the file

Open [`index.html`](./index.html) directly in a modern browser.

### Option 2: use a local server

From this directory:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000>.

Using a local server is recommended when testing browser integrations or deploying from a development environment.

## Suggested hackathon demo script

1. Start on the hero section and explain that the product translates scent signals into language.
2. Choose **Fresh citrus** or **After the rain** to show that profiles change.
3. Click **Start a scan** and point out the live status transition from waiting to reading sensor layers to scan complete.
4. Explain the confidence score and the four interpretable dimensions.
5. Run a second scan and show the **Your scent trail** history.
6. Close with the hardware bridge: replace the sample selector with readings from an electronic-nose array.

## Project structure

```text
index.html   Semantic page structure and demo content
style.css    Visual system, responsive layout, and animations
script.js    Sample data, scan state machine, and local history
README.md    Product story, setup, demo flow, and integration notes
```

## Sensor integration path

Browsers cannot smell without an external sensor. A production version would replace the sample selection in `script.js` with an adapter that:

1. Reads a normalized array of sensor values from an Arduino, ESP32, or backend API.
2. Maps those values to the same four-dimensional profile shape used by the demo.
3. Sends the profile through the existing `renderResult()` flow.
4. Keeps confidence scores calibrated against a labelled training set.

Possible next steps are Web Serial for a USB-connected microcontroller, Web Bluetooth for a supported device, or a small server endpoint for model inference. The current UI intentionally keeps this boundary clean so a hardware integration does not require a redesign.

## Important limitation

This repository is a working **front-end prototype**, not a chemical measurement device. Its simulated readings demonstrate the product experience and interaction design; they should not be presented as real-world odour identification or safety advice.

## License

No license has been selected yet. Add one before distributing the project outside the hackathon team.
