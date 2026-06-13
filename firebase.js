// =============================================
// FILE: firebase.js
// Mô tả: Cấu hình Firebase và tham chiếu Database
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, collection, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 🔥 Cấu hình Firebase cho Dunukha
const firebaseConfig = {
  apiKey: "AIzaSyBJ3DAWyschGA6fM5VmBndLI0cGSaFF46U",
  authDomain: "dunukhasite.firebaseapp.com",
  projectId: "dunukhasite",
  storageBucket: "dunukhasite.firebasestorage.app",
  messagingSenderId: "841226738327",
  appId: "1:841226738327:web:5e0192799adbe1179067d2"
};

// Khởi tạo Firebase App
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// =============================================
// THAM CHIẾU COLLECTIONS (Database References)
// =============================================

/**
 * Lấy tham chiếu đến document của user
 * @param {string} uid - ID của user
 */
function userRef(uid) {
  return doc(db, "users", uid);
}

/**
 * Lấy tham chiếu đến collection posts
 */
function postsCollection() {
  return collection(db, "posts");
}

/**
 * Lấy tham chiếu đến collection chats
 */
function chatsCollection() {
  return collection(db, "chats");
}

/**
 * Lấy tham chiếu đến sub-collection messages của một chat
 * @param {string} chatId - ID của chat
 */
function messagesCollection(chatId) {
  return collection(db, "chats", chatId, "messages");
}

/**
 * Lấy tham chiếu đến collection calls
 */
function callsCollection() {
  return collection(db, "calls");
}

// =============================================
// HÀM KHỞI TẠO USER MỚI (nếu chưa tồn tại)
// =============================================

/**
 * Tạo document user mới với cấu trúc chuẩn
 * @param {string} uid - Firebase Auth UID
 * @param {object} data - Dữ liệu ban đầu từ Google/Facebook
 */
async function createUserIfNotExists(uid, data) {
  const userDocRef = userRef(uid);
  const snap = await getDoc(userDocRef);
  
  if (!snap.exists()) {
    // Cấu trúc document users
    await setDoc(userDocRef, {
      uid: uid,                           // ID người dùng
      username: data.email.split('@')[0], // Tên mặc định từ email
      displayName: data.displayName || "Người dùng Dunukha",
      avatarUrl: data.photoURL || "https://via.placeholder.com/150",
      bio: "",                            // Tiểu sử
      website: "",                        // Website cá nhân
      followers: {},                      // Map { uid: true } để dễ kiểm tra
      following: {},                      // Map { uid: true }
      savedPosts: [],                     // Mảng lưu postId đã lưu
      blockedUsers: {},                   // Map { uid: true }
      isPrivate: false,                   // Tài khoản riêng tư?
      isVerified: false,                  // Tích xanh?
      createdAt: new Date().toISOString()
    });
    console.log(`✅ Đã tạo user: ${uid}`);
  }
}

export { db, userRef, postsCollection, chatsCollection, messagesCollection, callsCollection, createUserIfNotExists };
