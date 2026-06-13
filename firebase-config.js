// =============================================
// FILE: firebase-config.js
// DỰ ÁN: Dunukha - Mạng xã hội thế hệ mới
// MÔ TẢ: Cấu hình Firebase SDK v10, khởi tạo các dịch vụ,
//         export biến và viết hàm Helper kiểm tra/tạo user
// =============================================

// =============================================
// PHẦN 1: IMPORT FIREBASE SDK TỪ CDN (phiên bản 10.7.1)
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
    getAuth,
    GoogleAuthProvider,
    FacebookAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
    getFirestore,
    collection,
    addDoc,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    onSnapshot,
    arrayUnion,
    arrayRemove,
    increment,
    serverTimestamp,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
    getStorage,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// =============================================
// PHẦN 2: CẤU HÌNH FIREBASE - THAY THẾ BẰNG THÔNG TIN THẬT CỦA BẠN
// =============================================

const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// =============================================
// PHẦN 3: KHỞI TẠO FIREBASE APP
// =============================================

const app = initializeApp(firebaseConfig);

// =============================================
// PHẦN 4: KHỞI TẠO CÁC DỊCH VỤ FIREBASE
// =============================================

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// =============================================
// PHẦN 5: KHỞI TẠO CÁC PROVIDER ĐĂNG NHẬP MẠNG XÃ HỘI
// =============================================

const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

// Cấu hình thêm cho Google Provider
googleProvider.setCustomParameters({
    prompt: 'select_account'
});

// Cấu hình thêm cho Facebook Provider
facebookProvider.setCustomParameters({
    display: 'popup'
});

// =============================================
// PHẦN 6: CẤU HÌNH IMGBB API (UPLOAD ẢNH MIỄN PHÍ)
// =============================================

const IMGBB_API_KEY = "d4802501f212046a8d74561bbdaf6dd3";

// =============================================
// PHẦN 7: HÀM HELPER CHUYÊN SÂU - KIỂM TRA & TẠO USER
// =============================================

/**
 * Hàm kiểm tra trạng thái user trên Firestore
 * Nếu user chưa tồn tại, tự động tạo mới với các trường dữ liệu chuẩn
 * 
 * @param {string} uid - ID của user từ Firebase Authentication
 * @param {object} userData - Dữ liệu từ auth provider (Google, Facebook, Email)
 * @returns {Promise<object>} - Trả về object chứa dữ liệu user và trạng thái
 */
async function checkUserStatus(uid, userData) {
    // Tham chiếu đến document user trong collection 'users'
    const userRef = doc(db, "users", uid);

    // Kiểm tra xem document đã tồn tại chưa
    const userSnap = await getDoc(userRef);

    // Biến lưu trạng thái trả về
    let userExists = false;
    let userProfile = null;

    if (userSnap.exists()) {
        // Trường hợp 1: User đã tồn tại -> Lấy dữ liệu hiện có
        userExists = true;
        userProfile = userSnap.data();
        console.log("[Dunukha] User đã tồn tại:", userProfile.displayName);
    } else {
        // Trường hợp 2: User chưa tồn tại -> Tạo mới với dữ liệu mặc định
        const defaultUserProfile = {
            uid: uid,
            displayName: userData.displayName || userData.email?.split('@')[0] || "Người dùng Dunukha",
            email: userData.email || "",
            photoURL: userData.photoURL || "https://via.placeholder.com/150",
            avatarUrl: userData.photoURL || "https://via.placeholder.com/150",
            username: userData.email ? userData.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') : ("dunukha_user_" + uid.slice(0, 8)),
            bio: "",
            location: "",
            website: "",
            phoneNumber: userData.phoneNumber || "",
            followers: {},
            following: {},
            savedPosts: [],
            blockedUsers: {},
            isPrivate: false,
            isVerified: false,
            isOnline: false,
            lastSeen: serverTimestamp(),
            depositStatus: "none",
            depositAmount: 0,
            depositDate: null,
            refundDate: null,
            violationCount: 0,
            totalPosts: 0,
            totalLikes: 0,
            totalComments: 0,
            accountType: "free",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        // Lưu document mới vào Firestore
        await setDoc(userRef, defaultUserProfile);
        userExists = false;
        userProfile = defaultUserProfile;
        console.log("[Dunukha] Đã tạo user mới:", defaultUserProfile.displayName);
    }

    // Trả về kết quả
    return {
        exists: userExists,
        profile: userProfile,
        uid: uid
    };
}

/**
 * Hàm cập nhật trạng thái online của user
 * @param {string} uid - ID của user
 * @param {boolean} isOnline - Trạng thái online
 */
async function updateUserOnlineStatus(uid, isOnline) {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
        isOnline: isOnline,
        lastSeen: serverTimestamp()
    });
}

/**
 * Hàm lấy thông tin user từ Firestore
 * @param {string} uid - ID của user cần lấy thông tin
 * @returns {Promise<object|null>} - Dữ liệu user hoặc null nếu không tồn tại
 */
async function getUserProfile(uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        return {
            id: userSnap.id,
            ...userSnap.data()
        };
    }
    return null;
}

/**
 * Hàm kiểm tra xem user A có đang follow user B không
 * @param {string} followerUid - Người follow
 * @param {string} targetUid - Người được follow
 * @returns {Promise<boolean>}
 */
async function isUserFollowing(followerUid, targetUid) {
    const targetProfile = await getUserProfile(targetUid);
    if (!targetProfile) return false;
    return targetProfile.followers && targetProfile.followers[followerUid] === true;
}

/**
 * Hàm kiểm tra xem user A có bị user B chặn không
 * @param {string} myUid - Người kiểm tra
 * @param {string} targetUid - Người có thể đã chặn
 * @returns {Promise<boolean>}
 */
async function isUserBlocked(myUid, targetUid) {
    const targetProfile = await getUserProfile(targetUid);
    if (!targetProfile) return false;
    return targetProfile.blockedUsers && targetProfile.blockedUsers[myUid] === true;
}

/**
 * Hàm tạo ID ngẫu nhiên cho chat
 * @param {string} uid1 - User 1
 * @param {string} uid2 - User 2
 * @returns {string} - Chat ID duy nhất
 */
function generateChatId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
}

/**
 * Hàm format thời gian hiển thị
 * @param {Date|Timestamp} date - Thời gian cần format
 * @returns {string} - Chuỗi thời gian đã format
 */
function formatRelativeTime(date) {
    if (!date) return 'Không rõ';

    const now = new Date();
    const targetDate = date.toDate ? date.toDate() : new Date(date);
    const diffMs = now - targetDate;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'Vừa xong';
    if (diffMinutes < 60) return diffMinutes + ' phút trước';
    if (diffHours < 24) return diffHours + ' giờ trước';
    if (diffDays === 1) return 'Hôm qua';
    if (diffDays < 7) return diffDays + ' ngày trước';
    return Math.floor(diffDays / 7) + ' tuần trước';
}

// =============================================
// PHẦN 8: EXPORT TẤT CẢ CÁC BIẾN VÀ HÀM
// =============================================

export {
    // Firebase App
    app,

    // Authentication
    auth,
    googleProvider,
    facebookProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,

    // Firestore Database
    db,
    collection,
    addDoc,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    onSnapshot,
    arrayUnion,
    arrayRemove,
    increment,
    serverTimestamp,
    Timestamp,

    // Storage
    storage,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject,

    // ImgBB API
    IMGBB_API_KEY,

    // Helper Functions
    checkUserStatus,
    updateUserOnlineStatus,
    getUserProfile,
    isUserFollowing,
    isUserBlocked,
    generateChatId,
    formatRelativeTime
};

// =============================================
// PHẦN 9: LOG XÁC NHẬN FILE ĐÃ LOAD THÀNH CÔNG
// =============================================

console.log("✅ [Dunukha] firebase-config.js đã được load hoàn chỉnh!");
console.log("📦 Firebase App:", app.name);
console.log("🔐 Auth:", auth.app.name);
console.log("🗄️ Firestore:", db.app.name);
console.log("📁 Storage:", storage.app.name);
