const sensorChannels = [
    "Alcohol/VOC",
    "Ammonia",
    "Sulfur",
    "Smoke/CO",
    "Humidity",
    "Terpenes"
];

const fingerprints = {
    coffee: [0.72, 0.18, 0.28, 0.48, 0.56, 0.22],
    citrus: [0.42, 0.08, 0.04, 0.1, 0.48, 0.82],
    rain: [0.12, 0.18, 0.1, 0.08, 0.88, 0.3],
    mint: [0.2, 0.06, 0.04, 0.05, 0.42, 0.9],
    spoiledMilk: [0.28, 0.88, 0.92, 0.2, 0.62, 0.08],
    smoke: [0.38, 0.16, 0.5, 0.94, 0.18, 0.14],
    rubbingAlcohol: [0.96, 0.04, 0.02, 0.08, 0.2, 0.06]
};

const profiles = {
    coffee: { name: "Roasted coffee", emoji: "☕", description: "A deep, comforting aroma with toasted notes and a soft caramel finish." },
    citrus: { name: "Fresh citrus", emoji: "🍊", description: "A bright, sparkling profile with a clean peel note and a lively finish." },
    rain: { name: "After the rain", emoji: "🌧", description: "Cool mineral air layered with damp earth, green leaves, and petrichor." },
    mint: { name: "Crushed mint", emoji: "🌿", description: "A crisp, cooling burst of green leaves with a clean, airy finish." },
    spoiledMilk: { name: "Spoiled milk", emoji: "🥛", description: "A sour, sharp profile with fermented notes and a lingering funk." },
    smoke: { name: "Smoke", emoji: "💨", description: "A dry, ashy signal with a sharp burnt edge and lingering haze." },
    rubbingAlcohol: { name: "Rubbing alcohol", emoji: "🧴", description: "A clean, volatile burst with a strong sterile and solvent-like edge." }
};

const notes = {
    coffee: ["Roasted", "Nutty", "Caramel", "Bitter"],
    citrus: ["Zesty", "Fresh", "Sweet", "Peel"],
    rain: ["Mineral", "Earthy", "Green", "Woody"],
    mint: ["Fresh", "Green", "Cooling", "Herbal"],
    spoiledMilk: ["Sour", "Ammonia", "Sulfur", "Fermented"],
    smoke: ["Smoke", "Ashy", "Burnt", "Acrid"],
    rubbingAlcohol: ["Volatile", "Sterile", "Sharp", "Solvent"]
};

const sampleButtons = document.querySelectorAll(".sample-card");
const scanButton = document.querySelector("#scanButton");
const analyzerScanButton = document.querySelector("#analyzerScanButton");
const scanState = document.querySelector("#scanState");
const historyList = document.querySelector("#historyList");
const sensorStatus = document.querySelector("#sensorStatus");
const sensorCanvas = document.querySelector("#sensorCanvas");
const noteList = document.querySelector("#noteList");
const analyzerHeading = document.querySelector("#analyzer-heading");
let selectedSample = "coffee";

function loadHistory() {
    try {
        const storedHistory = JSON.parse(localStorage.getItem("fakesmell-history") || "[]");
        if (!Array.isArray(storedHistory)) {
            return [];
        }

        return storedHistory.filter((item) => typeof item.confidence === "number").map((item) => ({
            ...item,
            confidence: item.confidence > 1 ? item.confidence / 100 : item.confidence,
            seed: item.seed ?? "legacy"
        }));
    } catch (error) {
        console.warn("Ignoring invalid saved scent history.", error);
        localStorage.removeItem("fakesmell-history");
        return [];
    }
}

let history = loadHistory();

function mulberry32(seed) {
    return function nextRandom() {
        let value = seed += 0x6D2B79F5;
        value = Math.imul(value ^ value >>> 15, value | 1);
        value ^= value + Math.imul(value ^ value >>> 7, value | 61);
        return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
}

function gaussianNoise(random, sigma) {
    const first = Math.max(random(), Number.EPSILON);
    const second = random();
    return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * second) * sigma;
}

function clamp(value, minimum = 0, maximum = 1) {
    return Math.min(maximum, Math.max(minimum, value));
}

function createSeed() {
    return Math.floor(Math.random() * 4294967296);
}

function simulateReading(classKey, noiseLevel = 0.06, seed = createSeed()) {
    const random = mulberry32(seed);
    const fingerprint = fingerprints[classKey];
    const baselineDrift = sensorChannels.map(() => gaussianNoise(random, 0.015));

    const vector = fingerprint.map((value, index) => clamp(
        value + gaussianNoise(random, noiseLevel) + baselineDrift[index]
    ));

    return { vector, seed };
}

function cosineSimilarity(firstVector, secondVector) {
    const dotProduct = firstVector.reduce((sum, value, index) => sum + value * secondVector[index], 0);
    const firstMagnitude = Math.sqrt(firstVector.reduce((sum, value) => sum + value ** 2, 0));
    const secondMagnitude = Math.sqrt(secondVector.reduce((sum, value) => sum + value ** 2, 0));

    if (!firstMagnitude || !secondMagnitude) {
        return 0;
    }

    return dotProduct / (firstMagnitude * secondMagnitude);
}

function softmax(values, temperature = 0.08) {
    const highest = Math.max(...values);
    const exponentials = values.map((value) => Math.exp((value - highest) / temperature));
    const total = exponentials.reduce((sum, value) => sum + value, 0);
    return exponentials.map((value) => value / total);
}

function classify(vector) {
    const keys = Object.keys(fingerprints);
    const similarities = keys.map((key) => cosineSimilarity(vector, fingerprints[key]));
    const probabilities = softmax(similarities);

    return keys.map((key, index) => ({
        key,
        name: profiles[key].name,
        probability: probabilities[index]
    })).sort((first, second) => second.probability - first.probability);
}

function formatProbability(probability) {
    return `${Math.round(probability * 100)}% match`;
}

function buildMeters(vector) {
    return sensorChannels.map((label, index) => [label, Math.round(vector[index] * 100)]);
}

function renderEmptyResult() {
    document.querySelector("#resultName").textContent = "Run a scan to see a result";
    document.querySelector("#confidence").textContent = "No result yet";
    document.querySelector("#resultDescription").textContent = "Choose a sample, then start a scan. This demo uses simulated sensor data.";
    sensorCanvas.hidden = true;
    document.querySelector("#meterList").innerHTML = "";
    noteList.innerHTML = "";
    document.querySelector("#scanTime").textContent = "Waiting for scan";
}

function renderFinalResult(classification, vector) {
    const topResult = classification[0];
    const profile = profiles[topResult.key];
    document.querySelector("#resultName").textContent = topResult.name;
    document.querySelector("#confidence").textContent = formatProbability(topResult.probability);
    document.querySelector("#resultDescription").textContent = profile.description;
    document.querySelector("#meterList").innerHTML = buildMeters(vector).map(([label, value]) => `
        <div class="meter-row"><span>${label}</span><div class="meter"><i style="width: ${value}%"></i></div><strong>${value}%</strong></div>
    `).join("");
    noteList.innerHTML = notes[topResult.key].map((note) => `<span class="note-chip">${note}</span>`).join("");
}

function renderHistory() {
    if (!history.length) {
        historyList.innerHTML = '<div class="empty-history">Your completed scans will appear here.</div>';
        return;
    }
    historyList.innerHTML = history.map((item) => `
        <div class="history-card"><span class="sample-emoji">${item.emoji}</span><span><b>${item.name}</b><small>${item.time} · ${formatProbability(item.confidence)} · seed ${item.seed}</small></span></div>
    `).join("");
}

function setScanControlsLocked(locked) {
    sampleButtons.forEach((button) => {
        button.disabled = locked;
    });
    scanButton.disabled = locked;
    analyzerScanButton.disabled = locked;
}

function scrollToAnalyzer() {
    analyzerHeading.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
    });
}

function canvasContext() {
    const ratio = window.devicePixelRatio || 1;
    const width = sensorCanvas.clientWidth;
    const height = sensorCanvas.clientHeight;
    sensorCanvas.width = width * ratio;
    sensorCanvas.height = height * ratio;
    const context = sensorCanvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { context, width, height };
}

function drawSensorTrace(values, progress) {
    const { context, width, height } = canvasContext();
    const green = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
    const orange = getComputedStyle(document.documentElement).getPropertyValue("--orange").trim();
    const padding = 22;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    context.clearRect(0, 0, width, height);
    context.strokeStyle = "#67936c";
    context.lineWidth = 1;
    for (let line = 0; line < 4; line += 1) {
        const y = padding + (chartHeight / 3) * line;
        context.beginPath();
        context.moveTo(padding, y);
        context.lineTo(width - padding, y);
        context.stroke();
    }

    sensorChannels.forEach((channel, channelIndex) => {
        const target = values[channelIndex];
        const settledValue = target * (1 - Math.exp(-progress * 5));
        const color = channelIndex % 2 === 0 ? green : orange;
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.beginPath();

        for (let point = 0; point <= 40; point += 1) {
            const x = padding + (chartWidth / 40) * point;
            const wave = Math.sin(point * 0.75 + channelIndex * 1.7 + progress * 12) * 0.012 * (1 - progress);
            const value = clamp(settledValue + wave + channelIndex * 0.018);
            const y = height - padding - value * chartHeight;
            if (point === 0) {
                context.moveTo(x, y);
            } else {
                context.lineTo(x, y);
            }
        }
        context.stroke();
    });

    context.font = '9px "DM Mono", monospace';
    context.fillStyle = green;
    context.fillText("LIVE SENSOR TRACE", padding, 13);
    context.fillStyle = orange;
    context.fillText(`${Math.round(progress * 100)}% settled`, width - 80, 13);
}

function animateSensorTrace(vector, onComplete) {
    sensorCanvas.hidden = false;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
        drawSensorTrace(vector, 1);
        onComplete();
        return;
    }

    const duration = 2000;
    const start = performance.now();
    function frame(timestamp) {
        const progress = Math.min((timestamp - start) / duration, 1);
        drawSensorTrace(vector, progress);
        if (progress < 1) {
            window.requestAnimationFrame(frame);
        } else {
            onComplete();
        }
    }
    window.requestAnimationFrame(frame);
}

sampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (scanButton.disabled) {
            return;
        }
        sampleButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        selectedSample = button.dataset.sample;
        renderEmptyResult();
        document.querySelector("#scanTime").textContent = "Waiting for scan";
        scanState.innerHTML = '<span class="pulse-dot"></span> Waiting for a sample';
    });
});

function startScan() {
    scrollToAnalyzer();
    setScanControlsLocked(true);
    scanButton.innerHTML = '<span class="button-icon">◌</span> Analyzing...';
    analyzerScanButton.textContent = "Scanning...";
    scanState.classList.add("scanning");
    scanState.innerHTML = '<span class="pulse-dot"></span> Reading sensor layers';
    sensorStatus.textContent = "Scanning...";
    document.querySelector("#scanTime").textContent = "Reading simulated signal...";

    const reading = simulateReading(selectedSample);
    animateSensorTrace(reading.vector, () => {
        const classification = classify(reading.vector);
        const topResult = classification[0];
        const profile = profiles[topResult.key];
        const now = new Date();

        renderFinalResult(classification, reading.vector);
        history.unshift({
            key: topResult.key,
            name: topResult.name,
            emoji: profile.emoji,
            confidence: topResult.probability,
            seed: reading.seed,
            time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        });
        history = history.slice(0, 3);
        localStorage.setItem("fakesmell-history", JSON.stringify(history));
        renderHistory();
        scanState.classList.remove("scanning");
        scanState.innerHTML = '<span class="pulse-dot"></span> Scan complete';
        sensorStatus.textContent = "Simulated sensor";
        document.querySelector("#scanTime").textContent = "Just now";
        setScanControlsLocked(false);
        scanButton.innerHTML = '<span class="button-icon">⌁</span> Scan again';
        analyzerScanButton.textContent = "Scan again";
    });
}

scanButton.addEventListener("click", startScan);
analyzerScanButton.addEventListener("click", startScan);

document.querySelector("#clearHistory").addEventListener("click", () => {
    history = [];
    localStorage.removeItem("fakesmell-history");
    renderHistory();
});

renderEmptyResult();
renderHistory();
