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

const video = document.getElementById("camera-stream");
const canvas = document.getElementById("capture-canvas");
const btnCapture = document.getElementById("btn-capture");
const btnLoad = document.getElementById("btn-load");
const btnAddStamp = document.getElementById("btn-add-stamp");
const ocrStatus = document.getElementById("ocr-status");
const ticketInput = document.getElementById("ticket-num");
const stampCountEl = document.getElementById("stamp-count");
const stationSelect = document.getElementById("station-select");

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
btnCapture.addEventListener("click", async () => {
    if (!video.srcObject) {
        ocrStatus.innerText = "Camera offline. Type ticket ID manually.";
        return;
    }
    ocrStatus.innerText = "Analyzing live frame...";
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    try {
        const result = await Tesseract.recognize(
            canvas.toDataURL("image/jpeg"), 'eng', { tessedit_char_whitelist: '0123456789' }
        );
        const matches = result.data.text.match(/\d{3}/);
        if (matches && matches[0]) {
            const ticketNum = matches[0];
            ticketInput.value = ticketNum;
            ocrStatus.innerText = `Ticket detected: #${ticketNum}`;
            fetchTicketProgress(ticketNum);
        } else {
            ocrStatus.innerText = "Text unclear. Snap again or type manually.";
        }
    } catch (error) {
        ocrStatus.innerText = "OCR error. Type manually.";
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
            await setDoc(docRef, { stamps: currentTicketStamps });
        }
        updateUIWithStamps();
        btnAddStamp.disabled = false;
        ocrStatus.innerText = `Ticket #${ticketId} Loaded successfully.`;
    } catch (e) {
        ocrStatus.innerText = "Network Error syncing with cloud.";
    }
}

// Update UI
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

// Apply Specific Station Stamp
btnAddStamp.addEventListener("click", async () => {
    if (!currentTicketId) return;

    // Get the exact stamp selected from the dropdown
    const selectedStamp = stationSelect.value;

    // Check if the user already has this specific stamp
    if (currentTicketStamps.includes(selectedStamp)) {
        ocrStatus.innerText = `⚠️ Ticket #${currentTicketId} already has the [${selectedStamp}] stamp!`;
        return;
    }

    const docRef = doc(db, "tickets", currentTicketId);
    try {
        await updateDoc(docRef, { stamps: arrayUnion(selectedStamp) });
        currentTicketStamps.push(selectedStamp);
        updateUIWithStamps();
        ocrStatus.innerText = `Success! Stamp [${selectedStamp}] added to Ticket #${currentTicketId}.`;
        
        // Optional: clear input after successful scan for the next person
        // ticketInput.value = "";
        // currentTicketId = null;
        // btnAddStamp.disabled = true;
    } catch (error) {
        ocrStatus.innerText = "Failed to apply stamp. Check internet connection.";
    }
});
