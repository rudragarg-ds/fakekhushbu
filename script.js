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

const noiseLevels = [0.03, 0.08, 0.18];
const noiseLabels = ["Low", "Medium", "High"];
const historyStorageKey = "fakesmell-history-v2";
const sampleButtons = document.querySelectorAll(".sample-card");
const scanButton = document.querySelector("#scanButton");
const analyzerScanButton = document.querySelector("#analyzerScanButton");
const mysteryButton = document.querySelector("#mysteryButton");
const testButton = document.querySelector("#testButton");
const noiseLevelInput = document.querySelector("#noiseLevel");
const noiseValue = document.querySelector("#noiseValue");
const connectSensorButton = document.querySelector("#connectSensorButton");
const scanState = document.querySelector("#scanState");
const historyList = document.querySelector("#historyList");
const sensorStatus = document.querySelector("#sensorStatus");
const sensorCanvas = document.querySelector("#sensorCanvas");
const noteList = document.querySelector("#noteList");
const candidateList = document.querySelector("#candidateList");
const mysteryResult = document.querySelector("#mysteryResult");
const resultAnnouncement = document.querySelector("#resultAnnouncement");
const accuracyPanel = document.querySelector("#accuracyPanel");
const accuracySummary = document.querySelector("#accuracySummary");
const confusionMatrix = document.querySelector("#confusionMatrix");
const analyzerHeading = document.querySelector("#analyzer-heading");
const resultName = document.querySelector("#resultName");
const confidence = document.querySelector("#confidence");
const resultDescription = document.querySelector("#resultDescription");
const meterList = document.querySelector("#meterList");
const scanTime = document.querySelector("#scanTime");
const clearHistory = document.querySelector("#clearHistory");
let selectedSample = "coffee";
let mysteryMode = false;
let mysteryActualKey = null;
let replayButtons = [];
let serialPort = null;
let serialReader = null;
let latestSensorVector = null;

function isValidHistoryEntry(item) {
    return Boolean(
        item &&
        typeof item === "object" &&
        !Array.isArray(item) &&
        typeof item.key === "string" &&
        Object.prototype.hasOwnProperty.call(profiles, item.key) &&
        item.name === profiles[item.key].name &&
        item.emoji === profiles[item.key].emoji &&
        typeof item.time === "string" &&
        Number.isFinite(item.confidence) &&
        item.confidence >= 0 &&
        item.confidence <= 1 &&
        Number.isInteger(item.seed) &&
        item.seed >= 0 &&
        item.seed <= 4294967295
    );
}

function loadHistory() {
    try {
        const storedHistory = JSON.parse(localStorage.getItem(historyStorageKey) || "[]");
        if (!Array.isArray(storedHistory) || !storedHistory.every(isValidHistoryEntry)) {
            localStorage.removeItem(historyStorageKey);
            return [];
        }

        return storedHistory.slice(0, 8);
    } catch (error) {
        console.warn("Ignoring invalid saved scent history.", error);
        localStorage.removeItem(historyStorageKey);
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

function normalizeSensorValues(values) {
    const rawMaximum = values.some((value) => value > 1) ? 1023 : 1;
    return values.map((value) => clamp(value / rawMaximum));
}

function handleSensorLine(line) {
    const values = line.trim().split(",").map((value) => Number(value.trim()));
    if (values.length !== sensorChannels.length || values.some((value) => !Number.isFinite(value))) {
        console.warn("Ignoring malformed sensor line. Expected six numeric CSV values.");
        return;
    }

    latestSensorVector = normalizeSensorValues(values);
}

async function readSerialData(port) {
    const decoder = new TextDecoder();
    let buffer = "";
    serialReader = port.readable.getReader();

    try {
        while (serialPort === port) {
            const { value, done } = await serialReader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";
            lines.forEach(handleSensorLine);
        }
    } catch (error) {
        if (serialPort === port) {
            console.warn("Live sensor connection lost.", error);
        }
    } finally {
        serialReader.releaseLock();
        serialReader = null;
        if (serialPort === port) {
            serialPort = null;
            latestSensorVector = null;
            connectSensorButton.textContent = "Connect sensor";
            sensorStatus.textContent = "Simulated sensor";
            scanState.innerHTML = '<span class="pulse-dot"></span> Live sensor disconnected';
            try {
                if (port.opened) {
                    await port.close();
                }
            } catch (error) {
                console.warn("Unable to close the sensor port.", error);
            }
        }
    }
}

async function disconnectSensor() {
    const port = serialPort;
    serialPort = null;
    latestSensorVector = null;
    connectSensorButton.textContent = "Connect sensor";

    if (serialReader) {
        try {
            await serialReader.cancel();
        } catch (error) {
            console.warn("Unable to stop the sensor reader.", error);
        }
    }

    if (port) {
        try {
            if (port.opened) {
                await port.close();
            }
        } catch (error) {
            console.warn("Unable to close the sensor port.", error);
        }
    }

    sensorStatus.textContent = "Simulated sensor";
    scanState.innerHTML = '<span class="pulse-dot"></span> Live sensor disconnected';
}

async function connectSensor() {
    if (serialPort) {
        await disconnectSensor();
        return;
    }

    let port = null;
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 9600 });
        serialPort = port;
        latestSensorVector = null;
        connectSensorButton.textContent = "Disconnect sensor";
        sensorStatus.textContent = "Live sensor";
        scanState.innerHTML = '<span class="pulse-dot"></span> Waiting for live sensor data';
        readSerialData(port);
    } catch (error) {
        console.warn("Unable to connect to the sensor.", error);
        if (port?.opened) {
            try {
                await port.close();
            } catch (closeError) {
                console.warn("Unable to close the failed sensor port.", closeError);
            }
        }
        sensorStatus.textContent = "Simulated sensor";
        connectSensorButton.textContent = "Connect sensor";
    }
}

function initializeSerialSupport() {
    if (!("serial" in navigator) || !window.isSecureContext) {
        return;
    }

    connectSensorButton.hidden = false;
    connectSensorButton.addEventListener("click", connectSensor);
    navigator.serial.addEventListener("disconnect", (event) => {
        if (event.port === serialPort) {
            disconnectSensor();
        }
    });
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

function selectedNoise() {
    return noiseLevels[Number(noiseLevelInput.value)];
}

function isUncertain(classification) {
    const topProbability = classification[0].probability;
    const probabilityGap = topProbability - classification[1].probability;
    return topProbability < 0.55 || probabilityGap < 0.12;
}

function buildMeters(vector) {
    return sensorChannels.map((label, index) => [label, Math.round(vector[index] * 100)]);
}

function renderEmptyResult() {
    resultName.textContent = "Run a scan to see a result";
    confidence.textContent = "No result yet";
    resultDescription.textContent = "Choose a sample, then start a scan. This demo uses simulated sensor data.";
    sensorCanvas.hidden = true;
    meterList.innerHTML = "";
    noteList.innerHTML = "";
    candidateList.innerHTML = "";
    mysteryResult.hidden = true;
    mysteryResult.className = "mystery-result";
    resultAnnouncement.textContent = "";
    scanTime.textContent = "Waiting for scan";
}

function renderFinalResult(classification, vector) {
    const topResult = classification[0];
    const profile = profiles[topResult.key];
    const uncertain = isUncertain(classification);
    const resultLabel = uncertain ? "Not sure" : topResult.name;
    resultName.textContent = resultLabel;
    confidence.textContent = formatProbability(topResult.probability);
    resultAnnouncement.textContent = `Result: ${resultLabel}, ${Math.round(topResult.probability * 100)} percent confidence.`;
    resultDescription.textContent = uncertain
        ? "The simulated signal is ambiguous. Here are the three closest candidates."
        : profile.description;
    candidateList.innerHTML = uncertain
        ? classification.slice(0, 3).map((candidate) => `
            <span><b>${candidate.name}</b><strong>${formatProbability(candidate.probability)}</strong></span>
        `).join("")
        : `<div class="runner-up">Runner-up: ${classification[1].name} (${formatProbability(classification[1].probability)})</div>`;
    meterList.innerHTML = buildMeters(vector).map(([label, value]) => `
        <div class="meter-row"><span>${label}</span><div class="meter"><i style="width: ${value}%"></i></div><strong>${value}%</strong></div>
    `).join("");
    noteList.innerHTML = notes[topResult.key].map((note) => `<span class="note-chip">${note}</span>`).join("");

    if (mysteryMode) {
        const isCorrect = topResult.key === mysteryActualKey;
        mysteryResult.hidden = false;
        mysteryResult.className = `mystery-result ${isCorrect ? "correct" : "wrong"}`;
        mysteryResult.innerHTML = `<span>Actual: ${profiles[mysteryActualKey].name}</span><span class="mystery-badge">${isCorrect ? "✓ Correct" : "✗ Wrong"}</span>`;
    }
}

function renderHistory() {
    historyList.replaceChildren();
    replayButtons = [];
    if (!history.length) {
        const emptyHistory = document.createElement("div");
        emptyHistory.className = "empty-history";
        emptyHistory.textContent = "Your completed scans will appear here.";
        historyList.append(emptyHistory);
        return;
    }

    history.forEach((item) => {
        const card = document.createElement("div");
        const emoji = document.createElement("span");
        const details = document.createElement("span");
        const name = document.createElement("b");
        const metadata = document.createElement("small");
        const replay = document.createElement("button");

        card.className = "history-card";
        emoji.className = "sample-emoji";
        emoji.textContent = item.emoji;
        name.textContent = item.name;
        metadata.textContent = `${item.time} · ${formatProbability(item.confidence)}`;
        details.append(name, metadata);
        replay.className = "history-replay";
        replay.type = "button";
        replay.textContent = "Replay";
        replay.addEventListener("click", () => startScan({ key: item.key, seed: item.seed }));
        card.append(emoji, details, replay);
        historyList.append(card);
        replayButtons.push(replay);
    });
}

function setScanControlsLocked(locked) {
    sampleButtons.forEach((button) => {
        button.disabled = locked;
    });
    scanButton.disabled = locked;
    analyzerScanButton.disabled = locked;
    mysteryButton.disabled = locked;
    testButton.disabled = locked;
    noiseLevelInput.disabled = locked;
    connectSensorButton.disabled = locked;
    replayButtons.forEach((button) => {
        button.disabled = locked;
    });
}

function updateNoiseLabel() {
    noiseValue.textContent = noiseLabels[Number(noiseLevelInput.value)];
}

function renderConfusionMatrix(matrix, classKeys) {
    const header = classKeys.map((key) => `<th scope="col">${profiles[key].name}</th>`).join("");
    const rows = classKeys.map((actualKey) => `
        <tr>
            <th scope="row">${profiles[actualKey].name}</th>
            ${classKeys.map((predictedKey) => `<td>${matrix[actualKey][predictedKey]}</td>`).join("")}
        </tr>
    `).join("");
    confusionMatrix.innerHTML = `
        <table class="confusion-matrix">
            <caption>Rows are actual classes; columns are predicted classes.</caption>
            <thead><tr><th scope="col">Actual \\ Predicted</th>${header}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function runBenchmark() {
    setScanControlsLocked(true);
    testButton.textContent = "Running 200 scans...";
    sensorStatus.textContent = "Testing simulated data";
    const classKeys = Object.keys(fingerprints);
    const matrix = Object.fromEntries(classKeys.map((actualKey) => [
        actualKey,
        Object.fromEntries(classKeys.map((predictedKey) => [predictedKey, 0]))
    ]));
    let correct = 0;

    for (let scan = 0; scan < 200; scan += 1) {
        const actualKey = classKeys[Math.floor(Math.random() * classKeys.length)];
        const reading = simulateReading(actualKey, selectedNoise());
        const predictedKey = classify(reading.vector)[0].key;
        matrix[actualKey][predictedKey] += 1;
        if (actualKey === predictedKey) {
            correct += 1;
        }
    }

    const accuracy = Math.round((correct / 200) * 1000) / 10;
    accuracySummary.textContent = `${accuracy}% accuracy (${correct} correct of 200) at ${noiseLabels[Number(noiseLevelInput.value)].toLowerCase()} noise (σ = ${selectedNoise()}).`;
    renderConfusionMatrix(matrix, classKeys);
    accuracyPanel.open = true;
    sensorStatus.textContent = serialPort ? "Live sensor" : "Simulated sensor";
    testButton.textContent = "Run 200 test scans";
    setScanControlsLocked(false);
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
        sampleButtons.forEach((item) => item.setAttribute("aria-pressed", "false"));
        button.classList.add("active");
        button.setAttribute("aria-pressed", "true");
        selectedSample = button.dataset.sample;
        mysteryMode = false;
        mysteryActualKey = null;
        renderEmptyResult();
        scanTime.textContent = "Waiting for scan";
        scanState.innerHTML = '<span class="pulse-dot"></span> Waiting for a sample';
    });
});

function startScan(replayEntry = null) {
    if (replayEntry) {
        selectedSample = replayEntry.key;
        mysteryMode = false;
        mysteryActualKey = null;
        sampleButtons.forEach((button) => {
            const isSelected = button.dataset.sample === selectedSample;
            button.classList.toggle("active", isSelected);
            button.setAttribute("aria-pressed", String(isSelected));
        });
        renderEmptyResult();
    }

    scrollToAnalyzer();
    setScanControlsLocked(true);
    scanButton.innerHTML = '<span class="button-icon">◌</span> Analyzing...';
    analyzerScanButton.textContent = "Scanning...";
    scanState.classList.add("scanning");
    scanState.innerHTML = `<span class="pulse-dot"></span> ${serialPort && !replayEntry ? "Reading live sensor" : "Reading sensor layers"}`;
    sensorStatus.textContent = serialPort && !replayEntry ? "Live sensor" : "Scanning...";
    scanTime.textContent = serialPort && !replayEntry ? "Reading live signal..." : "Reading simulated signal...";

    if (serialPort && !latestSensorVector && !replayEntry) {
        scanState.classList.remove("scanning");
        scanState.innerHTML = '<span class="pulse-dot"></span> Waiting for live sensor data';
        scanTime.textContent = "No live reading yet";
        setScanControlsLocked(false);
        scanButton.innerHTML = '<span class="button-icon">⌁</span> Start a scan';
        analyzerScanButton.textContent = "Scan sample";
        return;
    }

    const usesLiveSensor = Boolean(serialPort && !replayEntry);
    const reading = usesLiveSensor
        ? { vector: [...latestSensorVector], seed: createSeed() }
        : simulateReading(selectedSample, selectedNoise(), replayEntry?.seed);
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
        history = history.slice(0, 8);
        localStorage.setItem(historyStorageKey, JSON.stringify(history));
        renderHistory();
        scanState.classList.remove("scanning");
        scanState.innerHTML = '<span class="pulse-dot"></span> Scan complete';
        sensorStatus.textContent = serialPort && usesLiveSensor ? "Live sensor" : "Simulated sensor";
        scanTime.textContent = "Just now";
        setScanControlsLocked(false);
        scanButton.innerHTML = '<span class="button-icon">⌁</span> Scan again';
        analyzerScanButton.textContent = "Scan again";
    });
}

scanButton.addEventListener("click", () => startScan());
analyzerScanButton.addEventListener("click", () => startScan());
mysteryButton.addEventListener("click", () => {
    if (mysteryButton.disabled) {
        return;
    }
    const classKeys = Object.keys(fingerprints);
    mysteryActualKey = classKeys[Math.floor(Math.random() * classKeys.length)];
    selectedSample = mysteryActualKey;
    mysteryMode = true;
    sampleButtons.forEach((button) => button.classList.remove("active"));
    sampleButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    renderEmptyResult();
    scanState.innerHTML = '<span class="pulse-dot"></span> Mystery sample selected';
    startScan();
});
testButton.addEventListener("click", runBenchmark);
noiseLevelInput.addEventListener("input", updateNoiseLabel);

clearHistory.addEventListener("click", () => {
    history = [];
    localStorage.removeItem(historyStorageKey);
    renderHistory();
});

renderEmptyResult();
renderHistory();
updateNoiseLabel();
initializeSerialSupport();
