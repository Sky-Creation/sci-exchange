// FIX: Frontend is on Netlify, so we MUST point to Render backend
const API = "https://sci-exchange-backend.onrender.com";

let currentPage = 1, currentSearch = "", chartInstanceVolume = null, chartInstanceCount = null;

const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const otp = document.getElementById("otp").value;
        const btn = loginForm.querySelector("button");
        const errorDiv = document.getElementById("error-msg");
        const errorText = document.getElementById("error-text");
        btn.disabled = true; btn.innerHTML = `Verifying...`; errorDiv.classList.add("hidden");
        try {
            const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, otp }) });
            const data = await res.json();
            if (res.ok) { localStorage.setItem("admin_token", data.token); window.location.href = "admin.html"; } else throw new Error(data.error || "Login failed");
        } catch (err) { errorText.textContent = err.message; errorDiv.classList.remove("hidden"); btn.disabled = false; btn.textContent = "Secure Login"; }
    });
}

if (window.location.pathname.includes("admin.html")) {
    const token = localStorage.getItem("admin_token");
    if (!token) window.location.href = "login.html";
    const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
    document.getElementById("logout-btn")?.addEventListener("click", () => { localStorage.removeItem("admin_token"); window.location.href = "login.html"; });

    window.showSection = (sectionId) => {
        ['orders', 'audit', 'backup', 'charts'].forEach(id => {
            document.getElementById(`section-${id}`)?.classList.add('hidden');
            document.getElementById(`nav-${id}`)?.classList.replace('bg-indigo-800', 'hover:bg-indigo-800');
        });
        document.getElementById(`section-${sectionId}`)?.classList.remove('hidden');
        document.getElementById(`nav-${sectionId}`)?.classList.add('bg-indigo-800');
        if (sectionId === 'orders') fetchDashboard(); if (sectionId === 'audit') fetchAudit(); if (sectionId === 'charts') loadCharts();
    };

    async function fetchDashboard(page = 1) {
        try {
            const res = await fetch(`${API}/admin/orders?page=${page}&limit=50&search=${encodeURIComponent(currentSearch)}`, { headers });
            if (res.status === 401) { localStorage.removeItem("admin_token"); window.location.href = "login.html"; return; }
            const responseData = await res.json();
            const orders = responseData.data || responseData; currentPage = responseData.page || 1;
            renderOrders(orders);
        } catch (err) { console.error("Failed to load dashboard", err); }
    }
    window.fetchDashboard = () => fetchDashboard(1);
    window.filterOrders = () => { currentSearch = document.getElementById("order-search").value; fetchDashboard(1); };

    function renderOrders(orders) {
        const tbody = document.getElementById("orders-table-body"); if (!tbody) return;
        if (orders.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-gray-400">No orders found.</td></tr>`; return; }
        tbody.innerHTML = orders.map(o => {
            const dateStr = new Date(o.created).toLocaleString("en-GB", { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            const slipLink = o.slipUrl ? `<a href="${o.slipUrl}" target="_blank" class="text-xs text-blue-600 underline ml-2">Slip</a>` : '';
            return `<tr class="border-b hover:bg-gray-50">
                <td class="p-4 font-mono text-sm text-indigo-600">${o.reference}</td>
                <td class="p-4 text-sm">${dateStr}</td>
                <td class="p-4 font-bold text-gray-800">${o.amount.toLocaleString()} ${o.direction === "MMK2THB"?"MMK":"THB"}</td>
                <td class="p-4 font-mono text-sm">${o.txid || '-'} ${slipLink}</td>
                <td class="p-4"><span class="px-2 py-1 rounded-full text-xs font-bold border ${o.status === 'COMPLETED' ? 'bg-green-50 text-green-700' : o.status === 'REJECTED' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}">${o.status}</span></td>
                <td class="p-4">${o.status === 'PENDING' ? `<div class="flex gap-2"><button onclick="updateOrder('${o.id}', 'COMPLETED')" class="px-3 py-1 bg-green-600 text-white rounded text-xs">Approve</button><button onclick="updateOrder('${o.id}', 'REJECTED')" class="px-3 py-1 border border-red-300 text-red-600 rounded text-xs">Reject</button></div>` : '-'}</td>
            </tr>`;
        }).join("");
    }

    window.updateOrder = async (id, status) => { if (confirm(`Mark as ${status}?`)) { await fetch(`${API}/admin/orders/${id}`, { method: "POST", headers, body: JSON.stringify({ status }) }); fetchDashboard(currentPage); } };

    async function fetchAudit() {
        const tbody = document.getElementById("audit-table-body");
        try {
            const logs = await (await fetch(`${API}/admin/audit`, { headers })).json();
            tbody.innerHTML = logs.length ? logs.sort((a,b)=>new Date(b.time)-new Date(a.time)).map(l => `
                <tr class="border-b"><td class="p-3 text-sm text-gray-600">${new Date(l.time).toLocaleString()}</td><td class="p-3 font-medium">${l.action}</td><td class="p-3 font-mono text-gray-500 text-sm">${l.target}</td></tr>
            `).join("") : `<tr><td colspan="3" class="p-8 text-center text-gray-400">No logs.</td></tr>`;
        } catch { tbody.innerHTML = `<tr><td colspan="3" class="text-center text-red-500">Error</td></tr>`; }
    }
    window.fetchAudit = fetchAudit;

    window.triggerBackup = async () => {
        const btn = document.getElementById("trigger-backup-btn"); btn.disabled = true; btn.innerHTML = `Processing...`;
        try {
            const data = await (await fetch(`${API}/admin/backup`, { method: "POST", headers })).json();
            if (data.directUrl) { const a = document.createElement('a'); a.href = window.URL.createObjectURL(await (await fetch(data.directUrl, { headers })).blob()); a.download = data.file; document.body.appendChild(a); a.click(); a.remove(); alert("Downloaded!"); }
        } catch (err) { alert("Backup failed: " + err.message); } finally { btn.disabled = false; btn.innerHTML = "Download Backup"; }
    };
    
    window.downloadCSV = async () => {
        try { const res = await fetch(`${API}/admin/export/csv`, { headers }); if (res.ok) { const a = document.createElement('a'); a.href = window.URL.createObjectURL(await res.blob()); a.download = `orders.csv`; document.body.appendChild(a); a.click(); a.remove(); } } catch { alert("Export failed"); }
    };

    async function loadCharts() {
        const ctxVol = document.getElementById('chart-volume'); if (!ctxVol) return;
        try {
            const data = await (await fetch(`${API}/admin/analytics`, { headers })).json();
            if (chartInstanceVolume) chartInstanceVolume.destroy(); if (chartInstanceCount) chartInstanceCount.destroy();
            chartInstanceVolume = new Chart(ctxVol, { type: 'bar', data: { labels: data.map(d=>d.date), datasets: [{ label: 'MMK', data: data.map(d=>d.volumeMMK), backgroundColor: '#6366f1' }, { label: 'THB', data: data.map(d=>d.volumeTHB), backgroundColor: '#22c55e' }] } });
            chartInstanceCount = new Chart(document.getElementById('chart-count'), { type: 'line', data: { labels: data.map(d=>d.date), datasets: [{ label: 'Orders', data: data.map(d=>d.count), borderColor: '#4f46e5' }] } });
        } catch {}
    }
    fetchDashboard();
    setInterval(() => { if (!document.getElementById("section-orders").classList.contains("hidden")) fetchDashboard(currentPage); }, 30000);
}
