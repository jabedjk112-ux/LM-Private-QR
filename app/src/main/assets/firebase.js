/* ==========================================
   PRIVATE QR CODE LM - FIREBASE INTERACTION ENGINE
   ========================================== */

let firebaseApp = null;
let authNode = null;
let dbNode = null;
let storageNode = null;
let isFirebaseConnected = false;

// Default Firebase configuration coordinates
// These are standard templates. Users can link their own Google Services config at any time.
const firebaseConfig = {
    apiKey: "AIzaSyDummyKeyValue_ForLocalExecution_PrivateQRLM",
    authDomain: "private-qr-code-lm.firebaseapp.com",
    projectId: "private-qr-code-lm",
    storageBucket: "private-qr-code-lm.appspot.com",
    messagingSenderId: "105658932468",
    appId: "1:105658932468:web:abcdef9876543210"
};

try {
    // Check if the compat script has loaded and holds the namespace
    if (typeof firebase !== 'undefined') {
        firebaseApp = firebase.initializeApp(firebaseConfig);
        authNode = firebase.auth();
        dbNode = firebase.firestore();
        storageNode = firebase.storage();
        isFirebaseConnected = true;
        
        console.log("🔥 Firebase modules loaded successfully. Multi-cloud registers ready.");
        
        // Attempt to activate offline capabilities for Firestore so the offline sync works perfectly
        dbNode.enablePersistence().catch(err => {
            console.warn("⚠️ Firestore persistent mode disabled: ", err.code);
        });
    } else {
        console.warn("⚠️ Firebase compat script is missing. Decentralized offline system configured.");
    }
} catch (error) {
    console.error("❌ Failed to bind online cloud endpoints. Commencing offline data engine:", error);
}

// Bind variables globally
window.firebaseAuth = authNode;
window.firestoreDb = dbNode;
window.firebaseStorage = storageNode;
window.isFirebaseConnected = isFirebaseConnected;

// Security rules simulator for offline system
// If firebase is offline, we mimic standard data saves in a local array list
class OfflineAuthSimulator {
    constructor() {
        this.currentUser = JSON.parse(localStorage.getItem('offline_current_agent')) || null;
    }

    login(email, password) {
        // Simple client side hashing for safety
        const emailSlug = email.toLowerCase().trim();
        const userKey = `agent_reg_${emailSlug}`;
        const registered = localStorage.getItem(userKey);
        
        if (!registered) {
            throw new Error("No agent profile matched to credentials.");
        }
        
        const candidate = JSON.parse(registered);
        const inputHash = CryptoJS.SHA256(password).toString();
        
        if (candidate.passHash === inputHash) {
            this.currentUser = {
                uid: emailSlug,
                email: email,
                displayName: candidate.name,
                isAnonymous: false,
                photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150"
            };
            localStorage.setItem('offline_current_agent', JSON.stringify(this.currentUser));
            return this.currentUser;
        } else {
            throw new Error("Mismatched decryption key credentials.");
        }
    }

    register(name, email, password) {
        const emailSlug = email.toLowerCase().trim();
        const userKey = `agent_reg_${emailSlug}`;
        
        if (localStorage.getItem(userKey)) {
            throw new Error("This agent protocol is already active on this terminal.");
        }
        
        const passHash = CryptoJS.SHA256(password).toString();
        const profile = { name, email, passHash, createdAt: new Date().toISOString() };
        
        localStorage.setItem(userKey, JSON.stringify(profile));
        
        // Auto sign in
        this.currentUser = {
            uid: emailSlug,
            email: email,
            displayName: name,
            isAnonymous: false,
            photoURL: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=150"
        };
        localStorage.setItem('offline_current_agent', JSON.stringify(this.currentUser));
        return this.currentUser;
    }

    signOut() {
        this.currentUser = null;
        localStorage.removeItem('offline_current_agent');
        return Promise.resolve();
    }
}

window.offlineAuth = new OfflineAuthSimulator();
