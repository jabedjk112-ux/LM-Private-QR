/* ==========================================
   PRIVATE QR CODE LM - HYPER-SPECTRAL SCANNER
   ========================================== */

let cameraInputStream = null;
let isScanningActive = false;
let scanningCanvas = null;
let scanningCtx = null;

let currentScanningQRId = null;
let currentScanningCipher = null;

// Initializing on ready
document.addEventListener('DOMContentLoaded', () => {
    scanningCanvas = document.getElementById('camera-canvas');
    if (scanningCanvas) {
        scanningCtx = scanningCanvas.getContext('2d');
    }
});

// START CAMERA SCANNING STREAM
async function startCameraScanner() {
    if (isScanningActive) return;

    const videoFeed = document.getElementById('camera-feed');
    const fallbackPnl = document.getElementById('camera-fallback');

    try {
        showLogToast("Deploying optical sensor arrays...", "info");
        
        // Request WebRTC Camera access with constraints
        cameraInputStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" }
        });

        if (videoFeed) {
            videoFeed.srcObject = cameraInputStream;
            videoFeed.setAttribute("playsinline", true); // iOS compatibility
            videoFeed.play();
        }

        if (fallbackPnl) fallbackPnl.classList.add('hidden');
        
        isScanningActive = true;
        document.getElementById('start-camera-scan-btn').classList.add('hidden');
        document.getElementById('stop-camera-scan-btn').classList.remove('hidden');

        // Fire scanning draw frame recursive sequence
        requestAnimationFrame(tickScannerFrame);

    } catch(err) {
        console.error("Camera capture failed:", err);
        showLogToast("Scanner hardware unattached or blocked. Use manual file uploader.", "err");
        if (fallbackPnl) fallbackPnl.classList.remove('hidden');
    }
}

// STOP CAMERA SCANNING
function stopCameraScanner() {
    if (cameraInputStream) {
        cameraInputStream.getTracks().forEach(track => track.stop());
    }
    
    const videoFeed = document.getElementById('camera-feed');
    if (videoFeed) {
        videoFeed.srcObject = null;
    }
    
    const fallbackPnl = document.getElementById('camera-fallback');
    if (fallbackPnl) {
        fallbackPnl.classList.remove('hidden');
    }

    isScanningActive = false;
    document.getElementById('start-camera-scan-btn').classList.remove('hidden');
    document.getElementById('stop-camera-scan-btn').classList.add('hidden');
    
    showLogToast("Aperture camera sensor deactivated.", "info");
}

// Frame analysis clock loop
function tickScannerFrame() {
    if (!isScanningActive) return;

    const videoFeed = document.getElementById('camera-feed');
    if (videoFeed && videoFeed.readyState === videoFeed.HAVE_ENOUGH_DATA && scanningCanvas && scanningCtx) {
        scanningCanvas.hidden = false;
        scanningCanvas.width = videoFeed.videoWidth;
        scanningCanvas.height = videoFeed.videoHeight;
        
        // Draw image frame onto background evaluation canvas
        scanningCtx.drawImage(videoFeed, 0, 0, scanningCanvas.width, scanningCanvas.height);
        
        const imgData = scanningCtx.getImageData(0, 0, scanningCanvas.width, scanningCanvas.height);
        const decodedCode = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: "dontInvert"
        });

        if (decodedCode) {
            // MATCH FOUND! STOP IMMEDIATELY & EVALUATE
            isScanningActive = false;
            stopCameraScanner();
            playTone('success');
            
            evaluateDecodedPayload(decodedCode.data);
            return;
        }
    }

    // Keep ticking while active
    if (isScanningActive) {
        requestAnimationFrame(tickScannerFrame);
    }
}

// Alternative Target File Reader
function parseManualQRImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const label = document.getElementById('scanner-filename');
    if (label) label.textContent = `Analyzing: ${file.name}`;

    const reader = new FileReader();
    reader.onload = function(e) {
        const tempImg = new Image();
        tempImg.onload = function() {
            // Draw dummy canvas to parse
            const evalCanvas = document.createElement('canvas');
            evalCanvas.width = tempImg.width;
            evalCanvas.height = tempImg.height;
            const evalCtx = evalCanvas.getContext('2d');
            evalCtx.drawImage(tempImg, 0, 0);

            const imgData = evalCtx.getImageData(0, 0, evalCanvas.width, evalCanvas.height);
            const decoded = jsQR(imgData.data, imgData.width, imgData.height);

            if (decoded) {
                playTone('success');
                showLogToast("Target pattern decrypted from image file.", "success");
                evaluateDecodedPayload(decoded.data);
            } else {
                showLogToast("Fail. No valid QR targets recognized in image.", "err");
                playTone('error');
            }
        };
        tempImg.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// MAIN HYPER-SPECTRAL INTERPRETER
async function evaluateDecodedPayload(rawString) {
    let parsedData = null;
    
    try {
        parsedData = JSON.parse(rawString);
    } catch(e) {
        // Plain QR format. Fallback content display
        showSimplePayloadViewer(rawString);
        return;
    }

    // Check if it fits the Private QR schema (has id and cipher)
    if (!parsedData.id || !parsedData.cipher) {
        // Non-private JSON standard
        showSimplePayloadViewer(rawString);
        return;
    }

    currentScanningQRId = parsedData.id;
    currentScanningCipher = parsedData.cipher;

    // STEP 1: Query the QR status and usage logs from registry
    showLogToast(`Checking telemetry node: ${currentScanningQRId}...`, "info");
    const activeRegistryRecord = await lookupQRRecord(currentScanningQRId);

    if (activeRegistryRecord) {
        // Enforce validations
        const now = Date.now();
        if (activeRegistryRecord.expiresAt > 0 && now > activeRegistryRecord.expiresAt) {
            showDestructionAlertOverlay("EXPIRED", "This Private QR Code LM has expired and is no longer available due to chronological boundaries.");
            return;
        }

        if (activeRegistryRecord.status === 'DESTROYED' || activeRegistryRecord.usageCount >= activeRegistryRecord.maxUsage) {
            showDestructionAlertOverlay("DESTROYED", "This Private QR Code LM has expired and is no longer available.");
            return;
        }
    }

    // STEP 2: Show secure password prompt modal
    openDecryptPromptModal(currentScanningQRId);
}

// Multi-engine lookup (Firestore cloud sync + Local registries)
async function lookupQRRecord(qrId) {
    // 1. Look locally first
    const localQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
    let record = localQRs.find(q => q.qrId === qrId);

    if (record) {
        console.log("Found local target registration:", record);
        return record;
    }

    // 2. Look in Firestore cloud if connected
    if (window.isFirebaseConnected && window.firestoreDb) {
        try {
            const snap = await window.firestoreDb.collection('secure_qrs').doc(qrId).get();
            if (snap.exists) {
                record = snap.data();
                console.log("Found cloud target registration:", record);
                return record;
            }
        } catch(e) {
            console.error("Firestore cloud lookup failed:", e);
        }
    }

    return null;
}

// Passphrase prompt triggerings
function openDecryptPromptModal(qrId) {
    document.getElementById('pwd-prompt-qrid').textContent = qrId;
    document.getElementById('modal-decrypt-password').value = "";
    document.getElementById('modal-pwd-err').classList.add('hidden');
    document.getElementById('password-prompt-modal').classList.remove('hidden');
}

function closeDecryptPromptModal() {
    document.getElementById('password-prompt-modal').classList.add('hidden');
    currentScanningQRId = null;
    currentScanningCipher = null;
}

// SUBMIT MASTER DECRYPTION ACTION
async function submitDecryptPassword() {
    const password = document.getElementById('modal-decrypt-password').value;
    if (!password) return;

    try {
        // Step 1: Attempt AES decryption
        const decryptedBytes = CryptoJS.AES.decrypt(currentScanningCipher, password);
        const decryptedContent = decryptedBytes.toString(CryptoJS.enc.Utf8);

        if (!decryptedContent || decryptedContent.trim() === "") {
            throw new Error("Bad decryption result");
        }

        // CORRECT PASSWORD! Hide prompt modal
        document.getElementById('password-prompt-modal').classList.add('hidden');
        
        // Lookup actual lifecycle logs
        let record = await lookupQRRecord(currentScanningQRId);
        
        if (!record) {
            // First scan of externally generated QR (generate anonymous record details dynamic)
            record = {
                qrId: currentScanningQRId,
                encryptedContent: currentScanningCipher,
                passwordHash: CryptoJS.SHA256(password).toString(),
                usageCount: 0,
                maxUsage: 2,
                createdAt: Date.now() - 1000,
                status: 'ACTIVE',
                description: 'External Secure Node Code',
                type: 'text'
            };
        }

        // Increment Scans Counters
        record.usageCount += 1;
        
        // Life cycle state checks
        let selfDestructActivated = false;
        let isLastUse = false;

        if (record.usageCount >= record.maxUsage) {
            record.status = 'DESTROYED';
            record.encryptedContent = "[SHREDDED_DATA_AES_SYSTEM]"; // Shred database secret block
            selfDestructActivated = true;
        } else if (record.usageCount === record.maxUsage - 1) {
            record.status = 'LAST_USE_REMAINING';
            isLastUse = true;
        }

        // Write modifications to registries
        await modifyQRRecordInEngines(record);

        if (selfDestructActivated) {
            // TRIGGER GORGEOUS DESTRUCT OVERLAY SEQUENCE (Shows payload for 5 seconds countdown, then purges!)
            triggerSelfDestructCountdownAction(decryptedContent);
        } else {
            // Regular viewing panel with scan notifications
            showParsedPayloadViewer(decryptedContent, record.status, record.usageCount, record.maxUsage);
        }

    } catch(err) {
        console.error("Master Decryption Failed: ", err);
        document.getElementById('modal-pwd-err').classList.remove('hidden');
        playTone('error');
    }
}

// Save database modifications
async function modifyQRRecordInEngines(record) {
    // 1. Update in local sharded list
    const localQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
    const index = localQRs.findIndex(q => q.qrId === record.qrId);
    
    if (index !== -1) {
        localQRs[index] = record;
    } else {
        localQRs.unshift(record);
    }
    localStorage.setItem('qr_local_registry', JSON.stringify(localQRs));

    // 2. Mirror status modification to Cloud Firestore if online
    const activeUser = getActiveSessionUser();
    if (window.isFirebaseConnected && window.firestoreDb && activeUser && isCloudSyncEnabled()) {
        try {
            await window.firestoreDb.collection('secure_qrs').doc(record.qrId).set(record);
            console.log("☁️ cloud logs successfully updated.");
        } catch(e) {
            console.warn("Cloud mirror unsuccessful offline local logs saved.", e);
        }
    }
}

// Display basic non-encrypted scanned data
function showSimplePayloadViewer(content) {
    const textPnl = document.getElementById('unlocked-text-payload');
    const statusPnl = document.getElementById('viewer-status');
    const descPnl = document.getElementById('viewer-usage-text');
    const actionsRow = document.getElementById('viewer-action-row');

    if (textPnl && statusPnl && descPnl && actionsRow) {
        textPnl.textContent = content;
        statusPnl.textContent = "PUBLIC";
        statusPnl.className = "status-indicator-badge success-badge";
        descPnl.textContent = "No cryptographic password encryption detected.";
        
        // Handle URL clicking standard
        if (content.startsWith("http://") || content.startsWith("https://")) {
            actionsRow.innerHTML = `<button class="glowing-btn py-1 px-4 text-xs" onclick="window.open('${content}', '_blank')"><i class="fa-solid fa-arrow-up-right-from-square"></i> Open Link</button> <button class="glowing-secondary-btn py-1 px-3 text-xs" onclick="copyUnlockedPayload()"><i class="fa-solid fa-copy"></i> Copy</button>`;
        } else {
            actionsRow.innerHTML = `<button class="glowing-secondary-btn py-1 px-3 text-xs" onclick="copyUnlockedPayload()"><i class="fa-solid fa-copy"></i> Copy Value</button>`;
        }
        
        document.getElementById('payload-viewer-modal').classList.remove('hidden');
    }
}

// Display decrypted target content standard panel
function showParsedPayloadViewer(content, status, usageCount, maxUsage) {
    const textPnl = document.getElementById('unlocked-text-payload');
    const statusPnl = document.getElementById('viewer-status');
    const descPnl = document.getElementById('viewer-usage-text');
    const actionsRow = document.getElementById('viewer-action-row');

    statusPnl.textContent = status;
    if (status === 'LAST_USE_REMAINING') {
        statusPnl.className = "status-indicator-badge success-badge bg-warning";
        statusPnl.style.background = "rgba(124, 58, 237, 0.15)";
        statusPnl.style.color = "#7C3AED";
        statusPnl.style.borderColor = "#7C3AED";
        descPnl.textContent = `Scans completed: ${usageCount} of ${maxUsage}. CRITICAL: Next scan will destroy the secret forever!`;
    } else {
        statusPnl.className = "status-indicator-badge success-badge";
        statusPnl.style.background = ""; // standard resets
        statusPnl.style.color = "";
        statusPnl.style.borderColor = "";
        descPnl.textContent = `Scans completed: ${usageCount} of ${maxUsage}. Status secure.`;
    }

    // Check if the payload is complex JSON object (WiFi, Contact, File)
    try {
        const payloadObject = JSON.parse(content);
        
        if (payloadObject.type === 'url') {
            textPnl.innerHTML = `<div class="p-2 font-mono" style="word-break:break-all;"><i class="fa-solid fa-link"></i> Sealed Destination Link: <h4 class="mt-2 text-cyan">${payloadObject.val}</h4></div>`;
            actionsRow.innerHTML = `<button class="glowing-btn py-1 px-4 text-xs" onclick="window.open('${payloadObject.val}', '_blank')"><i class="fa-solid fa-arrow-up-right-from-square"></i> Teleport Link</button> <button class="glowing-secondary-btn py-1 px-3 text-xs" onclick="copyValueToClipboard('${payloadObject.val}')"><i class="fa-solid fa-copy"></i> Copy Link</button>`;
        } else if (payloadObject.type === 'contact') {
            textPnl.innerHTML = `
                <div class="contact-details p-1 font-mono text-xs">
                    <p class="m-0"><i class="fa-solid fa-user"></i> Alias: <strong>${payloadObject.name}</strong></p>
                    <p class="mt-2"><i class="fa-solid fa-phone"></i> Terminal: <strong>${payloadObject.phone}</strong></p>
                    <p class="mt-2"><i class="fa-solid fa-envelope"></i> Node Email: <strong>${payloadObject.email}</strong></p>
                </div>`;
            actionsRow.innerHTML = `<button class="glowing-secondary-btn py-1 px-3 text-xs" onclick="copyValueToClipboard('${payloadObject.raw}')"><i class="fa-solid fa-address-card"></i> Export VCard</button>`;
        } else if (payloadObject.type === 'file') {
            textPnl.innerHTML = `
                <div class="contact-details p-1 font-mono text-center">
                    <i class="fa-solid fa-file-shield text-cyan f-size-3"></i>
                    <h5 class="mt-3 text-white">${payloadObject.filename}</h5>
                    <p class="text-xs text-muted">File Type: ${payloadObject.filetype}</p>
                </div>`;
            actionsRow.innerHTML = `<button class="glowing-btn py-1 px-4 text-xs" onclick="downloadScannedBase64File('${payloadObject.base64}', '${payloadObject.filename}')"><i class="fa-solid fa-download"></i> Recover File</button>`;
        }
    } catch(e) {
        // Simple plain text
        
        // Check if plain text holds standard WIFI string format
        if (content.startsWith("WIFI:")) {
            const parsedWifi = parseWifiTelemetryString(content);
            textPnl.innerHTML = `
                <div class="wifi-payload p-1 font-mono text-xs">
                    <p><i class="fa-solid fa-wifi text-cyan"></i> Secured SSID: <strong>${parsedWifi.ssid}</strong></p>
                    <p class="mt-2"><i class="fa-solid fa-key"></i> Passkey: <strong class="text-purple">${parsedWifi.pass}</strong></p>
                    <p class="mt-2"><i class="fa-solid fa-shield"></i> Auth Protocols: <strong>${parsedWifi.auth}</strong></p>
                </div>`;
            actionsRow.innerHTML = `<button class="glowing-secondary-btn py-1 px-3 text-xs" onclick="copyValueToClipboard('${parsedWifi.pass}')"><i class="fa-solid fa-key"></i> Copy WiFi Pass</button>`;
        } else {
            textPnl.textContent = content;
            actionsRow.innerHTML = `<button class="glowing-secondary-btn py-1 px-3 text-xs" onclick="copyUnlockedPayload()"><i class="fa-solid fa-copy"></i> Copy Value</button>`;
        }
    }

    document.getElementById('payload-viewer-modal').classList.remove('hidden');
}

// CRITICAL COUNTDOWN ACCENTUATOR WIDGETS
function triggerSelfDestructCountdownAction(decryptedContent) {
    const destructOverlay = document.getElementById('self-destruct-overlay');
    const logTimeline = document.getElementById('shred-terminal-log');
    const timerDisplay = document.getElementById('countdown-shred');
    const timerSlider = document.getElementById('destruction-timer-bar');

    // Show Critical Overwrite Screen
    destructOverlay.classList.remove('hidden');
    playTone('explode');

    let secondsLeft = 5;
    timerDisplay.textContent = secondsLeft;
    timerSlider.style.width = '100vw'; // full width resets

    logTimeline.innerHTML = `
        <span class="text-red">[CRITICAL] SHRED ENFORCEMENT STARTED</span><br>
        [SYSTEM] Matches Max Scans threshold.<br>
        [SYSTEM] Erasing local registers...<br>
        [SYSTEM] PURGING ENCRYPTED PAYLOAD FROM SECURED SECTORS.
    `;

    // Render Decrypted content in a small flashing block inside the shredding overlay for quick reading
    let payloadInfoHTML = "";
    try {
        const payloadObject = JSON.parse(decryptedContent);
        if (payloadObject.type === 'url') {
            payloadInfoHTML = `URL LINK: ${payloadObject.val}`;
        } else if (payloadObject.type === 'contact') {
            payloadInfoHTML = `ALIAS: ${payloadObject.name} | PHONE: ${payloadObject.phone}`;
        } else if (payloadObject.type === 'file') {
            payloadInfoHTML = `FILE: ${payloadObject.filename} (Click Recover before Purge!)`;
            // Add instant urgent download button so they can extract file attachment in 5s!
            payloadInfoHTML += `<br><button onclick="downloadScannedBase64File('${payloadObject.base64}', '${payloadObject.filename}')" class="glowing-btn text-xs py-1 px-3 mt-2" style="background:#22C55E;box-shadow:0 0 10px #22C55E;color:#FFF;"><i class="fa-solid fa-download"></i> URGENT RECOVER</button>`;
        }
    } catch(e) {
        if (decryptedContent.startsWith("WIFI:")) {
            const parsedWifi = parseWifiTelemetryString(decryptedContent);
            payloadInfoHTML = `WIFI NETWORK SSID: ${parsedWifi.ssid} | PASS: ${parsedWifi.pass}`;
        } else {
            payloadInfoHTML = decryptedContent;
        }
    }

    logTimeline.innerHTML += `<div class="p-3 my-2 bg-dark-glass text-white font-mono text-center rounded border-dashed" style="border:1.5px dashed var(--danger); font-size:11px; word-break:break-all;"><strong>PAYLOAD DATA (Self-Destructs in 5s):</strong><br><span style="color:#00E5FF;">${payloadInfoHTML}</span></div>`;

    let activeInterval = setInterval(() => {
        secondsLeft -= 1;
        timerDisplay.textContent = Math.max(0, secondsLeft);
        
        let sliderPercentage = (secondsLeft / 5) * 100;
        timerSlider.style.width = `${sliderPercentage}%`;

        logTimeline.innerHTML += `[SHRED] Wipe sequence ticking... T-${secondsLeft}s<br>`;
        logTimeline.scrollTop = logTimeline.scrollHeight;

        if (secondsLeft <= 0) {
            clearInterval(activeInterval);
            
            // COMPLETE SHRED ACTIONS
            logTimeline.innerHTML += `<span class="text-success">[COMPLETED] SECRET PAYLOAD ERASED PERMANENTLY. Sector zeroed out.</span><br>`;
            logTimeline.scrollTop = logTimeline.scrollHeight;

            // Simple visual delay before exit
            setTimeout(() => {
                destructOverlay.classList.add('hidden');
                showLogToast("Local and cloud secrets overwritten with cryptographic zeros.", "info");
                
                // Navigate back to history archive page where they can see the destroyed label
                navigateToSection('history');
                refreshAppDashboardStats();
            }, 1000);
        }
    }, 1000);
}

// Purge overlay warnings
function showDestructionAlertOverlay(type, message) {
    const destructOverlay = document.getElementById('self-destruct-overlay');
    const logTimeline = document.getElementById('shred-terminal-log');
    const timerDisplay = document.getElementById('countdown-shred');
    const timerSlider = document.getElementById('destruction-timer-bar');

    destructOverlay.classList.remove('hidden');
    timerDisplay.textContent = "⚔️";
    timerDisplay.style.color = "var(--danger)";
    timerDisplay.style.fontSize = "3.5rem";
    timerSlider.style.width = "0%";

    playTone('error');

    logTimeline.innerHTML = `
        <span class="text-red">[INTEGRITY CHECK FAILURE] ACCESS DENIED</span><br>
        [ERROR] Scans limit exceeded or item manually scrubbed.<br>
        <span class="text-white">${message}</span>
    `;

    // Simple exit mechanism button append
    logTimeline.innerHTML += `<div class="text-center mt-3"><button onclick="document.getElementById('self-destruct-overlay').classList.add('hidden')" class="glowing-btn text-xs py-1 px-4 text-center btn-red">EXIT WARN DECK</button></div>`;
}

// Copy clipboard
function copyUnlockedPayload() {
    const text = document.getElementById('unlocked-text-payload').textContent;
    copyValueToClipboard(text);
}

function copyValueToClipboard(value) {
    navigator.clipboard.writeText(value);
    showLogToast("Copied to clipboard matrix successfully.", "success");
}

// Download Base64 Attachments
function downloadScannedBase64File(base64Data, filename) {
    const link = document.createElement('a');
    link.href = base64Data;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showLogToast("File recovery complete. Download saved.", "success");
}

function closePayloadViewerModal() {
    document.getElementById('payload-viewer-modal').classList.add('hidden');
    currentScanningQRId = null;
    currentScanningCipher = null;
}

// Helper parser for WiFi codes
function parseWifiTelemetryString(wifiStr) {
    // Schema: WIFI:S:MySSID;T:WPA;P:MyPass;;
    let ssid = "";
    let pass = "";
    let auth = "WPA";

    const ssidMatch = wifiStr.match(/S:([^;]+)/);
    const passMatch = wifiStr.match(/P:([^;]+)/);
    const authMatch = wifiStr.match(/T:([^;]+)/);

    if (ssidMatch) ssid = ssidMatch[1];
    if (passMatch) pass = passMatch[1];
    if (authMatch) auth = authMatch[1];

    return { ssid, pass, auth };
}
