// =============================================
// FILE: search.js
// Mô tả: Tìm kiếm user theo username hoặc displayName
// =============================================

import { collection, query, where, getDocs, orderBy, startAt, endAt } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./firebase.js";

/**
 * Tìm kiếm user theo từ khóa (gõ đến đâu tìm đến đó)
 * Sử dụng Firestore query với orderBy và startAt/endAt
 * @param {string} keyword - Từ khóa tìm kiếm
 * @returns {Promise<Array>} Danh sách user phù hợp
 */
async function searchUsers(keyword) {
  const usersRef = collection(db, "users");
  
  // Tạo query tìm theo username (bạn có thể mở rộng thêm displayName)
  const q = query(
    usersRef,
    orderBy("username"),
    startAt(keyword.toLowerCase()),
    endAt(keyword.toLowerCase() + '\uf8ff')  // Ký tự cuối cùng của Unicode để lấy tất cả bắt đầu bằng keyword
  );
  
  const snapshot = await getDocs(q);
  const results = [];
  
  snapshot.forEach(doc => {
    // Không hiển thị chính mình trong kết quả
    if (doc.id !== currentUser.uid) {
      results.push({ id: doc.id, ...doc.data() });
    }
  });
  
  return results;
}

/**
 * Xử lý sự kiện khi người dùng nhập vào ô tìm kiếm
 * @param {string} inputValue - Giá trị từ ô input
 * @param {function} renderCallback - Hàm render kết quả ra UI
 */
async function onSearchInput(inputValue, renderCallback) {
  if (!inputValue.trim()) {
    renderCallback([]); // Xóa kết quả nếu ô trống
    return;
  }
  
  try {
    const users = await searchUsers(inputValue.trim());
    renderCallback(users);
  } catch (error) {
    console.error("❌ Lỗi khi tìm kiếm:", error);
  }
}

// Export để dùng trong UI
export { searchUsers, onSearchInput };
