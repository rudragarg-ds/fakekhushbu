const samples = {
    coffee: { name: "Roasted coffee", emoji: "☕", confidence: 96, description: "A deep, comforting aroma with toasted notes and a soft caramel finish.", meters: [["Roasted", 96], ["Nutty", 82], ["Caramel", 68], ["Bitter", 43]] },
    citrus: { name: "Fresh citrus", emoji: "🍊", confidence: 94, description: "A bright, sparkling profile with a clean peel note and a lively finish.", meters: [["Zesty", 94], ["Fresh", 88], ["Sweet", 62], ["Bitter", 24]] },
    rain: { name: "After the rain", emoji: "🌧", confidence: 89, description: "Cool mineral air layered with damp earth, green leaves, and petrichor.", meters: [["Mineral", 89], ["Earthy", 84], ["Green", 71], ["Woody", 46]] },
    mint: { name: "Crushed mint", emoji: "🌿", confidence: 97, description: "A crisp, cooling burst of green leaves with a clean, airy finish.", meters: [["Fresh", 97], ["Green", 91], ["Cooling", 86], ["Herbal", 78]] }
};

const sampleButtons = document.querySelectorAll(".sample-card");
const scanButton = document.querySelector("#scanButton");
const scanState = document.querySelector("#scanState");
const historyList = document.querySelector("#historyList");
let selectedSample = "coffee";
let history = JSON.parse(localStorage.getItem("fakesmell-history") || "[]");

function renderResult(sample) {
    document.querySelector("#resultName").textContent = sample.name;
    document.querySelector("#confidence").textContent = `${sample.confidence}% match`;
    document.querySelector("#resultDescription").textContent = sample.description;
    document.querySelector("#meterList").innerHTML = sample.meters.map(([label, value]) => `
        <div class="meter-row"><span>${label}</span><div class="meter"><i style="width: ${value}%"></i></div><strong>${value}%</strong></div>
    `).join("");
}

function renderHistory() {
    if (!history.length) {
        historyList.innerHTML = '<div class="empty-history">Your completed scans will appear here.</div>';
        return;
    }
    historyList.innerHTML = history.map((item) => `
        <div class="history-card"><span class="sample-emoji">${item.emoji}</span><span><b>${item.name}</b><small>${item.time} · ${item.confidence}% match</small></span></div>
    `).join("");
}

sampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
        sampleButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        selectedSample = button.dataset.sample;
        renderResult(samples[selectedSample]);
        document.querySelector("#scanTime").textContent = "Ready to scan";
        scanState.innerHTML = '<span class="pulse-dot"></span> Waiting for a sample';
    });
});

scanButton.addEventListener("click", () => {
    const sample = samples[selectedSample];
    scanButton.disabled = true;
    scanButton.innerHTML = '<span class="button-icon">◌</span> Analyzing...';
    scanState.classList.add("scanning");
    scanState.innerHTML = '<span class="pulse-dot"></span> Reading sensor layers';
    document.querySelector("#scanTime").textContent = "Analyzing signal...";

    window.setTimeout(() => {
        const now = new Date();
        history.unshift({ ...sample, time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
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

renderResult(samples[selectedSample]);
renderHistory();
