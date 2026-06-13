import {
    auth, db, storage, googleProvider, facebookProvider, IMGBB_API_KEY,
    signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
    query, where, orderBy, limit, startAfter, onSnapshot,
    arrayUnion, arrayRemove, increment, serverTimestamp, Timestamp,
    checkUserStatus, getUserProfile, isUserFollowing, isUserBlocked,
    generateChatId, formatRelativeTime
} from "./firebase-config.js";

let currentUser = null;
let currentChatUser = null;
let unsubscribes = {};
let allUsersCache = null;
let lastPostDoc = null;
let isLoadingPosts = false;
let selectedFiles = [];

// =============================================
// TOAST THÔNG BÁO
// =============================================
function showToast(message) {
    let toastElement = document.getElementById('dunukha-toast');
    if (!toastElement) {
        toastElement = document.createElement('div');
        toastElement.id = 'dunukha-toast';
        toastElement.style.cssText = `
            position:fixed; top:70px; left:50%; transform:translateX(-50%);
            background:linear-gradient(135deg,#333,#555); color:#fff;
            padding:12px 28px; border-radius:30px; font-size:14px; font-weight:600;
            opacity:0; transition:opacity 0.3s,transform 0.3s; z-index:10000;
            box-shadow:0 8px 30px rgba(0,0,0,0.3); pointer-events:none; white-space:nowrap;
        `;
        document.body.appendChild(toastElement);
    }
    clearTimeout(window.dunukhaToastTimer);
    toastElement.textContent = message;
    toastElement.style.opacity = '1';
    toastElement.style.transform = 'translateX(-50%) translateY(0)';
    window.dunukhaToastTimer = setTimeout(function() {
        toastElement.style.opacity = '0';
        toastElement.style.transform = 'translateX(-50%) translateY(-10px)';
    }, 2500);
}

// =============================================
// AUTHENTICATION
// =============================================
function setupAuthListeners() {
    const googleLoginBtn = document.getElementById('google-login');
    const facebookLoginBtn = document.getElementById('facebook-login');
    const emailLoginBtn = document.getElementById('email-login-btn');
    const emailRegisterBtn = document.getElementById('email-register-btn');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');

    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', async function() {
            try {
                await signInWithPopup(auth, googleProvider);
            } catch (error) {
                showToast("Lỗi đăng nhập Google: " + error.message);
            }
        });
    }
    if (facebookLoginBtn) {
        facebookLoginBtn.addEventListener('click', async function() {
            try {
                await signInWithPopup(auth, facebookProvider);
            } catch (error) {
                showToast("Lỗi đăng nhập Facebook: " + error.message);
            }
        });
    }
    if (emailLoginBtn && loginEmailInput && loginPasswordInput) {
        emailLoginBtn.addEventListener('click', async function() {
            const email = loginEmailInput.value.trim();
            const password = loginPasswordInput.value.trim();
            if (!email || !password) { showToast("Vui lòng nhập email và mật khẩu"); return; }
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                if (error.code === 'auth/user-not-found') showToast("Email chưa được đăng ký");
                else if (error.code === 'auth/wrong-password') showToast("Sai mật khẩu");
                else showToast("Lỗi đăng nhập: " + error.message);
            }
        });
    }
    if (emailRegisterBtn && loginEmailInput && loginPasswordInput) {
        emailRegisterBtn.addEventListener('click', async function() {
            const email = loginEmailInput.value.trim();
            const password = loginPasswordInput.value.trim();
            if (!email || !password) { showToast("Vui lòng nhập email và mật khẩu"); return; }
            if (password.length < 6) { showToast("Mật khẩu phải có ít nhất 6 ký tự"); return; }
            try {
                await createUserWithEmailAndPassword(auth, email, password);
                showToast("Đăng ký thành công! Chào mừng bạn đến với Dunukha!");
            } catch (error) {
                if (error.code === 'auth/email-already-in-use') showToast("Email này đã được đăng ký");
                else showToast("Lỗi đăng ký: " + error.message);
            }
        });
    }
}

function setupAuthStateObserver() {
    onAuthStateChanged(auth, async function(user) {
        if (user) {
            currentUser = user;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            await checkUserStatus(user.uid, {
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                phoneNumber: user.phoneNumber
            });
            navigateTo('home');
            listenForNotifications();
        } else {
            currentUser = null;
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('app').style.display = 'none';
            Object.values(unsubscribes).forEach(function(u) { if (u && typeof u === 'function') u(); });
            unsubscribes = {};
            allUsersCache = null;
            lastPostDoc = null;
        }
    });
}

// =============================================
// UPLOAD ẢNH IMGBB
// =============================================
async function uploadImageToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    const response = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, {
        method: 'POST', body: formData
    });
    const result = await response.json();
    if (!result.success) throw new Error('Upload ảnh thất bại: ' + (result.error ? result.error.message : 'Unknown error'));
    return result.data.url;
}

// =============================================
// NAVIGATION
// =============================================
function navigateTo(pageName) {
    document.querySelectorAll('.bottom-nav i').forEach(function(i) { i.classList.remove('active'); });
    const activeIcon = document.querySelector('.bottom-nav i[data-page="' + pageName + '"]');
    if (activeIcon) activeIcon.classList.add('active');
    document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
    const targetPage = document.getElementById('page-' + pageName);
    if (targetPage) targetPage.classList.add('active');
    if (pageName === 'home') { loadStories(); loadFeed(); }
    else if (pageName === 'explore') loadExplorePage();
    else if (pageName === 'reels') loadReelsPage();
    else if (pageName === 'profile' && currentUser) loadProfilePage(currentUser.uid);
}

function setupBottomNavigation() {
    document.querySelectorAll('.bottom-nav i').forEach(function(icon) {
        icon.addEventListener('click', function() {
            const pageName = this.getAttribute('data-page');
            if (pageName) navigateTo(pageName);
        });
    });
}

// =============================================
// STORIES
// =============================================
async function loadStories() {
    const container = document.getElementById('stories');
    if (!container) return;
    container.innerHTML = '';
    try {
        const snap = await getDocs(query(collection(db, "stories"), orderBy("expiresAt", "desc")));
        const now = new Date();
        const usersMap = {};
        snap.forEach(function(doc) {
            const d = doc.data();
            if (d.expiresAt && d.expiresAt.toDate() > now) {
                if (!usersMap[d.uid]) usersMap[d.uid] = { uid: d.uid, stories: [] };
                usersMap[d.uid].stories.push(d);
            }
        });
        for (const uid in usersMap) {
            const userSnap = await getDoc(doc(db, "users", uid));
            if (!userSnap.exists()) continue;
            const u = userSnap.data();
            const div = document.createElement('div');
            div.className = 'story-item';
            div.innerHTML = '<div class="story-ring"><img src="' + (u.photoURL || 'https://via.placeholder.com/66') + '"></div><span>' + u.displayName + '</span>';
            div.addEventListener('click', function() { viewStory(usersMap[uid].stories); });
            container.appendChild(div);
        }
    } catch (e) { console.error('Lỗi stories:', e); }
    const myDiv = document.createElement('div');
    myDiv.className = 'story-item';
    myDiv.innerHTML = '<div class="story-ring" style="background:#ddd;display:flex;align-items:center;justify-content:center;"><i class="fas fa-plus" style="color:#0095f6;font-size:24px;"></i></div><span>Bạn</span>';
    myDiv.addEventListener('click', function() { navigateTo('post'); });
    container.appendChild(myDiv);
}

function viewStory(stories) {
    let i = 0;
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:black;z-index:9999;';
    const img = document.createElement('img');
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    const vid = document.createElement('video');
    vid.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    vid.controls = true; vid.autoplay = true;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:absolute;top:15px;right:15px;background:white;border:none;border-radius:50%;width:36px;height:36px;font-size:18px;font-weight:bold;z-index:10;cursor:pointer;';
    closeBtn.addEventListener('click', function() { clearInterval(timer); modal.remove(); });
    modal.appendChild(closeBtn);
    function show() {
        const s = stories[i];
        if (s.mediaType === 'video') { vid.src = s.mediaUrl; modal.appendChild(vid); if (img.parentNode) img.remove(); }
        else { img.src = s.mediaUrl; modal.appendChild(img); if (vid.parentNode) vid.remove(); }
    }
    show();
    document.body.appendChild(modal);
    const timer = setInterval(function() { i++; if (i >= stories.length) { clearInterval(timer); modal.remove(); } else show(); }, 5000);
}

// =============================================
// FEED
// =============================================
function loadFeed() {
    const feed = document.getElementById('feed');
    if (!feed) return;
    feed.innerHTML = '';
    lastPostDoc = null;
    fetchMorePosts();
}

async function fetchMorePosts() {
    if (isLoadingPosts) return;
    isLoadingPosts = true;
    const loader = document.getElementById('feed-loader');
    if (loader) loader.style.display = 'block';
    try {
        const q = lastPostDoc
            ? query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(lastPostDoc), limit(5))
            : query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(5));
        const snap = await getDocs(q);
        if (!snap.empty) {
            snap.forEach(function(doc) { renderPost(doc.data(), doc.id); lastPostDoc = doc; });
        } else if (!lastPostDoc) {
            document.getElementById('feed').innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Chưa có bài viết nào. Hãy theo dõi bạn bè để xem bài viết của họ!</div>';
        }
    } catch (e) { console.error('Lỗi feed:', e); showToast('Lỗi tải bài viết'); }
    isLoadingPosts = false;
    if (loader) loader.style.display = 'none';
}

// =============================================
// RENDER BÀI VIẾT (LIKE, COMMENT, MENU 3 CHẤM)
// =============================================
function renderPost(postData, postId) {
    const feed = document.getElementById('feed');
    if (!feed) return;
    const isOwner = (postData.uid === currentUser.uid || postData.ownerId === currentUser.uid);
    const liked = postData.likes ? postData.likes.includes(currentUser.uid) : false;
    const div = document.createElement('div');
    div.className = 'post';
    div.setAttribute('data-id', postId);

    let mediaHTML = '';
    if (postData.mediaUrls && postData.mediaUrls.length > 0) {
        postData.mediaUrls.forEach(function(url) {
            if (url.match(/\.(mp4|webm|ogg|mov)$/i)) mediaHTML += '<video class="post-media" src="' + url + '" controls preload="metadata"></video>';
            else mediaHTML += '<img class="post-media" src="' + url + '" loading="lazy">';
        });
    } else {
        mediaHTML = '<img class="post-media" src="' + (postData.mediaUrl || postData.postUrl || 'https://via.placeholder.com/400') + '" loading="lazy">';
    }

    let timeStr = 'Vừa xong';
    if (postData.createdAt) {
        const d = postData.createdAt.toDate ? postData.createdAt.toDate() : new Date(postData.createdAt);
        timeStr = formatRelativeTime(d);
    }

    div.innerHTML = `
        <div class="post-header" data-uid="${postData.uid || postData.ownerId}">
            <img class="post-avatar" src="${postData.userAvatar || 'https://via.placeholder.com/32'}" alt="avatar">
            <span class="post-username">${postData.username || 'Người dùng'}</span>
            <span class="post-time">${timeStr}</span>
            <div style="margin-left:auto;position:relative;">
                <i class="fas fa-ellipsis-v post-menu-trigger" style="cursor:pointer;padding:5px;" data-id="${postId}"></i>
                <div class="post-menu-dropdown" data-id="${postId}" style="display:none;position:absolute;right:0;top:30px;background:white;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.15);z-index:100;min-width:150px;padding:5px 0;">
                    ${isOwner ? '<div class="menu-item-opt" data-action="delete" data-id="' + postId + '" style="padding:10px 15px;cursor:pointer;color:#ed4956;"><i class="fas fa-trash-alt"></i> Xóa bài viết</div>' : '<div class="menu-item-opt" data-action="report" data-id="' + postId + '" style="padding:10px 15px;cursor:pointer;color:#e74c3c;"><i class="fas fa-flag"></i> Báo cáo bài viết</div>'}
                    <div class="menu-item-opt" data-action="copy-link" data-id="${postId}" style="padding:10px 15px;cursor:pointer;"><i class="fas fa-link"></i> Sao chép liên kết</div>
                </div>
            </div>
        </div>
        <div>${mediaHTML}</div>
        <div class="post-actions">
            <i class="${liked ? 'fas fa-heart liked' : 'far fa-heart'}" data-id="${postId}" style="cursor:pointer;"></i>
            <i class="far fa-comment" data-id="${postId}" style="cursor:pointer;"></i>
            <i class="far fa-paper-plane share-btn" data-id="${postId}" style="cursor:pointer;"></i>
            <i class="far fa-bookmark save-btn" data-id="${postId}" style="cursor:pointer;"></i>
        </div>
        <div class="post-likes">${postData.likes ? postData.likes.length : 0} thích</div>
        <div class="post-caption"><strong>${postData.username || 'Người dùng'}</strong> ${postData.caption || ''}</div>
        <div class="comment-input">
            <input placeholder="Viết bình luận..." id="comment-${postId}" style="flex:1;border:none;outline:none;font-size:14px;padding:8px 0;">
            <button class="send-comment" data-id="${postId}" style="background:none;border:none;color:#0095f6;font-weight:600;cursor:pointer;">Đăng</button>
        </div>
        <div id="comments-${postId}" style="padding:0 15px 10px;"></div>
    `;
    feed.appendChild(div);

    div.querySelector('.post-header').addEventListener('click', function(e) {
        if (e.target.closest('.post-menu-trigger') || e.target.closest('.post-menu-dropdown')) return;
        const uid = div.querySelector('.post-header').getAttribute('data-uid');
        if (uid && uid !== 'undefined') { loadProfilePage(uid); navigateTo('profile'); }
    });

    const trigger = div.querySelector('.post-menu-trigger');
    const dropdown = div.querySelector('.post-menu-dropdown');
    if (trigger && dropdown) {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            const vis = dropdown.style.display === 'block';
            document.querySelectorAll('.post-menu-dropdown').forEach(function(m) { m.style.display = 'none'; });
            dropdown.style.display = vis ? 'none' : 'block';
        });
        dropdown.querySelectorAll('.menu-item-opt').forEach(function(item) {
            item.addEventListener('click', async function(e) {
                e.stopPropagation();
                dropdown.style.display = 'none';
                const action = this.getAttribute('data-action');
                const pid = this.getAttribute('data-id');
                if (action === 'delete') {
                    if (confirm('Xóa bài viết này?')) {
                        await deleteDoc(doc(db, "posts", pid));
                        div.remove();
                        showToast('Đã xóa bài viết');
                    }
                } else if (action === 'report') {
                    const reason = prompt('Vui lòng cho biết lý do báo cáo bài viết này:');
                    if (reason && reason.trim()) {
                        await addDoc(collection(db, "reports"), {
                            postId: pid,
                            reporterId: currentUser.uid,
                            reporterName: currentUser.displayName,
                            reason: reason.trim(),
                            status: 'pending',
                            createdAt: serverTimestamp()
                        });
                        showToast('Đã gửi báo cáo. Cảm ơn bạn!');
                    }
                } else if (action === 'copy-link') {
                    const url = postData.mediaUrls ? postData.mediaUrls[0] : (postData.mediaUrl || postData.postUrl || '');
                    if (navigator.clipboard) {
                        await navigator.clipboard.writeText(url);
                        showToast('Đã sao chép liên kết!');
                    } else { prompt('Copy link ảnh:', url); }
                }
            });
        });
    }

    document.addEventListener('click', function() {
        document.querySelectorAll('.post-menu-dropdown').forEach(function(m) { m.style.display = 'none'; });
    });

    const heart = div.querySelector('.fa-heart');
    if (heart) {
        heart.addEventListener('click', async function(e) {
            e.stopPropagation();
            const ref = doc(db, "posts", postId);
            if (liked) {
                await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
                this.classList.remove('liked', 'fas');
                this.classList.add('far');
            } else {
                await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
                this.classList.add('liked', 'fas');
                this.classList.remove('far');
            }
            const updated = await getDoc(ref);
            const likesSpan = div.querySelector('.post-likes');
            if (likesSpan) likesSpan.textContent = (updated.data().likes || []).length + ' thích';
        });
    }

    const sendBtn = div.querySelector('.send-comment');
    if (sendBtn) {
        sendBtn.addEventListener('click', async function() {
            const input = document.getElementById('comment-' + postId);
            if (!input) return;
            const text = input.value.trim();
            if (!text) return;
            await updateDoc(doc(db, "posts", postId), {
                comments: arrayUnion({
                    uid: currentUser.uid,
                    username: currentUser.displayName || 'Người dùng',
                    avatar: currentUser.photoURL || '',
                    text: text,
                    createdAt: new Date().toISOString()
                })
            });
            input.value = '';
            loadComments(postId);
            showToast('Đã bình luận!');
        });
    }

    const saveBtn = div.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            const ref = doc(db, "users", currentUser.uid);
            const snap = await getDoc(ref);
            const saved = snap.data().savedPosts || [];
            if (saved.includes(postId)) {
                await updateDoc(ref, { savedPosts: arrayRemove(postId) });
                showToast('Đã bỏ lưu');
            } else {
                await updateDoc(ref, { savedPosts: arrayUnion(postId) });
                showToast('Đã lưu bài viết');
            }
        });
    }

    const shareBtn = div.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', function() {
            const url = postData.mediaUrls ? postData.mediaUrls[0] : (postData.mediaUrl || postData.postUrl || '');
            if (navigator.share) navigator.share({ title: 'Dunukha', text: postData.caption || '', url: url }).catch(function() {});
            else prompt('Copy link:', url);
        });
    }

    loadComments(postId);
}

async function loadComments(postId) {
    const container = document.getElementById('comments-' + postId);
    if (!container) return;
    const snap = await getDoc(doc(db, "posts", postId));
    if (!snap.exists()) return;
    const comments = snap.data().comments || [];
    container.innerHTML = '';
    comments.forEach(function(c) {
        const d = document.createElement('div');
        d.style.cssText = 'padding:5px 0;border-bottom:1px solid #f5f5f5;display:flex;gap:8px;align-items:flex-start;';
        d.innerHTML = '<img src="' + (c.avatar || 'https://via.placeholder.com/24') + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;margin-top:2px;"><div style="flex:1;"><strong style="font-size:13px;">' + (c.username || 'Người dùng') + '</strong> <span style="font-size:14px;">' + c.text + '</span></div>';
        container.appendChild(d);
    });
}

// =============================================
// ĐĂNG BÀI
// =============================================
function setupPostUpload() {
    const fileInput = document.getElementById('post-files');
    const preview = document.getElementById('preview-container');
    const submitBtn = document.getElementById('submit-post');
    const captionInput = document.getElementById('post-caption');
    if (!fileInput || !preview || !submitBtn) return;

    fileInput.addEventListener('change', function() {
        preview.innerHTML = '';
        selectedFiles = Array.from(fileInput.files);
        if (selectedFiles.length === 0) {
            preview.innerHTML = '<p style="color:#aaa;font-size:14px;text-align:center;padding:20px;">Ảnh xem trước sẽ hiển thị ở đây</p>';
            return;
        }
        selectedFiles.forEach(function(file, idx) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const wrapper = document.createElement('div');
                wrapper.style.cssText = 'position:relative;width:90px;height:90px;border-radius:10px;overflow:hidden;display:inline-block;margin:5px;box-shadow:0 2px 8px rgba(0,0,0,0.1);';
                const el = file.type.startsWith('video') ? document.createElement('video') : document.createElement('img');
                el.src = e.target.result;
                el.style.cssText = 'width:100%;height:100%;object-fit:cover;';
                const removeBtn = document.createElement('button');
                removeBtn.innerHTML = '✕';
                removeBtn.style.cssText = 'position:absolute;top:4px;right:4px;background:#ff4757;color:white;border:none;border-radius:50%;width:22px;height:22px;font-size:12px;cursor:pointer;z-index:5;';
                removeBtn.addEventListener('click', function(ev) { ev.stopPropagation(); wrapper.remove(); selectedFiles.splice(idx, 1); if (preview.children.length === 0) preview.innerHTML = '<p style="color:#aaa;font-size:14px;text-align:center;padding:20px;">Ảnh xem trước sẽ hiển thị ở đây</p>'; });
                wrapper.appendChild(el);
                wrapper.appendChild(removeBtn);
                preview.appendChild(wrapper);
                const p = preview.querySelector('p');
                if (p) p.remove();
            };
            reader.readAsDataURL(file);
        });
    });

    submitBtn.addEventListener('click', async function() {
        if (selectedFiles.length === 0) { showToast('Vui lòng chọn ảnh/video'); return; }
        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng...';
        try {
            const urls = [];
            for (const f of selectedFiles) urls.push(await uploadImageToImgBB(f));
            const userSnap = await getDoc(doc(db, "users", currentUser.uid));
            const userData = userSnap.exists() ? userSnap.data() : {};
            await addDoc(collection(db, "posts"), {
                uid: currentUser.uid, ownerId: currentUser.uid,
                username: userData.displayName || currentUser.displayName || 'Người dùng',
                userAvatar: userData.photoURL || currentUser.photoURL || 'https://via.placeholder.com/32',
                mediaUrls: urls, mediaUrl: urls[0], postUrl: urls[0],
                mediaType: selectedFiles[0].type.startsWith('video') ? 'video' : 'image',
                caption: captionInput ? captionInput.value.trim() : '',
                likes: [], comments: [], status: 'pending', createdAt: serverTimestamp()
            });
            fileInput.value = '';
            preview.innerHTML = '<p style="color:#aaa;font-size:14px;text-align:center;padding:20px;">Ảnh xem trước sẽ hiển thị ở đây</p>';
            if (captionInput) captionInput.value = '';
            selectedFiles = [];
            showToast('Bài viết đã được gửi, đang chờ admin duyệt!');
            navigateTo('home');
        } catch (e) { showToast('Lỗi: ' + e.message); }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng';
    });
}

// =============================================
// PROFILE ĐỘNG (PHÂN BIỆT CHÍNH CHỦ / NGƯỜI KHÁC)
// =============================================
async function loadProfilePage(uid) {
    const container = document.getElementById('profile-content');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Đang tải thông tin...</div>';
    if (!uid) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Không tìm thấy người dùng</div>'; return; }
    try {
        const profile = await getUserProfile(uid);
        if (!profile) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Người dùng không tồn tại</div>'; return; }
        const isOwner = (uid === currentUser.uid);
        const following = profile.followers ? (profile.followers[currentUser.uid] === true) : false;
        const followersCount = profile.followers ? Object.keys(profile.followers).filter(function(k) { return profile.followers[k] === true; }).length : 0;
        const followingCount = profile.following ? Object.keys(profile.following).filter(function(k) { return profile.following[k] === true; }).length : 0;

        let actionHTML = '';
        if (isOwner) {
            actionHTML = '<button class="btn" id="edit-profile-btn" style="padding:8px 20px;border:1px solid #dbdbdb;border-radius:8px;background:#fafafa;font-weight:600;cursor:pointer;">Chỉnh sửa hồ sơ</button>';
        } else {
            actionHTML = `
                <button class="btn" id="follow-btn" style="padding:8px 20px;border:none;border-radius:8px;font-weight:600;cursor:pointer;background:${following ? '#fafafa' : '#0095f6'};color:${following ? '#262626' : 'white'};border:${following ? '1px solid #dbdbdb' : 'none'};">
                    ${following ? 'Đang theo dõi' : 'Theo dõi'}
                </button>
                <button class="btn" id="message-btn" style="padding:8px 20px;border:1px solid #dbdbdb;border-radius:8px;background:#fafafa;font-weight:600;cursor:pointer;">Nhắn tin</button>
            `;
        }

        container.innerHTML = `
            <div class="profile-header">
                <img class="profile-avatar" src="${profile.photoURL || 'https://via.placeholder.com/150'}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;">
                <div class="profile-info" style="flex:1;">
                    <h2 style="font-size:20px;margin:0 0 5px 0;">${profile.displayName} ${profile.isVerified ? '<span style="color:#0095f6;">✅</span>' : ''}</h2>
                    <p style="color:#888;margin:0 0 10px 0;">@${profile.username}</p>
                    <div class="profile-stats" style="display:flex;gap:20px;margin:10px 0;">
                        <div><span style="font-weight:700;">${profile.totalPosts || 0}</span><div style="font-size:13px;color:#888;">bài viết</div></div>
                        <div><span style="font-weight:700;">${followersCount}</span><div style="font-size:13px;color:#888;">followers</div></div>
                        <div><span style="font-weight:700;">${followingCount}</span><div style="font-size:13px;color:#888;">đang theo dõi</div></div>
                    </div>
                    <p>${profile.bio || ''}</p>
                    <p style="font-size:12px;color:#888;">📍 ${profile.location || 'Chưa có địa điểm'}</p>
                    <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;">${actionHTML}</div>
                </div>
            </div>
            <div class="profile-grid" id="profile-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3px;margin-top:10px;"></div>
        `;

        await loadProfilePosts(uid);

        if (isOwner) {
            const editBtn = document.getElementById('edit-profile-btn');
            if (editBtn) editBtn.addEventListener('click', function() { openEditModal(profile); });
        } else {
            const followBtn = document.getElementById('follow-btn');
            if (followBtn) followBtn.addEventListener('click', async function() {
                await handleFollow(uid);
                loadProfilePage(uid);
            });
            const msgBtn = document.getElementById('message-btn');
            if (msgBtn) msgBtn.addEventListener('click', function() { openChatFromProfile(uid, profile.displayName); });
        }
    } catch (e) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Lỗi: ' + e.message + '</div>'; }
}

async function loadProfilePosts(uid) {
    const grid = document.getElementById('profile-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#888;">Đang tải...</div>';
    try {
        const q = query(collection(db, "posts"), where("uid", "==", uid), orderBy("createdAt", "desc"), limit(12));
        const snap = await getDocs(q);
        grid.innerHTML = '';
        if (snap.empty) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">Chưa có bài viết</div>'; return; }
        snap.forEach(function(doc) {
            const d = doc.data();
            const img = document.createElement('img');
            img.src = d.mediaUrls ? d.mediaUrls[0] : (d.mediaUrl || d.postUrl || 'https://via.placeholder.com/400');
            img.style.cssText = 'width:100%;aspect-ratio:1/1;object-fit:cover;cursor:pointer;';
            img.addEventListener('click', function() { alert('📷 ' + (d.caption || 'Không có caption')); });
            grid.appendChild(img);
        });
    } catch (e) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#888;">Lỗi tải bài viết</div>'; }
}

async function handleFollow(targetUid) {
    const following = await isUserFollowing(currentUser.uid, targetUid);
    const targetRef = doc(db, "users", targetUid);
    const myRef = doc(db, "users", currentUser.uid);
    if (following) {
        await updateDoc(targetRef, { ['followers.' + currentUser.uid]: false });
        await updateDoc(myRef, { ['following.' + targetUid]: false });
        showToast('Đã bỏ theo dõi');
    } else {
        await updateDoc(targetRef, { ['followers.' + currentUser.uid]: true });
        await updateDoc(myRef, { ['following.' + targetUid]: true });
        showToast('Đã theo dõi');
        try {
            await addDoc(collection(db, "notifications"), {
                to: targetUid, from: currentUser.uid, type: 'follow',
                message: (currentUser.displayName || 'Người dùng') + ' đã theo dõi bạn',
                read: false, createdAt: serverTimestamp()
            });
        } catch (e) {}
    }
}

function openChatFromProfile(targetUid, targetName) {
    document.getElementById('chat-modal').style.display = 'flex';
    currentChatUser = targetUid;
    document.getElementById('chat-list').style.display = 'none';
    document.getElementById('chat-window').style.display = 'flex';
    document.getElementById('chat-username').textContent = targetName;
    loadChatMessages();
}

function openEditModal(profile) {
    const modal = document.getElementById('edit-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.getElementById('edit-displayname').value = profile.displayName || '';
    document.getElementById('edit-username').value = profile.username || '';
    document.getElementById('edit-bio').value = profile.bio || '';
    document.getElementById('edit-location').value = profile.location || '';
    const saveBtn = document.getElementById('save-edit');
    if (saveBtn) {
        const newSaveBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
        newSaveBtn.addEventListener('click', async function() {
            const updates = {
                displayName: document.getElementById('edit-displayname').value.trim(),
                username: document.getElementById('edit-username').value.trim(),
                bio: document.getElementById('edit-bio').value.trim(),
                location: document.getElementById('edit-location').value.trim()
            };
            const file = document.getElementById('edit-avatar');
            if (file && file.files && file.files[0]) {
                try {
                    const url = await uploadImageToImgBB(file.files[0]);
                    updates.photoURL = url;
                    updates.avatarUrl = url;
                } catch (e) { showToast('Lỗi upload: ' + e.message); return; }
            }
            await updateDoc(doc(db, "users", currentUser.uid), updates);
            modal.style.display = 'none';
            showToast('Đã cập nhật hồ sơ!');
            loadProfilePage(currentUser.uid);
        });
    }
}

// =============================================
// CHAT
// =============================================
function loadChatMessages() {
    if (!currentUser || !currentChatUser) return;
    const chatId = generateChatId(currentUser.uid, currentChatUser);
    if (unsubscribes['chat_' + chatId]) { unsubscribes['chat_' + chatId](); unsubscribes['chat_' + chatId] = null; }
    const q = query(collection(db, "messages"), where("chatId", "==", chatId), orderBy("createdAt"), limit(50));
    unsubscribes['chat_' + chatId] = onSnapshot(q, function(snap) {
        const container = document.getElementById('chat-messages');
        if (!container) return;
        container.innerHTML = '';
        snap.forEach(function(doc) {
            const d = doc.data();
            const row = document.createElement('div');
            row.className = 'message-row ' + (d.from === currentUser.uid ? 'sent' : 'received');
            row.innerHTML = '<div class="message-bubble">' + d.text + '</div>';
            container.appendChild(row);
        });
        container.scrollTop = container.scrollHeight;
    });
}

function setupChatSend() {
    const sendBtn = document.getElementById('chat-send-btn');
    const input = document.getElementById('chat-input');
    if (!sendBtn || !input) return;
    sendBtn.addEventListener('click', async function() {
        const text = input.value.trim();
        if (!text || !currentChatUser) return;
        const chatId = generateChatId(currentUser.uid, currentChatUser);
        await addDoc(collection(db, "messages"), {
            chatId, from: currentUser.uid, senderId: currentUser.uid, to: currentChatUser,
            text, type: 'text', createdAt: serverTimestamp(), timestamp: serverTimestamp()
        });
        await setDoc(doc(db, "chats", chatId), {
            chatId, users: [currentUser.uid, currentChatUser],
            lastMessage: text, lastMessageTime: serverTimestamp(), updatedAt: serverTimestamp()
        }, { merge: true });
        input.value = '';
        input.focus();
    });
    input.addEventListener('keypress', function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click(); } });
}

// =============================================
// EXPLORE, SEARCH, REELS, NOTIFICATIONS
// =============================================
async function loadExplorePage() {
    const grid = document.getElementById('search-results');
    if (!grid) return;
    grid.innerHTML = '';
    const snap = await getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(12)));
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(3,1fr)';
    grid.style.gap = '3px';
    snap.forEach(function(doc) {
        const d = doc.data();
        const img = document.createElement('img');
        img.src = d.mediaUrls ? d.mediaUrls[0] : (d.mediaUrl || d.postUrl || '');
        img.style.cssText = 'width:100%;aspect-ratio:1/1;object-fit:cover;cursor:pointer;';
        img.addEventListener('click', function() { loadProfilePage(d.uid || d.ownerId); navigateTo('profile'); });
        grid.appendChild(img);
    });
}

function setupSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');
    if (!input || !results) return;
    input.addEventListener('input', async function() {
        const kw = input.value.trim().toLowerCase();
        if (!kw) { results.style.display = 'grid'; results.style.gridTemplateColumns = 'repeat(3,1fr)'; loadExplorePage(); return; }
        results.style.display = 'block';
        results.innerHTML = '<div style="text-align:center;padding:10px;color:#888;">Đang tìm...</div>';
        if (!allUsersCache) {
            const snap = await getDocs(collection(db, "users"));
            allUsersCache = [];
            snap.forEach(function(doc) { if (doc.id !== currentUser.uid) allUsersCache.push({ id: doc.id, data: doc.data() }); });
        }
        const filtered = allUsersCache.filter(function(u) {
            const dn = u.data.displayName ? u.data.displayName.toLowerCase() : '';
            const un = u.data.username ? u.data.username.toLowerCase() : '';
            return dn.includes(kw) || un.includes(kw);
        });
        results.innerHTML = '';
        if (filtered.length === 0) { results.innerHTML = '<div style="text-align:center;padding:30px;color:#888;">Không tìm thấy</div>'; return; }
        filtered.forEach(function(u) {
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 15px;border-bottom:1px solid #f0f0f0;cursor:pointer;';
            div.innerHTML = '<img src="' + (u.data.photoURL || 'https://via.placeholder.com/44') + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;"><div style="flex:1;"><div style="font-weight:600;">' + u.data.displayName + '</div><div style="color:#888;font-size:13px;">@' + u.data.username + '</div></div>';
            div.addEventListener('click', function() { loadProfilePage(u.id); navigateTo('profile'); });
            results.appendChild(div);
        });
    });
}

async function loadReelsPage() {
    const container = document.getElementById('reels-container');
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#888;">Đang tải Reels...</div>';
    const snap = await getDocs(query(collection(db, "posts"), where("mediaType", "==", "video"), orderBy("createdAt", "desc"), limit(10)));
    container.innerHTML = '';
    snap.forEach(function(doc) {
        const d = doc.data();
        const div = document.createElement('div');
        div.className = 'reel-item';
        div.innerHTML = '<video src="' + (d.mediaUrls ? d.mediaUrls[0] : d.mediaUrl) + '" controls loop style="width:100%;height:100%;object-fit:contain;"></video>';
        container.appendChild(div);
    });
}

function listenForNotifications() {
    if (!currentUser) return;
    const q = query(collection(db, "notifications"), where("to", "==", currentUser.uid), orderBy("createdAt", "desc"), limit(30));
    unsubscribes['notifications'] = onSnapshot(q, function(snap) {
        let count = 0;
        snap.forEach(function(doc) { if (doc.data().read === false) count++; });
        const badge = document.getElementById('notif-btn');
        if (badge) badge.setAttribute('data-count', count);
    });
}

// =============================================
// SIDEBAR
// =============================================
function setupSidebar() {
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-menu');
    const overlay = document.getElementById('menu-overlay');
    const sideMenu = document.getElementById('side-menu');
    if (!menuBtn || !sideMenu) return;
    menuBtn.addEventListener('click', function() { sideMenu.classList.add('open'); if (overlay) overlay.classList.add('show'); });
    if (closeBtn) closeBtn.addEventListener('click', function() { sideMenu.classList.remove('open'); if (overlay) overlay.classList.remove('show'); });
    if (overlay) overlay.addEventListener('click', function() { sideMenu.classList.remove('open'); overlay.classList.remove('show'); });
    document.querySelectorAll('.menu-item').forEach(function(item) {
        item.addEventListener('click', function() {
            const act = this.getAttribute('data-action');
            sideMenu.classList.remove('open');
            if (overlay) overlay.classList.remove('show');
            if (act === 'profile') navigateTo('profile');
            else if (act === 'edit-profile') getDoc(doc(db, "users", currentUser.uid)).then(function(s) { if (s.exists()) openEditModal(s.data()); });
            else if (act === 'logout') { if (confirm('Đăng xuất?')) signOut(auth); }
        });
    });
}

// =============================================
// INIT
// =============================================
function initializeApp() {
    setupAuthListeners();
    setupAuthStateObserver();
    setupBottomNavigation();
    setupPostUpload();
    setupSearch();
    setupChatSend();
    setupSidebar();
    document.getElementById('chat-btn').addEventListener('click', function() { document.getElementById('chat-modal').style.display = 'flex'; });
    document.getElementById('chat-close-btn').addEventListener('click', function() { document.getElementById('chat-modal').style.display = 'none'; });
    document.getElementById('page-home').addEventListener('scroll', function() {
        if (this.scrollHeight - this.scrollTop - this.clientHeight < 100 && !isLoadingPosts) fetchMorePosts();
    });
}

document.addEventListener('DOMContentLoaded', initializeApp);
