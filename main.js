// QuickVibe - Minimal spatial chat powered by Firebase Realtime Database (modular SDK)
// Students: Paste your own Firebase config below where indicated.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
    getDatabase,
    ref,
    child,
    push,
    set,
    remove,
    onDisconnect,
    serverTimestamp,
    onValue,
    query,
    orderByChild
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-database.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";

// =====================
// 1) Firebase Setup
// =====================
// Replace the below placeholder object with YOUR Firebase project's web config.
// How to get it:
// - Go to Firebase console â†’ Your project â†’ Project settings â†’ General â†’ Your apps (Web)
// - Click "+ Add app" if you don't have one, then copy the config
// - Paste it here replacing every value (apiKey, authDomain, projectId, etc.)

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB3qxWLyU792p_GvKPVYG7SywtKmJ0_Hx8",
  authDomain: "backendtest-d0dc6.firebaseapp.com",
  databaseURL: "https://backendtest-d0dc6-default-rtdb.firebaseio.com",
  projectId: "backendtest-d0dc6",
  storageBucket: "backendtest-d0dc6.firebasestorage.app",
  messagingSenderId: "701974952381",
  appId: "1:701974952381:web:ef1b6563a48f00f95a3ad4",
  measurementId: "G-9RPP665GDC"
};
// Initialize Firebase and Realtime Database
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
let currentUser = null;
let authStatusResetTimeout = null;
const messagesRef = ref(db, 'quickvibe_messages');
const orderedMessagesQuery = query(messagesRef, orderByChild('createdAt'));
const cursorsRef = ref(db, 'quickvibe_cursors');
const clientId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
const cursorRef = child(cursorsRef, clientId);
onDisconnect(cursorRef).remove();
window.addEventListener('beforeunload', () => {
    remove(cursorRef).catch(() => { /* noop */ });
});
window.addEventListener('unload', () => {
    remove(cursorRef).catch(() => { /* noop */ });
});

// =====================
// 2) DOM Elements
// =====================
const stage = document.getElementById('stage');
const input = document.getElementById('floating-input');
const timeline = document.getElementById('timeline');
const authButton = document.getElementById('auth-button');
const authStatus = document.getElementById('auth-status');

function friendlyUserName(user) {
    if (!user) return '';
    if (user.displayName && user.displayName.trim()) return user.displayName.trim();
    if (user.email && user.email.trim()) return user.email.trim();
    return 'Anonymous';
}

function updateAuthUI(user) {
    if (authButton) {
        if (user) {
            authButton.textContent = 'Sign Out';
            authButton.classList.add('sign-out');
        } else {
            authButton.textContent = 'Sign In';
            authButton.classList.remove('sign-out');
        }
    }
    if (authStatus) {
        authStatus.textContent = user
            ? `Signed in as ${friendlyUserName(user)}`
            : 'Signed out - Sign in to add notes.';
    }
    if (stage) {
        stage.classList.toggle('signed-out', !user);
    }
    if (input) {
        input.placeholder = user ? 'Type and hit Enter' : 'Sign in to add a note';
    }
}

function showAuthMessage(message) {
    if (!authStatus) return;
    if (authStatusResetTimeout) {
        clearTimeout(authStatusResetTimeout);
    }
    authStatus.textContent = message;
    authStatusResetTimeout = setTimeout(() => {
        authStatusResetTimeout = null;
        updateAuthUI(currentUser);
    }, 4000);
}

if (authButton) {
    authButton.addEventListener('click', async () => {
        if (!currentUser) {
            try {
                await signInWithPopup(auth, googleProvider);
            } catch (err) {
                if (err && err.code === 'auth/popup-closed-by-user') {
                    return;
                }
                console.error('Sign-in failed:', err);
                showAuthMessage('Sign-in failed. Try again.');
            }
        } else {
            try {
                await signOut(auth);
            } catch (err) {
                console.error('Sign-out failed:', err);
                showAuthMessage('Sign-out failed. Please retry.');
            }
        }
    });
}

updateAuthUI(currentUser);

// =====================
// 3) Input positioning
// =====================
let pendingPosition = null; // { x, y } for the next message
let lastCursorUpdate = 0;

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    updateAuthUI(user);
    if (!user) {
        pendingPosition = null;
        if (input) {
            input.style.display = 'none';
            input.value = '';
        }
        try {
            await remove(cursorRef);
        } catch (err) {
            console.error('Failed to clear cursor on sign-out:', err);
        }
    }
});

stage.addEventListener('click', (ev) => {
    if (!currentUser) {
        showAuthMessage('Please sign in to add notes.');
        if (authButton) authButton.focus();
        return;
    }
    const x = ev.clientX;
    const y = ev.clientY;
    pendingPosition = { x, y };

    // Position and show the floating input
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.display = 'block';
    input.value = '';
    input.focus();
});

stage.addEventListener('mousemove', (ev) => {
    if (!currentUser) return;
    const x = ev.clientX;
    const y = ev.clientY;
    const now = Date.now();
    if (now - lastCursorUpdate < 40) return;
    lastCursorUpdate = now;
    set(cursorRef, {
        x,
        y,
        updatedAt: Date.now()
    }).catch(() => { /* noop */ });
});

stage.addEventListener('mouseleave', () => {
    remove(cursorRef).catch(() => { /* noop */ });
});

// Submit on Enter
input.addEventListener('keydown', async (ev) => {
    if (ev.key !== 'Enter') return;
    const text = input.value.trim();
    if (!currentUser) {
        input.style.display = 'none';
        pendingPosition = null;
        showAuthMessage('Sign in to share something.');
        return;
    }
    if (!text || !pendingPosition) {
        input.style.display = 'none';
        return;
    }

    try {
        await push(messagesRef, {
            text,
            x: pendingPosition.x,
            y: pendingPosition.y,
            createdAt: serverTimestamp(),
            uid: currentUser.uid,
            author: friendlyUserName(currentUser),
            photoURL: currentUser.photoURL || null
        });
    } catch (e) {
        console.error('Error saving message:', e);
    }

    // Hide input and clear position
    input.style.display = 'none';
    pendingPosition = null;
});

// =====================
// 4) Live Rendering
// =====================
// Render one chat bubble
function renderBubble(id, data) {
    let el = document.querySelector(`[data-id="${id}"]`);
    if (!el) {
        el = document.createElement('div');
        el.className = 'bubble pointer-none';
        el.dataset.id = id;
        const authorEl = document.createElement('div');
        authorEl.className = 'bubble-author';
        const textEl = document.createElement('div');
        textEl.className = 'bubble-text';
        el.appendChild(authorEl);
        el.appendChild(textEl);
        stage.appendChild(el);
    }
    const authorEl = el.querySelector('.bubble-author');
    const textEl = el.querySelector('.bubble-text');
    if (authorEl) {
        authorEl.textContent = data.author || 'Anonymous';
    }
    if (textEl) {
        textEl.textContent = data.text || '';
    }
    el.style.left = `${data.x || 0}px`;
    el.style.top = `${data.y || 0}px`;
}

function removeBubble(id) {
    const el = document.querySelector(`[data-id="${id}"]`);
    if (el && el.parentElement) {
        el.parentElement.removeChild(el);
    }
}

const cursorEls = new Map();
const timelineEls = new Map();

function colorForId(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = ((hash << 5) - hash) + id.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 80%, 60%)`;
}

function renderCursor(id, data) {
    if (id === clientId) return; // don't render our own cursor overlay
    let el = cursorEls.get(id);
    if (!el) {
        el = document.createElement('div');
        el.className = 'cursor pointer-none';
        stage.appendChild(el);
        cursorEls.set(id, el);
    }
    el.style.setProperty('--cursor-color', colorForId(id));
    el.style.left = `${data.x || 0}px`;
    el.style.top = `${data.y || 0}px`;
}

function removeCursor(id) {
    const el = cursorEls.get(id);
    if (el && el.parentElement) {
        el.parentElement.removeChild(el);
    }
    cursorEls.delete(id);
}

function formatTimestamp(ms) {
    if (typeof ms !== 'number') return 'Pending...';
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return 'Pending...';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderTimelineItem(id, data, orderIndex) {
    if (!timeline) return;
    let el = timelineEls.get(id);
    if (!el) {
        el = document.createElement('div');
        el.className = 'timeline-entry';
        el.innerHTML = `
            <div class="timeline-time"></div>
            <div class="timeline-author"></div>
            <div class="timeline-text"></div>
        `;
        timeline.appendChild(el);
        timelineEls.set(id, el);
    }
    const timeEl = el.querySelector('.timeline-time');
    const authorEl = el.querySelector('.timeline-author');
    const textEl = el.querySelector('.timeline-text');
    if (timeEl) {
        timeEl.textContent = formatTimestamp(data.createdAt);
    }
    if (authorEl) {
        authorEl.textContent = data.author || 'Anonymous';
    }
    if (textEl) {
        textEl.textContent = (data.text || '').slice(0, 80);
    }
    el.style.order = orderIndex;
}

function removeTimelineItem(id) {
    const el = timelineEls.get(id);
    if (el && el.parentElement) {
        el.parentElement.removeChild(el);
    }
    timelineEls.delete(id);
}

// Subscribe to database changes, newest last
onValue(orderedMessagesQuery, (snap) => {
    const seen = new Set();
    const orderedEntries = [];
    snap.forEach((childSnap) => {
        const id = childSnap.key;
        const data = childSnap.val() || {};
        seen.add(id);
        orderedEntries.push({ id, data });
        renderBubble(id, data);
    });

    orderedEntries.forEach(({ id, data }, index) => {
        renderTimelineItem(id, data, index);
    });

    const existing = Array.from(stage.querySelectorAll('.bubble'));
    existing.forEach((el) => {
        const id = el.getAttribute('data-id');
        if (id && !seen.has(id)) {
            removeBubble(id);
            removeTimelineItem(id);
        }
    });

    for (const id of Array.from(timelineEls.keys())) {
        if (!seen.has(id)) {
            removeTimelineItem(id);
        }
    }
});

onValue(cursorsRef, (snap) => {
    const seen = new Set();
    snap.forEach((childSnap) => {
        const id = childSnap.key;
        const data = childSnap.val();
        if (!id || !data) return;
        seen.add(id);
        renderCursor(id, data);
    });

    for (const id of Array.from(cursorEls.keys())) {
        if (!seen.has(id)) {
            removeCursor(id);
        }
    }
});
