// =============================================
// FILE: firebase-config.js
// MÔ TẢ: Cấu hình Firebase SDK v10 và khởi tạo các dịch vụ
// =============================================

// Import Firebase SDK từ CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, signInWithPopup, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, onSnapshot, arrayUnion, arrayRemove, increment, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// =============================================
// CẤU HÌNH FIREBASE - ĐIỀN THÔNG TIN CỦA BẠN VÀO ĐÂY
// =============================================
const firebaseConfig = {
    apiKey: "AIzaSyDURjXMqgt_pVaCcpNUSoCM9KPIR7OmW10",
    authDomain: "dunukhacall.firebaseapp.com",
    databaseURL: "https://dunukhacall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dunukhacall",
    storageBucket: "dunukhacall.firebasestorage.app",
    messagingSenderId: "907574693616",
    appId: "1:907574693616:web:632e8ebc4937842765bc35"
};

// =============================================
// KHỞI TẠO FIREBASE APP
// =============================================
const app = initializeApp(firebaseConfig);

// =============================================
// KHỞI TẠO CÁC DỊCH VỤ
// =============================================
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// =============================================
// PROVIDERS CHO ĐĂNG NHẬP MẠNG XÃ HỘI
// =============================================
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();

// =============================================
// CẤU HÌNH UPLOAD ẢNH (IMGBB API KEY)
// =============================================
const IMGBB_API_KEY = "d4802501f212046a8d74561bbdaf6dd3";

// =============================================
// EXPORT TẤT CẢ CÁC BIẾN VÀ HÀM CẦN THIẾT
// =============================================
export {
    app,
    auth,
    db,
    storage,
    googleProvider,
    facebookProvider,
    IMGBB_API_KEY,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
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
    ref,
    uploadBytesResumable,
    getDownloadURL
};
