/* =========================================================================
   زِيكولا — منطق التطبيق (app.js)
   -------------------------------------------------------------------------
   • محتوى الكتب والحلقات يأتي من الأكواد (library.js + ملفات books/).
   • المستخدم يقرأ فقط — لا يضيف ولا يحذف.
   • المفضلة وسجل القراءة والإعدادات تُحفظ محليًا على جهاز كل مستخدم.
   ========================================================================= */

const PREF_KEY = 'zikola-preferences-v1';
const USER_KEY = 'zikola-userdata-v1';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const initials = (title = 'رواية') => [...title.trim()].slice(0, 2).join('') || 'ر';
const palettes = [['#cc9a6e', '#5a382f'], ['#7d9c90', '#244139'], ['#b56d57', '#52332e'], ['#ac8c45', '#463524'], ['#8876aa', '#302845'], ['#4b7798', '#253345']];

let app = {
  books: [],
  user: { favorites: [], progress: {} },
  prefs: { uiTheme: 'light', readerTheme: 'paper', autoResume: true, profileName: 'قارئ' },
  view: 'home',
  filter: 'الكل',
  query: '',
  activeBookId: null,
  activeReader: null
};

/* ===================== تحميل المحتوى والبيانات ===================== */
function normalizeBook(raw, i) {
  const id = raw.id || `book-${i + 1}`;
  const chapters = (raw.chapters || []).map((c, j) => {
    const number = Number.isFinite(c.number) ? c.number : (j + 1);
    return {
      id: c.id || `${id}-ch${number}`,
      number,
      title: c.title || `الحلقة ${number}`,
      pdf: c.pdf || '',
      fileName: (c.pdf || '').split('/').pop() || 'ملف PDF'
    };
  }).sort((a, b) => a.number - b.number);
  return {
    id,
    title: raw.title || 'بدون عنوان',
    author: raw.author || '',
    category: raw.category || 'رواية',
    description: raw.description || '',
    cover: raw.cover || '',
    createdAt: raw.createdAt || null,
    palette: raw.palette || palettes[i % palettes.length],
    chapters
  };
}
function loadContent() {
  const raw = (window.ZIKOLA && Array.isArray(window.ZIKOLA.books)) ? window.ZIKOLA.books : [];
  app.books = raw.map(normalizeBook);
}
function loadPrefs() { try { app.prefs = { ...app.prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY)) || {}) }; } catch { /* defaults */ } }
function savePrefs() { localStorage.setItem(PREF_KEY, JSON.stringify(app.prefs)); }
function loadUserData() {
  try {
    const data = JSON.parse(localStorage.getItem(USER_KEY)) || {};
    app.user.favorites = Array.isArray(data.favorites) ? data.favorites : [];
    app.user.progress = (data.progress && typeof data.progress === 'object') ? data.progress : {};
  } catch { app.user = { favorites: [], progress: {} }; }
}
function saveUserData() { localStorage.setItem(USER_KEY, JSON.stringify({ favorites: app.user.favorites, progress: app.user.progress })); }

function applyPreferences() {
  document.body.classList.toggle('ui-dark', app.prefs.uiTheme === 'dark');
  document.body.classList.toggle('ui-brown', app.prefs.uiTheme === 'brown');
  $('#themeToggle').textContent = app.prefs.uiTheme === 'dark' ? '☀' : '☾';
  $('#profileInitial').textContent = initials(app.prefs.profileName).charAt(0);
}

/* ===================== أدوات مساعدة ===================== */
function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove('show'), 2800); }
function formatDate(value) { return new Intl.DateTimeFormat('ar-IQ', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)); }
function getBook(id) { return app.books.find(book => book.id === id); }
function getAllChapters(book) { return book.chapters; }
function bookPalette(book) { return book.palette || palettes[app.books.indexOf(book) % palettes.length]; }
function coverStyle(book) { const [a, b] = bookPalette(book); return `--coverA:${a};--coverB:${b};${book.cover ? `background-image:url('${book.cover}')` : ''}`; }
function bookCover(book, className = 'book-cover') { return `<span class="${className}${book.cover ? ' has-image' : ''}" data-initial="${escapeHTML(initials(book.title))}" style="${coverStyle(book)}"></span>`; }

function isFavorite(book) { return app.user.favorites.includes(book.id); }
function toggleFavorite(book) { const i = app.user.favorites.indexOf(book.id); if (i >= 0) app.user.favorites.splice(i, 1); else app.user.favorites.push(book.id); saveUserData(); }
function getProgress(book) { return app.user.progress[book.id] || null; }

function setActiveNav() { $$('[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === app.view)); }
function filteredBooks() { return app.books.filter(book => (app.filter === 'الكل' || book.category === app.filter) && `${book.title} ${book.author} ${book.description || ''}`.toLowerCase().includes(app.query.toLowerCase())); }
function stats() { return { books: app.books.length, chapters: app.books.reduce((sum, book) => sum + book.chapters.length, 0), favorites: app.user.favorites.length }; }

/* ===================== بطاقات وعناصر ===================== */
function emptyLibrary() { return `<div class="empty-state empty-library"><div><span class="empty-icon">▦</span><h3>لا توجد روايات بعد</h3><p>سيتم عرض الروايات هنا فور إضافتها. تابعنا للمزيد قريبًا.</p></div></div>`; }
function bookCard(book) {
  const chapters = getAllChapters(book); const fav = isFavorite(book);
  return `<article class="book-card" data-book="${book.id}" tabindex="0" role="button" aria-label="فتح ${escapeHTML(book.title)}">${bookCover(book)}<button class="book-menu" data-action="toggle-favorite" data-book="${book.id}" aria-label="${fav ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}">${fav ? '♥' : '♡'}</button><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(book.author || 'بدون اسم كاتب')}</p><div class="card-meta"><span>${chapters.length} ${chapters.length === 1 ? 'حلقة' : 'حلقات'}</span>${fav ? '<span class="fav-indicator">♥</span>' : ''}</div></article>`;
}
function recentBookCard(book) {
  const progress = getProgress(book); const chapter = getAllChapters(book).find(c => c.id === progress?.chapterId) || getAllChapters(book)[0]; const pct = progress?.percent || 0;
  return `<article class="continue-card"><button class="book-card" data-book="${book.id}" aria-label="فتح ${escapeHTML(book.title)}">${bookCover(book, 'mini-cover')}</button><div class="continue-info"><small>${escapeHTML(chapter?.title || 'لم تُضف حلقات بعد')}</small><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(book.author || 'رواية')}</p><div class="progress"><span style="width:${pct}%"></span></div><div class="progress-label"><span>${pct ? `وصلت إلى ${pct}%` : 'لم تبدأ بعد'}</span><button class="text-button" data-book="${book.id}">فتح</button></div></div></article>`;
}

/* ===================== الواجهات ===================== */
function renderHome() {
  const { books, chapters, favorites } = stats();
  const reading = [...app.books].filter(book => getProgress(book)).sort((a, b) => (getProgress(b).updatedAt || 0) - (getProgress(a).updatedAt || 0)).slice(0, 3);
  const showcase = reading.length ? reading : app.books.slice(0, 3);
  const showcaseGrid = reading.length
    ? `<div class="continue-grid">${reading.map(recentBookCard).join('')}</div>`
    : (app.books.length ? `<div class="book-grid">${showcase.map(bookCard).join('')}</div>` : emptyLibrary());
  return `<section class="view-heading"><div><p class="eyebrow">مكتبة زِيكولا</p><h1>أهلًا ${escapeHTML(app.prefs.profileName)}، ماذا ستقرأ اليوم؟</h1></div><button class="button button-primary" data-view="library">▦ تصفّح المكتبة</button></section><section class="hero"><div class="hero-copy"><p class="eyebrow">قارئ الروايات بصيغة PDF</p><h2>كل رواياتك<br />في مكتبة واحدة.</h2><p>تصفّح أحدث الروايات والحلقات، واقرأ في وضع أبيض أو بني أو داكن. يُحفظ موقعك تلقائيًا.</p><button class="button button-gold" data-view="library">ابدأ القراءة</button></div><div class="hero-art" aria-hidden="true"><i class="hero-ring"></i><i class="hero-book"></i></div></section><section class="stats-row"><div class="stat-card"><span>▦</span><div><b>${books}</b><small>رواية متاحة</small></div></div><div class="stat-card"><span>⌁</span><div><b>${chapters}</b><small>حلقة PDF</small></div></div><div class="stat-card"><span>♥</span><div><b>${favorites}</b><small>في مفضلتك</small></div></div></section><section><div class="section-head"><h2>${reading.length ? 'تابع القراءة' : 'روايات مختارة'}</h2>${books ? '<button class="text-button" data-view="library">عرض الكل ←</button>' : ''}</div>${showcaseGrid}</section>`;
}
function renderLibrary() {
  const categories = ['الكل', ...new Set(app.books.map(book => book.category).filter(Boolean))]; const list = filteredBooks();
  return `<section class="view-heading"><div><p class="eyebrow">مكتبة الروايات</p><h1>كل الروايات</h1></div></section><section class="library-toolbar"><div class="filter-row">${categories.map(category => `<button class="filter-chip ${category === app.filter ? 'active' : ''}" data-filter="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join('')}</div><span class="library-count">${list.length} ${list.length === 1 ? 'رواية' : 'روايات'}</span></section><section class="book-grid">${list.length ? list.map(bookCard).join('') : (app.books.length ? '<div class="empty-state empty-library"><div><span class="empty-icon">⌕</span><h3>لم نجد نتيجة</h3><p>جرّب كلمة بحث أخرى أو غيّر التصنيف.</p></div></div>' : emptyLibrary())}</section>`;
}
function renderHistory() {
  const rows = app.books.filter(book => getProgress(book)).sort((a, b) => getProgress(b).updatedAt - getProgress(a).updatedAt);
  return `<section class="view-heading"><div><p class="eyebrow">مسيرتك</p><h1>سجل القراءة</h1></div></section>${rows.length ? `<section class="history-list">${rows.map(book => { const progress = getProgress(book); const chapter = getAllChapters(book).find(c => c.id === progress.chapterId); return `<article class="history-item">${bookCover(book, 'mini-cover')}<div><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(chapter?.title || 'حلقة محذوفة')} · آخر قراءة ${formatDate(progress.updatedAt)}</p></div><div class="history-progress"><small>${progress.percent}% مكتمل</small><div class="progress"><span style="width:${progress.percent}%"></span></div></div><button class="button button-ghost" data-book="${book.id}">متابعة</button></article>`; }).join('')}</section>` : `<div class="empty-state"><div><span class="empty-icon">◷</span><h3>لا يوجد سجل للقراءة بعد</h3><p>عندما تفتح أي حلقة PDF، سيظهر تقدّمك هنا.</p><button class="button button-primary" data-view="library">اذهب إلى المكتبة</button></div></div>`}`;
}
function renderSettings() {
  const uiLabels = { light: 'فاتح', brown: 'بني', dark: 'داكن' };
  return `<section class="view-heading"><div><p class="eyebrow">تخصيص التطبيق</p><h1>الإعدادات</h1></div></section><section class="settings-layout"><article class="settings-card"><h2>مظهر التطبيق</h2><p>هذه الألوان لواجهة المكتبة، ويمكنك تغيير لون قارئ PDF أثناء القراءة.</p><div class="setting-row"><div><b>ألوان الواجهة</b><p>الوضع الحالي: ${uiLabels[app.prefs.uiTheme]}</p></div><div class="theme-options"><button class="theme-option ${app.prefs.uiTheme === 'light' ? 'active' : ''}" title="فاتح" data-ui-theme="light"></button><button class="theme-option brown ${app.prefs.uiTheme === 'brown' ? 'active' : ''}" title="بني" data-ui-theme="brown"></button><button class="theme-option dark ${app.prefs.uiTheme === 'dark' ? 'active' : ''}" title="داكن" data-ui-theme="dark"></button></div></div><div class="setting-row"><div><b>استئناف القراءة تلقائيًا</b><p>افتح آخر حلقة وصلت إليها عند اختيار الكتاب.</p></div><input id="autoResume" class="switch" type="checkbox" ${app.prefs.autoResume ? 'checked' : ''} /></div></article><article class="settings-card"><h2>حساب القارئ</h2><p>اسم بسيط يظهر في الترحيب داخل التطبيق.</p><div class="setting-row"><div><b>اسم القارئ</b><p>يمكنك تغييره في أي وقت.</p></div><input id="profileName" value="${escapeHTML(app.prefs.profileName)}" maxlength="24" aria-label="اسم القارئ" /></div></article><article class="settings-card"><h2>بياناتي على هذا الجهاز</h2><p>تُحفظ مفضلتك وسجل قراءتك محليًا على هذا الجهاز فقط. الروايات نفسها تأتي من المكتبة ولا تتأثر.</p><div class="setting-row"><div><b>مسح مفضلتي وسجلي</b><p>يمسح المفضلة وتقدّم القراءة فقط، دون حذف أي رواية.</p></div><button class="button button-danger" data-action="clear-user">مسح بياناتي</button></div></article></section>`;
}
function renderBook() {
  const book = getBook(app.activeBookId); if (!book) return renderLibrary(); const chapters = getAllChapters(book); const progress = getProgress(book); const fav = isFavorite(book);
  const addedPill = book.createdAt ? `<span>أُضيف ${formatDate(book.createdAt)}</span>` : '';
  return `<section class="view-heading"><div><button class="text-button" data-view="library">← العودة إلى المكتبة</button><p class="eyebrow">${escapeHTML(book.category || 'رواية')}</p><h1>${escapeHTML(book.title)}</h1></div><div><button class="button button-ghost" data-action="toggle-favorite" data-book="${book.id}">${fav ? '♥ في المفضلة' : '♡ أضف للمفضلة'}</button></div></section><section class="book-detail"><div class="book-detail-cover">${bookCover(book)}</div><div class="book-detail-text"><p class="book-author">${escapeHTML(book.author || 'بدون اسم كاتب')}</p><p>${escapeHTML(book.description || 'لم تُكتب نبذة لهذا الكتاب بعد.')}</p><div class="detail-pills"><span>${chapters.length} حلقات</span>${addedPill}</div>${chapters.length && progress ? `<button class="button button-primary" data-action="resume" data-book="${book.id}">تابع من ${escapeHTML(getAllChapters(book).find(c => c.id === progress.chapterId)?.title || 'آخر حلقة')}</button>` : (chapters.length ? `<button class="button button-primary" data-action="read" data-book="${book.id}" data-chapter="${chapters[0].id}">ابدأ القراءة</button>` : '')}</div></section><section class="chapter-section"><div class="section-head"><h2>الحلقات</h2></div>${chapters.length ? `<div class="chapter-list">${chapters.map((chapter, index) => `<article class="chapter-row"><span class="chapter-number">${String(chapter.number).padStart(2, '0')}</span><div><h3>${escapeHTML(chapter.title)}</h3><p>${escapeHTML(chapter.fileName || 'ملف PDF')}</p></div><div class="chapter-actions"><button class="button button-ghost" data-action="read" data-book="${book.id}" data-chapter="${chapter.id}">${index === 0 && !progress ? 'ابدأ القراءة' : 'افتح PDF'}</button></div></article>`).join('')}</div>` : `<div class="empty-state"><div><span class="empty-icon">⌁</span><h3>لا توجد حلقات في هذه الرواية بعد</h3><p>سيتم إضافة الحلقات قريبًا.</p></div></div>`}</section>`;
}
function render() { const views = { home: renderHome, library: renderLibrary, history: renderHistory, settings: renderSettings, book: renderBook }; $('#viewRoot').innerHTML = (views[app.view] || renderHome)(); setActiveNav(); updateStorage(); }

/* ===================== القارئ ===================== */
function showBook(bookId) { app.activeBookId = bookId; app.view = 'book'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function openReader(bookId, chapterId = null) {
  const book = getBook(bookId); if (!book) return;
  const chapters = getAllChapters(book); const progress = getProgress(book);
  const chapter = chapters.find(item => item.id === (chapterId || (app.prefs.autoResume ? progress?.chapterId : null))) || chapters[0];
  if (!chapter) return toast('لا توجد حلقات في هذه الرواية.');
  app.activeReader = { bookId, chapterId: chapter.id };
  $('#readerBookTitle').textContent = book.title;
  $('#readerChapterTitle').textContent = chapter.title;
  const startPage = progress?.chapterId === chapter.id ? (progress.page || 1) : 1;
  $('#pageNumber').value = startPage;
  $('#reader').classList.remove('hidden'); document.body.style.overflow = 'hidden';
  setReaderTheme(app.prefs.readerTheme, false);
  if (!chapter.pdf) { $('#pdfFrame').classList.add('hidden'); $('#noPdf').classList.remove('hidden'); return; }
  $('#pdfFrame').src = `${chapter.pdf}#page=${startPage}&view=FitH`;
  $('#noPdf').classList.add('hidden'); $('#pdfFrame').classList.remove('hidden');
  recordProgress();
}
function closeReader() { $('#reader').classList.add('hidden'); $('#pdfFrame').src = 'about:blank'; document.body.style.overflow = ''; app.activeReader = null; render(); }
function setReaderTheme(theme, save = true) { app.prefs.readerTheme = theme; if (save) savePrefs(); $('#readerStage').className = `reader-stage ${theme}`; $$('.reader-theme').forEach(button => button.classList.toggle('active', button.dataset.readerTheme === theme)); }
function recordProgress(percent = null) {
  if (!app.activeReader) return;
  const book = getBook(app.activeReader.bookId); if (!book) return;
  const page = Math.max(1, Number($('#pageNumber').value) || 1);
  const existing = getProgress(book);
  const previous = existing?.chapterId === app.activeReader.chapterId ? existing.percent : 0;
  app.user.progress[book.id] = { chapterId: app.activeReader.chapterId, page, percent: percent ?? Math.max(previous || 0, 1), updatedAt: Date.now() };
  saveUserData();
  $('#readerProgress').textContent = `تم حفظ موقعك — صفحة ${page}`;
}
function jumpPage() {
  if (!app.activeReader) return;
  const book = getBook(app.activeReader.bookId); const chapter = getAllChapters(book).find(c => c.id === app.activeReader.chapterId);
  if (!chapter?.pdf) return;
  const page = Math.max(1, Number($('#pageNumber').value) || 1);
  $('#pageNumber').value = page;
  $('#pdfFrame').src = `${chapter.pdf}#page=${page}&view=FitH`;
  recordProgress();
}
function nextChapter() {
  if (!app.activeReader) return;
  const book = getBook(app.activeReader.bookId); const chapters = getAllChapters(book);
  const i = chapters.findIndex(chapter => chapter.id === app.activeReader.chapterId);
  if (i < 0 || !chapters[i + 1]) return toast('هذه آخر حلقة في الرواية.');
  recordProgress(100);
  openReader(book.id, chapters[i + 1].id);
}

/* ===================== عدّاد المكتبة + مسح بيانات المستخدم ===================== */
function updateStorage() {
  const { books, chapters } = stats();
  const text = $('#storageText'); const bar = $('#storageBar');
  if (text) text.textContent = `${books} رواية · ${chapters} حلقة`;
  if (bar) bar.style.width = books ? '100%' : '4%';
}
function clearUserData() {
  if (!confirm('سيتم مسح المفضلة وسجل القراءة من هذا الجهاز فقط. الروايات تبقى كما هي. هل تريد المتابعة؟')) return;
  app.user = { favorites: [], progress: {} }; saveUserData(); app.view = 'home'; render(); toast('تم مسح بياناتك من هذا الجهاز.');
}

/* ===================== الأحداث ===================== */
document.addEventListener('click', event => {
  const target = event.target.closest('button, [data-book], [data-view], [data-filter]'); if (!target) return;
  if (target.id === 'menuButton') return $('.sidebar').classList.toggle('open');
  if (target.id === 'themeToggle') { const themes = ['light', 'brown', 'dark']; app.prefs.uiTheme = themes[(themes.indexOf(app.prefs.uiTheme) + 1) % themes.length]; savePrefs(); applyPreferences(); render(); return; }
  if (target.id === 'closeReader') return closeReader();
  if (target.id === 'fullscreenButton') { if (!document.fullscreenElement) $('#reader').requestFullscreen?.(); else document.exitFullscreen?.(); return; }
  if (target.id === 'nextChapter') return nextChapter();
  if (target.dataset.readerTheme) return setReaderTheme(target.dataset.readerTheme);
  if (target.dataset.uiTheme) { app.prefs.uiTheme = target.dataset.uiTheme; savePrefs(); applyPreferences(); render(); return; }
  if (target.dataset.filter) { app.filter = target.dataset.filter; render(); return; }
  if (target.dataset.view) { app.view = target.dataset.view; app.activeBookId = null; $('.sidebar').classList.remove('open'); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (target.dataset.action === 'read') return openReader(target.dataset.book, target.dataset.chapter);
  if (target.dataset.action === 'resume') return openReader(target.dataset.book);
  if (target.dataset.action === 'toggle-favorite') { event.stopPropagation(); const book = getBook(target.dataset.book); if (book) { toggleFavorite(book); render(); } return; }
  if (target.dataset.action === 'clear-user') return clearUserData();
  const bookElement = target.closest('[data-book]'); if (bookElement?.dataset.book) return showBook(bookElement.dataset.book);
});
$('#pageNumber').addEventListener('change', jumpPage); $('#pageNumber').addEventListener('keydown', event => { if (event.key === 'Enter') jumpPage(); });
$('#globalSearch').addEventListener('input', event => { app.query = event.target.value; if (app.view !== 'library') { app.view = 'library'; } render(); });
document.addEventListener('change', event => { if (event.target.id === 'autoResume') { app.prefs.autoResume = event.target.checked; savePrefs(); } });
document.addEventListener('input', event => { if (event.target.id === 'profileName') { app.prefs.profileName = event.target.value.trim() || 'قارئ'; savePrefs(); applyPreferences(); } });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#reader').classList.contains('hidden')) closeReader();
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.book-card[role="button"]')) { event.preventDefault(); showBook(event.target.dataset.book); }
});

/* ===================== الإقلاع ===================== */
(async function init() {
  loadPrefs();
  loadUserData();
  if (window.ZIKOLA && typeof window.ZIKOLA.load === 'function') { await window.ZIKOLA.load(); }
  loadContent();
  applyPreferences();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
})();
