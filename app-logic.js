// =============================================
// FILE: app-logic.js - DUNUKHA.STORE
// SIÊU GỌN - FULL CODE 100%
// =============================================

// VCONSOLE
(function(){var s=document.createElement('script');s.src='https://unpkg.com/vconsole@latest/dist/vconsole.min.js';s.async=true;s.onload=function(){if(typeof window.VConsole!=='undefined'){new window.VConsole();console.log('[Dunukha] vConsole ready');}};document.head.appendChild(s);})();

// FIREBASE IMPORTS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, FacebookAuthProvider, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, onSnapshot, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDURjXMqgt_pVaCcpNUSoCM9KPIR7OmW10",
    authDomain: "dunukhacall.firebaseapp.com",
    databaseURL: "https://dunukhacall-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "dunukhacall",
    storageBucket: "dunukhacall.firebasestorage.app",
    messagingSenderId: "907574693616",
    appId: "1:907574693616:web:632e8ebc4937842765bc35"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();
const IMGBB_API_KEY = "d4802501f212046a8d74561bbdaf6dd3";
const DEFAULT_AVATAR = 'https://www.gstatic.com/images/branding/product/1x/avatar_anonymous_512dp.png';
const DEFAULT_POST = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=400&fit=crop';

let currentUser = null;
let currentChatUser = null;
let unsubscribes = {};
let allUsersCache = null;
let lastPostDoc = null;
let isLoadingPosts = false;
let selectedFiles = [];

function showToast(msg){var t=document.getElementById('toast');if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}t.textContent=msg;t.classList.add('show');clearTimeout(window._tt);window._tt=setTimeout(function(){t.classList.remove('show');},2500);}
function safeImg(src,fb,cls,st){var i=document.createElement('img');i.src=src||fb;if(cls)i.className=cls;if(st)i.style.cssText=st;i.onerror=function(){this.src=fb;this.onerror=null;};return i;}
function safeShare(title,text,url){if(navigator.share){navigator.share({title:title,text:text,url:url}).catch(function(e){console.log('Share canceled');});}else{prompt('Copy link:',url);}}
async function uploadImgBB(file){var fd=new FormData();fd.append('image',file);var res=await fetch('https://api.imgbb.com/1/upload?key='+IMGBB_API_KEY,{method:'POST',body:fd});var data=await res.json();if(!data.success)throw new Error('Upload fail');return data.data.url;}

// AUTH
function setupAuth(){
    document.getElementById('google-login').onclick=function(){signInWithPopup(auth,googleProvider).catch(function(e){showToast(e.message);});};
    document.getElementById('facebook-login').onclick=function(){signInWithPopup(auth,facebookProvider).catch(function(e){showToast(e.message);});};
    document.getElementById('email-login-btn').onclick=async function(){var em=document.getElementById('login-email').value;var pw=document.getElementById('login-password').value;try{await signInWithEmailAndPassword(auth,em,pw);}catch(e){showToast(e.message);}};
    document.getElementById('email-register-btn').onclick=async function(){var em=document.getElementById('login-email').value;var pw=document.getElementById('login-password').value;try{await createUserWithEmailAndPassword(auth,em,pw);}catch(e){showToast(e.message);}};
    onAuthStateChanged(auth,async function(user){
        if(user){
            currentUser=user;
            document.getElementById('login-screen').style.display='none';
            document.getElementById('app').style.display='flex';
            var ref=doc(db,"users",user.uid);
            var snap=await getDoc(ref);
            if(!snap.exists()){await setDoc(ref,{uid:user.uid,displayName:user.displayName||user.email.split('@')[0],email:user.email||'',photoURL:user.photoURL||DEFAULT_AVATAR,username:user.email?user.email.split('@')[0]:'user'+user.uid.slice(0,6),bio:'',location:'',followers:{},following:{},savedPosts:[],createdAt:serverTimestamp()});}
            navigateTo('home');
            listenNotifications();
        }else{
            currentUser=null;
            document.getElementById('login-screen').style.display='flex';
            document.getElementById('app').style.display='none';
            Object.values(unsubscribes).forEach(function(u){if(u)u();});
            unsubscribes={};
        }
    });
}

// NAVIGATION
function navigateTo(page){
    document.querySelectorAll('.bottom-nav i').forEach(function(i){i.classList.remove('active');});
    var a=document.querySelector('.bottom-nav i[data-page="'+page+'"]');if(a)a.classList.add('active');
    document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
    var t=document.getElementById('page-'+page);if(t)t.classList.add('active');
    if(page==='home'){loadStories();loadFeed();}
    else if(page==='explore')loadExplore();
    else if(page==='reels')loadReels();
    else if(page==='profile'&&currentUser)loadUserProfile(currentUser.uid);
}
document.querySelectorAll('.bottom-nav i').forEach(function(icon){icon.addEventListener('click',function(){navigateTo(this.dataset.page);});});

// STORIES
async function loadStories(){
    var c=document.getElementById('stories');if(!c)return;c.innerHTML='';
    var snap=await getDocs(query(collection(db,"stories"),orderBy("expiresAt","desc")));
    var now=new Date();var map={};
    snap.forEach(function(doc){var d=doc.data();if(d.expiresAt&&d.expiresAt.toDate()>now){if(!map[d.uid])map[d.uid]={stories:[]};map[d.uid].stories.push(d);}});
    for(var uid in map){
        var us=await getDoc(doc(db,"users",uid));if(!us.exists())continue;var u=us.data();
        var div=document.createElement('div');div.className='story-item';
        var av=safeImg(u.photoURL,DEFAULT_AVATAR,'','width:100%;height:100%;border-radius:50%;border:2px solid white;object-fit:cover;');
        var ring=document.createElement('div');ring.className='story-ring';ring.appendChild(av);
        var sp=document.createElement('span');sp.textContent=u.displayName;
        div.appendChild(ring);div.appendChild(sp);
        div.onclick=function(){viewStory(map[uid].stories);};c.appendChild(div);
    }
    var my=document.createElement('div');my.className='story-item';
    my.innerHTML='<div class="story-ring" style="background:#ddd;display:flex;align-items:center;justify-content:center;"><i class="fas fa-plus" style="color:#0095f6;"></i></div><span>Bạn</span>';
    my.onclick=function(){navigateTo('post');};c.appendChild(my);
}
function viewStory(stories){
    var i=0;var modal=document.createElement('div');modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:black;z-index:9999;';
    var img=document.createElement('img');img.style.cssText='width:100%;height:100%;object-fit:contain;';img.onerror=function(){this.src=DEFAULT_POST;};
    var vid=document.createElement('video');vid.style.cssText='width:100%;height:100%;object-fit:contain;';vid.controls=true;vid.autoplay=true;
    var close=document.createElement('button');close.textContent='X';close.style.cssText='position:absolute;top:10px;right:10px;background:white;border:none;border-radius:50%;width:30px;height:30px;';
    close.onclick=function(){clearInterval(timer);modal.remove();};modal.appendChild(close);
    function show(){var s=stories[i];if(s.mediaType==='video'){vid.src=s.mediaUrl;modal.appendChild(vid);if(img.parentNode)img.remove();}else{img.src=s.mediaUrl;modal.appendChild(img);if(vid.parentNode)vid.remove();}}
    show();document.body.appendChild(modal);
    var timer=setInterval(function(){i++;if(i>=stories.length){clearInterval(timer);modal.remove();}else show();},5000);
}

// FEED
function loadFeed(){document.getElementById('feed').innerHTML='';lastPostDoc=null;fetchPosts();}
async function fetchPosts(){
    if(isLoadingPosts)return;isLoadingPosts=true;document.getElementById('feed-loader').style.display='block';
    var q=lastPostDoc?query(collection(db,"posts"),orderBy("createdAt","desc"),startAfter(lastPostDoc),limit(5)):query(collection(db,"posts"),orderBy("createdAt","desc"),limit(5));
    var snap=await getDocs(q);
    if(!snap.empty){snap.forEach(function(doc){renderPost(doc.data(),doc.id);lastPostDoc=doc;});}
    else if(!lastPostDoc){document.getElementById('feed').innerHTML='<div style="text-align:center;padding:40px;color:#888;">Chưa có bài viết.</div>';}
    isLoadingPosts=false;document.getElementById('feed-loader').style.display='none';
}
function renderPost(post,id){
    var feed=document.getElementById('feed');if(!feed)return;
    var isOwner=(post.uid===currentUser.uid||post.ownerId===currentUser.uid);
    var liked=post.likes?post.likes.includes(currentUser.uid):false;
    var div=document.createElement('div');div.className='post';div.setAttribute('data-id',id);
    var media='';if(post.mediaUrls&&post.mediaUrls.length){post.mediaUrls.forEach(function(url){if(url.match(/\.(mp4|webm|ogg|mov)$/i))media+='<video class="post-media" src="'+url+'" controls></video>';else media+='<img class="post-media" src="'+url+'" loading="lazy" onerror="this.src=\''+DEFAULT_POST+'\';">';});}else{media='<img class="post-media" src="'+(post.mediaUrl||post.postUrl||DEFAULT_POST)+'" onerror="this.src=\''+DEFAULT_POST+'\';">';}
    var timeStr='Vừa xong';if(post.createdAt){var d=post.createdAt.toDate?post.createdAt.toDate():new Date(post.createdAt);var now=new Date();var diff=Math.floor((now-d)/1000);if(diff<60)timeStr='Vừa xong';else if(diff<3600)timeStr=Math.floor(diff/60)+' phút';else if(diff<86400)timeStr=Math.floor(diff/3600)+' giờ';else timeStr=Math.floor(diff/86400)+' ngày';}
    div.innerHTML='<div class="post-header" data-uid="'+(post.uid||post.ownerId)+'"><img class="post-avatar" src="'+(post.userAvatar||DEFAULT_AVATAR)+'" onerror="this.src=\''+DEFAULT_AVATAR+'\';"><span class="post-username">'+(post.username||'Người dùng')+'</span><span class="post-time">'+timeStr+'</span><div style="margin-left:auto;position:relative;"><i class="fas fa-ellipsis-v post-menu-trigger" style="cursor:pointer;padding:5px;" data-id="'+id+'"></i><div class="post-menu-dropdown" data-id="'+id+'" style="display:none;position:absolute;right:0;top:30px;background:white;border:1px solid #ddd;border-radius:8px;z-index:100;min-width:150px;padding:5px 0;">'+(isOwner?'<div class="menu-opt" data-action="delete" data-id="'+id+'" style="padding:10px 15px;color:#ed4956;"><i class="fas fa-trash-alt"></i> Xóa</div>':'<div class="menu-opt" data-action="report" data-id="'+id+'" style="padding:10px 15px;color:#e74c3c;"><i class="fas fa-flag"></i> Báo cáo</div>')+'<div class="menu-opt" data-action="copy" data-id="'+id+'" style="padding:10px 15px;"><i class="fas fa-link"></i> Copy link</div></div></div></div><div>'+media+'</div><div class="post-actions"><i id="like-icon-'+id+'" class="'+(liked?'fas fa-heart liked':'far fa-heart')+'" data-id="'+id+'" style="cursor:pointer;"></i><i class="far fa-comment"></i><i class="far fa-paper-plane share-btn" data-id="'+id+'" style="cursor:pointer;"></i><i class="far fa-bookmark save-btn" data-id="'+id+'" style="cursor:pointer;"></i></div><div class="post-likes" id="like-count-'+id+'">'+(post.likes?post.likes.length:0)+' thích</div><div class="post-caption"><strong>'+(post.username||'Người dùng')+'</strong> '+(post.caption||'')+'</div><div class="comment-input"><input id="comment-'+id+'" placeholder="Bình luận..."><button class="send-comment" data-id="'+id+'">Đăng</button></div><div id="comments-'+id+'" style="padding:0 15px 10px;"></div>';
    feed.appendChild(div);
    div.querySelector('.post-header').onclick=function(e){if(e.target.closest('.post-menu-trigger')||e.target.closest('.post-menu-dropdown'))return;var uid=div.querySelector('.post-header').getAttribute('data-uid');if(uid){loadUserProfile(uid);navigateTo('profile');}};
    var trigger=div.querySelector('.post-menu-trigger');var dropdown=div.querySelector('.post-menu-dropdown');
    trigger.onclick=function(e){e.stopPropagation();document.querySelectorAll('.post-menu-dropdown').forEach(function(m){m.style.display='none';});dropdown.style.display=dropdown.style.display==='block'?'none':'block';};
    dropdown.querySelectorAll('.menu-opt').forEach(function(opt){opt.onclick=async function(e){e.stopPropagation();dropdown.style.display='none';var act=this.dataset.action;var pid=this.dataset.id;if(act==='delete'){if(confirm('Xóa?')){await deleteDoc(doc(db,"posts",pid));div.remove();showToast('Đã xóa');}}else if(act==='report'){var r=prompt('Lý do:');if(r){await addDoc(collection(db,"reports"),{postId:pid,reporterId:currentUser.uid,reason:r,createdAt:serverTimestamp()});showToast('Đã báo cáo');}}else if(act==='copy'){var url=post.mediaUrls?post.mediaUrls[0]:(post.mediaUrl||'');if(navigator.clipboard){await navigator.clipboard.writeText(url);showToast('Đã copy');}else prompt('Copy:',url);}};});
    document.addEventListener('click',function(){document.querySelectorAll('.post-menu-dropdown').forEach(function(m){m.style.display='none';});});
    var heart=document.getElementById('like-icon-'+id);if(heart){heart.onclick=async function(e){e.stopPropagation();var ref=doc(db,"posts",id);var snap=await getDoc(ref);var likes=snap.data().likes||[];if(likes.includes(currentUser.uid)){await updateDoc(ref,{likes:arrayRemove(currentUser.uid)});}else{await updateDoc(ref,{likes:arrayUnion(currentUser.uid)});}var upd=await getDoc(ref);var nl=upd.data().likes||[];document.getElementById('like-count-'+id).textContent=nl.length+' thích';var ic=document.getElementById('like-icon-'+id);if(ic){ic.className=nl.includes(currentUser.uid)?'fas fa-heart liked':'far fa-heart';}};}
    var sendBtn=div.querySelector('.send-comment');if(sendBtn){sendBtn.onclick=async function(){var inp=document.getElementById('comment-'+id);var txt=inp.value.trim();if(!txt)return;await updateDoc(doc(db,"posts",id),{comments:arrayUnion({uid:currentUser.uid,username:currentUser.displayName,avatar:currentUser.photoURL||DEFAULT_AVATAR,text:txt,createdAt:new Date().toISOString()})});inp.value='';loadComments(id);showToast('Đã bình luận');};}
    var saveBtn=div.querySelector('.save-btn');if(saveBtn){saveBtn.onclick=async function(){var ref=doc(db,"users",currentUser.uid);var snap=await getDoc(ref);var saved=snap.data().savedPosts||[];if(saved.includes(id)){await updateDoc(ref,{savedPosts:arrayRemove(id)});showToast('Đã bỏ lưu');}else{await updateDoc(ref,{savedPosts:arrayUnion(id)});showToast('Đã lưu');}};}
    var shareBtn=div.querySelector('.share-btn');if(shareBtn){shareBtn.onclick=function(){var url=post.mediaUrls?post.mediaUrls[0]:(post.mediaUrl||'');safeShare('Dunukha',post.caption||'',url);};}
    loadComments(id);
}
async function loadComments(postId){var c=document.getElementById('comments-'+postId);if(!c)return;var snap=await getDoc(doc(db,"posts",postId));var comments=snap.data().comments||[];c.innerHTML='';comments.forEach(function(cm){var d=document.createElement('div');d.style.cssText='padding:5px 0;border-bottom:1px solid #f5f5f5;display:flex;gap:8px;';var av=safeImg(cm.avatar,DEFAULT_AVATAR,'','width:24px;height:24px;border-radius:50%;');d.appendChild(av);var td=document.createElement('div');td.innerHTML='<strong>'+cm.username+'</strong> '+cm.text;d.appendChild(td);c.appendChild(d);});}

// POST UPLOAD
function setupPost(){
    var fi=document.getElementById('post-files');var pv=document.getElementById('preview-container');var sb=document.getElementById('submit-post');var cp=document.getElementById('post-caption');
    if(!fi||!sb)return;
    fi.onchange=function(){pv.innerHTML='';selectedFiles=Array.from(fi.files);if(!selectedFiles.length){pv.innerHTML='<p style="color:#aaa;">Ảnh xem trước</p>';return;}selectedFiles.forEach(function(f,idx){var r=new FileReader();r.onload=function(e){var w=document.createElement('div');w.style.cssText='position:relative;width:90px;height:90px;display:inline-block;margin:5px;';var el=f.type.startsWith('video')?document.createElement('video'):document.createElement('img');el.src=e.target.result;el.style.cssText='width:100%;height:100%;object-fit:cover;';var rm=document.createElement('button');rm.textContent='X';rm.style.cssText='position:absolute;top:2px;right:2px;background:red;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;';rm.onclick=function(ev){ev.stopPropagation();w.remove();selectedFiles.splice(idx,1);};w.appendChild(el);w.appendChild(rm);pv.appendChild(w);};r.readAsDataURL(f);});};
    sb.onclick=async function(){if(!selectedFiles.length){showToast('Chọn ảnh');return;}sb.disabled=true;sb.textContent='Đang đăng...';try{var urls=[];for(var f of selectedFiles)urls.push(await uploadImgBB(f));var snap=await getDoc(doc(db,"users",currentUser.uid));var u=snap.data();await addDoc(collection(db,"posts"),{uid:currentUser.uid,ownerId:currentUser.uid,username:u.displayName,userAvatar:u.photoURL||DEFAULT_AVATAR,mediaUrls:urls,mediaUrl:urls[0],postUrl:urls[0],mediaType:selectedFiles[0].type.startsWith('video')?'video':'image',caption:cp.value.trim(),likes:[],comments:[],status:'pending',createdAt:serverTimestamp()});fi.value='';pv.innerHTML='';cp.value='';selectedFiles=[];showToast('Đã gửi bài, chờ duyệt!');navigateTo('home');}catch(e){showToast('Lỗi: '+e.message);}sb.disabled=false;sb.textContent='Đăng';};
}

// PROFILE ĐỘNG
async function loadUserProfile(targetUid){
    var container=document.getElementById('profile-content');if(!container)return;
    container.innerHTML='<div style="text-align:center;padding:40px;">Đang tải...</div>';
    if(!targetUid){container.innerHTML='Không tìm thấy';return;}
    var snap=await getDoc(doc(db,"users",targetUid));
    if(!snap.exists()){container.innerHTML='Người dùng không tồn tại';return;}
    var profile=snap.data();
    var isOwner=(targetUid===currentUser.uid);
    var following=profile.followers?(profile.followers[currentUser.uid]===true):false;
    var followersCount=profile.followers?Object.keys(profile.followers).filter(function(k){return profile.followers[k]===true;}).length:0;
    var followingCount=profile.following?Object.keys(profile.following).filter(function(k){return profile.following[k]===true;}).length:0;
    container.innerHTML='<div class="profile-header"><img class="profile-avatar" src="'+(profile.photoURL||DEFAULT_AVATAR)+'" onerror="this.src=\''+DEFAULT_AVATAR+'\';"><div style="flex:1;"><h2>'+profile.displayName+'</h2><p style="color:#888;">@'+profile.username+'</p><div class="profile-stats"><div><span id="followers-count">'+followersCount+'</span> followers</div><div><span id="following-count">'+followingCount+'</span> following</div></div><p>'+(profile.bio||'')+'</p><div id="profile-action-area" style="margin-top:10px;display:flex;gap:8px;">'+(isOwner?'<button class="profile-action-btn" id="edit-profile-btn">Chỉnh sửa hồ sơ</button>':'<button class="profile-action-btn '+(following?'following':'primary')+'" id="follow-btn">'+(following?'Đang theo dõi':'Theo dõi')+'</button><button class="profile-action-btn primary" id="message-btn">Nhắn tin</button>')+'</div></div></div><div class="profile-grid" id="profile-posts-grid"></div>';
    loadProfilePosts(targetUid);
    if(isOwner){
        document.getElementById('edit-profile-btn').onclick=function(){
            document.getElementById('edit-profile-modal').style.display='flex';
            document.getElementById('edit-display-name').value=profile.displayName||'';
            document.getElementById('edit-bio').value=profile.bio||'';
            document.getElementById('edit-avatar-input').value='';
            document.getElementById('edit-avatar-preview').style.display='none';
        };
    }else{
        document.getElementById('follow-btn').onclick=async function(){await toggleFollow(targetUid);loadUserProfile(targetUid);};
        document.getElementById('message-btn').onclick=function(){openChatWithUser(targetUid,profile.displayName);};
    }
}
async function loadProfilePosts(uid){
    var grid=document.getElementById('profile-posts-grid');if(!grid)return;
    grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:20px;">Đang tải...</div>';
    var q=query(collection(db,"posts"),where("uid","==",uid),orderBy("createdAt","desc"),limit(12));
    var snap=await getDocs(q);
    grid.innerHTML='';
    if(snap.empty){grid.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">Chưa có bài viết</div>';return;}
    snap.forEach(function(doc){var d=doc.data();var img=safeImg(d.mediaUrls?d.mediaUrls[0]:(d.mediaUrl||''),DEFAULT_POST,'','width:100%;aspect-ratio:1;object-fit:cover;cursor:pointer;');img.onclick=function(){alert(d.caption||'Không có caption');};grid.appendChild(img);});
}
async function toggleFollow(targetUid){
    var targetRef=doc(db,"users",targetUid);var myRef=doc(db,"users",currentUser.uid);
    var snap=await getDoc(targetRef);
    var following=snap.data().followers?(snap.data().followers[currentUser.uid]===true):false;
    if(following){await updateDoc(targetRef,{['followers.'+currentUser.uid]:false});await updateDoc(myRef,{['following.'+targetUid]:false});showToast('Đã bỏ theo dõi');}
    else{await updateDoc(targetRef,{['followers.'+currentUser.uid]:true});await updateDoc(myRef,{['following.'+targetUid]:true});showToast('Đã theo dõi');}
}

// EDIT PROFILE
document.getElementById('save-profile-btn').onclick=async function(){
    var updates={displayName:document.getElementById('edit-display-name').value.trim(),bio:document.getElementById('edit-bio').value.trim()};
    var file=document.getElementById('edit-avatar-input').files[0];
    if(file){try{updates.photoURL=await uploadImgBB(file);updates.avatarUrl=updates.photoURL;}catch(e){return showToast('Lỗi upload');}}
    await updateDoc(doc(db,"users",currentUser.uid),updates);
    document.getElementById('edit-profile-modal').style.display='none';
    loadUserProfile(currentUser.uid);
    showToast('Cập nhật hồ sơ thành công!');
};
document.getElementById('cancel-edit-btn').onclick=function(){document.getElementById('edit-profile-modal').style.display='none';};
document.getElementById('edit-avatar-input').onchange=function(){var file=this.files[0];if(file){var reader=new FileReader();reader.onload=function(e){var prev=document.getElementById('edit-avatar-preview');prev.src=e.target.result;prev.style.display='block';};reader.readAsDataURL(file);}};

// CHAT
function openChatWithUser(uid,name){
    document.getElementById('chat-modal').style.display='flex';
    currentChatUser=uid;
    document.getElementById('chat-list').style.display='none';
    document.getElementById('chat-window').style.display='flex';
    document.getElementById('chat-username').textContent=name;
    var chatId=[currentUser.uid,uid].sort().join('_');
    if(unsubscribes['chat'])unsubscribes['chat']();
    unsubscribes['chat']=onSnapshot(query(collection(db,"messages"),where("chatId","==",chatId),orderBy("createdAt")),function(snap){var mc=document.getElementById('chat-messages');mc.innerHTML='';snap.forEach(function(doc){var d=doc.data();var row=document.createElement('div');row.className='message-row '+(d.from===currentUser.uid?'sent':'received');row.innerHTML='<div class="message-bubble">'+d.text+'</div>';mc.appendChild(row);});mc.scrollTop=mc.scrollHeight;});
}
document.getElementById('chat-btn').onclick=function(){document.getElementById('chat-modal').style.display='flex';loadChatList();};
document.getElementById('chat-close-btn').onclick=function(){document.getElementById('chat-modal').style.display='none';};
async function loadChatList(){
    var list=document.getElementById('chat-list');var win=document.getElementById('chat-window');
    list.style.display='block';win.style.display='none';
    var snap=await getDoc(doc(db,"users",currentUser.uid));var following=snap.data().following||{};
    list.innerHTML='<h4 style="padding:10px;">Danh sách bạn bè</h4>';
    for(var uid in following){if(!following[uid])continue;var u=await getDoc(doc(db,"users",uid));if(!u.exists())continue;var d=u.data();var div=document.createElement('div');div.style.cssText='display:flex;align-items:center;gap:10px;padding:10px;cursor:pointer;';var av=safeImg(d.photoURL,DEFAULT_AVATAR,'','width:44px;height:44px;border-radius:50%;');div.appendChild(av);var sp=document.createElement('span');sp.textContent=d.displayName;div.appendChild(sp);div.onclick=function(){openChatWithUser(uid,d.displayName);};list.appendChild(div);}
}
document.getElementById('chat-send-btn').onclick=async function(){var input=document.getElementById('chat-input');var text=input.value.trim();if(!text||!currentChatUser)return;var chatId=[currentUser.uid,currentChatUser].sort().join('_');await addDoc(collection(db,"messages"),{chatId:chatId,from:currentUser.uid,to:currentChatUser,text:text,type:'text',createdAt:serverTimestamp()});input.value='';};

// SEARCH, EXPLORE, REELS, NOTIFICATIONS, SIDEBAR
function setupSearch(){
    var input=document.getElementById('search-input');var results=document.getElementById('search-results');
    if(!input||!results)return;
    input.addEventListener('input',async function(){
        var raw=input.value.trim();if(!raw){loadExplore();return;}
        var keyword=raw.startsWith('@')?raw.substring(1).toLowerCase():raw.toLowerCase();
        results.style.display='block';results.innerHTML='<div style="text-align:center;padding:15px;">Đang tìm...</div>';
        if(!allUsersCache){var snap=await getDocs(collection(db,"users"));allUsersCache=snap.docs.map(function(d){return{id:d.id,data:d.data()}});}
        var filtered=allUsersCache.filter(function(u){if(u.id===currentUser.uid)return false;var dn=u.data.displayName?u.data.displayName.toLowerCase():'';var un=u.data.username?u.data.username.toLowerCase():'';return dn.includes(keyword)||un.includes(keyword);});
        results.innerHTML='';if(!filtered.length){results.innerHTML='<div style="text-align:center;padding:30px;">Không tìm thấy</div>';return;}
        filtered.forEach(function(u){var div=document.createElement('div');div.className='search-result';var av=safeImg(u.data.photoURL,DEFAULT_AVATAR,'','width:44px;height:44px;border-radius:50%;');var info=document.createElement('div');info.innerHTML='<strong>'+u.data.displayName+'</strong><br><span style="color:#888;">@'+u.data.username+'</span>';div.appendChild(av);div.appendChild(info);div.onclick=function(){loadUserProfile(u.id);navigateTo('profile');};results.appendChild(div);});
    });
}
async function loadExplore(){var grid=document.getElementById('search-results');grid.style.display='grid';grid.style.gridTemplateColumns='repeat(3,1fr)';grid.style.gap='3px';grid.innerHTML='';var snap=await getDocs(query(collection(db,"posts"),orderBy("createdAt","desc"),limit(12)));snap.forEach(function(doc){var d=doc.data();var img=safeImg(d.mediaUrls?d.mediaUrls[0]:(d.mediaUrl||''),DEFAULT_POST,'','width:100%;aspect-ratio:1;object-fit:cover;cursor:pointer;');img.onclick=function(){loadUserProfile(d.uid);navigateTo('profile');};grid.appendChild(img);});}
async function loadReels(){var c=document.getElementById('reels-container');if(!c)return;c.innerHTML='';var snap=await getDocs(query(collection(db,"posts"),where("mediaType","==","video"),orderBy("createdAt","desc"),limit(10)));snap.forEach(function(doc){var d=doc.data();var div=document.createElement('div');div.innerHTML='<video src="'+(d.mediaUrls?d.mediaUrls[0]:d.mediaUrl)+'" controls style="width:100%;height:100%;object-fit:contain;"></video>';c.appendChild(div);});}
function listenNotifications(){var q=query(collection(db,"notifications"),where("to","==",currentUser.uid),orderBy("createdAt","desc"),limit(20));unsubscribes['notif']=onSnapshot(q,function(snap){var count=0;snap.forEach(function(doc){if(!doc.data().read)count++;});document.getElementById('notif-btn').dataset.count=count;});}
document.getElementById('menu-btn').onclick=function(){document.getElementById('side-menu').classList.add('open');document.getElementById('menu-overlay').classList.add('show');};
document.getElementById('close-menu').onclick=function(){document.getElementById('side-menu').classList.remove('open');document.getElementById('menu-overlay').classList.remove('show');};
document.querySelectorAll('.menu-item').forEach(function(item){item.onclick=function(){var act=this.dataset.action;if(act==='profile')navigateTo('profile');else if(act==='edit-profile'){getDoc(doc(db,"users",currentUser.uid)).then(function(snap){var d=snap.data();document.getElementById('edit-profile-modal').style.display='flex';document.getElementById('edit-display-name').value=d.displayName||'';document.getElementById('edit-bio').value=d.bio||'';});}else if(act==='logout'){if(confirm('Đăng xuất?'))signOut(auth);}document.getElementById('side-menu').classList.remove('open');document.getElementById('menu-overlay').classList.remove('show');};});

// SCROLL
document.getElementById('page-home').addEventListener('scroll',function(){if(this.scrollHeight-this.scrollTop-this.clientHeight<100&&!isLoadingPosts)fetchPosts();});

// INIT
setupAuth();
setupPost();
setupSearch();
console.log('[Dunukha] Hệ thống đã sẵn sàng!');
