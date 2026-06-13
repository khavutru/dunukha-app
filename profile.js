// =============================================
// FILE: profile.js
// Mô tả: Fetch dữ liệu profile, bài viết, follow/unfollow
// =============================================

import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, query, collection, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db, userRef } from "./firebase.js";

/**
 * Lấy thông tin chi tiết của một user từ Firestore
 * @param {string} uid - ID của user cần xem
 * @returns {Promise<object|null>} Dữ liệu user hoặc null nếu không tồn tại
 */
async function getUserProfile(uid) {
  const docRef = userRef(uid);
  const snap = await getDoc(docRef);
  
  if (snap.exists()) {
    return { id: snap.id, ...snap.data() };
  }
  return null;
}

/**
 * Lấy danh sách bài viết của một user
 * @param {string} uid - ID của chủ bài viết
 * @param {number} limit - Số lượng bài viết tối đa (mặc định 12)
 * @returns {Promise<Array>} Danh sách posts
 */
async function getUserPosts(uid, limit = 12) {
  const postsRef = collection(db, "posts");
  const q = query(
    postsRef,
    where("ownerId", "==", uid),
    orderBy("createdAt", "desc"),
    limit(limit)
  );
  
  const snapshot = await getDocs(q);
  const posts = [];
  snapshot.forEach(doc => {
    posts.push({ postId: doc.id, ...doc.data() });
  });
  return posts;
}

/**
 * Kiểm tra xem currentUser có đang follow user mục tiêu hay không
 * @param {string} currentUid - Người đang đăng nhập
 * @param {string} targetUid - Người được kiểm tra
 * @returns {Promise<boolean>}
 */
async function isFollowing(currentUid, targetUid) {
  const userData = await getUserProfile(targetUid);
  return userData?.followers?.[currentUid] === true;
}

/**
 * Xử lý nút Follow/Unfollow, cập nhật cả 2 phía
 * @param {string} currentUid - Người thực hiện hành động
 * @param {string} targetUid - Người được follow/unfollow
 */
async function toggleFollow(currentUid, targetUid) {
  const currentUserRef = userRef(currentUid);
  const targetUserRef = userRef(targetUid);
  
  const following = await isFollowing(currentUid, targetUid);
  
  try {
    if (following) {
      // UNFOLLOW: Xóa khỏi danh sách của cả hai
      await updateDoc(targetUserRef, {
        [`followers.${currentUid}`]: false  // Hoặc xóa hẳn: sử dụng FieldValue.delete()
      });
      await updateDoc(currentUserRef, {
        [`following.${targetUid}`]: false
      });
      console.log(`👤 Đã unfollow ${targetUid}`);
    } else {
      // FOLLOW: Thêm vào danh sách của cả hai
      await updateDoc(targetUserRef, {
        [`followers.${currentUid}`]: true
      });
      await updateDoc(currentUserRef, {
        [`following.${targetUid}`]: true
      });
      console.log(`👤 Đã follow ${targetUid}`);
    }
  } catch (error) {
    console.error("❌ Lỗi khi follow/unfollow:", error);
  }
}

/**
 * Load toàn bộ dữ liệu cho trang cá nhân
 * @param {string} uid - UID cần hiển thị
 * @param {string} currentUid - UID của người đang đăng nhập
 * @returns {Promise<{user: object, posts: Array, isOwner: boolean, isFollowing: boolean}>}
 */
async function loadProfilePage(uid, currentUid) {
  const user = await getUserProfile(uid);
  if (!user) throw new Error("Người dùng không tồn tại");
  
  const posts = await getUserPosts(uid);
  const isOwner = (uid === currentUid);
  const isFollowing = isOwner ? false : await isFollowing(currentUid, uid);
  
  return {
    user,
    posts,
    isOwner,        // Có phải chủ tài khoản không
    isFollowing     // Đã follow chưa (chỉ có ý nghĩa nếu không phải chủ)
  };
}

// Export để dùng trong UI
export { getUserProfile, getUserPosts, toggleFollow, loadProfilePage, isFollowing };
