// 1. Import official Firebase SDK Modules using your chosen 12.15.0 version track
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

// 2. Your active live web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDurblPLcs0QUqWYrHsgPe9yKRhCXXzKBA",
    authDomain: "kpz-inside-out.firebaseapp.com",
    projectId: "kpz-inside-out",
    storageBucket: "kpz-inside-out.firebasestorage.app",
    messagingSenderId: "753609971318",
    appId: "1:753609971318:web:8368ef81225261245f3157",
    measurementId: "G-Y0MT5FF55K"
};

// Initialize Firebase & get Firestore Instance
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM Selectors
const video = document.getElementById("camera-stream");
const canvas = document.getElementById("capture-canvas");
const btnCapture = document.getElementById("btn-capture");
const btnAddStamp = document.getElementById("btn-add-stamp");
const ocrStatus = document.getElementById("ocr-status");
const ticketInput = document.getElementById("ticket-num");
const stampCountEl = document.getElementById("stamp-count");

let currentTicketId = null;
let currentTicketStamps = [];

// --- ENHANCED CAMERA INITIALIZATION WITH FALLBACKS ---
async function initCamera() {
    ocrStatus.innerText = "Requesting camera hardware access...";
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        ocrStatus.innerText = "Security Error: Open this page using HTTPS link on Safari/Chrome.";
        enableManualFallback();
        return;
    }

    // Attempt 1: Request the standard ultra-wide or wide rear camera
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" } 
        });
        video.srcObject = stream;
        ocrStatus.innerText = "Rear camera active. Ready to scan!";
    } catch (firstError) {
        console.warn("Rear camera constraint failed, executing fallback standard capture...", firstError);
        
        // Attempt 2: Fallback to any generic available default hardware lens
        try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
                video: true 
            });
            video.srcObject = fallbackStream;
            ocrStatus.innerText = "Default camera active. Ready to scan!";
        } catch (finalError) {
            console.error("All camera stream allocations failed:", finalError);
            
            // Print out clear human-readable error instructions directly to your phone screen
            if (finalError.name === "NotAllowedError" || finalError.name === "PermissionDeniedError") {
                ocrStatus.innerText = "⚠️ Camera Denied! Reset site permissions in your browser settings bar.";
            } else {
                ocrStatus.innerText = `Camera Error: ${finalError.message || finalError.name}`;
            }
            
            enableManualFallback();
        }
    }
}

// Safety backup mechanism: Allows manual input if the hardware is blocked
function enableManualFallback() {
    ticketInput.removeAttribute("readonly");
    ticketInput.placeholder = "Type # (e.g. 001)";
    ticketInput.style.border = "2px solid #f1c40f";
    ticketInput.style.background = "#1a2a5e";
    
    // Auto-fetch data when the operator types exactly 3 characters manually
    ticketInput.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        if (val.length >= 3) {
            fetchTicketProgress(val);
        }
    });
}

// Execute camera handshake immediately on load
initCamera();

// OCR Processing Action
btnCapture.addEventListener("click", async () => {
    if (!video.srcObject) {
        ocrStatus.innerText = "Scanner offline. Please type the ticket ID directly below.";
        return;
    }

    ocrStatus.innerText = "Analyzing live ticket frame...";
    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    try {
        const result = await Tesseract.recognize(
            canvas.toDataURL("image/jpeg"),
            'eng',
            { tessedit_char_whitelist: '0123456789' }
        );

        const matches = result.data.text.match(/\d{3}/);
        if (matches && matches[0]) {
            const ticketNum = matches[0];
            ticketInput.value = ticketNum;
            ocrStatus.innerText = `Ticket detected: #${ticketNum}`;
            fetchTicketProgress(ticketNum);
        } else {
            ocrStatus.innerText = "Target text unclear. Adjust alignment and snap again.";
        }
    } catch (error) {
        console.error(error);
        ocrStatus.innerText = "OCR Initialization error.";
    }
});

// Database Synchronization
async function fetchTicketProgress(ticketId) {
    ocrStatus.innerText = "Syncing progress with Firebase...";
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
        ocrStatus.innerText = `Cloud Connected. Ticket #${ticketId} loaded.`;
    } catch (e) {
        console.error("Database connection fault: ", e);
        ocrStatus.innerText = "Error syncing with cloud servers.";
    }
}

// Repaint Stamp Dashboard Cards
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

// Award linear MBTI thematic stamps
btnAddStamp.addEventListener("click", async () => {
    if (!currentTicketId) return;

    const mbtiOrder = ["E", "I", "S", "N", "T", "F", "J", "P"];
    const nextStamp = mbtiOrder.find(type => !currentTicketStamps.includes(type));

    if (nextStamp) {
        const docRef = doc(db, "tickets", currentTicketId);
        
        try {
            await updateDoc(docRef, {
                stamps: arrayUnion(nextStamp)
            });
            
            currentTicketStamps.push(nextStamp);
            updateUIWithStamps();
            ocrStatus.innerText = `Stamp [${nextStamp}] successfully added to Ticket #${currentTicketId}!`;
        } catch (error) {
            console.error(error);
            ocrStatus.innerText = "Failed to upload stamp to Firebase cloud.";
        }
    } else {
        ocrStatus.innerText = "All 8 event stamps complete!";
    }
});
