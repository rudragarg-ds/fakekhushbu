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
const scanState = document.querySelector("#scanState");
const historyList = document.querySelector("#historyList");
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

function buildMeters(vector, classKey) {
    return notes[classKey].map((label, index) => [label, Math.round(vector[index] * 100)]);
}

function renderResult(classification, vector) {
    const topResult = classification[0];
    const profile = profiles[topResult.key];
    document.querySelector("#resultName").textContent = topResult.name;
    document.querySelector("#confidence").textContent = formatProbability(topResult.probability);
    document.querySelector("#resultDescription").textContent = profile.description;
    document.querySelector("#meterList").innerHTML = buildMeters(vector, topResult.key).map(([label, value]) => `
        <div class="meter-row"><span>${label}</span><div class="meter"><i style="width: ${value}%"></i></div><strong>${value}%</strong></div>
    `).join("");
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

function renderReferenceResult(classKey) {
    const vector = fingerprints[classKey];
    renderResult(classify(vector), vector);
}

sampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
        sampleButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        selectedSample = button.dataset.sample;
        renderReferenceResult(selectedSample);
        document.querySelector("#scanTime").textContent = "Ready to scan";
        scanState.innerHTML = '<span class="pulse-dot"></span> Waiting for a sample';
    });
});

scanButton.addEventListener("click", () => {
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="button-icon">◌</span> Analyzing...';
    scanState.classList.add("scanning");
    scanState.innerHTML = '<span class="pulse-dot"></span> Reading sensor layers';
    document.querySelector("#scanTime").textContent = "Analyzing signal...";

    window.setTimeout(() => {
        const reading = simulateReading(selectedSample);
        const classification = classify(reading.vector);
        const topResult = classification[0];
        const profile = profiles[topResult.key];
        const now = new Date();

        renderResult(classification, reading.vector);
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
        document.querySelector("#scanTime").textContent = "Just now";
        scanButton.disabled = false;
        scanButton.innerHTML = '<span class="button-icon">⌁</span> Scan again';
    }, 1500);
});

document.querySelector("#clearHistory").addEventListener("click", () => {
    history = [];
    localStorage.removeItem("fakesmell-history");
    renderHistory();
});

renderReferenceResult(selectedSample);
renderHistory();
