/**
 * 歌词学习核心逻辑
 * 功能：逐句高亮、播放控制、生词收藏
 */

// 全局状态
const state = {
    songData: null,        // 歌词数据
    currentLineIndex: -1,  // 当前行索引
    isPlaying: false,      // 是否正在播放
    isRepeating: false,    // 是否循环播放当前句
    vocab: [],             // 生词本
    autoPlayTimer: null,   // 自动播放定时器
    currentPopupWord: null // 当前弹窗单词
};

// DOM 元素
const els = {
    loading: document.getElementById('loadingState'),
    empty: document.getElementById('emptyState'),
    content: document.getElementById('songContent'),
    artwork: document.getElementById('songArtwork'),
    title: document.getElementById('songTitle'),
    artist: document.getElementById('songArtist'),
    meta: document.getElementById('songMeta'),
    progressText: document.getElementById('progressText'),
    progressPercent: document.getElementById('progressPercent'),
    progressFill: document.getElementById('progressFill'),
    lyricsDisplay: document.getElementById('lyricsDisplay'),
    playBtn: document.getElementById('playBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    vocabBtn: document.getElementById('vocabBtn'),
    vocabCount: document.getElementById('vocabCount'),
    wordPopup: document.getElementById('wordPopup'),
    wordPopupOverlay: document.getElementById('wordPopupOverlay'),
    popupWord: document.getElementById('popupWord'),
    popupPhonetic: document.getElementById('popupPhonetic'),
    popupMeaning: document.getElementById('popupMeaning'),
    vocabSidebar: document.getElementById('vocabSidebar'),
    vocabList: document.getElementById('vocabList')
};

// 初始化
async function init() {
    // 加载生词本
    loadVocab();

    // 获取歌曲参数
    const urlParams = new URLSearchParams(window.location.search);
    const songId = urlParams.get('song');

    if (songId) {
        await loadSong(songId);
    } else {
        // 显示歌曲列表
        showSongList();
    }
}

// 加载歌曲列表
async function showSongList() {
    els.loading.style.display = 'none';

    try {
        const response = await fetch('private/lyrics/index.json');
        if (!response.ok) throw new Error('无法加载歌曲列表');

        const data = await response.json();
        const songs = data.songs || [];

        if (songs.length === 0) {
            els.empty.style.display = 'block';
            return;
        }

        // 渲染歌曲列表
        renderSongList(songs);
    } catch (err) {
        console.error('加载歌曲列表失败:', err);
        els.empty.style.display = 'block';
    }
}

// 渲染歌曲列表
function renderSongList(songs) {
    const container = document.createElement('div');
    container.innerHTML = songs.map(song => `
        <div class="song-header" style="cursor: pointer; margin-bottom: 12px;" onclick="loadSong('${song.id}')">
            <div class="song-artwork">${song.emoji || '🎵'}</div>
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title)}</div>
                <div class="song-artist">${escapeHtml(song.artist)}</div>
                <div class="song-meta">${song.year || ''} · ${song.genre || ''}</div>
            </div>
        </div>
    `).join('');

    els.content.innerHTML = '';
    els.content.appendChild(container);
    els.content.style.display = 'block';
}

// 加载歌曲
async function loadSong(songId) {
    els.loading.style.display = 'block';
    els.empty.style.display = 'none';
    els.content.style.display = 'none';

    try {
        const response = await fetch(`private/lyrics/${songId}.json`);
        if (!response.ok) throw new Error('歌曲不存在');

        state.songData = await response.json();

        // 渲染歌曲
        renderSong();
        renderLyrics();
        updateProgress();

        els.loading.style.display = 'none';
        els.content.style.display = 'block';
    } catch (err) {
        console.error('加载歌曲失败:', err);
        els.loading.style.display = 'none';
        els.empty.style.display = 'block';
    }
}

// 渲染歌曲信息
function renderSong() {
    const song = state.songData;
    els.title.textContent = song.title;
    els.artist.textContent = song.artist;
    els.meta.textContent = `${song.year || ''} · ${song.album || ''}`;
    els.artwork.textContent = song.emoji || '🎵';

    if (song.artwork) {
        els.artwork.innerHTML = `<img src="${song.artwork}" alt="${escapeHtml(song.title)}">`;
    }
}

// 渲染歌词
function renderLyrics() {
    const container = els.lyricsDisplay;
    container.innerHTML = '';

    const lyrics = state.songData.lyrics;

    lyrics.forEach((section, sectionIndex) => {
        // 段落标签
        if (section.label) {
            const label = document.createElement('div');
            label.className = 'section-label';
            label.textContent = section.label;
            container.appendChild(label);
        }

        // 歌词行
        section.lines.forEach((line, lineIndex) => {
            const lineEl = document.createElement('div');
            lineEl.className = 'lyrics-line';
            lineEl.dataset.section = sectionIndex;
            lineEl.dataset.line = lineIndex;
            lineEl.dataset.globalIndex = getGlobalIndex(sectionIndex, lineIndex);

            // 行号
            const lineNum = document.createElement('span');
            lineNum.className = 'line-number';
            lineNum.textContent = lineIndex + 1;
            lineEl.appendChild(lineNum);

            // 歌词文本（支持点击单词）
            const textSpan = document.createElement('span');
            textSpan.innerHTML = highlightWords(line.text);
            lineEl.appendChild(textSpan);

            // 点击行
            lineEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('word')) {
                    showWordPopup(e.target.textContent, line.translation);
                } else {
                    playLine(sectionIndex, lineIndex);
                }
            });

            container.appendChild(lineEl);
        });
    });

    // 绑定单词点击
    container.querySelectorAll('.word').forEach(wordEl => {
        wordEl.addEventListener('click', (e) => {
            e.stopPropagation();
            const word = wordEl.textContent;
            const lineEl = wordEl.closest('.lyrics-line');
            const globalIdx = parseInt(lineEl.dataset.globalIndex);
            const line = getLineByGlobalIndex(globalIdx);
            showWordPopup(word, line?.translation);
        });
    });
}

// 获取全局行索引
function getGlobalIndex(sectionIndex, lineIndex) {
    let index = 0;
    for (let i = 0; i < sectionIndex; i++) {
        index += state.songData.lyrics[i].lines.length;
    }
    return index + lineIndex;
}

// 根据全局索引获取行数据
function getLineByGlobalIndex(globalIndex) {
    let count = 0;
    for (const section of state.songData.lyrics) {
        if (globalIndex < count + section.lines.length) {
            return section.lines[globalIndex - count];
        }
        count += section.lines.length;
    }
    return null;
}

// 高亮单词（可点击）
function highlightWords(text) {
    // 匹配单词（包括撇号，如 don't）
    return text.replace(/\b[A-Za-z']+\b/g, '<span class="word">$&</span>');
}

// 播放某行
function playLine(sectionIndex, lineIndex) {
    // 停止当前播放
    stopAutoPlay();

    // 计算全局索引
    const globalIndex = getGlobalIndex(sectionIndex, lineIndex);
    state.currentLineIndex = globalIndex;

    // 更新 UI
    updateActiveLine();
    updateProgress();

    // 高亮并滚动到该行
    const lineEl = document.querySelector(`.lyrics-line[data-global-index="${globalIndex}"]`);
    if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 朗读该行
    const line = state.songData.lyrics[sectionIndex].lines[lineIndex];
    speakText(line.text);
}

// 更新当前行高亮
function updateActiveLine() {
    document.querySelectorAll('.lyrics-line').forEach(el => {
        const idx = parseInt(el.dataset.globalIndex);
        el.classList.remove('active', 'played');

        if (idx === state.currentLineIndex) {
            el.classList.add('active');
        } else if (idx < state.currentLineIndex) {
            el.classList.add('played');
        }
    });
}

// 更新进度
function updateProgress() {
    const totalLines = getTotalLines();
    const current = state.currentLineIndex + 1;
    const percent = totalLines > 0 ? Math.round((current / totalLines) * 100) : 0;

    els.progressText.textContent = `${current} / ${totalLines}`;
    els.progressPercent.textContent = `${percent}%`;
    els.progressFill.style.width = `${percent}%`;
}

// 获取总行数
function getTotalLines() {
    return state.songData.lyrics.reduce((sum, section) => sum + section.lines.length, 0);
}

// 播放/暂停
function togglePlay() {
    if (state.isPlaying) {
        stopAutoPlay();
    } else {
        startAutoPlay();
    }
}

// 开始自动播放
function startAutoPlay() {
    if (!state.songData) return;

    state.isPlaying = true;
    els.playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        <span>暂停</span>
    `;

    // 从当前行开始播放
    if (state.currentLineIndex < 0) {
        state.currentLineIndex = 0;
    }

    playCurrentLine();
}

// 停止自动播放
function stopAutoPlay() {
    state.isPlaying = false;
    els.playBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <span>播放</span>
    `;

    if (state.autoPlayTimer) {
        clearTimeout(state.autoPlayTimer);
        state.autoPlayTimer = null;
    }

    speechSynthesis.cancel();
}

// 播放当前行并自动前进
function playCurrentLine() {
    if (!state.isPlaying || state.currentLineIndex >= getTotalLines()) {
        stopAutoPlay();
        return;
    }

    // 找到当前行数据
    let count = 0;
    let currentLine = null;
    let sectionIdx = 0, lineIdx = 0;

    for (let i = 0; i < state.songData.lyrics.length; i++) {
        const section = state.songData.lyrics[i];
        if (state.currentLineIndex < count + section.lines.length) {
            sectionIdx = i;
            lineIdx = state.currentLineIndex - count;
            currentLine = section.lines[lineIdx];
            break;
        }
        count += section.lines.length;
    }

    if (!currentLine) {
        stopAutoPlay();
        return;
    }

    // 更新 UI
    updateActiveLine();
    updateProgress();

    // 滚动到当前行
    const lineEl = document.querySelector(`.lyrics-line[data-global-index="${state.currentLineIndex}"]`);
    if (lineEl) {
        lineEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 朗读当前行
    speakText(currentLine.text, () => {
        if (!state.isPlaying) return;

        if (state.isRepeating) {
            // 循环播放当前句
            playCurrentLine();
        } else {
            // 前进到下一行
            state.currentLineIndex++;
            // 短暂延迟后播放下一行
            state.autoPlayTimer = setTimeout(playCurrentLine, 300);
        }
    });
}

// 上一句
function prevLine() {
    if (state.currentLineIndex > 0) {
        state.currentLineIndex--;
        playLineByGlobalIndex(state.currentLineIndex);
    }
}

// 下一句
function nextLine() {
    if (state.currentLineIndex < getTotalLines() - 1) {
        state.currentLineIndex++;
        playLineByGlobalIndex(state.currentLineIndex);
    }
}

// 根据全局索引播放行
function playLineByGlobalIndex(globalIndex) {
    let count = 0;
    for (let i = 0; i < state.songData.lyrics.length; i++) {
        const section = state.songData.lyrics[i];
        if (globalIndex < count + section.lines.length) {
            playLine(i, globalIndex - count);
            return;
        }
        count += section.lines.length;
    }
}

// 切换循环模式
function toggleRepeat() {
    state.isRepeating = !state.isRepeating;
    els.repeatBtn.classList.toggle('active', state.isRepeating);
}

// 朗读文本
function speakText(text, callback) {
    if (!('speechSynthesis' in window)) {
        console.warn('浏览器不支持语音合成');
        if (callback) callback();
        return;
    }

    // 取消之前的朗读
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;

    // 设置语音（优先使用英语）
    const voices = speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang.startsWith('en'));
    if (enVoice) utterance.voice = enVoice;

    if (callback) {
        utterance.onend = callback;
        utterance.onerror = callback;
    }

    speechSynthesis.speak(utterance);
}

// 朗读单词
function speakWord() {
    if (state.currentPopupWord) {
        speakText(state.currentPopupWord);
    }
}

// 显示单词弹窗
async function showWordPopup(word, context) {
    state.currentPopupWord = word;
    els.popupWord.textContent = word;

    // 查找单词释义（从 ECDICT 缓存）
    const meaning = await lookupWord(word);
    els.popupMeaning.textContent = meaning || '未找到释义';

    // 尝试获取音标
    els.popupPhonetic.textContent = '';

    els.wordPopup.classList.add('show');
    els.wordPopupOverlay.classList.add('show');
}

// 关闭单词弹窗
function closeWordPopup() {
    els.wordPopup.classList.remove('show');
    els.wordPopupOverlay.classList.remove('show');
    state.currentPopupWord = null;
}

// 查找单词（简单实现，可从 ECDICT 查询）
async function lookupWord(word) {
    // TODO: 接入 ECDICT 或其他词典 API
    // 目前返回简单提示
    return `点击"收藏"添加到生词本，稍后补充释义`;
}

// 保存单词到生词本
function saveWord() {
    if (!state.currentPopupWord) return;

    const word = state.currentPopupWord.toLowerCase();

    if (!state.vocab.find(v => v.word === word)) {
        state.vocab.push({
            word: word,
            addedAt: new Date().toISOString(),
            context: '' // 可添加上下文
        });

        saveVocab();
        updateVocabCount();
        renderVocabList();

        // 视觉反馈
        showToast(`已收藏 "${word}"`);
    } else {
        showToast(`"${word}" 已在生词本中`);
    }

    closeWordPopup();
}

// 加载生词本
function loadVocab() {
    const stored = localStorage.getItem('english_lyrics_vocab');
    state.vocab = stored ? JSON.parse(stored) : [];
    updateVocabCount();
}

// 保存生词本
function saveVocab() {
    localStorage.setItem('english_lyrics_vocab', JSON.stringify(state.vocab));
}

// 更新生词本计数
function updateVocabCount() {
    els.vocabCount.textContent = state.vocab.length;
}

// 切换生词本侧边栏
function toggleVocabSidebar() {
    const isOpen = els.vocabSidebar.classList.contains('show');

    if (isOpen) {
        els.vocabSidebar.classList.remove('show');
    } else {
        renderVocabList();
        els.vocabSidebar.classList.add('show');
    }
}

// 渲染生词本列表
function renderVocabList() {
    if (state.vocab.length === 0) {
        els.vocabList.innerHTML = '<div class="vocab-empty">暂无收藏单词</div>';
        return;
    }

    els.vocabList.innerHTML = state.vocab.map((item, index) => `
        <div class="vocab-item">
            <div>
                <div class="vocab-word">${escapeHtml(item.word)}</div>
                <div class="vocab-meaning">${escapeHtml(item.meaning || '')}</div>
            </div>
            <button class="vocab-delete" onclick="deleteVocabItem(${index})">×</button>
        </div>
    `).join('');
}

// 删除生词本条目
function deleteVocabItem(index) {
    state.vocab.splice(index, 1);
    saveVocab();
    updateVocabCount();
    renderVocabList();
}

// 显示提示
function showToast(message) {
    // 简单 toast 实现
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--text);
        color: var(--bg);
        padding: 12px 24px;
        border-radius: 24px;
        font-size: 14px;
        z-index: 2000;
        animation: fadeIn 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// HTML 转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 事件绑定
els.playBtn.addEventListener('click', togglePlay);
els.prevBtn.addEventListener('click', prevLine);
els.nextBtn.addEventListener('click', nextLine);
els.repeatBtn.addEventListener('click', toggleRepeat);
els.vocabBtn.addEventListener('click', toggleVocabSidebar);
els.wordPopupOverlay.addEventListener('click', closeWordPopup);

// 键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch(e.key) {
        case ' ':
            e.preventDefault();
            togglePlay();
            break;
        case 'ArrowUp':
            e.preventDefault();
            prevLine();
            break;
        case 'ArrowDown':
            e.preventDefault();
            nextLine();
            break;
        case 'Escape':
            closeWordPopup();
            if (els.vocabSidebar.classList.contains('show')) {
                toggleVocabSidebar();
            }
            break;
        case 'r':
        case 'R':
            toggleRepeat();
            break;
    }
});

// 初始化
init();
