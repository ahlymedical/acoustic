document.addEventListener('DOMContentLoaded', function () {
    // =================================================================
    // تم إدخال إعدادات Firebase الخاصة بك هنا
    // =================================================================
    const firebaseConfig = {
        apiKey: "AIzaSyA7yDHMKVXJFzYxDVYbIIj-MaLyNiISSKE",
        authDomain: "translation-470421-f18e8.firebaseapp.com",
        projectId: "translation-470421-f18e8",
        storageBucket: "translation-470421-f18e8.appspot.com", // Corrected storage bucket URL
        messagingSenderId: "250174443342",
        appId: "1:250174443342:web:0ac6deb18084078a3dd81f",
        measurementId: "G-GMZYXQE6PL"
    };

    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // عناصر الواجهة
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const userEmail = document.getElementById('user-email');
    const mainContent = document.getElementById('main-content');
    const loginPrompt = document.getElementById('login-prompt');
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loader-text');

    const separatorForm = document.getElementById('separator-form');
    const enhancerForm = document.getElementById('enhancer-form');

    let currentUser = null;
    let idToken = null;

    // مراقبة حالة تسجيل الدخول
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUser = user;
            idToken = await user.getIdToken();
            
            // تحديث الواجهة
            userEmail.textContent = user.email;
            userInfo.classList.remove('hidden');
            loginBtn.classList.add('hidden');
            mainContent.style.display = 'flex';
            loginPrompt.style.display = 'none';
        } else {
            currentUser = null;
            idToken = null;

            // تحديث الواجهة
            userInfo.classList.add('hidden');
            loginBtn.classList.remove('hidden');
            mainContent.style.display = 'none';
            loginPrompt.style.display = 'block';
        }
    });

    // تسجيل الدخول
    loginBtn.addEventListener('click', () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => {
            console.error("Login failed:", error);
            alert("فشل تسجيل الدخول.");
        });
    });

    // تسجيل الخروج
    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

    // تحديث اسم الملف عند اختياره
    updateFileName('separator-file', 'separator-file-name');
    updateFileName('enhancer-file', 'enhancer-file-name');

    // التعامل مع رفع نموذج الفصل
    separatorForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('separator-file');
        if (fileInput.files.length === 0) {
            alert('الرجاء اختيار ملف أولاً.');
            return;
        }

        const formData = new FormData();
        formData.append('audio_file', fileInput.files[0]);
        formData.append('operation', 'separate');
        
        // إضافة الـ stems المختارة
        const checkedStems = separatorForm.querySelectorAll('input[name="stems"]:checked');
        if (checkedStems.length === 0) {
            alert("الرجاء اختيار مسار واحد على الأقل لفصله.");
            return;
        }
        checkedStems.forEach(stem => {
            formData.append('stems', stem.value);
        });

        startProcess(formData, 'separator-results');
    });

    // التعامل مع رفع نموذج التحسين
    enhancerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const fileInput = document.getElementById('enhancer-file');
        if (fileInput.files.length === 0) {
            alert('الرجاء اختيار ملف أولاً.');
            return;
        }

        const formData = new FormData();
        formData.append('audio_file', fileInput.files[0]);
        formData.append('operation', 'enhance');
        startProcess(formData, 'enhancer-results');
    });

    // بدء عملية المعالجة ومتابعتها
    async function startProcess(formData, resultsId) {
        showLoader(true, "جاري رفع الملف وبدء المعالجة...");
        try {
            const response = await fetch('/process', {
                method: 'POST',
                body: formData,
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'حدث خطأ أثناء بدء المعالجة.');
            }
            
            const taskId = result.task_id;
            showLoader(true, `بدأت المعالجة (ID: ${taskId}). سيتم تحديث الحالة تلقائياً.`);
            pollTaskStatus(taskId, resultsId);

        } catch (error) {
            alert(error.message);
            showLoader(false);
        }
    }

    // متابعة حالة المهمة
    function pollTaskStatus(taskId, resultsId) {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/task_status/${taskId}`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                const data = await response.json();

                if (data.status === 'completed') {
                    clearInterval(interval);
                    showLoader(false);
                    displayResults(resultsId, data.results);
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    showLoader(false);
                    alert(`فشلت المهمة: ${data.error}`);
                }
                // إذا كانت الحالة 'processing'، لا تفعل شيئًا واستمر في المتابعة
            } catch (error) {
                clearInterval(interval);
                showLoader(false);
                alert("فشل الاتصال بالخادم لمتابعة الحالة.");
            }
        }, 5000); // متابعة كل 5 ثوانٍ
    }

    function showLoader(show, text = "جاري المعالجة...") {
        loaderText.textContent = text;
        loader.classList.toggle('hidden', !show);
    }

    function displayResults(resultsId, files) {
        const resultsArea = document.getElementById(resultsId);
        resultsArea.innerHTML = '<h3>النتائج جاهزة!</h3>';

        for (const key in files) {
            const trackName = key.charAt(0).toUpperCase() + key.slice(1); // Capitalize
            const filePath = files[key];
            
            const trackElement = document.createElement('div');
            trackElement.className = 'result-track';
            trackElement.innerHTML = `
                <span>${trackName}</span>
                <a href="${filePath}" class="download-btn" target="_blank" download><i class="fas fa-download"></i> تحميل</a>
            `;
            resultsArea.appendChild(trackElement);
        }
        resultsArea.classList.remove('hidden');
    }

    function updateFileName(fileInputId, fileNameId) {
        const fileInput = document.getElementById(fileInputId);
        const fileNameDisplay = document.getElementById(fileNameId);
        fileInput.addEventListener('change', () => {
            fileNameDisplay.textContent = fileInput.files.length > 0 ? fileInput.files[0].name : '';
        });
    }
});
