let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let startTime;
let timerInterval;

// Initialize Telegram WebApp
const webapp = window.Telegram.WebApp;
webapp.ready();

const recordButton = document.getElementById('recordButton');
const timer = document.getElementById('timer');
const recordingsList = document.getElementById('recordingsList');

// Request microphone permission
async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupMediaRecorder(stream);
    } catch (error) {
        console.error('Error accessing microphone:', error);
        alert('Please allow microphone access to use this app');
    }
}

// Setup MediaRecorder with the audio stream
function setupMediaRecorder(stream) {
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            audioChunks.push(event.data);
        }
    };

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        addRecordingToList(audioUrl);
        audioChunks = [];
    };
}

// Start recording
function startRecording() {
    if (!mediaRecorder) {
        requestMicrophonePermission();
        return;
    }

    audioChunks = [];
    mediaRecorder.start();
    isRecording = true;
    recordButton.classList.add('recording');
    startTimer();
}

// Stop recording
function stopRecording() {
    if (!isRecording) return;

    mediaRecorder.stop();
    isRecording = false;
    recordButton.classList.remove('recording');
    stopTimer();
}

// Timer functions
function startTimer() {
    startTime = Date.now();
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timer.textContent = '00:00';
}

function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    timer.textContent = `${minutes}:${seconds}`;
}

// Add recording to the list
function addRecordingToList(audioUrl) {
    const recordingItem = document.createElement('div');
    recordingItem.className = 'recording-item';

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = audioUrl;

    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Save';
    downloadButton.onclick = () => {
        const link = document.createElement('a');
        link.href = audioUrl;
        link.download = `recording-${new Date().toISOString()}.wav`;
        link.click();
    };

    recordingItem.appendChild(audio);
    recordingItem.appendChild(downloadButton);
    recordingsList.insertBefore(recordingItem, recordingsList.firstChild);
}

// Function to check if device is mobile
function isMobileDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// Event listeners for recording button
if (!isMobileDevice()) {
    // Desktop click behavior - toggle recording
    recordButton.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
            recordButton.querySelector('.button-text').textContent = 'Click to Stop';
        } else {
            stopRecording();
            recordButton.querySelector('.button-text').textContent = 'Click to Record';
        }
    });
} else {
    // Mobile touch behavior - press and hold
    recordButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
        recordButton.querySelector('.button-text').textContent = 'Hold to Record';
    });

    recordButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopRecording();
        recordButton.querySelector('.button-text').textContent = 'Hold to Record';
    });

    // Handle touch cancel (e.g., if user slides finger off button)
    recordButton.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        if (isRecording) {
            stopRecording();
            recordButton.querySelector('.button-text').textContent = 'Hold to Record';
        }
    });
}

// Initialize the app
requestMicrophonePermission();
