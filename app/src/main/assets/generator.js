/* ==========================================
   PRIVATE QR CODE LM - AES-256 GENERATOR ENGINE
   ========================================== */

let activeFormType = 'text';
let generatedQRData = null; // Holds the last compiled QR data object

// On document load setup
document.addEventListener('DOMContentLoaded', () => {
    // File inputs setup
    const fileInput = document.getElementById('qr-input-file');
    if (fileInput) {
        // Prevent default drag drops
        window.addEventListener("dragover", e => e.preventDefault(), false);
        window.addEventListener("drop", e => e.preventDefault(), false);
    }
});

// Switch QR Input Forms (Text, URL, WiFi, Contact, File/Media)
function setQRFormType(type) {
    activeFormType = type;
    
    // Toggle active state in tab buttons
    document.querySelectorAll('.type-tab').forEach(btn => {
        if (btn.getAttribute('data-type') === type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Toggle active form inputs
    const formGroups = ['text', 'url', 'wifi', 'contact', 'file'];
    formGroups.forEach(g => {
        const groupEl = document.getElementById(`form-group-${g}`);
        if (groupEl) {
            if (g === type) {
                groupEl.classList.remove('hidden');
            } else {
                groupEl.classList.add('hidden');
            }
        }
    });
}

// Convert files to Base64 telemetry string
let uploadedFileBase64 = null;
let uploadedFileMeta = {};

function previewSelectedFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showLogToast("File size represents a security risk. Maximum size: 2MB.", "err");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        uploadedFileBase64 = e.target.result;
        uploadedFileMeta = {
            name: file.name,
            size: file.size,
            type: file.type
        };
        
        const infoBadge = document.getElementById('file-info-badge');
        const filePreview = document.getElementById('file-preview-area');
        const filenameLabel = document.getElementById('uploader-filename');

        if (infoBadge && filePreview && filenameLabel) {
            infoBadge.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            filePreview.classList.remove('hidden');
            filenameLabel.textContent = `File selected: ${file.name}`;
        }
    };
    reader.readAsDataURL(file);
}

function toggleSelfDestructOpts() {
    const isChecked = document.getElementById('qr-self-destruct').checked;
    const optsPnl = document.getElementById('self-destruct-options');
    if (isChecked) {
        optsPnl.classList.remove('hidden');
    } else {
        optsPnl.classList.add('hidden');
    }
}

// MAIN CODE COMPILER
async function generateSecureQR(event) {
    if (event) event.preventDefault();

    const password = document.getElementById('qr-security-password').value;
    if (!password) {
        showLogToast("Master password is required for AES-256 seal.", "err");
        return;
    }

    // Step 1: Format the source payload according to tab
    let rawPayload = "";
    let description = "Secret Payload";

    switch(activeFormType) {
        case 'text':
            const textVal = document.getElementById('qr-input-text').value;
            if (!textVal) { showLogToast("Please input text payload.", "err"); return; }
            rawPayload = textVal;
            description = textVal.length > 30 ? textVal.substring(0, 27) + "..." : textVal;
            break;
            
        case 'url':
            const urlVal = document.getElementById('qr-input-url').value;
            if (!urlVal) { showLogToast("Please define secure URL.", "err"); return; }
            rawPayload = JSON.stringify({ type: 'url', val: urlVal });
            description = `Redirect URL: ${urlVal}`;
            break;

        case 'wifi':
            const ssid = document.getElementById('qr-input-wifi-ssid').value;
            const wifiPass = document.getElementById('qr-input-wifi-password').value;
            const authType = document.getElementById('qr-input-wifi-auth').value;
            if (!ssid) { showLogToast("SSID Identifier is required.", "err"); return; }
            rawPayload = `WIFI:S:${ssid};T:${authType};P:${wifiPass};;`;
            description = `WiFi Network: ${ssid}`;
            break;

        case 'contact':
            const cName = document.getElementById('qr-input-contact-name').value;
            const cPhone = document.getElementById('qr-input-contact-phone').value;
            const cEmail = document.getElementById('qr-input-contact-email').value;
            if (!cName) { showLogToast("Contact Name is required.", "err"); return; }
            const vcard = `BEGIN:VCARD\nVERSION:3.0\nN:${cName}\nTEL:${cPhone}\nEMAIL:${cEmail}\nEND:VCARD`;
            rawPayload = JSON.stringify({ type: 'contact', name: cName, phone: cPhone, email: cEmail, raw: vcard });
            description = `Contact: ${cName}`;
            break;

        case 'file':
            if (!uploadedFileBase64) {
               showLogToast("Please choose an attachment payload first.", "err");
               return;
            }
            rawPayload = JSON.stringify({
                type: 'file',
                filename: uploadedFileMeta.name,
                filetype: uploadedFileMeta.type,
                base64: uploadedFileBase64
            });
            description = `Encrypted Attachment: ${uploadedFileMeta.name}`;
            break;
    }

    try {
        showLogToast("Initializing cryptography sequence...", "success");

        // Step 2: Encrypt Payload using AES-256
        const encryptedContent = CryptoJS.AES.encrypt(rawPayload, password).toString();

        // Step 3: Password hashing for lookup verification (SHA-256)
        const passwordHash = CryptoJS.SHA256(password).toString();

        // Step 4: Unique ID generator
        const qrId = 'qr_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36).substr(-4);

        // Step 5: Lifespan Expiry Timestamp
        const lifespanOption = parseInt(document.getElementById('qr-expiry').value);
        const expiresAt = lifespanOption > 0 ? (Date.now() + lifespanOption) : 0;

        // Step 6: Config self-destruct limits
        const isSelfDestruct = document.getElementById('qr-self-destruct').checked;
        const maxUsage = isSelfDestruct ? parseInt(document.getElementById('qr-max-scans').value) : 999999;

        // Step 7: Create QR index object
        const qrRecord = {
            qrId: qrId,
            encryptedContent: encryptedContent,
            passwordHash: passwordHash,
            usageCount: 0,
            maxUsage: maxUsage,
            createdAt: Date.now(),
            expiresAt: expiresAt,
            status: 'ACTIVE',
            description: description,
            type: activeFormType
        };

        // Step 8: Save record to Firebase (cloud) or local storage registry (fallback)
        await saveQRRecordToEngines(qrRecord);

        // Step 9: Compile Web preview payload representing QR
        // The QR code stores: { "id": qrId, "cipher": encryptedContent }
        const qrImgText = JSON.stringify({
            id: qrId,
            cipher: encryptedContent
        });

        drawQRImage(qrImgText);

        // Save reference for downloads and exports
        generatedQRData = {
            id: qrId,
            record: qrRecord
        };

        // UI Feedback updates
        document.getElementById('disp-qr-id').textContent = `ID: ${qrId}`;
        document.getElementById('disp-qr-uses').textContent = `Max Uses: ${maxUsage} | Expires: ${lifespanOption === 0 ? 'Never' : 'Dynamic timer'}`;
        document.getElementById('generator-actions-pnl').classList.remove('hidden');

        // Play synthetic tone
        playTone('success');
        showLogToast("QR Targets successfully compiled & sealed.", "success");

        // Clean password input for security
        document.getElementById('qr-security-password').value = "";
        
        // Refresh stats on dashboard asynchronously
        refreshAppDashboardStats();

    } catch(err) {
        showLogToast(`Compilation failure: ${err.message}`, "err");
        playTone('error');
    }
}

// Generate the QR matrix visually
function drawQRImage(textData) {
    const qrContainer = document.getElementById('generated-qrcode-container');
    qrContainer.innerHTML = ""; // Wipe original placeholder
    
    // Create new QRCode element
    new QRCode(qrContainer, {
        text: textData,
        width: 220,
        height: 220,
        colorDark : "#0B0F19",
        colorLight : "#FFFFFF",
        correctLevel : QRCode.CorrectLevel.M
    });
}

// Multi-engine storage (Firebase & Local fallbacks)
async function saveQRRecordToEngines(qrRecord) {
    const activeUser = getActiveSessionUser();
    
    // 1. Always save in local archives index (sharded LocalStorage)
    const localQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
    // Keep user tags if logged in
    qrRecord.ownerId = activeUser ? activeUser.uid : 'guest';
    localQRs.unshift(qrRecord);
    localStorage.setItem('qr_local_registry', JSON.stringify(localQRs));

    // 2. Mirror to Firebase Firestore if online and logged in
    if (window.isFirebaseConnected && window.firestoreDb && activeUser && isCloudSyncEnabled()) {
        try {
            await window.firestoreDb.collection('secure_qrs').doc(qrRecord.qrId).set(qrRecord);
            console.log("☁️ Record synced to cloud secure vaults.");
        } catch(e) {
            console.warn("Could not sync key directly to Firestore cloud. Running in offline fallback.", e);
        }
    }
}

// Share targeting
function shareSecureQR() {
    if (!generatedQRData) return;
    
    const qrText = `Private QR Node ID: ${generatedQRData.id}\nStatus: Enforced Encryption Path Active.`;
    
    if (navigator.share) {
        navigator.share({
            title: 'Private QR Code LM Share',
            text: qrText,
            url: window.location.href
        })
        .then(() => showLogToast("Share action initiated.", "success"))
        .catch((e) => console.log(e));
    } else {
        // Fallback: Copy ID
        navigator.clipboard.writeText(JSON.stringify({ id: generatedQRData.id }));
        showLogToast("Target manifest copied to clipboard buffer.", "success");
    }
}

// Dowmload Image
function downloadQRasPNG() {
    const qrContainer = document.getElementById('generated-qrcode-container');
    const img = qrContainer.querySelector('img') || qrContainer.querySelector('canvas');
    if (!img) {
        showLogToast("Generate a QR Target first.", "err");
        return;
    }

    let src = img.src;
    if (!src && img.toDataURL) {
        src = img.toDataURL("image/png");
    }

    if (!src) {
        showLogToast("An error occurred during canvas readback.", "err");
        return;
    }

    // Android Asset loader workaround: download files through simulated link element
    const link = document.createElement('a');
    link.href = src;
    link.download = `private_qr_${generatedQRData ? generatedQRData.id : 'code'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showLogToast("Secure QR image saved.", "success");
}

function isCloudSyncEnabled() {
    const cloudsyncToggle = document.getElementById('setting-cloudsync');
    return cloudsyncToggle ? cloudsyncToggle.checked : false;
}
