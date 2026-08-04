(function() {
    // ─── State ────────────────────────────
    let emailsData = [];
    let currentIndex = -1;
    let darkMode = localStorage.getItem('darkMode') === 'true';
    let readIds = JSON.parse(localStorage.getItem('readIds') || '[]');
    let searchQuery = '';
    let loading = false;
    let currentTab = 'html';
    let fetchInterval = null;
    let toastIdCounter = 0;

    const avatarPalette = [
        '#4a6a7a', '#5a7a6b', '#7a6a5a', '#8b6b7a',
        '#6a7a8a', '#7a8a6a', '#9b7a6b', '#6b8a7b',
        '#5a6a8a', '#8a7a6b', '#6a5a7a', '#7a8b6a',
    ];

    // ─── DOM Elements ─────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const appEl = $('#app');
    const toastContainer = $('#toast-container');
    const unreadBadge = $('#unread-badge');
    const darkModeToggle = $('#dark-mode-toggle');
    const darkModeIcon = $('#dark-mode-icon');
    const refreshBtn = $('#refresh-btn');
    const refreshIcon = $('#refresh-icon');
    const clearAllBtn = $('#clear-all-btn');
    const searchInput = $('#search-input');
    const clearSearchBtn = $('#clear-search-btn');
    const emailCountEl = $('#email-count');
    const loadingIndicator = $('#loading-indicator');
    const skeletonContainer = $('#skeleton-container');
    const emptyState = $('#empty-state');
    const noResultsState = $('#no-results-state');
    const noResultsQuery = $('#no-results-query');
    const emailListEl = $('#email-list');
    const previewPane = $('#preview-pane');
    const previewPlaceholder = $('#preview-placeholder');
    const previewContent = $('#preview-content');
    const pvSubject = $('#pv-subject');
    const pvDate = $('#pv-date');
    const pvFrom = $('#pv-from');
    const pvTo = $('#pv-to');
    const pvBodyHtml = $('#pv-body-html');
    const pvBodyText = $('#pv-body-text');
    const pvBodyHeaders = $('#pv-body-headers');
    const copyBtn = $('#copy-btn');
    const deleteCurrentBtn = $('#delete-current-btn');
    const mobileOverlay = $('#mobile-overlay');
    const mobileBackBtn = $('#mobile-back-btn');
    const mobilePreviewContent = $('#mobile-preview-content');

    // ─── Apply Dark Mode ──────────────────
    function applyDarkMode() {
        if (darkMode) {
            document.documentElement.classList.add('dark');
            darkModeIcon.className = 'fa-solid fa-sun text-sm';
        } else {
            document.documentElement.classList.remove('dark');
            darkModeIcon.className = 'fa-solid fa-moon text-sm';
        }
    }
    applyDarkMode();

    // ─── Toast ────────────────────────────
    function showToast(message, type = 'info') {
        const id = ++toastIdCounter;
        const config = {
            info: { bg: 'var(--info)', icon: 'fa-solid fa-circle-info' },
            success: { bg: 'var(--success)', icon: 'fa-solid fa-circle-check' },
            error: { bg: 'var(--danger)', icon: 'fa-solid fa-circle-exclamation' },
            warning: { bg: 'var(--warning)', icon: 'fa-solid fa-triangle-exclamation' },
        };
        const { bg, icon } = config[type] || config.info;
        const toast = document.createElement('div');
        toast.className =
            'pointer-events-auto px-4 py-3 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2.5 toast-enter';
        toast.style.background = bg;
        toast.style.color = '#fff';
        toast.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    // ─── Helpers ──────────────────────────
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function avatarColor(fromStr) {
        if (!fromStr) return avatarPalette[0];
        let hash = 0;
        for (let i = 0; i < fromStr.length; i++) {
            hash = fromStr.charCodeAt(i) + ((hash << 5) - hash);
        }
        return avatarPalette[Math.abs(hash) % avatarPalette.length];
    }

    function formatTime(dateStr) {
        if (!dateStr) return '-';
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            if (diffMins < 1) return 'Baru saja';
            if (diffMins < 60) return `${diffMins}m lalu`;
            if (diffHours < 24) return `${diffHours}j lalu`;
            return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit',
                minute: '2-digit' });
        } catch {
            return dateStr;
        }
    }

    function snippet(email) {
        const raw = (email.text || email.html || '').replace(/<[^>]*>/g, '').substring(0, 80);
        return raw || '';
    }

    function formatHeaders(email) {
        if (!email) return '';
        const headersObj = email.headers || {};
        let text = '';
        if (Object.keys(headersObj).length > 0) {
            for (const [key, values] of Object.entries(headersObj)) {
                const val = Array.isArray(values) ? values.join(', ') : values;
                text += `${key}: ${val}\n`;
            }
        } else {
            text =
                `From: ${email.from || '-'}\nTo: ${email.to || '-'}\nDate: ${email.date || '-'}\nSubject: ${email.subject || '-'}\n\n(Tidak ada header tambahan)`;
        }
        return text;
    }

    function isRead(email) {
        return readIds.includes(email.id || '');
    }

    function getFilteredEmails() {
        let list = emailsData.map((email, idx) => ({ ...email, _origIndex: idx, _key: email.id ||
                `email-${idx}` }));
        const q = searchQuery.toLowerCase().trim();
        if (q) {
            list = list.filter(e =>
                (e.subject || '').toLowerCase().includes(q) ||
                (e.from || '').toLowerCase().includes(q) ||
                (e.to || '').toLowerCase().includes(q)
            );
        }
        return list;
    }

    function getCurrentEmail() {
        if (currentIndex >= 0 && currentIndex < emailsData.length) {
            return { ...emailsData[currentIndex], _key: emailsData[currentIndex].id ||
                    `curr-${currentIndex}`, _origIndex: currentIndex };
        }
        return null;
    }

    function updateUnreadBadge() {
        const unreadCount = emailsData.filter(e => !isRead(e)).length;
        if (unreadCount > 0) {
            unreadBadge.classList.remove('hidden');
            unreadBadge.textContent = `${unreadCount} belum dibaca`;
        } else {
            unreadBadge.classList.add('hidden');
        }
    }

    function updateEmailCount() {
        emailCountEl.textContent = `(${emailsData.length})`;
    }

    // ─── Render Email List ────────────────
    function renderList() {
        skeletonContainer.classList.add('hidden');
        emailListEl.innerHTML = '';
        const filtered = getFilteredEmails();

        if (loading && emailsData.length === 0) {
            skeletonContainer.classList.remove('hidden');
            emptyState.classList.add('hidden');
            noResultsState.classList.add('hidden');
            updatePreviewVisibility();
            return;
        }

        if (!loading && emailsData.length === 0) {
            emptyState.classList.remove('hidden');
            noResultsState.classList.add('hidden');
            emailListEl.classList.add('hidden');
            updatePreviewVisibility();
            updateEmailCount();
            updateUnreadBadge();
            return;
        }

        if (filtered.length === 0 && searchQuery) {
            emptyState.classList.add('hidden');
            noResultsState.classList.remove('hidden');
            emailListEl.classList.add('hidden');
            noResultsQuery.textContent = searchQuery;
            updatePreviewVisibility();
            updateEmailCount();
            updateUnreadBadge();
            return;
        }

        emptyState.classList.add('hidden');
        noResultsState.classList.add('hidden');
        emailListEl.classList.remove('hidden');

        filtered.forEach(email => {
            const item = document.createElement('div');
            item.className = `email-item px-4 py-3.5 border-b ${!isRead(email) ? 'unread' : ''} ${currentIndex === email._origIndex ? 'active' : ''}`;
            item.style.borderColor = 'var(--border-light)';
            item.setAttribute('data-index', email._origIndex);
            item.addEventListener('click', function(e) {
                if (e.target.closest('.delete-btn')) return;
                selectEmail(email._origIndex);
            });

            item.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm" style="background:${avatarColor(email.from)};">
                        ${escapeHTML((email.from || '?').charAt(0).toUpperCase())}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex justify-between items-baseline mb-0.5">
                            <span class="font-semibold text-sm truncate pr-2" style="color:var(--text);">${escapeHTML(email.from || 'Tidak diketahui')}</span>
                            <span class="text-xs whitespace-nowrap flex items-center gap-1.5 flex-shrink-0" style="color:var(--text-muted);">
                                ${!isRead(email) ? '<span class="w-2 h-2 rounded-full flex-shrink-0" style="background:var(--accent);"></span>' : ''}
                                ${formatTime(email.date)}
                            </span>
                        </div>
                        <div class="text-sm font-medium truncate" style="color:var(--text-secondary);">${escapeHTML(email.subject || '(Tanpa Subjek)')}</div>
                        <div class="text-xs truncate mt-0.5" style="color:var(--text-muted);">${escapeHTML(snippet(email))}</div>
                    </div>
                    <button class="delete-btn flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors" style="background:transparent;border:none;cursor:pointer;" title="Hapus email">
                        <i class="fa-solid fa-xmark text-xs" style="color:var(--danger);"></i>
                    </button>
                </div>`;

            const delBtn = item.querySelector('.delete-btn');
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                deleteEmail(email._origIndex);
            });

            emailListEl.appendChild(item);
        });

        updateEmailCount();
        updateUnreadBadge();
        updatePreviewVisibility();

        // Scroll to active
        const activeItem = emailListEl.querySelector('.email-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    function updatePreviewVisibility() {
        const email = getCurrentEmail();
        if (window.innerWidth >= 640) {
            if (email) {
                previewPane.style.display = 'flex';
                previewPlaceholder.classList.add('hidden');
                previewContent.classList.remove('hidden');
            } else if (emailsData.length === 0 || (getFilteredEmails().length === 0 && searchQuery)) {
                previewPane.style.display = 'none';
            } else {
                previewPane.style.display = 'flex';
                previewPlaceholder.classList.remove('hidden');
                previewContent.classList.add('hidden');
            }
        }
    }

    // ─── Preview ──────────────────────────
    function showPreview(index) {
        if (index < 0 || index >= emailsData.length) return;
        const email = emailsData[index];
        const emailId = email.id || '';
        if (emailId && !readIds.includes(emailId)) {
            readIds.push(emailId);
            localStorage.setItem('readIds', JSON.stringify(readIds));
        }
        currentIndex = index;
        currentTab = email.html ? 'html' : email.text ? 'text' : 'headers';

        pvSubject.textContent = email.subject || '(Tanpa Subjek)';
        pvDate.textContent = email.date || '-';
        pvFrom.textContent = email.from || 'Tidak diketahui';
        pvTo.textContent = email.to || 'Tidak diketahui';
        pvBodyHtml.innerHTML = email.html ||
            '<p style="color:var(--text-muted);font-style:italic;">Tidak ada versi HTML</p>';
        pvBodyText.textContent = email.text || 'Tidak ada versi teks biasa.';
        pvBodyHeaders.textContent = formatHeaders(email);

        switchTab(currentTab);

        if (window.innerWidth < 640) {
            renderMobilePreview(email);
            mobileOverlay.classList.remove('hidden');
            mobileOverlay.style.display = 'flex';
        } else {
            mobileOverlay.classList.add('hidden');
            mobileOverlay.style.display = 'none';
            previewPane.style.display = 'flex';
            previewPlaceholder.classList.add('hidden');
            previewContent.classList.remove('hidden');
            previewContent.classList.add('animate-scale-in');
            setTimeout(() => previewContent.classList.remove('animate-scale-in'), 300);
        }

        renderList();
        updateUnreadBadge();
    }

    function renderMobilePreview(email) {
        mobilePreviewContent.innerHTML = `
            <div class="rounded-xl p-4 shadow-sm" style="background:var(--surface);border:1px solid var(--border-light);">
                <h2 class="text-lg font-bold mb-3" style="color:var(--text);">${escapeHTML(email.subject || '(Tanpa Subjek)')}</h2>
                <div class="grid grid-cols-1 gap-2 mb-3">
                    <div class="p-3 rounded-xl" style="background:var(--surface-alt);">
                        <span class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted);">Dari</span>
                        <p class="font-semibold text-sm mt-0.5" style="color:var(--text);">${escapeHTML(email.from || '-')}</p>
                    </div>
                    <div class="p-3 rounded-xl" style="background:var(--surface-alt);">
                        <span class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted);">Untuk</span>
                        <p class="font-semibold text-sm mt-0.5" style="color:var(--text);">${escapeHTML(email.to || '-')}</p>
                    </div>
                </div>
                <p class="text-xs mb-3 flex items-center gap-1" style="color:var(--text-muted);">
                    <i class="fa-solid fa-clock"></i> ${email.date || '-'}
                </p>
                <div class="flex gap-1 mb-3 p-1 rounded-xl" style="background:var(--surface-alt);">
                    <button data-mobile-tab="html" class="tab-btn flex-1 text-xs ${currentTab === 'html' ? 'active' : ''}"><i class="fa-brands fa-html5"></i> HTML</button>
                    <button data-mobile-tab="text" class="tab-btn flex-1 text-xs ${currentTab === 'text' ? 'active' : ''}"><i class="fa-solid fa-align-left"></i> Text</button>
                </div>
                <div id="mobile-html-view" class="border rounded-xl p-3 min-h-[200px] max-h-[350px] overflow-y-auto text-sm" style="background:var(--surface);border-color:var(--border-light);display:${currentTab === 'html' ? 'block' : 'none'};">
                    ${email.html || '<p style="color:var(--text-muted);font-style:italic;">Tidak ada versi HTML</p>'}
                </div>
                <pre id="mobile-text-view" class="whitespace-pre-wrap text-xs p-3 rounded-xl min-h-[200px] max-h-[350px] overflow-y-auto font-mono" style="background:#1e1e1c;color:#c5e8d0;display:${currentTab === 'text' ? 'block' : 'none'};">${escapeHTML(email.text || 'Tidak ada konten.')}</pre>
                <div class="flex gap-2 mt-3">
                    <button id="mobile-delete-btn" class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5" style="background:var(--danger);color:#fff;border:none;cursor:pointer;">
                        <i class="fa-solid fa-trash"></i> Hapus
                    </button>
                    <button id="mobile-copy-btn" class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5" style="background:var(--surface-alt);color:var(--text);border:1px solid var(--border);cursor:pointer;">
                        <i class="fa-solid fa-copy"></i> Salin
                    </button>
                </div>
            </div>`;

        // Bind mobile tab buttons
        const mobileTabBtns = mobilePreviewContent.querySelectorAll('[data-mobile-tab]');
        mobileTabBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const tab = this.getAttribute('data-mobile-tab');
                currentTab = tab;
                mobilePreviewContent.querySelectorAll('[data-mobile-tab]').forEach(b => b
                    .classList.remove('active'));
                this.classList.add('active');
                const htmlView = mobilePreviewContent.querySelector('#mobile-html-view');
                const textView = mobilePreviewContent.querySelector('#mobile-text-view');
                if (htmlView) htmlView.style.display = tab === 'html' ? 'block' : 'none';
                if (textView) textView.style.display = tab === 'text' ? 'block' : 'none';
                // Also update desktop tabs
                switchTab(tab);
            });
        });

        const mobileDelBtn = mobilePreviewContent.querySelector('#mobile-delete-btn');
        if (mobileDelBtn) {
            mobileDelBtn.addEventListener('click', function() {
                deleteCurrentEmail();
                mobileOverlay.classList.add('hidden');
                mobileOverlay.style.display = 'none';
            });
        }
        const mobileCopyBtn = mobilePreviewContent.querySelector('#mobile-copy-btn');
        if (mobileCopyBtn) {
            mobileCopyBtn.addEventListener('click', copyEmailContent);
        }
    }

    function switchTab(tab) {
        currentTab = tab;
        const allTabs = previewContent.querySelectorAll('.tab-btn');
        allTabs.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tab) btn.classList.add('active');
        });
        pvBodyHtml.style.display = tab === 'html' ? 'block' : 'none';
        pvBodyText.style.display = tab === 'text' ? 'block' : 'none';
        pvBodyHeaders.style.display = tab === 'headers' ? 'block' : 'none';
    }

    // ─── Actions ──────────────────────────
    function selectEmail(index) {
        if (index < 0 || index >= emailsData.length) return;
        const email = emailsData[index];
        const emailId = email.id || '';
        if (emailId && !readIds.includes(emailId)) {
            readIds.push(emailId);
            localStorage.setItem('readIds', JSON.stringify(readIds));
        }
        showPreview(index);
    }

    function deleteEmail(index) {
        if (index < 0 || index >= emailsData.length) return;
        const email = emailsData[index];
        const emailId = email.id || '';
        readIds = readIds.filter(id => id !== emailId);
        localStorage.setItem('readIds', JSON.stringify(readIds));
        emailsData.splice(index, 1);
        if (currentIndex === index) {
            currentIndex = -1;
            mobileOverlay.classList.add('hidden');
            mobileOverlay.style.display = 'none';
            previewPane.style.display = 'none';
        } else if (currentIndex > index) {
            currentIndex--;
        }
        renderList();
        updateUnreadBadge();
        showToast('🗑️ Email berhasil dihapus', 'success');
        try {
            fetch(`/api/emails/${encodeURIComponent(emailId)}`, { method: 'DELETE' }).catch(() => {});
        } catch (e) {}
    }

    function deleteCurrentEmail() {
        if (currentIndex >= 0 && currentIndex < emailsData.length) {
            deleteEmail(currentIndex);
        }
    }

    function clearAllEmails() {
        if (emailsData.length === 0) {
            showToast('Inbox sudah kosong', 'warning');
            return;
        }
        if (confirm(
                `Yakin ingin menghapus semua ${emailsData.length} email? Tindakan ini tidak dapat dibatalkan.`
                )) {
            emailsData = [];
            readIds = [];
            localStorage.setItem('readIds', '[]');
            currentIndex = -1;
            mobileOverlay.classList.add('hidden');
            mobileOverlay.style.display = 'none';
            previewPane.style.display = 'none';
            renderList();
            updateUnreadBadge();
            showToast('🗑️ Semua email berhasil dihapus', 'success');
            try {
                fetch('/api/emails', { method: 'DELETE' }).catch(() => {});
            } catch (e) {}
        }
    }

    function copyEmailContent() {
        const email = getCurrentEmail();
        if (!email) {
            showToast('Tidak ada email yang dipilih', 'warning');
            return;
        }
        const content =
            `Subjek: ${email.subject || '-'}\nDari: ${email.from || '-'}\nUntuk: ${email.to || '-'}\nWaktu: ${email.date || '-'}\n\n${email.text || (email.html || '').replace(/<[^>]*>/g, '') || 'Tidak ada konten.'}`;
        navigator.clipboard.writeText(content).then(() => {
            showToast('📋 Konten email disalin ke clipboard!', 'success');
        }).catch(() => {
            showToast('Gagal menyalin konten', 'error');
        });
    }

    // ─── Fetch ────────────────────────────
    async function fetchEmails(showLoadingIndicator = true) {
        if (showLoadingIndicator) {
            loading = true;
            loadingIndicator.classList.remove('hidden');
            refreshIcon.classList.add('fa-spin');
            if (emailsData.length === 0) {
                skeletonContainer.classList.remove('hidden');
                emptyState.classList.add('hidden');
            }
        }
        try {
            const response = await fetch('/api/emails');
            if (!response.ok) throw new Error('Gagal mengambil email');
            const newData = await response.json();
            if (emailsData.length > 0 && newData.length > emailsData.length) {
                const newCount = newData.length - emailsData.length;
                showToast(`📬 ${newCount} email baru masuk!`, 'success');
            }
            emailsData = newData;
            if (currentIndex >= emailsData.length) {
                currentIndex = -1;
            }
            renderList();
        } catch (error) {
            console.error('Fetch error:', error);
            skeletonContainer.classList.add('hidden');
            if (emailsData.length === 0) {
                emptyState.classList.remove('hidden');
                emptyState.innerHTML = `
                    <div class="w-20 h-20 rounded-full flex items-center justify-center mb-4" style="background:var(--surface-alt);">
                        <i class="fa-solid fa-triangle-exclamation text-2xl" style="color:var(--warning);"></i>
                    </div>
                    <p class="font-semibold text-lg mb-1" style="color:var(--text-secondary);">Gagal Terhubung</p>
                    <p class="text-sm" style="color:var(--text-muted);">Tidak dapat mengambil email. Pastikan server berjalan.</p>
                    <button id="retry-btn" class="mt-4 px-4 py-2 rounded-lg font-semibold text-sm" style="background:var(--accent);color:var(--accent-text);border:none;cursor:pointer;">
                        <i class="fa-solid fa-arrows-rotate mr-1"></i> Coba Lagi
                    </button>`;
                const retryBtn = $('#retry-btn');
                if (retryBtn) retryBtn.addEventListener('click', () => fetchEmails(true));
            }
        } finally {
            loading = false;
            loadingIndicator.classList.add('hidden');
            refreshIcon.classList.remove('fa-spin');
            skeletonContainer.classList.add('hidden');
        }
    }

    // ─── Event Listeners ──────────────────
    darkModeToggle.addEventListener('click', () => {
        darkMode = !darkMode;
        localStorage.setItem('darkMode', darkMode);
        applyDarkMode();
        showToast(darkMode ? '🌙 Dark mode aktif' : '☀️ Light mode aktif', 'info');
    });

    refreshBtn.addEventListener('click', () => fetchEmails(true));
    clearAllBtn.addEventListener('click', clearAllEmails);
    copyBtn.addEventListener('click', copyEmailContent);
    deleteCurrentBtn.addEventListener('click', deleteCurrentEmail);

    searchInput.addEventListener('input', function() {
        searchQuery = this.value;
        if (searchQuery.trim()) {
            clearSearchBtn.classList.remove('hidden');
        } else {
            clearSearchBtn.classList.add('hidden');
        }
        renderList();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchQuery = '';
        searchInput.value = '';
        clearSearchBtn.classList.add('hidden');
        renderList();
        searchInput.focus();
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            searchQuery = '';
            this.value = '';
            clearSearchBtn.classList.add('hidden');
            this.blur();
            renderList();
        }
    });

    mobileBackBtn.addEventListener('click', () => {
        mobileOverlay.classList.add('hidden');
        mobileOverlay.style.display = 'none';
    });

    // Desktop tab buttons
    previewContent.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const tab = this.getAttribute('data-tab');
            switchTab(tab);
        });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
        }
        if (e.key === 'Escape') {
            mobileOverlay.classList.add('hidden');
            mobileOverlay.style.display = 'none';
            if (document.activeElement === searchInput) {
                searchInput.blur();
            }
        }
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            fetchEmails(true);
        }
    });

    // Window resize handler
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 640) {
            mobileOverlay.classList.add('hidden');
            mobileOverlay.style.display = 'none';
        }
        updatePreviewVisibility();
    });

    // ─── Init ─────────────────────────────
    function init() {
        if (window.innerWidth >= 640) {
            previewPane.style.display = 'flex';
        } else {
            previewPane.style.display = 'none';
        }
        fetchEmails(true);
        fetchInterval = setInterval(() => fetchEmails(false), 4000);
        console.log('%c📧 なつServer Mail Catcher %cReady',
            'font-size:1.2em;font-weight:bold;color:#2c3e4e;',
            'color:#3d6b4f;');
        console.log(
            '%cFitur: Search (Ctrl+K) | Refresh (Ctrl+R) | Dark Mode | Copy | Delete | Auto-refresh tiap 4 detik',
            'color:#636360;');
    }

    init();
})();