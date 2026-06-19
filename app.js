import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDurblPLcs0QUqWYrHsgPe9yKRhCXXzKBA",
    authDomain: "kpz-inside-out.firebaseapp.com",
    projectId: "kpz-inside-out",
    storageBucket: "kpz-inside-out.firebasestorage.app",
    messagingSenderId: "753609971318",
    appId: "1:753609971318:web:8368ef81225261245f3157",
    measurementId: "G-Y0MT5FF55K"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- LIGHTWEIGHT OPERATOR TRACKING SYSTEM ---
const urlParams = new URLSearchParams(window.location.search);
const nameParam = urlParams.get('name');

// If "?name=something" is in the link, save it and scrub the URL clean
if (nameParam) {
    localStorage.setItem('kpz_operator_name', nameParam.trim());
    window.location.href = window.location.origin + window.location.pathname;
}

// Fallback to "Unknown Booth" if they just opened the base link directly
const currentOperator = localStorage.getItem('kpz_operator_name') || "Unknown Booth";

// DOM Selectors
const video = document.getElementById("camera-stream");
const canvas = document.getElementById("capture-canvas");
const btnCapture = document.getElementById("btn-capture");
const btnLoad = document.getElementById("btn-load");
const btnAddStamp = document.getElementById("btn-add-stamp");
const ocrStatus = document.getElementById("ocr-status");
const ticketInput = document.getElementById("ticket-num");
const stampCountEl = document.getElementById("stamp-count");
const stationSelect = document.getElementById("station-select");
const operatorBadge = document.getElementById("operator-badge");

// Render the active operator tracking badge on screen
if (operatorBadge) {
    operatorBadge.innerText = `👤 ${currentOperator}`;
    operatorBadge.style.display = "inline-block";
}

let currentTicketId = null;
let currentTicketStamps = [];

// Initialize Camera
async function initCamera() {
    ocrStatus.innerText = "Initializing camera...";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        ocrStatus.innerText = "Camera not supported. Please type ticket ID manually.";
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        ocrStatus.innerText = "Camera active. Ready to scan or type.";
    } catch (err) {
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = fallbackStream;
            ocrStatus.innerText = "Default camera active.";
        } catch (finalErr) {
            ocrStatus.innerText = "Camera blocked. Type ID manually.";
        }
    }
}
initCamera();

// Manual Load Action
btnLoad.addEventListener("click", () => {
    const val = ticketInput.value.trim();
    if (val.length > 0) {
        fetchTicketProgress(val);
    } else {
        ocrStatus.innerText = "Please type a ticket number first!";
    }
});

// Auto-Scan Action (Isolates Red Text in the Center Box)
btnCapture.addEventListener("click", async () => {
    if (!video.srcObject) {
        ocrStatus.innerText = "Camera offline. Type ticket ID manually.";
        return;
    }
    
    ocrStatus.innerText = "Isolating red serial numbers...";
    const context = canvas.getContext("2d");

    // 1. Define the tight center box (Region of Interest)
    const cropWidth = video.videoWidth * 0.70;   
    const cropHeight = video.videoHeight * 0.20; // Lowered height to focus tightly on the sticker
    const cropX = (video.videoWidth - cropWidth) / 2;
    const cropY = (video.videoHeight - cropHeight) / 2;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // 2. Draw the raw camera crop into the canvas first
    context.drawImage(
        video, 
        cropX, cropY, cropWidth, cropHeight, 
        0, 0, cropWidth, cropHeight          
    );

    // 3. Pixel Manipulation: Filter out everything except RED
    const imageData = context.getImageData(0, 0, cropWidth, cropHeight);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];     // Red channel
        const g = data[i + 1]; // Green channel
        const b = data[i + 2]; // Blue channel

        // Threshold Rule: True red has a strong R value, and is significantly higher than G and B
        // We also want to avoid pure whites/yellows where G is high
        if (r > 110 && r > g * 1.4 && r > b * 1.4) {
            // It's the red number! Make it crisp black text for Tesseract
            data[i] = 0;     // R
            data[i + 1] = 0; // G
            data[i + 2] = 0; // B
        } else {
            // It's background noise, barcode, or text. Erase it to pure white.
            data[i] = 255;   // R
            data[i + 1] = 255; // G
            data[i + 2] = 255; // B
        }
    }
    
    // Write our red-isolated pixel data back to the canvas layout
    context.putImageData(imageData, 0, 0);
    
    try {
        // Tesseract now only receives a clean image of black numbers on a white canvas
        const result = await Tesseract.recognize(
            canvas.toDataURL("image/jpeg"), 
            'eng',
            { tessedit_char_whitelist: '0123456789' } // Safe to use numbers-only whitelist again!
        );
        
        const detectedText = result.data.text.replace(/\s+/g, ''); // Clear random spaces
        console.log("Isolated Red Text Result:", detectedText); 

        const matches = detectedText.match(/\d{3}/);
        
        if (matches && matches[0]) {
            const ticketNum = matches[0];
            ticketInput.value = ticketNum;
            ocrStatus.innerText = `🎯 Ticket detected: #${ticketNum}`;
            fetchTicketProgress(ticketNum);
        } else {
            ocrStatus.innerText = "Number unclear. Ensure lighting is bright and red numbers are centered.";
        }
    } catch (error) {
        console.error(error);
        ocrStatus.innerText = "OCR processing glitch. Type manually.";
    }
});

// Fetch Data
async function fetchTicketProgress(ticketId) {
    ocrStatus.innerText = `Loading Ticket #${ticketId} from Cloud...`;
    currentTicketId = ticketId;
    const docRef = doc(db, "tickets", ticketId);
    
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            currentTicketStamps = docSnap.data().stamps || [];
        } else {
            currentTicketStamps = [];
            // Initialize document with empty arrays if it's a completely new ticket
            await setDoc(docRef, { stamps: currentTicketStamps, logs: [] });
        }
        updateUIWithStamps();
        btnAddStamp.disabled = false;
        ocrStatus.innerText = `Ticket #${ticketId} loaded successfully.`;
    } catch (e) {
        ocrStatus.innerText = "Network Error syncing with cloud.";
    }
}

// Update UI Matrix
function updateUIWithStamps() {
    const cards = document.querySelectorAll(".stamp-card");
    let count = 0;
    cards.forEach(card => {
        const mbtiType = card.getAttribute("data-mbti");
        if (currentTicketStamps.includes(mbtiType)) {
            card.classList.add("unlocked");
            card.classList.remove("locked");
            count++;
        } else {
            card.classList.add("locked");
            card.classList.remove("unlocked");
        }
    });
    stampCountEl.innerText = count;
}

// Apply Specific Station Stamp with Audit Log Tracking
btnAddStamp.addEventListener("click", async () => {
    if (!currentTicketId) return;

    const selectedStamp = stationSelect.value;

    if (currentTicketStamps.includes(selectedStamp)) {
        ocrStatus.innerText = `⚠️ Ticket #${currentTicketId} already has the [${selectedStamp}] stamp!`;
        return;
    }

    const docRef = doc(db, "tickets", currentTicketId);
    
    // Package up the audit metadata
    const logEntry = {
        stamp: selectedStamp,
        operator: currentOperator,
        timestamp: new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) // Local Malaysian Time
    };

    try {
        await updateDoc(docRef, { 
            stamps: arrayUnion(selectedStamp),
            logs: arrayUnion(logEntry) // Saves tracking log history into Firestore seamlessly
        });

        currentTicketStamps.push(selectedStamp);
        updateUIWithStamps();
        ocrStatus.innerText = `Success! Stamp [${selectedStamp}] applied by ${currentOperator}.`;
        
    } catch (error) {
        ocrStatus.innerText = "Failed to apply stamp. Check internet connection.";
    }
});
