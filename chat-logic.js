// =============================================
// FILE: chat-logic.js
// MÔ TẢ: Xử lý toàn bộ logic nhắn tin realtime và gọi điện
// =============================================

import {
    db, auth, collection, addDoc, doc, getDoc, getDocs,
    query, where, orderBy, limit, onSnapshot, serverTimestamp, arrayUnion, updateDoc
} from "./firebase-config.js";

// =============================================
// BIẾN TOÀN CỤC CHO CHAT
// =============================================
let currentChatUser = null;
let unsubscribes = {};

// =============================================
// LẤY DANH SÁCH CUỘC HỘI THOẠI
// =============================================
async function loadChatList() {
    var currentUser = auth.currentUser;
    if (!currentUser) return;

    var chatListContainer = document.getElementById('chat-list');
    var chatWindowContainer = document.getElementById('chat-window');

    if (!chatListContainer || !chatWindowContainer) return;

    chatListContainer.style.display = 'block';
    chatWindowContainer.style.display = 'none';

    var userSnap = await getDoc(doc(db, "users", currentUser.uid));
    var followingMap = userSnap.data().following || {};

    chatListContainer.innerHTML = '<h4 style="padding:15px; border-bottom:1px solid #efefef;">💬 Danh sách nhắn tin</h4>';

    for (var friendUid in followingMap) {
        if (!followingMap[friendUid]) continue;

        var friendSnap = await getDoc(doc(db, "users", friendUid));
        if (!friendSnap.exists()) continue;

        var friendData = friendSnap.data();
        var friendRow = document.createElement('div');
        friendRow.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 14px 15px;
            border-bottom: 1px solid #f0f0f0;
            cursor: pointer;
            transition: background 0.2s;
        `;
        friendRow.onmouseenter = function() { this.style.background = '#f9f9f9'; };
        friendRow.onmouseleave = function() { this.style.background = 'transparent'; };

        friendRow.innerHTML = `
            <img src="${friendData.photoURL || 'https://via.placeholder.com/44'}"
                 style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:600; font-size:15px;">${friendData.displayName}</div>
                <div style="font-size:13px; color:#888;">@${friendData.username}</div>
            </div>
            <i class="fas fa-chevron-right" style="color:#ccc;"></i>
        `;

        friendRow.onclick = function() {
            openChatWithUser(friendUid, friendData.displayName);
        };

        chatListContainer.appendChild(friendRow);
    }

    if (chatListContainer.querySelectorAll('div').length <= 1) {
        chatListContainer.innerHTML += '<div style="text-align:center; padding:30px; color:#888;">Bạn chưa theo dõi ai để nhắn tin</div>';
    }
}

// =============================================
// MỞ CUỘC TRÒ CHUYỆN VỚI NGƯỜI DÙNG
// =============================================
function openChatWithUser(targetUid, targetDisplayName) {
    currentChatUser = targetUid;

    var chatListContainer = document.getElementById('chat-list');
    var chatWindowContainer = document.getElementById('chat-window');
    var chatUsernameElement = document.getElementById('chat-username');

    if (!chatListContainer || !chatWindowContainer) return;

    chatListContainer.style.display = 'none';
    chatWindowContainer.style.display = 'flex';

    if (chatUsernameElement) {
        chatUsernameElement.textContent = targetDisplayName || 'Chat';
    }

    loadChatMessagesRealtime();
}

// =============================================
// TẢI TIN NHẮN REALTIME VỚI onSnapshot
// =============================================
function loadChatMessagesRealtime() {
    var currentUser = auth.currentUser;
    if (!currentUser || !currentChatUser) return;

    var chatId = [currentUser.uid, currentChatUser].sort().join('_');

    if (unsubscribes['chat_' + chatId]) {
        unsubscribes['chat_' + chatId]();
        unsubscribes['chat_' + chatId] = null;
    }

    var messagesQuery = query(
        collection(db, "messages"),
        where("chatId", "==", chatId),
        orderBy("createdAt"),
        limit(50)
    );

    unsubscribes['chat_' + chatId] = onSnapshot(messagesQuery, function(snapshot) {
        var messagesContainer = document.getElementById('chat-messages');
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';

        snapshot.forEach(function(docSnapshot) {
            var messageData = docSnapshot.data();
            var isSentByMe = (messageData.from === currentUser.uid);

            var messageRow = document.createElement('div');
            messageRow.className = 'message-row ' + (isSentByMe ? 'sent' : 'received');

            var messageBubble = document.createElement('div');
            messageBubble.className = 'message-bubble';

            if (messageData.type === 'image') {
                var msgImage = document.createElement('img');
                msgImage.src = messageData.text;
                msgImage.style.cssText = 'max-width:200px; border-radius:10px; cursor:pointer;';
                msgImage.onclick = function() {
                    openImageFullscreen(messageData.text);
                };
                messageBubble.appendChild(msgImage);
            } else if (messageData.type === 'video') {
                var msgVideo = document.createElement('video');
                msgVideo.src = messageData.text;
                msgVideo.controls = true;
                msgVideo.style.cssText = 'max-width:200px; border-radius:10px;';
                messageBubble.appendChild(msgVideo);
            } else if (messageData.type === 'call_log') {
                messageBubble.innerHTML = '📞 <em>' + messageData.text + '</em>';
                messageBubble.style.background = '#fff3cd';
                messageBubble.style.color = '#856404';
            } else {
                messageBubble.textContent = messageData.text;
            }

            var messageTime = document.createElement('div');
            messageTime.style.cssText = 'font-size:10px; color:' + (isSentByMe ? '#rgba(255,255,255,0.7)' : '#999') + '; margin-top:4px;';
            if (messageData.createdAt) {
                var msgDate = messageData.createdAt.toDate ? messageData.createdAt.toDate() : new Date(messageData.createdAt);
                messageTime.textContent = formatMessageTime(msgDate);
            }
            messageBubble.appendChild(messageTime);

            messageRow.appendChild(messageBubble);
            messagesContainer.appendChild(messageRow);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// =============================================
// GỬI TIN NHẮN MỚI
// =============================================
async function sendMessage(text, type, mediaUrl) {
    var currentUser = auth.currentUser;
    if (!currentUser || !currentChatUser) return;

    var chatId = [currentUser.uid, currentChatUser].sort().join('_');

    var messageData = {
        chatId: chatId,
        from: currentUser.uid,
        senderId: currentUser.uid,
        to: currentChatUser,
        type: type || 'text',
        createdAt: serverTimestamp(),
        timestamp: serverTimestamp()
    };

    if (type === 'text') {
        messageData.text = text;
    } else if (type === 'image' || type === 'video') {
        messageData.text = mediaUrl;
    } else if (type === 'call_log') {
        messageData.text = text;
    }

    await addDoc(collection(db, "messages"), messageData);

    await updateDoc(doc(db, "chats", chatId), {
        lastMessage: text || ('Đã gửi ' + (type === 'image' ? 'một ảnh' : type === 'video' ? 'một video' : 'một tin nhắn')),
        updatedAt: serverTimestamp(),
        users: [currentUser.uid, currentChatUser]
    });
}

// =============================================
// ĐỊNH DẠNG THỜI GIAN TIN NHẮN
// =============================================
function formatMessageTime(date) {
    var now = new Date();
    var isToday = date.toDateString() === now.toDateString();
    var hours = date.getHours().toString().padStart(2, '0');
    var minutes = date.getMinutes().toString().padStart(2, '0');

    if (isToday) {
        return hours + ':' + minutes;
    } else {
        var day = date.getDate().toString().padStart(2, '0');
        var month = (date.getMonth() + 1).toString().padStart(2, '0');
        return day + '/' + month + ' ' + hours + ':' + minutes;
    }
}

// =============================================
// MỞ ẢNH TOÀN MÀN HÌNH
// =============================================
function openImageFullscreen(imageUrl) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.9); z-index:10000; display:flex; justify-content:center; align-items:center;';
    overlay.onclick = function() { overlay.remove(); };

    var fullImage = document.createElement('img');
    fullImage.src = imageUrl;
    fullImage.style.cssText = 'max-width:90%; max-height:90%; object-fit:contain; border-radius:8px;';

    overlay.appendChild(fullImage);
    document.body.appendChild(overlay);
}

// =============================================
// GỌI ĐIỆN / VIDEO CALL (JITSI MEET)
// =============================================
function startCall(roomName, audioOnly) {
    var currentUser = auth.currentUser;
    if (!currentUser || !currentChatUser) return;

    var callModal = document.getElementById('call-modal');
    var jitsiContainer = document.getElementById('jitsi-container');

    if (!callModal || !jitsiContainer) return;

    callModal.style.display = 'flex';
    jitsiContainer.innerHTML = '';

    var domain = 'meet.jit.si';
    var callOptions = {
        roomName: roomName,
        width: '100%',
        height: '100%',
        parentNode: jitsiContainer,
        configOverwrite: {
            startWithVideoMuted: audioOnly,
            startWithAudioMuted: false,
            prejoinPageEnabled: false
        },
        interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_BUTTONS: ['microphone', 'camera', 'desktop', 'hangup', 'tileview']
        }
    };

    if (window.JitsiMeetExternalAPI) {
        var api = new window.JitsiMeetExternalAPI(domain, callOptions);
        api.addListener('readyToClose', function() {
            callModal.style.display = 'none';
            jitsiContainer.innerHTML = '';
        });
    } else {
        var scriptTag = document.createElement('script');
        scriptTag.src = 'https://meet.jit.si/external_api.js';
        scriptTag.async = true;
        scriptTag.onload = function() {
            var api = new window.JitsiMeetExternalAPI(domain, callOptions);
            api.addListener('readyToClose', function() {
                callModal.style.display = 'none';
                jitsiContainer.innerHTML = '';
            });
        };
        document.body.appendChild(scriptTag);
    }

    var closeCallButton = document.getElementById('close-call');
    if (closeCallButton) {
        closeCallButton.onclick = function() {
            callModal.style.display = 'none';
            jitsiContainer.innerHTML = '';
        };
    }

    var callType = audioOnly ? 'Gọi thoại' : 'Gọi video';
    sendMessage('Cuộc gọi ' + callType + ' (' + new Date().toLocaleTimeString() + ')', 'call_log', null);
}

// =============================================
// THIẾT LẬP SỰ KIỆN CHO NÚT GỌI TRONG CHAT
// =============================================
function setupCallButtons() {
    var audioCallBtn = document.getElementById('chat-call-btn');
    var videoCallBtn = document.getElementById('chat-video-btn');

    if (audioCallBtn) {
        audioCallBtn.onclick = function() {
            if (!currentChatUser) return;
            var roomId = [auth.currentUser.uid, currentChatUser].sort().join('_');
            startCall(roomId, true);
        };
    }

    if (videoCallBtn) {
        videoCallBtn.onclick = function() {
            if (!currentChatUser) return;
            var roomId = [auth.currentUser.uid, currentChatUser].sort().join('_');
            startCall(roomId, false);
        };
    }
}

// =============================================
// THIẾT LẬP NÚT GỬI TIN NHẮN
// =============================================
function setupMessageSendButton() {
    var sendButton = document.getElementById('chat-send-btn');
    var chatInput = document.getElementById('chat-input');

    if (!sendButton || !chatInput) return;

    sendButton.onclick = function() {
        var text = chatInput.value.trim();
        if (!text) return;
        sendMessage(text, 'text', null);
        chatInput.value = '';
        chatInput.focus();
    };

    chatInput.addEventListener('keypress', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendButton.click();
        }
    });
}

// =============================================
// THIẾT LẬP NÚT MỞ MODAL CHAT
// =============================================
function setupChatModalTrigger() {
    var chatTriggerBtn = document.getElementById('chat-btn');
    var chatModal = document.getElementById('chat-modal');
    var chatCloseBtn = document.getElementById('chat-close-btn');
    var chatModalOverlay = document.getElementById('chat-modal-overlay');

    if (!chatTriggerBtn || !chatModal) return;

    chatTriggerBtn.onclick = function() {
        chatModal.style.display = 'flex';
        loadChatList();
    };

    if (chatCloseBtn) {
        chatCloseBtn.onclick = function() {
            chatModal.style.display = 'none';
        };
    }

    if (chatModalOverlay) {
        chatModalOverlay.onclick = function(event) {
            if (event.target === chatModalOverlay) {
                chatModal.style.display = 'none';
            }
        };
    }
}

// =============================================
// KHỞI TẠO TẤT CẢ CHỨC NĂNG CHAT
// =============================================
function initializeChatModule() {
    setupChatModalTrigger();
    setupMessageSendButton();
    setupCallButtons();
    console.log('✅ Chat Module đã được khởi tạo hoàn chỉnh!');
}

// =============================================
// GỌI KHỞI TẠO KHI DOM SẴN SÀNG
// =============================================
document.addEventListener('DOMContentLoaded', function() {
    initializeChatModule();
});

// Export các hàm để file khác sử dụng
export {
    loadChatList,
    openChatWithUser,
    loadChatMessagesRealtime,
    sendMessage,
    startCall,
    initializeChatModule
};
