# फेकsmell

A polished, responsive electronic-nose demo that turns a simulated sensor signal into an understandable scent profile.

## Run it

Open `index.html` directly in a browser, or serve this folder with any static file server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## How it works

Choose a sample and start a scan. The interface simulates the response of four sensor layers, renders the matching scent profile, and stores the latest three readings in local browser storage.

This is a front-end demo: browsers cannot smell by themselves. A real deployment would replace the sample selector with readings from an electronic-nose device or API.
