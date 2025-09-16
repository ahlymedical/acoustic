document.addEventListener('DOMContentLoaded', function () {
    // --- Firebase Configuration (UPDATED FOR LANA PROJECT) ---
    const firebaseConfig = {
        apiKey: "AIzaSyC4JhxTRmtA8wSMzcPnyGndDiFRSukq1-c",
        authDomain: "lana-472315.firebaseapp.com",
        projectId: "lana-472315",
        storageBucket: "lana-472315.appspot.com", // Corrected from firebasestorage.app
        messagingSenderId: "713909142851",
        appId: "1:713909142851:web:4ec9969b7bbd88df459bf6",
        measurementId: "G-659LFJYGQX"
    };

    // --- Initialize Firebase ---
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const provider = new firebase.auth.GoogleAuthProvider();

    // --- DOM Elements ---
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const userEmailSpan = document.getElementById('user-email');
    const mainContent = document.getElementById('main-content');
    const loginPrompt = document.getElementById('login-prompt');
    const loader = document.getElementById('loader');

    const separatorForm = document.getElementById('separator-form');
    const enhancerForm = document.getElementById('enhancer-form');
    
    const separatorFileInput = document.getElementById('separator-file');
    const enhancerFileInput = document.getElementById('enhancer-file');
    
    const separatorFileName = document.getElementById('separator-file-name');
    const enhancerFileName = document.getElementById('enhancer-file-name');

    const separatorResults = document.getElementById('separator-results');
    const enhancerResults = document.getElementById('enhancer-results');

    let idToken = null;

    // --- Authentication Logic ---
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in
            user.getIdToken().then(token => {
                idToken = token;
                loginBtn.classList.add('hidden');
                userInfo.classList.remove('hidden');
                userEmailSpan.textContent = user.email;
                mainContent.style.display = 'flex';
                loginPrompt.style.display = 'none';
            });
        } else {
            // User is signed out
            idToken = null;
            loginBtn.classList.remove('hidden');
            userInfo.classList.add('hidden');
            mainContent.style.display = 'none';
            loginPrompt.style.display = 'block';
        }
    });

    loginBtn.addEventListener('click', () => {
        auth.signInWithPopup(provider).catch(error => {
            console.error("Login failed:", error);
            alert("فشل تسجيل الدخول. الرجاء المحاولة مرة أخرى.");
        });
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

    // --- File Input Handlers ---
    separatorFileInput.addEventListener('change', () => {
        separatorFileName.textContent = separatorFileInput.files[0] ? separatorFileInput.files[0].name : '';
    });

    enhancerFileInput.addEventListener('change', () => {
        enhancerFileName.textContent = enhancerFileInput.files[0] ? enhancerFileInput.files[0].name : '';
    });

    // --- Form Submission Handlers ---
    separatorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const file = separatorFileInput.files[0];
        if (!file) {
            alert("الرجاء اختيار ملف أولاً.");
            return;
        }
        const formData = new FormData();
        formData.append('audio_file', file);
        formData.append('operation', 'separate');
        
        const stems = separatorForm.querySelectorAll('input[name="stems"]:checked');
        if (stems.length === 0) {
            alert("الرجاء اختيار مسار واحد على الأقل لفصله.");
            return;
        }
        stems.forEach(stem => {
            formData.append('stems', stem.value);
        });

        startProcessing(formData, separatorResults);
    });

    enhancerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const file = enhancerFileInput.files[0];
        if (!file) {
            alert("الرجاء اختيار ملف أولاً.");
            return;
        }
        const formData = new FormData();
        formData.append('audio_file', file);
        formData.append('operation', 'enhance');
        startProcessing(formData, enhancerResults);
    });

    // --- Core Processing Logic ---
    async function startProcessing(formData, resultsArea) {
        if (!idToken) {
            alert("جلسة المستخدم غير صالحة. الرجاء تسجيل الدخول مرة أخرى.");
            return;
        }

        loader.classList.remove('hidden');
        resultsArea.classList.add('hidden');
        resultsArea.innerHTML = '';

        try {
            const response = await fetch('/process', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`
                },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                pollTaskStatus(data.task_id, resultsArea);
            } else {
                throw new Error(data.error || "حدث خطأ غير معروف.");
            }
        } catch (error) {
            console.error('Error starting processing:', error);
            alert(`فشل بدء المعالجة: ${error.message}`);
            loader.classList.add('hidden');
        }
    }

    function pollTaskStatus(taskId, resultsArea) {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/task_status/${taskId}`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });

                if (!response.ok) {
                    // Stop polling if task not found or auth error
                    clearInterval(interval);
                    loader.classList.add('hidden');
                    alert("لم يتم العثور على المهمة أو حدث خطأ في المصادقة.");
                    return;
                }

                const data = await response.json();

                if (data.status === 'completed') {
                    clearInterval(interval);
                    loader.classList.add('hidden');
                    displayResults(data.results, resultsArea);
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    loader.classList.add('hidden');
                    alert(`فشلت المعالجة: ${data.error || 'خطأ غير معروف'}`);
                }
                // If 'processing', continue polling
            } catch (error) {
                clearInterval(interval);
                loader.classList.add('hidden');
                console.error('Error polling task status:', error);
                alert("حدث خطأ أثناء التحقق من حالة المهمة.");
            }
        }, 5000); // Poll every 5 seconds
    }

    function displayResults(results, resultsArea) {
        resultsArea.innerHTML = '<h3>النتائج جاهزة!</h3>';
        for (const trackName in results) {
            const url = results[trackName];
            const trackElement = document.createElement('div');
            trackElement.className = 'result-track';
            
            const trackTitle = document.createElement('span');
            trackTitle.textContent = getArabicTrackName(trackName);
            
            const audioPlayer = document.createElement('audio');
            audioPlayer.controls = true;
            audioPlayer.src = url;

            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.textContent = 'تحميل';
            downloadLink.className = 'download-btn';
            downloadLink.target = '_blank'; // Open in new tab
            downloadLink.download = ''; // Suggests browser to download

            trackElement.appendChild(trackTitle);
            trackElement.appendChild(audioPlayer);
            trackElement.appendChild(downloadLink);
            resultsArea.appendChild(trackElement);
        }
        resultsArea.classList.remove('hidden');
    }
    
    function getArabicTrackName(trackName) {
        const names = {
            'vocals': 'صوت المغني',
            'drums': 'الطبول',
            'bass': 'البيس',
            'other': 'آلات أخرى',
            'instrumental': 'موسيقى فقط',
            'enhanced': 'الصوت المحسّن'
        };
        return names[trackName.toLowerCase()] || trackName;
    }
});
