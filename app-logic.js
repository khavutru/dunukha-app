// =============================================
// FILE: app-logic.js
// MÔ TẢ: Xử lý toàn bộ logic ứng dụng Dunukha
// Bao gồm: Auth, Navigation, Tìm kiếm, Đăng bài, Profile, Feed, Reels, Story
// =============================================

// Import từ firebase-config.js
import {
    auth, db, storage, googleProvider, facebookProvider, IMGBB_API_KEY,
    signInWithPopup, signOut, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc,
    query, where, orderBy, limit, startAfter, onSnapshot,
    arrayUnion, arrayRemove, serverTimestamp,
    ref, uploadBytesResumable, getDownloadURL
} from "./firebase-config.js";

// =============================================
// BIẾN TOÀN CỤC
// =============================================
let currentUser = null;
let currentChatUser = null;
let unsubscribes = {};
let allUsersCache = null;
let lastPostDoc = null;
let isLoadingPosts = false;

// =============================================
// HIỂN THỊ THÔNG BÁO TOAST
// =============================================
function showToast(message) {
    const toastElement = document.getElementById('toast');
    if (!toastElement) {
        const newToast = document.createElement('div');
        newToast.id = 'toast';
        newToast.style.cssText = 'position:fixed; top:60px; left:50%; transform:translateX(-50%); background:#333; color:white; padding:10px 20px; border-radius:20px; font-size:14px; opacity:0; transition:0.3s; z-index:9999;';
        document.body.appendChild(newToast);
        window.toastTimer = null;
    }
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    toast.style.opacity = '1';
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(function() {
        toast.style.opacity = '0';
        toast.classList.remove('show');
    }, 2500);
}

// =============================================
// AUTHENTICATION: ĐĂNG NHẬP / ĐĂNG KÝ
// =============================================
function setupAuthListeners() {
    var googleLoginBtn = document.getElementById('google-login');
    var facebookLoginBtn = document.getElementById('facebook-login');
    var emailLoginBtn = document.getElementById('email-login-btn');
    var emailRegisterBtn = document.getElementById('email-register-btn');

    if (googleLoginBtn) {
        googleLoginBtn.onclick = function() {
            signInWithPopup(auth, googleProvider).catch(function(error) {
                showToast('Lỗi đăng nhập Google: ' + error.message);
            });
        };
    }

    if (facebookLoginBtn) {
        facebookLoginBtn.onclick = function() {
            signInWithPopup(auth, facebookProvider).catch(function(error) {
                showToast('Lỗi đăng nhập Facebook: ' + error.message);
            });
        };
    }

    if (emailLoginBtn) {
        emailLoginBtn.onclick = async function() {
            var email = document.getElementById('login-email').value;
            var password = document.getElementById('login-password').value;
            try {
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                showToast('Lỗi đăng nhập: ' + error.message);
            }
        };
    }

    if (emailRegisterBtn) {
        emailRegisterBtn.onclick = async function() {
            var email = document.getElementById('login-email').value;
            var password = document.getElementById('login-password').value;
            try {
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (error) {
                showToast('Lỗi đăng ký: ' + error.message);
            }
        };
    }
}

// =============================================
// THEO DÕI TRẠNG THÁI ĐĂNG NHẬP
// =============================================
function setupAuthStateObserver() {
    onAuthStateChanged(auth, async function(user) {
        if (user) {
            currentUser = user;
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            await ensureUserDocumentExists(user);
            navigateTo('home');
            listenForNotifications();
            showToast('Chào mừng đến với Dunukha!');
        } else {
            currentUser = null;
            document.getElementById('login-screen').style.display = 'flex';
            document.getElementById('app').style.display = 'none';
            Object.values(unsubscribes).forEach(function(unsub) { unsub(); });
            unsubscribes = {};
        }
    });
}

// =============================================
// TẠO DOCUMENT USER NẾU CHƯA TỒN TẠI
// =============================================
async function ensureUserDocumentExists(user) {
    var userRef = doc(db, "users", user.uid);
    var userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
        await setDoc(userRef, {
            uid: user.uid,
            displayName: user.displayName || (user.email ? user.email.split('@')[0] : "Người dùng Dunukha"),
            email: user.email || "",
            photoURL: user.photoURL || "https://via.placeholder.com/150",
            avatarUrl: user.photoURL || "https://via.placeholder.com/150",
            username: user.email ? user.email.split('@')[0] : ("dunukha_user_" + user.uid.slice(0, 6)),
            bio: "",
            location: "",
            website: "",
            followers: {},
            following: {},
            savedPosts: [],
            blockedUsers: {},
            isPrivate: false,
            isVerified: false,
            depositStatus: "none",
            violationCount: 0,
            createdAt: serverTimestamp()
        });
    }
}

// =============================================
// UPLOAD ẢNH LÊN IMGBB
// =============================================
async function uploadImageToImgBB(file) {
    var formData = new FormData();
    formData.append('image', file);
    var response = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, {
        method: 'POST',
        body: formData
    });
    var result = await response.json();
    if (!result.success) {
        throw new Error('Upload ảnh thất bại: ' + (result.error ? result.error.message : 'Unknown error'));
    }
    return result.data.url;
}

// =============================================
// NAVIGATION: CHUYỂN TRANG
// =============================================
function navigateTo(pageName) {
    var navIcons = document.querySelectorAll('.bottom-nav i');
    navIcons.forEach(function(icon) {
        icon.classList.remove('active');
    });
    var activeNavIcon = document.querySelector('[data-page="' + pageName + '"]');
    if (activeNavIcon) {
        activeNavIcon.classList.add('active');
    }

    var allPages = document.querySelectorAll('.page');
    allPages.forEach(function(page) {
        page.classList.remove('active');
    });
    var targetPage = document.getElementById('page-' + pageName);
    if (targetPage) {
        targetPage.classList.add('active');
    }

    if (pageName === 'home') {
        loadStories();
        loadFeed();
    } else if (pageName === 'explore') {
        loadExplorePage();
    } else if (pageName === 'reels') {
        loadReelsPage();
    } else if (pageName === 'profile') {
        loadProfilePage(currentUser.uid);
    }
}

// =============================================
// GÁN SỰ KIỆN CHO THANH ĐIỀU HƯỚNG DƯỚI CÙNG
// =============================================
function setupBottomNavigation() {
    var navIcons = document.querySelectorAll('.bottom-nav i');
    navIcons.forEach(function(icon) {
        icon.addEventListener('click', function() {
            var pageName = this.getAttribute('data-page');
            navigateTo(pageName);
        });
    });
}

// =============================================
// STORIES: TẢI DANH SÁCH STORY
// =============================================
async function loadStories() {
    var storiesContainer = document.getElementById('stories');
    if (!storiesContainer) return;
    storiesContainer.innerHTML = '';

    try {
        var storiesQuery = query(collection(db, "stories"), orderBy("expiresAt", "desc"));
        var storiesSnapshot = await getDocs(storiesQuery);
        var now = new Date();
        var usersMap = {};

        storiesSnapshot.forEach(function(docSnapshot) {
            var storyData = docSnapshot.data();
            if (storyData.expiresAt.toDate() > now) {
                if (!usersMap[storyData.uid]) {
                    usersMap[storyData.uid] = { uid: storyData.uid, stories: [] };
                }
                usersMap[storyData.uid].stories.push(storyData);
            }
        });

        for (var uid in usersMap) {
            var userEntry = usersMap[uid];
            var userDocSnap = await getDoc(doc(db, "users", uid));
            if (!userDocSnap.exists()) continue;
            var userData = userDocSnap.data();

            var storyItem = document.createElement('div');
            storyItem.className = 'story-item';
            storyItem.innerHTML = '<div class="story-ring"><img src="' + (userData.photoURL || 'https://via.placeholder.com/66') + '"></div><span>' + userData.displayName + '</span>';
            storyItem.onclick = function() {
                viewStory(userEntry.stories);
            };
            storiesContainer.appendChild(storyItem);
        }
    } catch (error) {
        console.error('Lỗi tải stories:', error);
    }

    var myStoryItem = document.createElement('div');
    myStoryItem.className = 'story-item';
    myStoryItem.innerHTML = '<div class="story-ring" style="background:#ddd; display:flex; align-items:center; justify-content:center;"><i class="fas fa-plus" style="color:#0095f6;"></i></div><span>Bạn</span>';
    myStoryItem.onclick = function() { navigateTo('post'); };
    storiesContainer.appendChild(myStoryItem);
}

// =============================================
// VIEW STORY: XEM STORY
// =============================================
function viewStory(stories) {
    var storyIndex = 0;
    var storyModal = document.createElement('div');
    storyModal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:black; z-index:9999;';
    var storyImage = document.createElement('img');
    storyImage.style.cssText = 'width:100%; height:100%; object-fit:contain;';
    var storyVideo = document.createElement('video');
    storyVideo.style.cssText = 'width:100%; height:100%; object-fit:contain;';
    storyVideo.controls = true;
    storyVideo.autoplay = true;
    var closeStoryBtn = document.createElement('button');
    closeStoryBtn.textContent = 'X';
    closeStoryBtn.style.cssText = 'position:absolute; top:10px; right:10px; background:white; border:none; border-radius:50%; width:30px; height:30px; font-weight:bold; z-index:10;';
    closeStoryBtn.onclick = function() {
        clearInterval(storyTimer);
        storyModal.remove();
    };
    storyModal.appendChild(closeStoryBtn);

    function showCurrentStory() {
        var currentStory = stories[storyIndex];
        if (currentStory.mediaType === 'video') {
            storyVideo.src = currentStory.mediaUrl;
            storyModal.appendChild(storyVideo);
            if (storyImage.parentNode) storyImage.remove();
        } else {
            storyImage.src = currentStory.mediaUrl;
            storyModal.appendChild(storyImage);
            if (storyVideo.parentNode) storyVideo.remove();
        }
    }
    showCurrentStory();
    document.body.appendChild(storyModal);

    var storyTimer = setInterval(function() {
        storyIndex++;
        if (storyIndex >= stories.length) {
            clearInterval(storyTimer);
            storyModal.remove();
        } else {
            showCurrentStory();
        }
    }, 5000);
}

// =============================================
// FEED: TẢI BÀI VIẾT (CHỈ BÀI ĐÃ ĐƯỢC DUYỆT)
// =============================================
function loadFeed() {
    document.getElementById('feed').innerHTML = '';
    lastPostDoc = null;
    fetchMorePosts();
}

async function fetchMorePosts() {
    if (isLoadingPosts) return;
    isLoadingPosts = true;
    var feedLoader = document.getElementById('feed-loader');
    feedLoader.style.display = 'block';

    try {
        var postsQuery;
        if (lastPostDoc) {
            postsQuery = query(
                collection(db, "posts"),
                where("status", "==", "approved"),
                orderBy("createdAt", "desc"),
                startAfter(lastPostDoc),
                limit(5)
            );
        } else {
            postsQuery = query(
                collection(db, "posts"),
                where("status", "==", "approved"),
                orderBy("createdAt", "desc"),
                limit(5)
            );
        }

        var postsSnapshot = await getDocs(postsQuery);
        if (!postsSnapshot.empty) {
            postsSnapshot.forEach(function(docSnapshot) {
                renderPost(docSnapshot.data(), docSnapshot.id);
                lastPostDoc = docSnapshot;
            });
        } else {
            if (!lastPostDoc) {
                document.getElementById('feed').innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Chưa có bài viết nào được duyệt.</div>';
            }
        }
    } catch (error) {
        console.error('Lỗi tải feed:', error);
        showToast('Lỗi tải bài viết');
    }

    isLoadingPosts = false;
    feedLoader.style.display = 'none';
}

// =============================================
// RENDER MỘT BÀI VIẾT
// =============================================
function renderPost(postData, postId) {
    var isOwner = (postData.uid === currentUser.uid);
    var isLiked = postData.likes ? postData.likes.includes(currentUser.uid) : false;

    var postDiv = document.createElement('div');
    postDiv.className = 'post';
    postDiv.dataset.id = postId;

    var mediaHTML = '';
    if (postData.mediaUrls && postData.mediaUrls.length > 0) {
        postData.mediaUrls.forEach(function(url) {
            if (url.match(/\.(mp4|webm|ogg|mov)$/i)) {
                mediaHTML += '<video class="post-media" src="' + url + '" controls preload="metadata"></video>';
            } else {
                mediaHTML += '<img class="post-media" src="' + url + '" loading="lazy">';
            }
        });
    } else if (postData.mediaUrl) {
        mediaHTML = '<img class="post-media" src="' + postData.mediaUrl + '" loading="lazy">';
    } else {
        mediaHTML = '<img class="post-media" src="https://via.placeholder.com/400">';
    }

    var timeString = 'Vừa xong';
    if (postData.createdAt) {
        var postDate = postData.createdAt.toDate ? postData.createdAt.toDate() : new Date(postData.createdAt);
        timeString = formatRelativeTime(postDate);
    }

    postDiv.innerHTML = `
        <div class="post-header" data-uid="${postData.uid}">
            <img class="post-avatar" src="${postData.userAvatar || 'https://via.placeholder.com/32'}">
            <span class="post-username">${postData.username}</span>
            <span class="post-time">${timeString}</span>
        </div>
        <div>${mediaHTML}</div>
        <div class="post-actions">
            <i class="${isLiked ? 'fas fa-heart liked' : 'far fa-heart'}" data-id="${postId}"></i>
            <i class="far fa-comment" data-id="${postId}"></i>
            <i class="far fa-paper-plane share-btn" data-id="${postId}"></i>
            <i class="far fa-bookmark save-btn" data-id="${postId}"></i>
        </div>
        <div class="post-likes">${(postData.likes ? postData.likes.length : 0)} thích</div>
        <div class="post-caption"><strong>${postData.username}</strong> ${postData.caption || ''}</div>
        <div class="comment-input">
            <input placeholder="Viết bình luận..." id="comment-${postId}">
            <button class="send-comment" data-id="${postId}">Đăng</button>
        </div>
        <div id="comments-${postId}" style="margin-top:5px;"></div>
    `;

    document.getElementById('feed').appendChild(postDiv);

    postDiv.querySelector('.post-header').addEventListener('click', function(event) {
        if (event.target.closest('.fa-ellipsis-v')) return;
        var headerUid = postDiv.querySelector('.post-header').getAttribute('data-uid');
        if (headerUid) loadProfilePage(headerUid);
    });

    var heartIcon = postDiv.querySelector('.fa-heart');
    if (heartIcon) {
        heartIcon.onclick = async function(event) {
            var clickedId = event.target.getAttribute('data-id');
            var postRef = doc(db, "posts", clickedId);
            if (isLiked) {
                await updateDoc(postRef, { likes: arrayRemove(currentUser.uid) });
                event.target.classList.remove('liked', 'fas');
                event.target.classList.add('far');
            } else {
                await updateDoc(postRef, { likes: arrayUnion(currentUser.uid) });
                event.target.classList.add('liked', 'fas');
                event.target.classList.remove('far');
                if (postData.uid !== currentUser.uid) {
                    sendNotification(postData.uid, 'like', currentUser.displayName + ' đã thích bài viết của bạn');
                }
            }
            var updatedSnap = await getDoc(doc(db, "posts", clickedId));
            var likesSpan = postDiv.querySelector('.post-likes');
            if (updatedSnap.exists()) {
                var updatedLikes = updatedSnap.data().likes || [];
                likesSpan.textContent = updatedLikes.length + ' thích';
            }
        };
    }

    var sendCommentBtn = postDiv.querySelector('.send-comment');
    if (sendCommentBtn) {
        sendCommentBtn.onclick = async function() {
            var commentId = this.getAttribute('data-id');
            var commentInput = document.getElementById('comment-' + commentId);
            var commentText = commentInput.value.trim();
            if (!commentText) return;
            await updateDoc(doc(db, "posts", commentId), {
                comments: arrayUnion({
                    uid: currentUser.uid,
                    username: currentUser.displayName,
                    avatar: currentUser.photoURL,
                    text: commentText,
                    createdAt: new Date().toISOString()
                })
            });
            if (postData.uid !== currentUser.uid) {
                sendNotification(postData.uid, 'comment', currentUser.displayName + ': ' + commentText);
            }
            commentInput.value = '';
            loadCommentsForPost(commentId);
            showToast('Đã bình luận');
        };
    }

    var saveBtn = postDiv.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.onclick = async function() {
            var userRef = doc(db, "users", currentUser.uid);
            var userSnap = await getDoc(userRef);
            var savedList = userSnap.data().savedPosts || [];
            if (savedList.includes(postId)) {
                await updateDoc(userRef, { savedPosts: arrayRemove(postId) });
                showToast('Đã bỏ lưu');
            } else {
                await updateDoc(userRef, { savedPosts: arrayUnion(postId) });
                showToast('Đã lưu bài viết');
            }
        };
    }

    var shareBtn = postDiv.querySelector('.share-btn');
    if (shareBtn) {
        shareBtn.onclick = function() {
            var shareUrl = postData.mediaUrls ? postData.mediaUrls[0] : (postData.mediaUrl || '');
            if (navigator.share) {
                navigator.share({ title: 'Dunukha', text: postData.caption, url: shareUrl });
            } else {
                prompt('Copy link ảnh:', shareUrl);
            }
        };
    }

    loadCommentsForPost(postId);
}

// =============================================
// TẢI BÌNH LUẬN CHO BÀI VIẾT
// =============================================
async function loadCommentsForPost(postId) {
    var commentsContainer = document.getElementById('comments-' + postId);
    if (!commentsContainer) return;
    var postSnap = await getDoc(doc(db, "posts", postId));
    if (!postSnap.exists()) return;
    var comments = postSnap.data().comments || [];
    commentsContainer.innerHTML = '';
    comments.forEach(function(comment) {
        var commentDiv = document.createElement('div');
        commentDiv.style.cssText = 'padding:5px 0; border-bottom:1px solid #efefef; display:flex; gap:8px;';
        commentDiv.innerHTML = '<img src="' + (comment.avatar || 'https://via.placeholder.com/24') + '" style="width:24px;height:24px;border-radius:50%;"><div><strong>' + comment.username + '</strong> ' + comment.text + '</div>';
        commentsContainer.appendChild(commentDiv);
    });
}

// =============================================
// ĐỊNH DẠNG THỜI GIAN TƯƠNG ĐỐI
// =============================================
function formatRelativeTime(date) {
    var now = new Date();
    var diffMs = now - date;
    var diffSeconds = Math.floor(diffMs / 1000);
    var diffMinutes = Math.floor(diffSeconds / 60);
    var diffHours = Math.floor(diffMinutes / 60);
    var diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'Vừa xong';
    if (diffMinutes < 60) return diffMinutes + ' phút trước';
    if (diffHours < 24) return diffHours + ' giờ trước';
    if (diffDays === 1) return 'Hôm qua';
    return diffDays + ' ngày trước';
}

// =============================================
// LOGIC ĐĂNG BÀI: XEM TRƯỚC ẢNH & UPLOAD
// =============================================
function setupPostUpload() {
    var fileInput = document.getElementById('post-files');
    var previewContainer = document.getElementById('preview-container');
    var submitBtn = document.getElementById('submit-post');
    var captionInput = document.getElementById('post-caption');

    if (!fileInput || !previewContainer || !submitBtn) return;

    fileInput.onchange = function() {
        previewContainer.innerHTML = '';
        var files = Array.from(fileInput.files);
        if (files.length === 0) {
            previewContainer.innerHTML = '<p style="color:#aaa; font-size:14px;">Ảnh xem trước sẽ hiển thị ở đây</p>';
            return;
        }
        files.forEach(function(file) {
            var reader = new FileReader();
            reader.onload = function(event) {
                var wrapper = document.createElement('div');
                wrapper.style.cssText = 'position:relative; width:90px; height:90px; border-radius:10px; overflow:hidden; display:inline-block; margin:4px;';
                var mediaElement = file.type.startsWith('video') ? document.createElement('video') : document.createElement('img');
                mediaElement.src = event.target.result;
                mediaElement.style.cssText = 'width:100%; height:100%; object-fit:cover;';
                var removeBtn = document.createElement('button');
                removeBtn.innerHTML = '✕';
                removeBtn.style.cssText = 'position:absolute; top:3px; right:3px; background:#ff4757; color:white; border:none; border-radius:50%; width:20px; height:20px; font-size:11px; cursor:pointer;';
                removeBtn.onclick = function(ev) { ev.stopPropagation(); wrapper.remove(); };
                wrapper.appendChild(mediaElement);
                wrapper.appendChild(removeBtn);
                previewContainer.appendChild(wrapper);
            };
            reader.readAsDataURL(file);
        });
    };

    submitBtn.onclick = async function() {
        var files = fileInput.files;
        var caption = captionInput ? captionInput.value.trim() : '';

        if (files.length === 0) {
            showToast('Vui lòng chọn ít nhất 1 ảnh/video');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Đang đăng...';

        try {
            var mediaUrls = [];
            for (var i = 0; i < files.length; i++) {
                var uploadedUrl = await uploadImageToImgBB(files[i]);
                mediaUrls.push(uploadedUrl);
            }

            var userSnap = await getDoc(doc(db, "users", currentUser.uid));
            var userData = userSnap.data();

            await addDoc(collection(db, "posts"), {
                uid: currentUser.uid,
                ownerId: currentUser.uid,
                username: userData.displayName,
                userAvatar: userData.photoURL,
                mediaUrls: mediaUrls,
                mediaUrl: mediaUrls[0],
                postUrl: mediaUrls[0],
                mediaType: files[0].type.startsWith('video') ? 'video' : 'image',
                caption: caption,
                likes: [],
                comments: [],
                status: 'pending',
                createdAt: serverTimestamp()
            });

            fileInput.value = '';
            previewContainer.innerHTML = '<p style="color:#aaa; font-size:14px;">Ảnh xem trước sẽ hiển thị ở đây</p>';
            if (captionInput) captionInput.value = '';
            showToast('Bài viết đã được gửi, đang chờ admin duyệt!');
            navigateTo('home');
        } catch (error) {
            showToast('Lỗi đăng bài: ' + error.message);
            console.error('Lỗi đăng bài:', error);
        }

        submitBtn.disabled = false;
        submitBtn.textContent = 'Đăng';
    };
}

// =============================================
// EXPLORE: TẢI TRANG KHÁM PHÁ
// =============================================
async function loadExplorePage() {
    var searchResults = document.getElementById('search-results');
    if (!searchResults) return;
    searchResults.innerHTML = '';

    try {
        var postsQuery = query(collection(db, "posts"), where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(12));
        var postsSnap = await getDocs(postsQuery);
        postsSnap.forEach(function(docSnap) {
            var postData = docSnap.data();
            var imageEl = document.createElement('img');
            imageEl.src = postData.mediaUrls ? postData.mediaUrls[0] : (postData.mediaUrl || 'https://via.placeholder.com/400');
            imageEl.style.cssText = 'width:100%; aspect-ratio:1/1; object-fit:cover; cursor:pointer;';
            imageEl.onclick = function() { loadProfilePage(postData.uid); };
            searchResults.appendChild(imageEl);
        });
    } catch (error) {
        console.error('Lỗi tải explore:', error);
    }
}

// =============================================
// TÌM KIẾM NGƯỜI DÙNG
// =============================================
function setupSearchFunctionality() {
    var searchInput = document.getElementById('search-input');
    var searchResults = document.getElementById('search-results');
    if (!searchInput || !searchResults) return;

    searchInput.addEventListener('input', async function() {
        var keyword = searchInput.value.trim().toLowerCase();
        if (keyword === '') {
            loadExplorePage();
            return;
        }

        if (!allUsersCache) {
            var usersSnap = await getDocs(collection(db, "users"));
            allUsersCache = [];
            usersSnap.forEach(function(docSnap) {
                if (docSnap.id !== currentUser.uid) {
                    allUsersCache.push({ id: docSnap.id, data: docSnap.data() });
                }
            });
        }

        var filteredUsers = allUsersCache.filter(function(userEntry) {
            return (userEntry.data.displayName && userEntry.data.displayName.toLowerCase().includes(keyword)) ||
                   (userEntry.data.username && userEntry.data.username.toLowerCase().includes(keyword));
        });

        searchResults.innerHTML = '';
        if (filteredUsers.length === 0) {
            searchResults.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Không tìm thấy người dùng</div>';
            return;
        }

        filteredUsers.forEach(function(userEntry) {
            var userDiv = document.createElement('div');
            userDiv.className = 'search-result';
            userDiv.dataset.uid = userEntry.id;
            userDiv.innerHTML = `
                <img src="${userEntry.data.photoURL || 'https://via.placeholder.com/44'}" style="width:44px;height:44px;border-radius:50%;">
                <div>
                    <div style="font-weight:600;">${userEntry.data.displayName}</div>
                    <div style="color:#888; font-size:12px;">@${userEntry.data.username}</div>
                    <div style="font-size:12px; color:#888;">${userEntry.data.bio || ''}</div>
                </div>
            `;
            userDiv.addEventListener('click', function() {
                loadProfilePage(userEntry.id);
                navigateTo('profile');
            });
            searchResults.appendChild(userDiv);
        });
    });
}

// =============================================
// PROFILE: TẢI TRANG CÁ NHÂN
// =============================================
async function loadProfilePage(uid) {
    var profileContainer = document.getElementById('profile-content');
    if (!profileContainer) return;
    profileContainer.innerHTML = 'Đang tải...';

    var userRef = doc(db, "users", uid);
    var userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        profileContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Người dùng không tồn tại</div>';
        return;
    }

    var userData = userSnap.data();
    var isOwner = (uid === currentUser.uid);
    var isCurrentlyFollowing = userData.followers ? (userData.followers[currentUser.uid] === true) : false;
    var followersCount = userData.followers ? Object.keys(userData.followers).length : 0;
    var followingCount = userData.following ? Object.keys(userData.following).length : 0;

    profileContainer.innerHTML = `
        <div class="profile-header">
            <img class="profile-avatar" src="${userData.photoURL || 'https://via.placeholder.com/150'}">
            <div class="profile-info">
                <h2>${userData.displayName} ${userData.isVerified ? '✅' : ''}</h2>
                <p>@${userData.username}</p>
                <div class="profile-stats">
                    <div><span>${followersCount}</span> followers</div>
                    <div><span>${followingCount}</span> following</div>
                </div>
                <p>${userData.bio || ''}</p>
                <p style="font-size:12px; color:#888;">📍 ${userData.location || 'Chưa có địa điểm'}</p>
                <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">
                    ${isOwner ? '<button class="btn" id="edit-profile-btn">Chỉnh sửa hồ sơ</button>' : `
                        <button class="btn" id="follow-btn" style="background:${isCurrentlyFollowing ? '#fafafa' : '#0095f6'}; color:${isCurrentlyFollowing ? '#262626' : 'white'}; font-weight:600;">
                            ${isCurrentlyFollowing ? 'Bỏ theo dõi' : 'Theo dõi'}
                        </button>
                        <button class="btn" id="msg-btn" style="background:#0095f6; color:white;">Nhắn tin</button>
                        <button class="call-btn" id="call-btn">📞 Gọi</button>
                        <button class="video-call-btn" id="video-call-btn">📹 Video</button>
                    `}
                </div>
            </div>
        </div>
        <div class="profile-grid" id="profile-grid"></div>
    `;

    var profileGrid = document.getElementById('profile-grid');
    try {
        var userPostsQuery = query(collection(db, "posts"), where("uid", "==", uid), where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(12));
        var userPostsSnap = await getDocs(userPostsQuery);
        profileGrid.innerHTML = '';
        userPostsSnap.forEach(function(docSnap) {
            var postData = docSnap.data();
            var postImage = document.createElement('img');
            postImage.src = postData.mediaUrls ? postData.mediaUrls[0] : (postData.mediaUrl || 'https://via.placeholder.com/400');
            postImage.style.cssText = 'width:100%; aspect-ratio:1/1; object-fit:cover; cursor:pointer;';
            postImage.onclick = function() { alert(postData.caption || 'Không có caption'); };
            profileGrid.appendChild(postImage);
        });
        if (profileGrid.innerHTML === '') {
            profileGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:20px; color:#888;">Chưa có bài viết</div>';
        }
    } catch (error) {
        console.error('Lỗi tải bài viết profile:', error);
    }

    if (isOwner) {
        var editBtn = document.getElementById('edit-profile-btn');
        if (editBtn) {
            editBtn.onclick = function() {
                document.getElementById('edit-modal').style.display = 'flex';
                document.getElementById('edit-displayname').value = userData.displayName || '';
                document.getElementById('edit-username').value = userData.username || '';
                document.getElementById('edit-bio').value = userData.bio || '';
                document.getElementById('edit-location').value = userData.location || '';
            };
        }
    } else {
        var followBtn = document.getElementById('follow-btn');
        if (followBtn) {
            followBtn.onclick = async function() {
                var targetRef = doc(db, "users", uid);
                var myRef = doc(db, "users", currentUser.uid);
                if (isCurrentlyFollowing) {
                    await updateDoc(targetRef, { ['followers.' + currentUser.uid]: false });
                    await updateDoc(myRef, { ['following.' + uid]: false });
                    showToast('Đã bỏ theo dõi');
                } else {
                    await updateDoc(targetRef, { ['followers.' + currentUser.uid]: true });
                    await updateDoc(myRef, { ['following.' + uid]: true });
                    sendNotification(uid, 'follow', currentUser.displayName + ' đã theo dõi bạn');
                    showToast('Đã theo dõi');
                }
                loadProfilePage(uid);
            };
        }

        var msgBtn = document.getElementById('msg-btn');
        if (msgBtn) {
            msgBtn.onclick = function() {
                document.getElementById('chat-modal').style.display = 'flex';
                openChatWithUser(uid, userData.displayName);
            };
        }

        var callBtn = document.getElementById('call-btn');
        if (callBtn) {
            callBtn.onclick = function() {
                var roomId = [currentUser.uid, uid].sort().join('_');
                startCall(roomId, true);
            };
        }

        var videoCallBtn = document.getElementById('video-call-btn');
        if (videoCallBtn) {
            videoCallBtn.onclick = function() {
                var roomId = [currentUser.uid, uid].sort().join('_');
                startCall(roomId, false);
            };
        }
    }
}

// =============================================
// CHỈNH SỬA HỒ SƠ
// =============================================
function setupEditProfile() {
    var saveEditBtn = document.getElementById('save-edit');
    if (!saveEditBtn) return;

    saveEditBtn.onclick = async function() {
        var updates = {
            displayName: document.getElementById('edit-displayname').value.trim(),
            username: document.getElementById('edit-username').value.trim(),
            bio: document.getElementById('edit-bio').value.trim(),
            location: document.getElementById('edit-location').value.trim()
        };

        var avatarFile = document.getElementById('edit-avatar').files[0];
        if (avatarFile) {
            try {
                var avatarUrl = await uploadImageToImgBB(avatarFile);
                updates.photoURL = avatarUrl;
                updates.avatarUrl = avatarUrl;
            } catch (error) {
                showToast('Lỗi upload avatar: ' + error.message);
                return;
            }
        }

        await updateDoc(doc(db, "users", currentUser.uid), updates);
        document.getElementById('edit-modal').style.display = 'none';
        loadProfilePage(currentUser.uid);
        showToast('Đã cập nhật hồ sơ!');
    };
}

// =============================================
// REELS: TẢI VIDEO NGẮN
// =============================================
async function loadReelsPage() {
    var reelsContainer = document.getElementById('reels-container');
    if (!reelsContainer) return;
    reelsContainer.innerHTML = '';

    try {
        var reelsQuery = query(collection(db, "posts"), where("mediaType", "==", "video"), where("status", "==", "approved"), orderBy("createdAt", "desc"), limit(10));
        var reelsSnap = await getDocs(reelsQuery);
        reelsSnap.forEach(function(docSnap) {
            var reelData = docSnap.data();
            var reelDiv = document.createElement('div');
            reelDiv.className = 'reel-item';
            reelDiv.innerHTML = '<video src="' + reelData.mediaUrls[0] + '" controls style="width:100%; height:100%; object-fit:contain;"></video>';
            reelsContainer.appendChild(reelDiv);
        });
    } catch (error) {
        console.error('Lỗi tải reels:', error);
    }
}

// =============================================
// NOTIFICATIONS: LẮNG NGHE THÔNG BÁO
// =============================================
function listenForNotifications() {
    var notifQuery = query(collection(db, "notifications"), where("to", "==", currentUser.uid), orderBy("createdAt", "desc"), limit(20));
    unsubscribes['notifications'] = onSnapshot(notifQuery, function(snapshot) {
        var unreadCount = 0;
        snapshot.forEach(function(docSnap) {
            if (!docSnap.data().read) unreadCount++;
        });
        var notifBadge = document.getElementById('notif-btn');
        if (notifBadge) {
            notifBadge.setAttribute('data-count', unreadCount);
        }
    });
}

// =============================================
// GỬI THÔNG BÁO
// =============================================
async function sendNotification(toUserId, type, message) {
    await addDoc(collection(db, "notifications"), {
        to: toUserId,
        from: currentUser.uid,
        type: type,
        message: message,
        read: false,
        createdAt: serverTimestamp()
    });
}

// =============================================
// CHAT: MỞ CHAT VỚI USER
// =============================================
async function openChatWithUser(targetUid, targetDisplayName) {
    currentChatUser = targetUid;
    document.getElementById('chat-list').style.display = 'none';
    document.getElementById('chat-window').style.display = 'flex';
    document.getElementById('chat-username').textContent = targetDisplayName;
    loadChatMessages();
}

// =============================================
// CHAT: TẢI TIN NHẮN REALTIME
// =============================================
function loadChatMessages() {
    var chatId = [currentUser.uid, currentChatUser].sort().join('_');
    if (unsubscribes['chat_' + chatId]) {
        unsubscribes['chat_' + chatId]();
    }

    var messagesQuery = query(collection(db, "messages"), where("chatId", "==", chatId), orderBy("createdAt"));
    unsubscribes['chat_' + chatId] = onSnapshot(messagesQuery, function(snapshot) {
        var messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;
        messagesContainer.innerHTML = '';

        snapshot.forEach(function(docSnap) {
            var messageData = docSnap.data();
            var messageRow = document.createElement('div');
            messageRow.className = 'message-row ' + (messageData.from === currentUser.uid ? 'sent' : 'received');
            messageRow.innerHTML = '<div class="message-bubble">' + messageData.text + '</div>';
            messagesContainer.appendChild(messageRow);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// =============================================
// CHAT: GỬI TIN NHẮN
// =============================================
function setupChatSendButton() {
    var chatSendBtn = document.getElementById('chat-send-btn');
    var chatInput = document.getElementById('chat-input');

    if (!chatSendBtn || !chatInput) return;

    chatSendBtn.onclick = async function() {
        var text = chatInput.value.trim();
        if (!text || !currentChatUser) return;

        var chatId = [currentUser.uid, currentChatUser].sort().join('_');
        await addDoc(collection(db, "messages"), {
            chatId: chatId,
            from: currentUser.uid,
            senderId: currentUser.uid,
            to: currentChatUser,
            text: text,
            type: 'text',
            createdAt: serverTimestamp(),
            timestamp: serverTimestamp()
        });
        chatInput.value = '';
    };

    chatInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            chatSendBtn.click();
        }
    });
}

// =============================================
// CHAT: TẢI DANH SÁCH BẠN BÈ
// =============================================
async function loadChatList() {
    var chatListContainer = document.getElementById('chat-list');
    var chatWindowContainer = document.getElementById('chat-window');
    if (!chatListContainer) return;

    chatListContainer.style.display = 'block';
    chatWindowContainer.style.display = 'none';

    var userSnap = await getDoc(doc(db, "users", currentUser.uid));
    var followingMap = userSnap.data().following || {};
    chatListContainer.innerHTML = '<h4 style="padding:10px;">Danh sách bạn bè</h4>';

    for (var uid in followingMap) {
        if (!followingMap[uid]) continue;
        var friendSnap = await getDoc(doc(db, "users", uid));
        if (!friendSnap.exists()) continue;
        var friendData = friendSnap.data();
        var friendDiv = document.createElement('div');
        friendDiv.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px; border-bottom:1px solid #efefef; cursor:pointer;';
        friendDiv.innerHTML = '<img src="' + (friendData.photoURL || 'https://via.placeholder.com/44') + '" style="width:44px;height:44px;border-radius:50%;"><span>' + friendData.displayName + '</span>';
        friendDiv.onclick = function() {
            openChatWithUser(uid, friendData.displayName);
        };
        chatListContainer.appendChild(friendDiv);
    }
}

// =============================================
// CALL: GỌI ĐIỆN / VIDEO CALL (JITSI MEET)
// =============================================
function startCall(roomName, audioOnly) {
    var callModal = document.getElementById('call-modal');
    var jitsiContainer = document.getElementById('jitsi-container');

    if (!callModal || !jitsiContainer) return;

    callModal.style.display = 'flex';
    jitsiContainer.innerHTML = '';

    var domain = 'meet.jit.si';
    var options = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainer,
        configOverwrite: {
            startWithVideoMuted: audioOnly,
            startWithAudioMuted: false
        },
        interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false
        }
    };

    if (window.JitsiMeetExternalAPI) {
        new window.JitsiMeetExternalAPI(domain, options);
    } else {
        var jitsiScript = document.createElement('script');
        jitsiScript.src = 'https://meet.jit.si/external_api.js';
        jitsiScript.async = true;
        jitsiScript.onload = function() {
            new window.JitsiMeetExternalAPI(domain, options);
        };
        document.body.appendChild(jitsiScript);
    }

    var closeCallBtn = document.getElementById('close-call');
    if (closeCallBtn) {
        closeCallBtn.onclick = function() {
            callModal.style.display = 'none';
            jitsiContainer.innerHTML = '';
        };
    }
}

// =============================================
// SIDEBAR MENU
// =============================================
function setupSidebarMenu() {
    var menuBtn = document.getElementById('menu-btn');
    var closeMenuBtn = document.getElementById('close-menu');
    var menuOverlay = document.getElementById('menu-overlay');
    var sideMenu = document.getElementById('side-menu');

    if (!menuBtn || !sideMenu) return;

    menuBtn.onclick = function() {
        sideMenu.classList.add('open');
        menuOverlay.classList.add('show');
    };

    closeMenuBtn.onclick = function() {
        sideMenu.classList.remove('open');
        menuOverlay.classList.remove('show');
    };

    menuOverlay.onclick = function() {
        sideMenu.classList.remove('open');
        menuOverlay.classList.remove('show');
    };

    var menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(function(item) {
        item.onclick = function() {
            var action = item.getAttribute('data-action');
            if (action === 'profile') navigateTo('profile');
            else if (action === 'edit-profile') {
                document.getElementById('edit-modal').style.display = 'flex';
                getDoc(doc(db, "users", currentUser.uid)).then(function(snap) {
                    var data = snap.data();
                    document.getElementById('edit-displayname').value = data.displayName || '';
                    document.getElementById('edit-username').value = data.username || '';
                    document.getElementById('edit-bio').value = data.bio || '';
                    document.getElementById('edit-location').value = data.location || '';
                });
            } else if (action === 'logout') {
                if (confirm('Đăng xuất?')) signOut(auth);
            }
            sideMenu.classList.remove('open');
            menuOverlay.classList.remove('show');
        };
    });
}

// =============================================
// KHỞI TẠO TẤT CẢ CÁC SỰ KIỆN KHI TRANG TẢI XONG
// =============================================
function initializeApp() {
    setupAuthListeners();
    setupAuthStateObserver();
    setupBottomNavigation();
    setupPostUpload();
    setupSearchFunctionality();
    setupEditProfile();
    setupChatSendButton();
    setupSidebarMenu();

    var chatBtn = document.getElementById('chat-btn');
    if (chatBtn) {
        chatBtn.onclick = function() {
            document.getElementById('chat-modal').style.display = 'flex';
            loadChatList();
        };
    }

    var chatCloseBtn = document.getElementById('chat-close-btn');
    if (chatCloseBtn) {
        chatCloseBtn.onclick = function() {
            document.getElementById('chat-modal').style.display = 'none';
        };
    }

    document.getElementById('page-home').addEventListener('scroll', function() {
        if (this.scrollHeight - this.scrollTop - this.clientHeight < 100 && !isLoadingPosts) {
            fetchMorePosts();
        }
    });

    document.getElementById('save-edit').addEventListener('click', async function() {
        var updates = {
            displayName: document.getElementById('edit-displayname').value.trim(),
            username: document.getElementById('edit-username').value.trim(),
            bio: document.getElementById('edit-bio').value.trim(),
            location: document.getElementById('edit-location').value.trim()
        };
        var avatarFile = document.getElementById('edit-avatar').files[0];
        if (avatarFile) {
            try {
                var avatarUrl = await uploadImageToImgBB(avatarFile);
                updates.photoURL = avatarUrl;
                updates.avatarUrl = avatarUrl;
            } catch (error) {
                showToast('Lỗi upload avatar: ' + error.message);
                return;
            }
        }
        await updateDoc(doc(db, "users", currentUser.uid), updates);
        document.getElementById('edit-modal').style.display = 'none';
        loadProfilePage(currentUser.uid);
        showToast('Đã cập nhật hồ sơ!');
    });

    console.log('✅ Dunukha App đã được khởi tạo hoàn chỉnh!');
}

// =============================================
// GỌI HÀM KHỞI TẠO KHI DOM SẴN SÀNG
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Export để file khác dùng nếu cần
export { initializeApp, navigateTo, loadProfilePage, showToast };
