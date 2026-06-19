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

// Auto-Scan Action
// Auto-Scan Action (With Image Pre-Processing & Targeted Cropping)
btnCapture.addEventListener("click", async () => {
    if (!video.srcObject) {
        ocrStatus.innerText = "Camera offline. Type ticket ID manually.";
        return;
    }
    
    ocrStatus.innerText = "Processing high-contrast scan...";
    const context = canvas.getContext("2d");

    // 1. Calculate Target Cropping Coordinates (Region of Interest)
    // We target a crisp, tight horizontal box right in the center of the video
    const cropWidth = video.videoWidth * 0.70;   // Matches your 70% width overlay
    const cropHeight = video.videoHeight * 0.25; // Targets a focused box height
    const cropX = (video.videoWidth - cropWidth) / 2;
    const cropY = (video.videoHeight - cropHeight) / 2;

    // Set canvas dimensions strictly to the cropped box size
    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // 2. Apply Hardware-Accelerated Filters for Crisp Text Detection
    // This turns red text black, brightens the white label, and sharpens edges
    context.filter = 'grayscale(100%) contrast(250%) brightness(120%)';

    // 3. Draw ONLY the optimized, cropped center box onto the canvas
    context.drawImage(
        video, 
        cropX, cropY, cropWidth, cropHeight, // Source coordinates from live video
        0, 0, cropWidth, cropHeight          // Destination coordinates on canvas
    );
    
    try {
        // Use a less restrictive whitelist to handle potential raw artifacting
        const result = await Tesseract.recognize(
            canvas.toDataURL("image/jpeg"), 
            'eng',
            { tessedit_char_whitelist: '0123456789No.Ticket:no ' }
        );
        
        const detectedText = result.data.text.toLowerCase();
        console.log("Processed Scan Box Text:", detectedText); 

        // Match any clean 3-digit cluster inside our isolated box
        const matches = detectedText.match(/\d{3}/);
        
        if (matches && matches[0]) {
            const ticketNum = matches[0];
            ticketInput.value = ticketNum;
            ocrStatus.innerText = `🎯 Ticket detected: #${ticketNum}`;
            fetchTicketProgress(ticketNum);
        } else {
            ocrStatus.innerText = "Number unclear. Center the red digits in the box and retry.";
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
