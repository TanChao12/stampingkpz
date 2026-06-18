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

// Initialize device camera track stream
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(stream => { video.srcObject = stream; })
        .catch(err => {
            console.error(err);
            ocrStatus.innerText = "Error: Camera track access blocked.";
        });
}

// OCR Processing Action
btnCapture.addEventListener("click", async () => {
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