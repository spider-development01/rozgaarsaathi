// --- CONFIGURATION ---
const SUPABASE_URL = 'https://prjwnbctmwkrscdsmtkh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByanduYmN0bXdrcnNjZHNtdGtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MjkwMDksImV4cCI6MjA3OTIwNTAwOX0.28WSuMkPd76qUSjGMz5KkKx-8cGtx17-0PgLYj8DfGM';
const RAZORPAY_KEY = 'rzp_live_Rh4kTjb6HHV09d,35YdwOteMUTVsJvh2KJI3aMH'; // e.g., rzp_test_...

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- STATE ---
let state = {
    user: null,
    profile: null,
    role: localStorage.getItem('rozgaar_role'), 
    lang: localStorage.getItem('rozgaar_lang') || 'en',
    activeJob: null
};

// --- TRANSLATIONS ---
const i18n = {
    en: { login_title: "Login / Signup", continue_btn: "Continue", complete_profile: "Complete Profile", upload_photo: "Upload Photo:", select_category: "Category:", save_profile: "Save Profile", dashboard_title: "My Dashboard", status_label: "Status:", waiting_msg: "Waiting for jobs...", new_job: "You have been hired!", start_job: "Start Job", enter_otp: "Enter Employer's OTP", verify_otp: "Verify & Complete" },
    hi: { login_title: "लॉगिन / साइनअप", continue_btn: "जारी रखें", complete_profile: "प्रोफ़ाइल पूरी करें", upload_photo: "फोटो:", select_category: "श्रेणी:", save_profile: "सहेजें", dashboard_title: "डैशबोर्ड", status_label: "स्थिति:", waiting_msg: "इंतज़ार कर रहे हैं...", new_job: "आपको काम मिला है!", start_job: "शुरू करें", enter_otp: "OTP दर्ज करें", verify_otp: "सत्यापित करें" },
    pb: { login_title: "ਲੌਗਇਨ / ਸਾਈਨ ਅਪ", continue_btn: "ਜਾਰੀ ਰੱਖੋ", complete_profile: "ਪ੍ਰੋਫਾਈਲ ਪੂਰੀ ਕਰੋ", upload_photo: "ਫੋਟੋ:", select_category: "ਸ਼੍ਰੇਣੀ:", save_profile: "ਸੇਵ ਕਰੋ", dashboard_title: "ਡੈਸ਼ਬੋਰਡ", status_label: "ਸਥਿਤੀ:", waiting_msg: "ਉਡੀਕ ਕਰ ਰਿਹਾ ਹੈ...", new_job: "ਤੁਹਾਨੂੰ ਕੰਮ ਮਿਲਿਆ ਹੈ!", start_job: "ਸ਼ੁਰੂ ਕਰੋ", enter_otp: "OTP ਦਰਜ ਕਰੋ", verify_otp: "ਪੁਸ਼ਟੀ ਕਰੋ" }
};

// --- APP INIT ---
window.onload = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        handleSession(session.user);
    } else {
        showView('role-selection');
    }
};

// --- VIEWS ---
function showView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
    applyTranslations();
}

async function selectRole(role) {
    state.role = role;
    localStorage.setItem('rozgaar_role', role);

    // CRITICAL FIX: If user is already logged in but role was missing/wrong, update it now.
    if (state.user) {
        await supabase.from('profiles').update({ role: role }).eq('id', state.user.id);
        location.reload(); // Reload to load fresh profile
        return;
    }

    if (role === 'worker') showView('language-selection');
    else showView('auth-screen');
}

function setLanguage(lang) {
    state.lang = lang;
    localStorage.setItem('rozgaar_lang', lang);
    showView('auth-screen');
}

function applyTranslations() {
    const lang = (state.role === 'employer') ? 'en' : state.lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang] && i18n[lang][key]) el.textContent = i18n[lang][key];
    });
}

// --- AUTH ---
document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    let { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
        let signUp = await supabase.auth.signUp({ email, password });
        if (signUp.error) { alert(signUp.error.message); return; }
        data = signUp.data;
        alert("Account created!");
    }
    handleSession(data.user);
});

// --- LOGIC CORE ---
async function handleSession(user) {
    state.user = user;
    document.getElementById('logoutBtn').classList.remove('hidden');

    // Fetch Profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

    if (profile) {
        // FIX: If profile exists but role is NULL, force selection
        if (!profile.role) {
            alert("Your profile is missing a role. Please select Employer or Worker.");
            showView('role-selection');
            return;
        }

        state.profile = profile;
        state.role = profile.role; // Trust DB over LocalStorage
        
        if (state.role === 'employer') {
            showView('employer-dashboard');
            checkActiveJobsEmployer();
        } else {
            showView('worker-dashboard');
            listenForJobs();
        }
    } else {
        // No profile -> Onboarding
        showView('onboarding-screen');
        if (state.role === 'employer') {
            document.getElementById('worker-category-input').classList.add('hidden');
        } else {
            document.getElementById('worker-category-input').classList.remove('hidden');
        }
    }
}

// --- SAVE PROFILE ---
document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.textContent = "Saving...";
    
    const file = document.getElementById('profile-photo').files[0];
    let publicUrl = "https://via.placeholder.com/150";
    
    if (file) {
        const fileName = `${Date.now()}-${file.name}`;
        await supabase.storage.from('avatars').upload(fileName, file);
        const res = supabase.storage.from('avatars').getPublicUrl(fileName);
        publicUrl = res.data.publicUrl;
    }

    // Use state.role or fallback to localStorage
    const roleToSave = state.role || localStorage.getItem('rozgaar_role');
    if(!roleToSave) { alert("Role missing. Reloading."); location.reload(); return; }

    const { error } = await supabase.from('profiles').insert({
        id: state.user.id,
        role: roleToSave,
        full_name: document.getElementById('full-name').value,
        phone: document.getElementById('phone').value,
        city: document.getElementById('city').value,
        state: document.getElementById('state').value,
        address: document.getElementById('address').value,
        photo_url: publicUrl,
        category: roleToSave === 'worker' ? document.getElementById('category').value : null,
        language: state.lang
    });

    if (error) { alert(error.message); btn.textContent = "Try Again"; }
    else location.reload();
});

// --- EMPLOYER ---
async function findWorkers() {
    const cat = document.getElementById('search-category').value;
    const { data: workers } = await supabase.from('profiles').select('*').eq('role', 'worker').eq('category', cat);
    
    const list = document.getElementById('workers-list');
    list.innerHTML = '';
    if (!workers || !workers.length) { list.innerHTML = '<p>No workers found.</p>'; return; }

    workers.forEach(w => {
        list.innerHTML += `
            <div class="worker-card">
                <img src="${w.photo_url}" style="width:50px;height:50px;border-radius:50%">
                <div style="flex:1; margin-left:10px;">
                    <h3>${w.full_name}</h3>
                    <p>${w.city}</p>
                </div>
                <button style="width:auto;" onclick="initiateHire('${w.id}', '${w.full_name}')">Hire ₹20</button>
            </div>`;
    });
}
// Updated initiateHire function to use your Node.js Backend
async function initiateHire(workerId, workerName) {
    
    const hireBtn = document.activeElement; // Get the button clicked
    hireBtn.textContent = "Processing...";
    hireBtn.disabled = true;

    try {
        // 1. Call your new backend to create an Order ID
        const response = await fetch("https://razorpay-snll.onrender.com/create-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        if (!response.ok) {
            throw new Error("Backend connection failed");
        }

        const orderData = await response.json();
        console.log("Order Created:", orderData);

        // 2. Open Razorpay with the Order ID from backend
        const options = {
            "key": "rzp_live_Rh4kTjb6HHV09d", // MUST MATCH THE KEY ID IN SERVER.JS
            "amount": orderData.amount, 
            "currency": orderData.currency,
            "name": "Rozgaar Saathi",
            "description": "Hiring Fee for " + workerName,
            "order_id": orderData.id, // <--- This is the magic part for Live payments
            "handler": function (response) {
                // 3. Payment Successful
                console.log("Payment ID: ", response.razorpay_payment_id);
                createJob(workerId, workerName);
            },
            "prefill": {
                "name": state.profile.full_name,
                "contact": state.profile.phone
            },
            "theme": {
                "color": "#2563eb"
            },
            "modal": {
                "ondismiss": function() {
                    hireBtn.textContent = "Hire for ₹20";
                    hireBtn.disabled = false;
                }
            }
        };

        const rzp1 = new Razorpay(options);
        rzp1.on('payment.failed', function (response){
            alert("Payment Failed: " + response.error.description);
            hireBtn.textContent = "Hire for ₹20";
            hireBtn.disabled = false;
        });
        rzp1.open();

    } catch (err) {
        console.error(err);
        alert("Error: Make sure `node server.js` is running!");
        hireBtn.textContent = "Hire for ₹20";
        hireBtn.disabled = false;
    }
}

async function createJob(wId, wName) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await supabase.from('jobs').insert({ employer_id: state.user.id, worker_id: wId, otp: otp, status: 'hired' });
    showJobScreen(otp, wName);
}

function showJobScreen(otp, wName) {
    showView('employer-job-screen');
    document.getElementById('generated-otp').textContent = otp;
    document.getElementById('hired-worker-name').textContent = wName;
    
    const channel = supabase.channel('job-track').on('postgres_changes', 
        { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `employer_id=eq.${state.user.id}` }, 
        (payload) => {
            if (payload.new.status === 'completed') {
                document.getElementById('employer-completion-msg').classList.remove('hidden');
                supabase.removeChannel(channel);
            }
        }
    ).subscribe();
}

async function checkActiveJobsEmployer() {
    const { data } = await supabase.from('jobs').select('*, profiles:worker_id(full_name)').eq('employer_id', state.user.id).eq('status', 'hired').single();
    if (data) showJobScreen(data.otp, data.profiles.full_name);
}

// --- WORKER ---
async function listenForJobs() {
    const check = async () => {
        const { data } = await supabase.from('jobs').select('*, profiles:employer_id(*)').eq('worker_id', state.user.id).eq('status', 'hired').single();
        if (data) {
            state.activeJob = data;
            document.getElementById('notification-area').classList.remove('hidden');
            document.querySelector('.active-status').textContent = "Active Job!";
            document.querySelector('.active-status').style.color = "green";
            const emp = data.profiles;
            document.getElementById('employer-details').innerHTML = `${emp.full_name}<br>${emp.phone}<br>${emp.address}`;
        }
    };
    check();
    supabase.channel('worker-listen').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs', filter: `worker_id=eq.${state.user.id}` }, check).subscribe();
}

function acceptJob() {
    document.getElementById('worker-otp-section').classList.remove('hidden');
}

async function verifyOtp() {
    if (document.getElementById('job-otp-input').value === state.activeJob.otp) {
        await supabase.from('jobs').update({ status: 'completed' }).eq('id', state.activeJob.id);
        alert("Success!");
        location.reload();
    } else {
        alert("Wrong OTP");
    }
}

// --- UTILS ---
document.getElementById('resetBtn').addEventListener('click', async () => {
    if(confirm("Reset app? This logs you out.")) {
        await supabase.auth.signOut();
        localStorage.clear();
        location.reload();
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.reload();
});
