let synthesis = null;
let voices = { male: null, female: null };
let selectedVoice = 'female';
let isReady = false;

function init() {
    return new Promise((resolve, reject) => {
        synthesis = window.speechSynthesis;
        if (!synthesis) return reject("Speech synthesis not supported.");

        const loadVoices = () => {
            const availableVoices = synthesis.getVoices();
            if (!availableVoices.length) return;

            voices.female = availableVoices.find(v => v.lang.startsWith('en') && (v.name.includes('Google US English') || v.name.includes('Zira'))) || availableVoices.find(v => v.lang.startsWith('en-US') && v.name.includes('Female'));
            voices.male = availableVoices.find(v => v.lang.startsWith('en') && (v.name.includes('Google UK English Male') || v.name.includes('David'))) || availableVoices.find(v => v.lang.startsWith('en-US') && v.name.includes('Male'));
            
            if (voices.female || voices.male) {
                isReady = true;
                resolve();
            }
        };

        synthesis.onvoiceschanged = loadVoices;
        loadVoices();
        setTimeout(() => { // Fallback timeout
            if (!isReady) {
                loadVoices();
                if (isReady) resolve();
                else reject("Voice loading timeout");
            }
        }, 1000);
    });
}

function speak(text, priority = false) {
    if (!isReady || !text) return;
    if (priority && synthesis.speaking) {
        synthesis.cancel();
    }

    setTimeout(() => {
        if (!synthesis.speaking) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.voice = voices[selectedVoice] || voices.female || voices.male;
            if (utterance.voice) synthesis.speak(utterance);
        }
    }, 50);
}

function setVoice(gender) {
    if (voices[gender]) {
        selectedVoice = gender;
        localStorage.setItem('mapVoice', gender);
        document.querySelector(`input[name="nav-voice"][value="${gender}"]`).checked = true;
    }
}

function cancel() {
    if (synthesis) synthesis.cancel();
}

export async function initializeSpeechService() {
    try {
        await init();
        const savedVoice = localStorage.getItem('mapVoice') || 'female';
        setVoice(savedVoice);

        document.querySelectorAll('input[name="nav-voice"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                setVoice(e.target.value);
                speak("Voice has been changed.");
            });
        });

    } catch (error) {
        console.error("Speech service initialization failed:", error);
        // Disable voice options in UI
        document.querySelector('.setting-group:has(input[name="nav-voice"])').style.display = 'none';
    }

    return { speak, cancel, setVoice };
}
