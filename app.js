document.addEventListener("DOMContentLoaded", () => {
    // Initialize Telegram WebApp
    if (window.Telegram && window.Telegram.WebApp) {
        const webapp = window.Telegram.WebApp;
        webapp.ready();
        initializeApp(webapp);
    } else {
        console.error("Telegram WebApp not found.");
        alert("Telegram WebApp not available.");
    }
});

function initializeApp(webapp) {
    // Device detection
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Get DOM elements
    const recordButton = document.getElementById('recordButton');
    const timer = document.getElementById('timer');
    const recordingsList = document.getElementById('recordingsList');
    const apiKeyInput = document.getElementById('apiKeyInput');

    // Validate DOM elements
    if (!recordButton || !timer || !recordingsList || !apiKeyInput) {
        console.error("One or more required DOM elements are missing.");
        webapp.showAlert("Application initialization failed. Please try again.");
        return;
    }

    // WebView compatibility check with detailed error reporting
    if (!navigator.mediaDevices || !window.MediaRecorder) {
        const errorMsg = 'Audio recording is not supported in this environment';
        console.error('Compatibility check failed:', {
            hasMediaDevices: !!navigator.mediaDevices,
            hasMediaRecorder: !!window.MediaRecorder,
            userAgent: navigator.userAgent,
            isIOS: isIOS
        });
        webapp.showAlert(errorMsg);
        throw new Error(errorMsg);
    }

    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let startTime;
    let timerInterval;

    // OpenAI API configuration
    const OPENAI_API_URL = 'https://api.openai.com/v1/audio/transcriptions';

    // Error logging helper
    function logError(context, error) {
        console.error(`Error in ${context}:`, {
            message: error.message,
            stack: error.stack,
            userAgent: navigator.userAgent,
            isIOS: isIOS
        });
    }

    // Function to get API key from input
    function getApiKey() {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            webapp.showAlert('Please enter your OpenAI API key');
            return null;
        }
        return apiKey;
    }

    // Function to transcribe audio using OpenAI Whisper API
    async function transcribeAudio(formData) {
        const apiKey = getApiKey();
        if (!apiKey) return null;

        try {
            console.log('Sending request to OpenAI...');
            const response = await fetch(OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.text();
                console.error('OpenAI API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: errorData
                });
                throw new Error(`API Error: ${response.status} - ${errorData}`);
            }

            const data = await response.json();
            console.log('Transcription successful');
            return data.text;
        } catch (error) {
            console.error('Detailed transcription error:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // Function to send transcribed text back to Telegram
    function sendTranscriptionToTelegram(text, recordingItem) {
        if (text) {
            const sendButton = document.createElement('button');
            sendButton.textContent = 'Send to Chat';
            sendButton.className = 'send-button';
            sendButton.onclick = () => {
                webapp.sendData(JSON.stringify({ transcription: text }));
                sendButton.disabled = true;
                sendButton.textContent = 'Sent';
                webapp.close(); // Optionally close the WebApp after sending
            };
            recordingItem.appendChild(sendButton);
        }
    }

    // Request microphone permission
    async function requestMicrophonePermission() {
        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setupMediaRecorder(stream);
        } catch (error) {
            logError('requestMicrophonePermission', error);
            webapp.showAlert('Please allow microphone access to use this app');
        }
    }

    // Setup MediaRecorder with the audio stream
    function setupMediaRecorder(stream) {
        // Try to use the most widely supported format
        let options = {};
        // iOS typically supports mp4 better
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
            options.mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            options.mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
            options.mimeType = 'audio/aac';
        }

        try {
            mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
            console.error('Error creating MediaRecorder:', e);
            webapp.showAlert('Error initializing audio recorder');
            return;
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = async () => {
            try {
                console.log('Recording stopped, processing audio...');

                // Validate audio chunks
                if (!audioChunks.length) {
                    throw new Error('No audio data recorded');
                }

                // Use the same MIME type as the MediaRecorder
                const blobType = isIOS ? 'audio/mp4' : (mediaRecorder.mimeType || 'audio/webm');
                const audioBlob = new Blob(audioChunks, { type: blobType });
                console.log('Audio blob created:', audioBlob.size, 'bytes');

                if (audioBlob.size === 0) {
                    throw new Error('Audio recording is empty');
                }

                const audioUrl = URL.createObjectURL(audioBlob);
                const recordingItem = addRecordingToList(audioUrl);

                // Show loading state
                const transcriptionDiv = document.createElement('div');
                transcriptionDiv.className = 'transcription';
                transcriptionDiv.textContent = 'Transcribing...';
                recordingItem.appendChild(transcriptionDiv);

                // Create form data with correct extension
                const formData = new FormData();
                const format = (mediaRecorder.mimeType || 'audio/webm').split('/')[1].split(';')[0];
                const fileExtension = isIOS ? 'mp4' : format;
                formData.append('file', audioBlob, `recording.${fileExtension}`);
                formData.append('model', 'whisper-1');

                // Log form data contents
                console.log('Form data prepared:', {
                    hasFile: formData.has('file'),
                    hasModel: formData.has('model')
                });

                // Transcribe the audio
                const transcribedText = await transcribeAudio(formData);
                console.log('Transcription result:', transcribedText);

                if (transcribedText) {
                    transcriptionDiv.textContent = transcribedText;
                    sendTranscriptionToTelegram(transcribedText, recordingItem);
                } else {
                    throw new Error('No transcription result received');
                }
            } catch (error) {
                console.error('Detailed error in onstop handler:', {
                    message: error.message,
                    stack: error.stack,
                    audioChunksLength: audioChunks.length,
                    totalSize: audioChunks.reduce((size, chunk) => size + chunk.size, 0)
                });
                const transcriptionDiv = recordingItem.querySelector('.transcription');
                if (transcriptionDiv) {
                    transcriptionDiv.textContent = `Error: ${error.message}`;
                    transcriptionDiv.classList.add('error');
                }
            } finally {
                audioChunks = [];
            }
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
        downloadButton.className = 'action-button';
        downloadButton.onclick = () => {
            const link = document.createElement('a');
            link.href = audioUrl;
            link.download = `recording-${new Date().toISOString()}.${isIOS ? 'mp4' : (mediaRecorder.mimeType || 'webm').split('/')[1]}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        recordingItem.appendChild(audio);
        recordingItem.appendChild(downloadButton);
        recordingsList.insertBefore(recordingItem, recordingsList.firstChild);

        return recordingItem;
    }

    // Function to check if device is mobile
    function isMobileDevice() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    // Set up event listeners based on device type
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
            recordButton.querySelector('.button-text').textContent = 'Release to Stop';
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

    // Initialize microphone permission only after user interaction
    recordButton.addEventListener('click', () => {
        if (!mediaRecorder) {
            requestMicrophonePermission();
        }
    });
}