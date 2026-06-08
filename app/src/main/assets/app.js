/* ==========================================
   PRIVATE QR CODE LM - COORDINATOR PROTOCOL (MAIN APP)
   ========================================== */

let activeSectionId = 'dashboard';
let appThemeState = 'dark';

// Initial startup binding
document.addEventListener('DOMContentLoaded', () => {
    initializeCoreTelemetryClocks();
    checkExistingAgentSession();
    initializeInteractiveCards();
    
    // Default form inputs reset
    setQRFormType('text');
});

// Real-time Dashboard Clock updates
function initializeCoreTelemetryClocks() {
    const clockEl = document.getElementById('live-clock');
    if (clockEl) {
        setInterval(() => {
            const now = new Date();
            const timeString = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
            clockEl.textContent = timeString;
        }, 1000);
    }
}

// Navigation flow coordinator
function navigateToSection(targetSectionId, optionalParam = null) {
    if (targetSectionId === 'scanner') {
        // Trigger camera permission check warning
        showLogToast("Deploying optical sensors...", "info");
    } else {
        // Automatically close cameras when leaving scan section
        stopCameraScanner();
    }

    // Toggle screen visibilities
    const screens = ['dashboard', 'generator', 'scanner', 'history', 'profile'];
    screens.forEach(s => {
        const screenEl = document.getElementById(`screen-${s}`);
        if (screenEl) {
            if (s === targetSectionId) {
                screenEl.classList.remove('hidden');
            } else {
                screenEl.classList.add('hidden');
            }
        }
    });

    // Toggle active state in sidebar navigation buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        if (btn.getAttribute('data-target') === targetSectionId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Handle incoming routing parameters
    if (targetSectionId === 'generator' && optionalParam) {
        setQRFormType(optionalParam);
    }

    if (targetSectionId === 'history') {
        renderQRArchivesList();
    }

    activeSectionId = targetSectionId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Session Integrity Check
function checkExistingAgentSession() {
    const splash = document.getElementById('splash-screen');
    const authScr = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');

    // Simulate calibration progress before releasing splash screen
    setTimeout(() => {
        const offlineUser = localStorage.getItem('offline_current_agent');
        
        // Check Firebase Auth as well
        if (window.isFirebaseConnected && window.firebaseAuth) {
            window.firebaseAuth.onAuthStateChanged(user => {
                splash.classList.add('hidden');
                
                if (user) {
                    onSessionAgentAuthorized(user, "ONLINE SYNC PROTOCOL");
                } else if (offlineUser) {
                    onSessionAgentAuthorized(JSON.parse(offlineUser), "DECENTRALIZED ENCRYPT FALLBACK");
                } else {
                    authScr.classList.remove('hidden');
                    mainApp.classList.add('hidden');
                }
            });
        } else {
            // No Firebase loaded. Check offline registry
            splash.classList.add('hidden');
            if (offlineUser) {
                onSessionAgentAuthorized(JSON.parse(offlineUser), "DECENTRALIZED ENCRYPT FALLBACK");
            } else {
                authScr.classList.remove('hidden');
                mainApp.classList.add('hidden');
            }
        }
    }, 2200);
}

// Switch Login/Register Tabs
function switchAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const regForm = document.getElementById('register-form');
    const loginBtn = document.getElementById('tab-login-btn');
    const regBtn = document.getElementById('tab-register-btn');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        regForm.classList.add('hidden');
        loginBtn.classList.add('active');
        regBtn.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        regForm.classList.remove('hidden');
        loginBtn.classList.remove('active');
        regBtn.classList.add('active');
    }
}

// Submit authentications (Standard + Offline registers)
async function handleAuthSubmit(event, mode) {
    event.preventDefault();
    showLogToast("Analyzing digital passphrase parameters...", "info");

    const email = mode === 'login' ? document.getElementById('login-email').value : document.getElementById('reg-email').value;
    const password = mode === 'login' ? document.getElementById('login-password').value : document.getElementById('reg-password').value;
    const name = mode === 'register' ? document.getElementById('reg-name').value : "";

    // 1. Try Firebase Auth Online first if connected
    if (window.isFirebaseConnected && window.firebaseAuth) {
        try {
            let authResult;
            if (mode === 'login') {
                authResult = await window.firebaseAuth.signInWithEmailAndPassword(email, password);
                onSessionAgentAuthorized(authResult.user, "ONLINE PROTOCOLS VALIDATED");
            } else {
                authResult = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
                await authResult.user.updateProfile({ displayName: name });
                // Make a matching entry in Firestore db for security logs
                await window.firestoreDb.collection('agents').doc(authResult.user.uid).set({
                    displayName: name,
                    email: email,
                    joinedAt: Date.now()
                });
                onSessionAgentAuthorized(authResult.user, "AGENT CIPHER KEYS LINKED");
            }
            return;
        } catch(err) {
            console.warn("Firebase Auth rejected, checking offline keys: ", err.message);
        }
    }

    // 2. Offline Vault fallback execution if firebase fails/disabled
    try {
        let guestResult;
        if (mode === 'login') {
            guestResult = window.offlineAuth.login(email, password);
            onSessionAgentAuthorized(guestResult, "DECENTRALIZED ENCRYPT FALLBACK");
        } else {
            guestResult = window.offlineAuth.register(name, email, password);
            onSessionAgentAuthorized(guestResult, "OFFLINE CIPHER CREDENTIAL INSTALLED");
        }
    } catch(err) {
        showLogToast(err.message, "err");
        playTone('error');
    }
}

// Offline Guest login directly
function continueOffline() {
    showLogToast("Bypassing cloud bindings. Session locked local.", "success");
    const offlineUserDummy = {
        uid: 'anonymous_dec_agent',
        displayName: 'Decentralized Agent',
        email: 'offline-protocol-agent',
        isAnonymous: true,
        photoURL: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150"
    };

    localStorage.setItem('offline_current_agent', JSON.stringify(offlineUserDummy));
    onSessionAgentAuthorized(offlineUserDummy, "MOCK DECENTRALIZED FALLBACK MODE");
}

// When Agent Session authorized successfully
function onSessionAgentAuthorized(agentUser, methodLabel) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    // Load metrics on views
    document.getElementById('user-display-name').textContent = agentUser.displayName || 'Agent';
    document.getElementById('agent-welcome-name').textContent = agentUser.displayName || 'Agent';
    document.getElementById('profile-name-lbl').textContent = agentUser.displayName || 'Secured Agent';
    document.getElementById('profile-email-lbl').textContent = agentUser.email;
    
    // Status text updates
    const connEl = document.getElementById('connection-status');
    const badgeEl = document.getElementById('profile-sync-badge');
    const cloudsyncToggle = document.getElementById('setting-cloudsync');

    if (window.isFirebaseConnected && !agentUser.isAnonymous) {
        if (connEl) connEl.innerHTML = `<span class="status-dot green"></span> MILITARY CLOUD LINK SECURED`;
        if (badgeEl) badgeEl.textContent = `CLOUD MUTUAL SYNC ACTIVE`;
        if (cloudsyncToggle) cloudsyncToggle.checked = true;
    } else {
        if (connEl) connEl.innerHTML = `<span class="status-dot red"></span> DECENTRALIZED OFFLINE PROTECTION`;
        if (badgeEl) badgeEl.textContent = `DECENTRALIZED LOCAL CACHE SECURED`;
        if (cloudsyncToggle) cloudsyncToggle.checked = false;
    }

    showLogToast(`Decryption deck assigned via ${methodLabel}`, "success");
    playTone('success');
    
    // Refresh stats and history logs
    refreshAppDashboardStats();
}

// Logouts Session
async function logoutSession() {
    showLogToast("Purging authorization signatures...", "info");
    
    if (window.isFirebaseConnected && window.firebaseAuth) {
        await window.firebaseAuth.signOut().catch(e => console.log(e));
    }
    
    await window.offlineAuth.signOut();
    
    // Reset inputs & visibility
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    showLogToast("De-authorized. Quantum deck returned to sleep.", "info");
}

// Retrieve current logged agent object
function getActiveSessionUser() {
    const offlineUser = localStorage.getItem('offline_current_agent');
    if (offlineUser) return JSON.parse(offlineUser);
    
    if (window.isFirebaseConnected && window.firebaseAuth) {
        return window.firebaseAuth.currentUser;
    }
    return null;
}

// RENDER QR LISTINGS IN HISTORIC ARCHIVES CARDS
function renderQRArchivesList() {
    const listContainer = document.getElementById('archives-list-container');
    if (!listContainer) return;

    const allQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
    const activeAgent = getActiveSessionUser();
    const guestUid = activeAgent ? activeAgent.uid : 'guest';

    // Filter list to only show records created by this agent (or guest)
    const userQRs = allQRs.filter(q => q.ownerId === guestUid);

    if (userQRs.length === 0) {
        listContainer.innerHTML = `
            <div class="glass-card p-4 text-center text-muted" style="grid-column: 1 / -1;">
                <i class="fa-solid fa-folder-open f-size-3"></i>
                <p class="mt-2">No secure key targets found under this agent credentials.</p>
            </div>`;
        return;
    }

    listContainer.innerHTML = "";// wipe placeholders

    userQRs.forEach(qr => {
        // Compute nice tags/labels
        let typeIcon = "fa-font";
        switch(qr.type) {
            case 'url': typeIcon = "fa-link"; break;
            case 'wifi': typeIcon = "fa-wifi"; break;
            case 'contact': typeIcon = "fa-id-card"; break;
            case 'file': typeIcon = "fa-file-arrow-up"; break;
        }

        const dateFormatted = new Date(qr.createdAt).toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
        
        let statusBadgeClass = "status-active";
        let cardEffectsClass = "glow-purple";
        let statusLabel = "ACTIVE";

        if (qr.status === 'DESTROYED') {
            statusBadgeClass = "status-destroyed";
            cardEffectsClass = "glow-red";
            statusLabel = "DESTROYED";
        } else if (qr.status === 'LAST_USE_REMAINING') {
            statusBadgeClass = "status-pending";
            cardEffectsClass = "glow-cyan";
            statusLabel = "1 USE LEFT";
        }

        const passesLimit = qr.maxUsage === 999999 ? 'UNLIMITED' : qr.maxUsage;
        const scansRatio = qr.status === 'DESTROYED' ? 'PURGED' : `${qr.usageCount} / ${passesLimit} Scans`;

        // Create standard HTML card string
        const cardHtml = `
            <div class="glass-card archive-card ${cardEffectsClass}">
                <div class="arch-header">
                    <div class="arch-type-icon"><i class="fa-solid ${typeIcon}"></i></div>
                    <span class="stat-badge ${statusBadgeClass}">${statusLabel}</span>
                </div>
                
                <h4 class="arch-desc font-mono">${qr.description}</h4>
                
                <div class="arch-meta">
                    <span class="text-cyan font-mono" style="font-size:10px; display:block; margin-bottom: 4px;">ID: ${qr.qrId}</span>
                    <span><i class="fa-solid fa-clock"></i> ${dateFormatted}</span><br>
                    <span><i class="fa-solid fa-chart-bar"></i> ${scansRatio}</span>
                </div>

                <div class="arch-footer">
                    <span class="text-muted text-xs font-mono">AES-256 SECURED</span>
                    <div class="arch-actions">
                        <button class="arch-action-btn" onclick="regenerateCachedQR('${qr.qrId}')" title="Recall QR Visual Code">
                            <i class="fa-solid fa-qrcode text-cyan"></i>
                        </button>
                        <button class="arch-action-btn del-btn" onclick="eraseIndividualQR('${qr.qrId}')" title="Shred permanently">
                            <i class="fa-solid fa-trash-can text-red"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        listContainer.insertAdjacentHTML('beforeend', cardHtml);
    });
}

// Recall generated QR on click
function regenerateCachedQR(qrId) {
    const allQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
    const match = allQRs.find(q => q.qrId === qrId);

    if (!match) return;

    if (match.status === 'DESTROYED') {
        showLogToast("Target content has been crushed. Code visuals are locked permanently.", "err");
        playTone('error');
        return;
    }

    navigateToSection('generator');
    setQRFormType(match.type);

    const qrImgText = JSON.stringify({
        id: match.qrId,
        cipher: match.encryptedContent
    });

    drawQRImage(qrImgText);

    generatedQRData = {
        id: match.qrId,
        record: match
    };

    document.getElementById('disp-qr-id').textContent = `ID: ${match.qrId}`;
    document.getElementById('disp-qr-uses').textContent = `Decryption scans completed: ${match.usageCount} of ${match.maxUsage}`;
    document.getElementById('generator-actions-pnl').classList.remove('hidden');
    
    showLogToast(`Reconfigured viewfinder for QR ID: ${qrId}`, "success");
    playTone('success');
}

// Shred individual QR key
async function eraseIndividualQR(qrId) {
    if (!confirm("Are you certain you want to erase this target?")) return;

    // Remove locally
    let allQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
    allQRs = allQRs.filter(q => q.qrId !== qrId);
    localStorage.setItem('qr_local_registry', JSON.stringify(allQRs));

    // Remove from Firestore cloud if synchronized
    const activeUser = getActiveSessionUser();
    if (window.isFirebaseConnected && window.firestoreDb && activeUser && isCloudSyncEnabled()) {
        try {
            await window.firestoreDb.collection('secure_qrs').doc(qrId).delete();
            console.log("☁️ cloud logs zeroed out.");
        } catch(e) {
            console.warn(e);
        }
    }

    showLogToast("Target systematically expunged from database logs.", "info");
    playTone('explode');
    
    renderQRArchivesList();
    refreshAppDashboardStats();
}

// Filter searches
function filterArchive() {
    const query = document.getElementById('archive-search').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.archive-card');

    cards.forEach(card => {
        const descText = card.querySelector('.arch-desc').textContent.toLowerCase();
        const idText = card.querySelector('.text-cyan').textContent.toLowerCase();
        if (descText.includes(query) || idText.includes(query)) {
            card.style.display = "";// show
        } else {
            card.style.display = "none";// hide
        }
    });
}

function filterArchiveByStatus(status) {
    // Styling buttons toggling
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.getAttribute('data-filter') === status.toLowerCase()) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const cards = document.querySelectorAll('.archive-card');
    cards.forEach(card => {
        const badgeText = card.querySelector('.stat-badge').textContent.toLowerCase();
        
        if (status === 'all') {
            card.style.display = "";
        } else if (status === 'ACTIVE') {
            // Include LAST_USE_REMAINING (1 USE LEFT badge) as active standard
            if (badgeText.includes('active') || badgeText.includes('1 use')) {
                card.style.display = "";
            } else {
                card.style.display = "none";
            }
        } else if (status === 'DESTROYED') {
            if (badgeText.includes('destroyed') || badgeText.includes('purged')) {
                card.style.display = "";
            } else {
                card.style.display = "none";
            }
        }
    });
}

// RE-CALCULATE METRICS DISPLAYED ON HOME SCREEN
function refreshAppDashboardStats() {
    const allQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
    const activeAgent = getActiveSessionUser();
    const guestUid = activeAgent ? activeAgent.uid : 'guest';

    // Select items belonging to current session user
    const userQRs = allQRs.filter(q => q.ownerId === guestUid);

    let activeCount = 0;
    let destroyedCount = 0;
    let scansDone = 0;

    userQRs.forEach(qr => {
        scansDone += qr.usageCount;
        if (qr.status === 'DESTROYED') {
            destroyedCount += 1;
        } else {
            activeCount += 1;
        }
    });

    document.getElementById('stat-active').textContent = activeCount;
    document.getElementById('stat-destroyed').textContent = destroyedCount;
    document.getElementById('stat-total-uses').textContent = scansDone;
}

// Cloud synchronization toggle settings
function toggleCloudSyncSetting() {
    const isActive = document.getElementById('setting-cloudsync').checked;
    const activeUser = getActiveSessionUser();

    if (isActive && (!activeUser || activeUser.isAnonymous)) {
        showLogToast("Cloud security sync requires a real Firebase Auth profile.", "err");
        document.getElementById('setting-cloudsync').checked = false;
        playTone('error');
        return;
    }

    if (isActive) {
        showLogToast("Cloud mirrored backup tunnels configured.", "success");
        // Sync local indices to firestore loop
        const localQRs = JSON.parse(localStorage.getItem('qr_local_registry') || '[]');
        const userQRs = localQRs.filter(q => q.ownerId === activeUser.uid);
        
        if (window.isFirebaseConnected && window.firestoreDb) {
            userQRs.forEach(qr => {
                window.firestoreDb.collection('secure_qrs').doc(qr.qrId).set(qr).catch(e => console.log(e));
            });
            showLogToast("Local vaults synced safely to cloud sector arrays.", "success");
        }
    } else {
        showLogToast("Cloud routes severed. All data locked locally.", "info");
    }
}

// System reset
function destroyAllArchivedQRs() {
    if (!confirm("🚨 WARNING: This protocol will erase all local indices in this vault permanently! Proceed?")) return;

    localStorage.removeItem('qr_local_registry');
    showLogToast("Ecosystem registry wiped. Cryptos zeroed.", "info");
    playTone('explode');
    
    renderQRArchivesList();
    refreshAppDashboardStats();
}

// 3D Tilt interactive cards feedback helper
function initializeInteractiveCards() {
    // Select active widgets
    document.addEventListener('mousemove', (e) => {
        const cards = document.querySelectorAll('.stat-card');
        cards.forEach(card => {
            const rect = card.getBoundingClientRect();
            // Calculate hover delta values
            const x = e.clientX - rect.left - (rect.width/2);
            const y = e.clientY - rect.top - (rect.height/2);
            
            const xRotate = (y / (rect.height / 2)) * -10; // clamp to 10 degrees limits
            const yRotate = (x / (rect.width / 2)) * 10;
            
            // Adjust perspective transformation dynamically if user hovers close
            const dist = Math.hypot(x, y);
            if (dist < 150) {
               card.style.transform = `perspective(1000px) rotateX(${xRotate}deg) rotateY(${yRotate}deg) translateY(-4px)`;
            } else {
               card.style.transform = "";
            }
        });
    });
}

// SYSTEM THEME MANAGEMENT
function toggleTheme() {
    const htmlTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = htmlTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    appThemeState = newTheme;

    // Checkbox synchronization
    const checkboxToggle = document.getElementById('setting-darktheme');
    if (checkboxToggle) {
        checkboxToggle.checked = newTheme === 'dark';
    }

    showLogToast(`Calibrated theme profile to ${newTheme.toUpperCase()} mode.`, "info");
}

// EASTER EGG RE-CALIBRATE PROTOCOL
function triggerEasterEgg3D() {
    showLogToast("Recalibrating high-energy 3D perspective variables...", "success");
    playTone('success');
    
    // Rotate entire UI as dynamic 3D element feedback!
    const bodyContainer = document.getElementById('main-app');
    if (bodyContainer) {
        bodyContainer.style.transition = "transform 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
        bodyContainer.style.transform = "rotateZ(1deg) scale(0.99) rotateY(1deg)";
        
        setTimeout(() => {
            bodyContainer.style.transform = "";
        }, 1500);
    }
}

// GENUINE HARDWARE-SYNTHESIZED HARMONIC SOUND MACHINE
// Uses browser Web Audio synthesizer contexts to safely sound buzzers!
function playTone(type) {
    // Check toggle logging settings
    const activeLogToggle = document.getElementById('setting-logs');
    const logsEnabled = activeLogToggle ? activeLogToggle.checked : true;
    if (!logsEnabled) return;

    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        const startTime = ctx.currentTime;
        
        if (type === 'success') {
            // High futuristic synth bleep sweeps: Pleasant harmonic beep
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, startTime); // D5 tone
            osc.frequency.exponentialRampToValueAtTime(880.00, startTime + 0.15); // Sweep to A5
            gain.gain.setValueAtTime(0.15, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.25);
            osc.start(startTime);
            osc.stop(startTime + 0.25);
        } else if (type === 'error') {
            // Red alert buzzer double sweep tones
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220.00, startTime); // Low drone sweep
            osc.frequency.linearRampToValueAtTime(110.00, startTime + 0.3);
            gain.gain.setValueAtTime(0.2, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.35);
            osc.start(startTime);
            osc.stop(startTime + 0.35);
        } else if (type === 'explode') {
            // Sound of data destruction (noise modulated low rumble sound)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150.00, startTime);
            osc.frequency.exponentialRampToValueAtTime(30.00, startTime + 0.8);
            gain.gain.setValueAtTime(0.3, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.9);
            osc.start(startTime);
            osc.stop(startTime + 0.9);
        }
    } catch(err) {
        // Soft fallback to traditional HTML audio element play parameters
        console.warn("Audio Context synth blocked by device policies. Falling back to source elements:", err);
        const fallbackAudio = document.getElementById(`sound-${type}`);
        if (fallbackAudio) {
            fallbackAudio.play().catch(e => console.log(e));
        }
    }
}

// LOG TOAST NOTIFICATION ENGINE
function showLogToast(msg, type = 'info') {
    // Generate simple toast element
    const toastNode = document.createElement('div');
    toastNode.style.position = "fixed";
    toastNode.style.bottom = "80px"; // Keeps it above the bottom navigation panel
    toastNode.style.left = "50%";
    toastNode.style.transform = "translateX(-50%)";
    toastNode.style.backgroundColor = "rgba(15, 23, 42, 0.9)";
    toastNode.style.color = "#FFF";
    toastNode.style.fontFamily = "Orbitron, sans-serif";
    toastNode.style.fontSize = "11px";
    toastNode.style.padding = "10px 20px";
    toastNode.style.borderRadius = "30px";
    toastNode.style.zIndex = "99999";
    toastNode.style.boxShadow = "0 8px 32px rgba(0,0,0,0.5)";
    toastNode.style.pointerEvents = "none";
    toastNode.style.transition = "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
    toastNode.style.letterSpacing = "0.5px";
    toastNode.style.textAlign = "center";
    toastNode.style.whiteSpace = "nowrap";

    let borderCol = "var(--accent)";
    if (type === 'err') {
        borderCol = "var(--danger)";
        toastNode.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red" style="margin-right:8px;"></i> ${msg}`;
    } else if (type === 'success') {
        borderCol = "var(--success)";
        toastNode.innerHTML = `<i class="fa-solid fa-circle-check text-success" style="margin-right:8px;"></i> ${msg}`;
    } else {
        toastNode.innerHTML = `<i class="fa-solid fa-circle-info text-cyan" style="margin-right:8px;"></i> ${msg}`;
    }

    toastNode.style.border = `1px solid ${borderCol}`;

    document.body.appendChild(toastNode);

    // Dynamic fade-in-out transition timelines
    setTimeout(() => {
        toastNode.style.opacity = "0";
        setTimeout(() => {
            document.body.removeChild(toastNode);
        }, 300);
    }, 2800);
}
