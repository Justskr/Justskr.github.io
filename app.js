// 单词学习系统 - 模块化重构版本

// 基于随机种子的伪随机数生成器
class SeededRandom {
    constructor(seed) {
        this.seed = this.hashString(seed.toString());
    }

    // 将字符串转换为数字哈希
    hashString(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash);
    }

    // 生成0到1之间的随机数
    next() {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }

    // 生成指定范围内的随机整数
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    // 从数组中随机选择一个元素
    nextChoice(array) {
        return array[this.nextInt(0, array.length - 1)];
    }

    // 打乱数组（Fisher-Yates算法）
    shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }
}

// 核心命名空间
const WordTester = {
    // ==================== 状态管理 ====================
    state: {
        // 单词数据
        words: {
            list: [],
            currentBookType: '默认词书'
        },
        
        // 学习会话
        session: {
            current: null,
            mode: null,
            words: [],
            currentIndex: 0,
            correctCount: 0,
            incorrectCount: 0,
            errorQueue: [], // 错误单词队列
            questionsAnswered: 0, // 已回答的问题数量
            answeredWords: {} // 存储已回答单词的状态
        },
        
        // 综合训练
        comprehensive: {
            questions: [],
            totalQuestions: 0,
            scores: {
                correct: 0,
                incorrect: 0,
                total: 0,
                score: 0,
                cteCount: 0,
                etcCount: 0,
                ctecCount: 0
            }
        }
    },

    // ==================== 初始化 ====================
    // DOM 加载完成后执行
    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.initializeApp();
            this.bindEvents();
        });
    },

    // 初始化应用
    initializeApp() {
        this.clearAllData();
        this.initSpeechSynthesis();
        this.loadDefaultWordBook();
        
        // 初始化图表实例
        this.accuracyChartInstance = null;
        this.errorChartInstance = null;
    },

    // ==================== 事件绑定 ====================
    // 绑定所有事件
    bindEvents() {
        this.bindNavigationEvents();
        this.bindUploadModalEvents();
        this.bindModePageEvents();
        this.bindChineseToEnglishEvents();
        this.bindEnglishToChineseEvents();
        this.bindChineseToEnglishChoiceEvents();
        this.bindComprehensiveTrainingEvents();
        this.bindStatsPageEvents();
        this.bindHelpModalEvents();
    },

    // 通用事件绑定函数
    bindEvent(elementId, eventType, callback) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, callback.bind(this));
        }
    },

    // 通用多个事件绑定函数
    bindEventsToElements(eventsConfig) {
        eventsConfig.forEach(config => {
            this.bindEvent(config.elementId, config.eventType, config.callback);
        });
    },

    // ==================== 核心模块 ====================
    // 加载默认词书
    loadDefaultWordBook() {
        fetch('test-words.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('无法加载默认词书');
                }
                return response.json();
            })
            .then(data => {
                if (Array.isArray(data)) {
                    this.state.words.list = data.map((item, index) => ({
                        id: index + 1,
                        english: item.english || item.en || item.word,
                        chinese: item.chinese || item.cn || item.meaning,
                        isStudied: false,
                        isCorrect: false,
                        studyCount: 0,
                        errorCount: 0,
                        lastStudied: null,
                        lastError: null
                    }));
                    
                    this.state.words.currentBookType = '默认词书';
                    this.updateWordStats();
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                } else {
                    console.error('默认词书格式错误');
                    document.getElementById('upload-modal').classList.remove('hidden');
                }
            })
            .catch(error => {
                console.error('加载默认词书失败:', error);
                document.getElementById('upload-modal').classList.remove('hidden');
            });
    },

    // 处理文件上传
    handleFileUpload(file) {
        const loadingSpinner = document.getElementById('modal-loading-spinner');
        const successIcon = document.getElementById('modal-success-icon');
        loadingSpinner.classList.remove('scale-0', 'opacity-0', 'hidden');
        successIcon.classList.add('scale-0', 'opacity-0');
        
        if (!this.validateFileType(file)) {
            return;
        }
        
        document.getElementById('modal-upload-status').classList.remove('hidden');
        document.getElementById('modal-status-message').textContent = '正在解析文件...';
        
        this.parseJsonFile(file)
            .then(words => {
                if (words.length > 0) {
                    this.state.words.list = words;
                    this.state.words.currentBookType = '用户上传';
                    
                    loadingSpinner.classList.add('scale-0', 'opacity-0');
                    setTimeout(() => {
                        loadingSpinner.classList.add('hidden');
                        successIcon.classList.remove('scale-0', 'opacity-0');
                    }, 300);
                    
                    document.getElementById('modal-status-message').textContent = `成功解析 ${words.length} 个单词`;
                    
                    setTimeout(() => {
                        document.getElementById('upload-modal').classList.add('hidden');
                        this.showPage('mode-page');
                        this.updateNavigationState('mode-page');
                    }, 1500);
                } else {
                    document.getElementById('modal-status-message').textContent = '无法从JSON文件中解析单词，请检查文件格式';
                }
            })
            .catch(error => {
                console.error('JSON文件解析错误:', error);
                document.getElementById('modal-status-message').textContent = `解析失败: ${error.message}`;
            });
    },

    // 验证文件类型
    validateFileType(file) {
        const fileExtension = file.name.toLowerCase().substr(file.name.lastIndexOf('.'));
        if (fileExtension === '.json') {
            return true;
        }
        alert('请上传.json格式的文件');
        return false;
    },

    // 解析JSON文件
    parseJsonFile(file) {
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
            reader.onload = (e) => {
                try {
                    const jsonText = e.target.result;
                    const jsonData = JSON.parse(jsonText);
                    const words = this.parseJsonIntoWordList(jsonData);
                    resolve(words);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    // 解析JSON数据为单词列表
    parseJsonIntoWordList(jsonData) {
        const words = [];
        const jsonArray = Array.isArray(jsonData) ? jsonData : [jsonData];
        
        for (let i = 0; i < jsonArray.length; i++) {
            const item = jsonArray[i];
            const english = item.english || item.en || item.word;
            const chinese = item.chinese || item.cn || item.meaning;
            
            if (english && chinese) {
                words.push({
                    id: i + 1,
                    english: english.trim(),
                    chinese: chinese.trim(),
                    isStudied: false,
                    isCorrect: null,
                    studyCount: 0,
                    errorCount: 0,
                    lastStudied: null,
                    lastError: null
                });
            }
        }
        return words;
    },

    // 清空所有数据
    clearAllData() {
        this.state.words.list = [];
        this.state.session.words = [];
        this.state.session.currentIndex = 0;
        this.state.session.correctCount = 0;
        this.state.session.incorrectCount = 0;
        this.state.session.current = null;
        this.state.comprehensive.questions = [];
        this.state.comprehensive.totalQuestions = 0;
        this.state.comprehensive.scores = {
            correct: 0,
            incorrect: 0,
            total: 0,
            score: 0,
            cteCount: 0,
            etcCount: 0,
            ctecCount: 0
        };
    },

    // 重置统计数据
    resetStatistics() {
        for (const word of this.state.words.list) {
            word.isStudied = false;
            word.isCorrect = null;
            word.studyCount = 0;
            word.lastStudied = null;
        }
    },

    // ==================== 模式模块 ====================

    // 开始汉语提示拼写模式
    startChineseToEnglishMode() {
        this.state.session.mode = 'chinese-to-english';
        this.prepareStudyWords();
        this.resetStudyState();
        
        this.state.session.current = {
            mode: 'chinese-to-english',
            totalWords: this.state.session.words.length,
            completedWords: 0,
            correctCount: 0,
            incorrectCount: 0,
            currentWordIndex: 0,
            startTime: new Date().toISOString(),
            endTime: null
        };
        
        this.showPage('chinese-to-english-page');
        this.updateNavigationState('chinese-to-english-page');
        this.updateChineseToEnglishUI();
    },

    // 开始英文选汉语模式
    startEnglishToChineseMode() {
        this.state.session.mode = 'english-to-chinese';
        this.prepareStudyWords();
        this.resetStudyState();
        
        this.state.session.current = {
            mode: 'english-to-chinese',
            totalWords: this.state.session.words.length,
            completedWords: 0,
            correctCount: 0,
            incorrectCount: 0,
            currentWordIndex: 0,
            startTime: new Date().toISOString(),
            endTime: null
        };
        
        this.showPage('english-to-chinese-page');
        this.updateNavigationState('english-to-chinese-page');
        this.updateEnglishToChineseUI();
    },

    // 开始汉语选英文模式
    startChineseToEnglishChoiceMode() {
        this.state.session.mode = 'chinese-to-english-choice';
        this.prepareStudyWords();
        this.resetStudyState();
        
        this.state.session.current = {
            mode: 'chinese-to-english-choice',
            totalWords: this.state.session.words.length,
            completedWords: 0,
            correctCount: 0,
            incorrectCount: 0,
            currentWordIndex: 0,
            startTime: new Date().toISOString(),
            endTime: null
        };
        
        this.showPage('chinese-to-english-choice-page');
        this.updateNavigationState('chinese-to-english-choice-page');
        this.updateChineseToEnglishChoiceUI();
    },

    // 开始综合训练模式
    startComprehensiveTrainingMode() {
        this.showPage('comprehensive-training-page');
        this.updateNavigationState('comprehensive-training-page');
        
        this.state.comprehensiveTrainingQuestions = [];
        this.state.comprehensiveTrainingTotalQuestions = 0;
        this.state.comprehensiveTrainingScores = {
            correct: 0,
            incorrect: 0,
            total: 0,
            score: 0,
            cteCount: 0,
            etcCount: 0,
            ctecCount: 0
        };
        
        document.getElementById('ct-start-section').classList.remove('hidden');
        document.getElementById('ct-exercise-section').classList.add('hidden');
        document.getElementById('ct-result-section').classList.add('hidden');
    },

    // 准备学习单词
    prepareStudyWords() {
        const wordsWithPriority = this.state.words.list.map(word => {
            let priority = 0;
            const studyCount = word.studyCount || 0;
            const errorCount = word.errorCount || 0;
            const correctCount = studyCount - errorCount;
            
            // 计算熟练度
            const proficiency = studyCount > 0 ? Math.min(100, Math.round((correctCount / studyCount) * 100)) : 0;
            
            // 基础优先级
            if (!word.isStudied) priority += 100;
            priority += errorCount * 20;
            
            // 错误时间权重
            if (word.lastError) {
                const daysSinceError = (Date.now() - new Date(word.lastError).getTime()) / (1000 * 60 * 60 * 24);
                priority += Math.max(0, 50 - daysSinceError * 5);
            }
            
            // 学习次数权重
            priority += Math.max(0, 30 - studyCount * 3);
            
            // 正确率权重
            if (studyCount > 0) {
                const accuracy = correctCount / studyCount;
                priority += (1 - accuracy) * 40;
            }
            
            // 熟练度权重
            priority += (100 - proficiency) * 0.5;
            
            // 记忆曲线调整
            if (word.lastStudied) {
                const hoursSinceStudied = (Date.now() - new Date(word.lastStudied).getTime()) / (1000 * 60 * 60);
                const memoryPoints = [1, 6, 24, 48, 72];
                
                for (const point of memoryPoints) {
                    if (Math.abs(hoursSinceStudied - point) < 1) {
                        priority += 30;
                        break;
                    }
                }
            }
            
            return {
                ...word,
                priority,
                proficiency,
                difficultyLevel: errorCount >= 3 ? 'hard' : errorCount >= 1 ? 'medium' : 'easy'
            };
        });
        
        this.state.session.words = this.generateProbabilisticWordList(wordsWithPriority);
    },

    // 生成基于概率的随机学习列表
    generateProbabilisticWordList(wordsWithPriority) {
        const totalPriority = wordsWithPriority.reduce((sum, word) => sum + word.priority, 0);
        
        const wordsWithProbability = wordsWithPriority.map(word => ({
            ...word,
            probability: totalPriority > 0 ? word.priority / totalPriority : 1 / wordsWithPriority.length
        }));
        
        const resultList = [];
        let availableWords = [...wordsWithProbability];
        
        while (availableWords.length > 0) {
            const selectedWord = this.selectWordByProbability(availableWords);
            resultList.push({
                id: selectedWord.id,
                english: selectedWord.english,
                chinese: selectedWord.chinese
            });
            availableWords = availableWords.filter(word => word.id !== selectedWord.id);
        }
        
        return resultList;
    },

    // 基于概率选择单词
    selectWordByProbability(words) {
        const random = Math.random();
        let cumulativeProbability = 0;
        
        for (const word of words) {
            cumulativeProbability += word.probability;
            if (random <= cumulativeProbability) {
                return word;
            }
        }
        
        return words[0];
    },

    // 重置学习状态
    resetStudyState() {
        this.state.session.currentIndex = 0;
        this.state.session.correctCount = 0;
        this.state.session.incorrectCount = 0;
        this.state.session.errorQueue = [];
        this.state.session.questionsAnswered = 0;
        this.state.session.answeredWords = {};
        this.state.session.wordAppearanceCount = {}; // 记录每个单词在当前会话中出现的次数
        
        // 隐藏所有反馈信息div
        const feedbackDivs = [
            'cte-feedback',
            'etc-feedback',
            'ctec-feedback',
            'ct-feedback'
        ];
        
        feedbackDivs.forEach(divId => {
            const div = document.getElementById(divId);
            if (div) {
                div.classList.add('hidden');
            }
        });
    },

    // 获取单词在当前会话中的出现次数
    getWordAppearanceCount(wordId) {
        if (!this.state.session.wordAppearanceCount[wordId]) {
            this.state.session.wordAppearanceCount[wordId] = 0;
        }
        return this.state.session.wordAppearanceCount[wordId];
    },

    // 增加单词的出现次数并返回新的次数
    incrementWordAppearanceCount(wordId) {
        if (!this.state.session.wordAppearanceCount[wordId]) {
            this.state.session.wordAppearanceCount[wordId] = 0;
        }
        this.state.session.wordAppearanceCount[wordId]++;
        return this.state.session.wordAppearanceCount[wordId];
    },

    // 生成答题状态的唯一键（使用 word.id 和出现次数的组合）
    getAnswerKey(wordId) {
        const appearanceCount = this.getWordAppearanceCount(wordId);
        return `${wordId}_${appearanceCount}`;
    },

    // ==================== UI 模块 ====================

    // 显示指定页面
    showPage(pageId) {
        document.querySelectorAll('.page-section').forEach(page => {
            page.classList.add('hidden');
        });
        
        // 隐藏所有反馈信息div
        const feedbackDivs = [
            'cte-feedback',
            'etc-feedback',
            'ctec-feedback',
            'ct-feedback'
        ];
        
        feedbackDivs.forEach(divId => {
            const div = document.getElementById(divId);
            if (div) {
                div.classList.add('hidden');
            }
        });
        
        // 重置所有"我有点忘了"按钮的状态
        const forgotButtons = [
            'cte-forgot-btn',
            'etc-forgot-btn',
            'ctec-forgot-btn'
        ];
        
        forgotButtons.forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.disabled = false;
            }
        });
        
        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            targetPage.classList.add('animate-bounce-in');
            
            setTimeout(() => {
                targetPage.classList.remove('animate-bounce-in');
            }, 600);
            
            if (pageId === 'stats-page') {
                this.updateStatsPage();
            }
        } else {
            console.error(`页面ID不存在: ${pageId}`);
            // 默认显示模式选择页面
            const modePage = document.getElementById('mode-page');
            if (modePage) {
                modePage.classList.remove('hidden');
            }
        }
    },

    // 更新导航状态
    updateNavigationState(activePageId) {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('text-primary', 'font-semibold');
            btn.classList.add('text-gray-600');
        });
        
        const navId = activePageId.replace('-page', '');
        const activeNavBtn = document.getElementById(`nav-${navId}`);
        const activeMobileNavBtn = document.getElementById(`mobile-nav-${navId}`);
        
        if (activeNavBtn) {
            activeNavBtn.classList.remove('text-gray-600');
            activeNavBtn.classList.add('text-primary', 'font-semibold');
        }
        
        if (activeMobileNavBtn) {
            activeMobileNavBtn.classList.remove('text-gray-600');
            activeMobileNavBtn.classList.add('text-primary', 'font-semibold');
        }
    },

    // 绑定导航事件
    bindNavigationEvents() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                let pageId = btn.id;
                // 先移除mobile-nav-前缀
                if (pageId.startsWith('mobile-nav-')) {
                    pageId = pageId.replace('mobile-nav-', '') + '-page';
                } 
                // 再移除nav-前缀
                else if (pageId.startsWith('nav-')) {
                    pageId = pageId.replace('nav-', '') + '-page';
                }
                this.showPage(pageId);
                this.updateNavigationState(pageId);
                
                // 平滑地隐藏移动端菜单
                const mobileMenu = document.getElementById('mobile-menu');
                mobileMenu.classList.add('opacity-0', 'translate-y-[-10px]');
                setTimeout(() => {
                    mobileMenu.classList.add('hidden');
                }, 300);
            });
        });
        
        this.bindEvent('mobile-menu-btn', 'click', () => {
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.remove('hidden');
                setTimeout(() => {
                    mobileMenu.classList.add('opacity-100');
                    mobileMenu.classList.remove('opacity-0', 'translate-y-[-10px]');
                }, 10);
            } else {
                mobileMenu.classList.add('opacity-0', 'translate-y-[-10px]');
                setTimeout(() => {
                    mobileMenu.classList.add('hidden');
                }, 300);
            }
        });
    },

    // 绑定上传模态框事件
    bindUploadModalEvents() {
        this.bindEvent('close-upload-modal', 'click', () => {
            document.getElementById('upload-modal').classList.add('hidden');
        });
        
        const dropArea = document.getElementById('modal-drop-area');
        const fileInput = document.getElementById('modal-file-input');
        
        if (dropArea) {
            dropArea.addEventListener('click', () => {
                fileInput.click();
            });
            
            const label = document.querySelector('#modal-drop-area label');
            if (label) {
                label.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
            
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, this.preventDefaults, false);
            });
            
            ['dragenter', 'dragover'].forEach(eventName => {
                dropArea.addEventListener(eventName, () => {
                    dropArea.classList.add('border-primary', 'drag-over');
                }, false);
            });
            
            ['dragleave', 'drop'].forEach(eventName => {
                dropArea.addEventListener(eventName, () => {
                    dropArea.classList.remove('border-primary', 'drag-over');
                }, false);
            });
            
            dropArea.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files.length > 0) {
                    this.handleFileUpload(files[0]);
                }
            }, false);
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0) {
                    this.handleFileUpload(fileInput.files[0]);
                }
            });
        }
    },

    // 阻止默认事件
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    },

    // 绑定模式选择页事件
    bindModePageEvents() {
        this.bindEventsToElements([
            {
                elementId: 'chinese-to-english-btn',
                eventType: 'click',
                callback: this.startChineseToEnglishMode
            },
            {
                elementId: 'english-to-chinese-btn',
                eventType: 'click',
                callback: this.startEnglishToChineseMode
            },
            {
                elementId: 'chinese-to-english-choice-btn',
                eventType: 'click',
                callback: this.startChineseToEnglishChoiceMode
            },
            {
                elementId: 'comprehensive-training-btn',
                eventType: 'click',
                callback: this.startComprehensiveTrainingMode
            },
            {
                elementId: 'change-book-btn',
                eventType: 'click',
                callback: () => {
                    this.state.words.list = [];
                    document.getElementById('upload-modal').classList.remove('hidden');
                    document.getElementById('modal-upload-status').classList.add('hidden');
                }
            }
        ]);
    },

    // 绑定汉语提示拼写模式事件
    bindChineseToEnglishEvents() {
        this.bindEventsToElements([
            {
                elementId: 'exit-cte-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            },
            {
                elementId: 'cte-check-btn',
                eventType: 'click',
                callback: this.checkChineseToEnglishAnswer
            },
            {
                elementId: 'cte-prev-btn',
                eventType: 'click',
                callback: this.goToPreviousChineseToEnglishWord
            },
            {
                elementId: 'cte-next-btn',
                eventType: 'click',
                callback: this.goToNextChineseToEnglishWord
            },
            {
                elementId: 'cte-forgot-btn',
                eventType: 'click',
                callback: () => this.handleForgotAnswer('cte')
            },
            {
                elementId: 'cte-review-btn',
                eventType: 'click',
                callback: this.reviewChineseToEnglishErrors
            },
            {
                elementId: 'cte-back-to-mode-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            }
        ]);
        
        // 特殊处理键盘事件
        const inputElement = document.getElementById('cte-english-input');
        if (inputElement) {
            inputElement.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const checkBtn = document.getElementById('cte-check-btn');
                    if (!checkBtn.disabled) {
                        this.checkChineseToEnglishAnswer();
                    } else {
                        const nextBtn = document.getElementById('cte-next-btn');
                        if (!nextBtn.disabled) {
                            this.goToNextChineseToEnglishWord();
                        }
                    }
                }
            });
        }
    },

    // 绑定英文选汉语模式事件
    bindEnglishToChineseEvents() {
        this.bindEventsToElements([
            {
                elementId: 'exit-etc-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            },
            {
                elementId: 'etc-prev-btn',
                eventType: 'click',
                callback: this.goToPreviousEnglishToChineseWord
            },
            {
                elementId: 'etc-next-btn',
                eventType: 'click',
                callback: this.goToNextEnglishToChineseWord
            },
            {
                elementId: 'etc-forgot-btn',
                eventType: 'click',
                callback: () => this.handleForgotAnswer('etc')
            },
            {
                elementId: 'etc-review-btn',
                eventType: 'click',
                callback: this.reviewEnglishToChineseErrors
            },
            {
                elementId: 'etc-back-to-mode-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            }
        ]);
    },

    // 绑定汉语选英文模式事件
    bindChineseToEnglishChoiceEvents() {
        this.bindEventsToElements([
            {
                elementId: 'exit-ctec-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            },
            {
                elementId: 'ctec-prev-btn',
                eventType: 'click',
                callback: this.goToPreviousChineseToEnglishChoiceWord
            },
            {
                elementId: 'ctec-next-btn',
                eventType: 'click',
                callback: this.goToNextChineseToEnglishChoiceWord
            },
            {
                elementId: 'ctec-review-btn',
                eventType: 'click',
                callback: this.reviewChineseToEnglishChoiceErrors
            },
            {
                elementId: 'ctec-back-to-mode-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            },
            {
                elementId: 'ctec-forgot-btn',
                eventType: 'click',
                callback: () => this.handleForgotAnswer('ctec')
            }
        ]);
    },

    // 绑定综合训练模式事件
    bindComprehensiveTrainingEvents() {
        this.bindEventsToElements([
            {
                elementId: 'exit-ct-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            },
            {
                elementId: 'ct-10-btn',
                eventType: 'click',
                callback: () => this.startComprehensiveTrainingExercise(10)
            },
            {
                elementId: 'ct-25-btn',
                eventType: 'click',
                callback: () => this.startComprehensiveTrainingExercise(25)
            },
            {
                elementId: 'ct-50-btn',
                eventType: 'click',
                callback: () => this.startComprehensiveTrainingExercise(50)
            },
            {
                elementId: 'ct-friend-battle-btn',
                eventType: 'click',
                callback: this.showFriendBattleModal
            },
            {
                elementId: 'close-friend-battle-modal',
                eventType: 'click',
                callback: this.hideFriendBattleModal
            },
            {
                elementId: 'cancel-friend-battle-btn',
                eventType: 'click',
                callback: this.hideFriendBattleModal
            },
            {
                elementId: 'start-friend-battle-btn',
                eventType: 'click',
                callback: this.startFriendBattle
            },
            {
                elementId: 'ct-prev-btn',
                eventType: 'click',
                callback: this.goToPreviousComprehensiveTrainingQuestion
            },
            {
                elementId: 'ct-next-btn',
                eventType: 'click',
                callback: this.goToNextComprehensiveTrainingQuestion
            },
            {
                elementId: 'ct-check-btn',
                eventType: 'click',
                callback: this.checkComprehensiveTrainingAnswer
            },
            {
                elementId: 'ct-review-btn',
                eventType: 'click',
                callback: this.reviewComprehensiveTrainingErrors
            },
            {
                elementId: 'ct-retry-errors-btn',
                eventType: 'click',
                callback: this.retryComprehensiveTrainingErrors
            },
            {
                elementId: 'ct-back-to-mode-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            }
        ]);
        
        // 特殊处理键盘事件
        const inputElement = document.getElementById('ct-input');
        if (inputElement) {
            inputElement.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const checkBtn = document.getElementById('ct-check-btn');
                    if (!checkBtn.disabled && !checkBtn.classList.contains('hidden')) {
                        this.checkComprehensiveTrainingAnswer();
                    } else {
                        const nextBtn = document.getElementById('ct-next-btn');
                        if (!nextBtn.disabled) {
                            this.goToNextComprehensiveTrainingQuestion();
                        }
                    }
                }
            });
        }
    },

    // 绑定统计页事件
    bindStatsPageEvents() {
        this.bindEventsToElements([
            {
                elementId: 'reset-stats-btn',
                eventType: 'click',
                callback: () => {
                    if (confirm('确定要重置所有统计数据吗？此操作不可恢复。')) {
                        this.resetStatistics();
                        this.updateStatsPage();
                    }
                }
            },
            {
                elementId: 'review-error-words-btn',
                eventType: 'click',
                callback: this.reviewErrorWords
            },
            {
                elementId: 'review-all-words-btn',
                eventType: 'click',
                callback: this.reviewAllWords
            },
            {
                elementId: 'view-all-words-btn',
                eventType: 'click',
                callback: this.showAllWordsModal
            },
            {
                elementId: 'close-all-words-modal',
                eventType: 'click',
                callback: this.hideAllWordsModal
            },
            {
                elementId: 'all-words-search',
                eventType: 'input',
                callback: this.searchAllWords
            },
            {
                elementId: 'export-error-words-btn',
                eventType: 'click',
                callback: this.showExportErrorWordsModal
            },
            {
                elementId: 'import-error-words-btn',
                eventType: 'click',
                callback: this.showImportErrorWordsModal
            },
            {
                elementId: 'close-export-error-words-modal',
                eventType: 'click',
                callback: this.hideExportErrorWordsModal
            },
            {
                elementId: 'cancel-export-error-words-btn',
                eventType: 'click',
                callback: this.hideExportErrorWordsModal
            },
            {
                elementId: 'confirm-export-error-words-btn',
                eventType: 'click',
                callback: this.exportErrorWords
            },
            {
                elementId: 'close-import-error-words-modal',
                eventType: 'click',
                callback: this.hideImportErrorWordsModal
            },
            {
                elementId: 'cancel-import-error-words-btn',
                eventType: 'click',
                callback: this.hideImportErrorWordsModal
            },
            {
                elementId: 'confirm-import-error-words-btn',
                eventType: 'click',
                callback: this.importErrorWords
            }
        ]);
    },

    // 绑定帮助模态框事件
    bindHelpModalEvents() {
        this.bindEventsToElements([
            {
                elementId: 'help-link',
                eventType: 'click',
                callback: (e) => {
                    e.preventDefault();
                    document.getElementById('help-modal').classList.remove('hidden');
                }
            },
            {
                elementId: 'close-help-modal',
                eventType: 'click',
                callback: () => {
                    document.getElementById('help-modal').classList.add('hidden');
                }
            }
        ]);
        
        // 特殊处理窗口点击事件
        window.addEventListener('click', (e) => {
            const modal = document.getElementById('help-modal');
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    },

    // ==================== 发音功能模块 ====================
    
    // 初始化语音合成
    initSpeechSynthesis() {
        if ('speechSynthesis' in window) {
            // 语音加载完成后设置
            const setVoice = () => {
                const voices = speechSynthesis.getVoices();
                this.americanEnglishVoice = voices.find(voice => 
                    voice.lang === 'en-US' && voice.name.includes('American')
                ) || voices.find(voice => 
                    voice.lang === 'en-US'
                ) || voices.find(voice => 
                    voice.name.includes('American')
                ) || voices[0]; // 如果没有美式英语，使用第一个可用语音
            };
            
            // 立即尝试设置
            setVoice();
            
            // 监听语音加载完成事件
            speechSynthesis.addEventListener('voiceschanged', setVoice);
        } else {
            console.warn('浏览器不支持语音合成');
            this.speechSupported = false;
        }
    },
    
    // 播放单词发音
    speakWord(word, callback) {
        if (!('speechSynthesis' in window)) {
            if (callback) callback();
            return;
        }
        
        // 取消任何正在进行的发音
        speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'en-US';
        utterance.rate = 0.7; // 进一步放慢语速，使发音更清晰
        utterance.pitch = 1.1; // 稍微提高音调，使发音更自然
        utterance.volume = 1;
        
        if (this.americanEnglishVoice) {
            utterance.voice = this.americanEnglishVoice;
        }
        
        // 发音完成回调
        utterance.onend = () => {
            if (callback) callback();
        };
        
        // 发音错误回调
        utterance.onerror = () => {
            console.error('发音失败');
            if (callback) callback();
        };
        
        speechSynthesis.speak(utterance);
    },
    
    // 检查语音合成是否可用
    isSpeechSupported() {
        return 'speechSynthesis' in window;
    },

    // ==================== 功能模块 ====================

    // 更新单词统计
    updateWordStats() {
        const totalWords = this.state.words.list.length;
        if (document.getElementById('stats-total-words')) {
            document.getElementById('stats-total-words').textContent = totalWords;
        }
    },

    // 更新统计页
    updateStatsPage() {
        const totalWords = this.state.words.list.length;
        const masteredWords = this.state.words.list.filter(word => word.isCorrect).length;
        const needPracticeWords = this.state.words.list.filter(word => word.isInErrorList).length;
        
        document.getElementById('stats-total-words').textContent = totalWords;
        document.getElementById('stats-mastered-words').textContent = masteredWords;
        document.getElementById('stats-need-practice-words').textContent = needPracticeWords;
        
        const progress = totalWords > 0 ? (masteredWords / totalWords) * 100 : 0;
        document.getElementById('stats-progress-value').style.width = `${progress}%`;
        document.getElementById('stats-progress-percentage').textContent = `${Math.round(progress)}%`;
        
        this.updateErrorWordsList();
    },

    // 从错误列表中删除单词
    removeWordFromErrorList(wordId) {
        const word = this.state.words.list.find(w => w.id === wordId);
        if (word) {
            word.isInErrorList = false;
            word.isCorrect = true; // 标记为正确，因为用户已经掌握了
            this.updateErrorWordsList();
        }
    },

    // 更新错误单词列表
    updateErrorWordsList() {
        const errorWords = this.state.words.list.filter(word => word.isInErrorList);
        const errorWordsList = document.getElementById('error-words-list');
        
        if (!errorWordsList) {
            return;
        }
        
        if (errorWords.length === 0) {
            errorWordsList.innerHTML = '<li class="py-2 text-center text-gray-500">暂无错误单词</li>';
            const reviewBtn = document.getElementById('review-error-words-btn');
            if (reviewBtn) {
                reviewBtn.disabled = true;
            }
            const reviewAllBtn = document.getElementById('review-all-words-btn');
            if (reviewAllBtn) {
                reviewAllBtn.disabled = true;
            }
            return;
        }
        
        errorWordsList.innerHTML = errorWords.map(word => `
            <li class="py-2 flex justify-between items-center" data-word-id="${word.id}">
                <div class="flex-1">
                    <span class="font-medium">${word.english}</span>
                    <span class="text-gray-600 ml-2">${word.chinese}</span>
                </div>
                <button class="delete-error-word-btn text-red-500 hover:text-red-700 ml-4 px-2 py-1 rounded hover:bg-red-50 transition-colors" data-word-id="${word.id}" title="从错误列表中删除">
                    <i class="fa fa-trash"></i>
                </button>
            </li>
        `).join('');
        
        // 绑定删除按钮事件
        const deleteButtons = errorWordsList.querySelectorAll('.delete-error-word-btn');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wordId = parseInt(btn.getAttribute('data-word-id'));
                this.removeWordFromErrorList(wordId);
            });
        });
        
        const reviewBtn = document.getElementById('review-error-words-btn');
        if (reviewBtn) {
            reviewBtn.disabled = false;
        }
        const reviewAllBtn = document.getElementById('review-all-words-btn');
        if (reviewAllBtn) {
            reviewAllBtn.disabled = false;
        }
    },

    // 通用导航函数
    goToPreviousWord(updateUIFunction) {
        if (this.state.session.currentIndex > 0) {
            this.state.session.currentIndex--;
            updateUIFunction.call(this);
        }
    },

    // 通用导航函数
    goToNextWord(updateUIFunction) {
        // 增加已回答问题数量
        this.state.session.questionsAnswered++;
        
        // 每回答五道题后，检查是否有错误单词需要重复出现（综合训练模式除外）
        if (this.state.session.mode !== 'comprehensive' && 
            this.state.session.questionsAnswered % 5 === 0 && 
            this.state.session.errorQueue.length > 0) {
            
            // 从错误队列中取出第一个错误单词
            const errorWord = this.state.session.errorQueue.shift();
            
            // 将错误单词插入到当前单词列表的下一个位置
            this.state.session.words.splice(this.state.session.currentIndex + 1, 0, {
                id: errorWord.id,
                english: errorWord.english,
                chinese: errorWord.chinese
            });
        }
        
        this.state.session.currentIndex++;
        updateUIFunction.call(this);
    },

    // 通用完成页面显示函数
    showCompletedPage(prefix, totalWords, correctCount, incorrectCount) {
        if (this.state.session.current) {
            this.state.session.current.endTime = new Date().toISOString();
        }
        
        document.getElementById(`${prefix}-word-card`).classList.add('hidden');
        document.getElementById(`${prefix}-completed`).classList.remove('hidden');
        
        document.getElementById(`${prefix}-total-count`).textContent = totalWords;
        document.getElementById(`${prefix}-correct-count`).textContent = correctCount;
        document.getElementById(`${prefix}-accuracy-rate`).textContent = `${Math.round((correctCount / totalWords) * 100)}%`;
        
        document.getElementById(`${prefix}-review-btn`).disabled = incorrectCount === 0;
    },

    // 通用错误复习函数
    reviewErrors(updateUIFunction) {
        const errorWords = this.state.session.words.filter((word, index) => {
            const wordInList = this.state.words.list.find(w => w.id === word.id);
            return wordInList && wordInList.isInErrorList;
        });
        
        if (errorWords.length === 0) {
            alert('没有错误单词需要复习');
            return;
        }
        
        this.state.session.words = [...errorWords];
        this.resetStudyState();
        updateUIFunction.call(this);
    },

    // 通用选项生成函数
    generateOptionButtons(options, containerId, callback) {
        const optionsElement = document.getElementById(containerId);
        optionsElement.innerHTML = '';
        
        options.forEach(option => {
            const optionButton = document.createElement('button');
            optionButton.className = 'option-button';
            optionButton.textContent = option;
            optionButton.setAttribute('data-option', option);
            optionButton.addEventListener('click', () => {
                callback.call(this, optionButton);
            });
            optionsElement.appendChild(optionButton);
        });
    },

    // 通用反馈显示函数
    showFeedback(elementId, isCorrect, correctAnswer, userInput = null) {
        const feedbackElement = document.getElementById(elementId);
        feedbackElement.classList.remove('hidden');
        
        if (isCorrect) {
            feedbackElement.className = 'correct-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-check-circle text-green-500 text-xl mr-2"></i>
                    <span>正确!</span>
                </div>
            `;
        } else {
            feedbackElement.className = 'incorrect-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-times-circle text-red-500 text-xl mr-2"></i>
                    <span>错误! 正确答案是: <strong>${correctAnswer}</strong></span>
                </div>
            `;
        }
    },

    // 通用选项反馈处理函数
    handleOptionFeedback(optionButtons, correctAnswer, selectedButton, isCorrect) {
        if (isCorrect) {
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                correctButton.classList.add('correct-option');
            }
        } else {
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                correctButton.classList.add('correct-option');
            }
            
            if (selectedButton.getAttribute('data-option') !== correctAnswer) {
                selectedButton.classList.add('incorrect-option');
            }
        }
        
        optionButtons.forEach(btn => {
            btn.disabled = true;
        });
    },

    // 通用进度和准确率更新函数
    updateProgressAndAccuracy(prefix, currentIndex, totalItems, correctCount, incorrectCount) {
        const progress = ((currentIndex + 1) / totalItems) * 100;
        document.getElementById(`${prefix}-progress-value`).style.width = `${progress}%`;
        document.getElementById(`${prefix}-progress-text`).textContent = `${currentIndex + 1}/${totalItems}`;
        
        const totalAnswered = correctCount + incorrectCount;
        const accuracy = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0;
        document.getElementById(`${prefix}-accuracy-text`).textContent = `正确率: ${accuracy}%`;
    },

    // 更新汉语提示拼写UI
    updateChineseToEnglishUI() {
        if (this.state.session.currentIndex >= this.state.session.words.length) {
            this.showCompletedPage('cte', this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
            return;
        }
        
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        document.getElementById('cte-chinese-meaning').textContent = currentWord.chinese;
        document.getElementById('cte-english-input').value = '';
        
        // 增加单词的出现次数
        this.incrementWordAppearanceCount(currentWord.id);
        
        // 检查当前单词是否已经被回答过（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('cte-feedback').classList.add('hidden');
        
        this.updateProgressAndAccuracy('cte', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        document.getElementById('cte-prev-btn').disabled = this.state.session.currentIndex === 0;
        
        if (answeredStatus) {
            // 已回答过，显示为已回答状态
            document.getElementById('cte-english-input').value = answeredStatus.correctAnswer;
            document.getElementById('cte-english-input').disabled = true;
            document.getElementById('cte-check-btn').disabled = true;
            document.getElementById('cte-forgot-btn').disabled = true;
            document.getElementById('cte-next-btn').disabled = false;
            
            // 显示反馈
            this.showFeedback('cte-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer, answeredStatus.userAnswer);
        } else {
            // 未回答过，显示为初始状态
            document.getElementById('cte-english-input').value = '';
            document.getElementById('cte-english-input').disabled = false;
            document.getElementById('cte-check-btn').disabled = false;
            document.getElementById('cte-forgot-btn').disabled = false;
            document.getElementById('cte-next-btn').disabled = true;
        }
        
        document.getElementById('cte-word-card').classList.remove('hidden');
        document.getElementById('cte-completed').classList.add('hidden');
        
        if (!answeredStatus) {
            document.getElementById('cte-english-input').focus();
        }
    },

    // 检查汉语提示拼写答案
    checkChineseToEnglishAnswer() {
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        const userInput = document.getElementById('cte-english-input').value.trim().toLowerCase();
        const correctAnswer = currentWord.english.toLowerCase();
        const isCorrect = userInput === correctAnswer;
        
        if (isCorrect) {
            this.state.session.correctCount++;
        } else {
            this.state.session.incorrectCount++;
        }
        
        this.updateWordStatus(currentWord.id, isCorrect, 'chinese-to-english');
        
        if (this.state.session.current) {
            this.state.session.current.completedWords++;
            this.state.session.current.correctCount = this.state.session.correctCount;
            this.state.session.current.incorrectCount = this.state.session.incorrectCount;
            this.state.session.current.currentWordIndex = this.state.session.currentIndex;
        }
        
        this.showFeedback('cte-feedback', isCorrect, currentWord.english, userInput);
        
        document.getElementById('cte-check-btn').disabled = true;
        document.getElementById('cte-next-btn').disabled = false;
        
        // 存储答题状态（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        this.state.session.answeredWords[answerKey] = {
            isCorrect: isCorrect,
            correctAnswer: currentWord.english,
            userAnswer: userInput,
            type: 'cte'
        };
        
        this.updateProgressAndAccuracy('cte', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        if (isCorrect) {
            // 为输入框添加放大动画效果
            const inputElement = document.getElementById('cte-english-input');
            
            // 同时开始播放发音和动画
            this.speakWord(currentWord.english, () => {
                // 发音完成后，等待一段时间，然后自动跳转到下一题
                setTimeout(() => {
                    inputElement.style.transform = 'scale(1)';
                    inputElement.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                    setTimeout(() => {
                        this.goToNextChineseToEnglishWord();
                    }, 300);
                }, 200);
            });
            
            // 立即开始动画效果
            inputElement.style.transform = 'scale(1.05)';
            inputElement.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
            inputElement.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        } else {
            // 播放正确答案的发音
            this.speakWord(currentWord.english);
        }
    },

    // 前往上一个汉语提示拼写单词
    goToPreviousChineseToEnglishWord() {
        this.goToPreviousWord(this.updateChineseToEnglishUI);
    },

    // 前往下一个汉语提示拼写单词
    goToNextChineseToEnglishWord() {
        this.goToNextWord(this.updateChineseToEnglishUI);
    },

    // 复习汉语提示拼写错误
    reviewChineseToEnglishErrors() {
        this.reviewErrors(this.updateChineseToEnglishUI);
    },

    // 更新英文选汉语UI
    updateEnglishToChineseUI() {
        if (this.state.session.currentIndex >= this.state.session.words.length) {
            this.showCompletedPage('etc', this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
            return;
        }
        
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        document.getElementById('etc-english-word').textContent = currentWord.english;
        
        // 增加单词的出现次数
        this.incrementWordAppearanceCount(currentWord.id);
        
        const options = this.generateOptions(currentWord, 'chinese');
        this.generateOptionButtons(options, 'etc-options', this.selectEnglishToChineseOption);
        
        // 检查当前单词是否已经被回答过（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('etc-feedback').classList.add('hidden');
        
        this.updateProgressAndAccuracy('etc', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        document.getElementById('etc-prev-btn').disabled = this.state.session.currentIndex === 0;
        
        if (answeredStatus) {
            // 已回答过，显示为已回答状态
            const optionButtons = document.querySelectorAll('#etc-options button');
            const correctAnswer = answeredStatus.correctAnswer;
            const userAnswer = answeredStatus.userAnswer;
            
            // 禁用所有选项按钮
            optionButtons.forEach(btn => {
                btn.disabled = true;
                if (btn.getAttribute('data-option') === correctAnswer) {
                    btn.classList.add('correct-option');
                    btn.style.backgroundColor = '#10b981';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#059669';
                } else if (btn.getAttribute('data-option') === userAnswer && !answeredStatus.isCorrect) {
                    btn.classList.add('incorrect-option');
                    btn.style.backgroundColor = '#ef4444';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#dc2626';
                }
            });
            
            document.getElementById('etc-next-btn').disabled = false;
            
            // 显示反馈
            this.showFeedback('etc-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer);
        } else {
            // 未回答过，显示为初始状态
            document.getElementById('etc-next-btn').disabled = true;
        }
        
        document.getElementById('etc-word-card').classList.remove('hidden');
        document.getElementById('etc-completed').classList.add('hidden');
    },

    // 生成选项
    generateOptions(currentWord, type) {
        const correctAnswer = type === 'chinese' ? currentWord.chinese : currentWord.english;
        const allOptions = this.state.words.list
            .filter(word => type === 'chinese' ? word.chinese !== correctAnswer : word.english !== correctAnswer)
            .map(word => type === 'chinese' ? word.chinese : word.english);
        
        allOptions.sort(() => Math.random() - 0.5);
        const wrongOptions = allOptions.slice(0, 3);
        const options = [correctAnswer, ...wrongOptions].sort(() => Math.random() - 0.5);
        
        return options;
    },

    // 选择英文选汉语选项
    selectEnglishToChineseOption(button) {
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        const userSelection = button.getAttribute('data-option');
        const correctAnswer = currentWord.chinese;
        const isCorrect = userSelection === correctAnswer;
        
        if (isCorrect) {
            this.state.session.correctCount++;
        } else {
            this.state.session.incorrectCount++;
        }
        
        this.updateWordStatus(currentWord.id, isCorrect, 'english-to-chinese');
        
        if (this.state.session.current) {
            this.state.session.current.completedWords++;
            this.state.session.current.correctCount = this.state.session.correctCount;
            this.state.session.current.incorrectCount = this.state.session.incorrectCount;
            this.state.session.current.currentWordIndex = this.state.session.currentIndex;
        }
        
        this.showFeedback('etc-feedback', isCorrect, correctAnswer);
        
        const optionButtons = document.querySelectorAll('#etc-options button');
        this.handleOptionFeedback(optionButtons, correctAnswer, button, isCorrect);
        
        // 存储答题状态（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        this.state.session.answeredWords[answerKey] = {
            isCorrect: isCorrect,
            correctAnswer: currentWord.chinese,
            userAnswer: userSelection,
            type: 'etc'
        };
        
        // 播放正确答案的发音
        if (isCorrect) {
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                // 立即开始动画效果
                correctButton.style.transform = 'scale(1.1)';
                correctButton.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
                correctButton.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            }
        }
        
        // 同时开始播放发音
        this.speakWord(currentWord.english, () => {
            // 发音完成后，等待一段时间，然后自动跳转到下一题
            if (isCorrect) {
                const correctButton = Array.from(optionButtons).find(btn => 
                    btn.getAttribute('data-option') === correctAnswer
                );
                if (correctButton) {
                    // 动画完成后，等待一段时间，然后自动跳转到下一题
                    setTimeout(() => {
                        correctButton.style.transform = 'scale(1)';
                        correctButton.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                        setTimeout(() => {
                            this.goToNextWord(this.updateEnglishToChineseUI);
                        }, 300);
                    }, 200);
                }
            } else {
                document.getElementById('etc-next-btn').disabled = false;
            }
        });
        
        this.updateProgressAndAccuracy('etc', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
    },

    // 前往上一个英文选汉语单词
    goToPreviousEnglishToChineseWord() {
        this.goToPreviousWord(this.updateEnglishToChineseUI);
    },

    // 前往下一个英文选汉语单词
    goToNextEnglishToChineseWord() {
        this.goToNextWord(this.updateEnglishToChineseUI);
    },

    // 复习英文选汉语错误
    reviewEnglishToChineseErrors() {
        this.reviewErrors(this.updateEnglishToChineseUI);
    },

    // 更新汉语选英文UI
    updateChineseToEnglishChoiceUI() {
        if (this.state.session.currentIndex >= this.state.session.words.length) {
            this.showCompletedPage('ctec', this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
            return;
        }
        
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        document.getElementById('ctec-chinese-meaning').textContent = currentWord.chinese;
        
        // 增加单词的出现次数
        this.incrementWordAppearanceCount(currentWord.id);
        
        const options = this.generateOptions(currentWord, 'english');
        this.generateOptionButtons(options, 'ctec-options', this.selectChineseToEnglishChoiceOption);
        
        // 检查当前单词是否已经被回答过（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('ctec-feedback').classList.add('hidden');
        
        this.updateProgressAndAccuracy('ctec', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        document.getElementById('ctec-prev-btn').disabled = this.state.session.currentIndex === 0;
        
        if (answeredStatus) {
            // 已回答过，显示为已回答状态
            const optionButtons = document.querySelectorAll('#ctec-options button');
            const correctAnswer = answeredStatus.correctAnswer;
            const userAnswer = answeredStatus.userAnswer;
            
            // 禁用所有选项按钮
            optionButtons.forEach(btn => {
                btn.disabled = true;
                if (btn.getAttribute('data-option') === correctAnswer) {
                    btn.classList.add('correct-option');
                    btn.style.backgroundColor = '#10b981';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#059669';
                } else if (btn.getAttribute('data-option') === userAnswer && !answeredStatus.isCorrect) {
                    btn.classList.add('incorrect-option');
                    btn.style.backgroundColor = '#ef4444';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#dc2626';
                }
            });
            
            document.getElementById('ctec-next-btn').disabled = false;
            document.getElementById('ctec-forgot-btn').disabled = true;
            
            // 显示反馈
            this.showFeedback('ctec-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer);
        } else {
            // 未回答过，显示为初始状态
            document.getElementById('ctec-next-btn').disabled = true;
            document.getElementById('ctec-forgot-btn').disabled = false;
        }
        
        document.getElementById('ctec-word-card').classList.remove('hidden');
        document.getElementById('ctec-completed').classList.add('hidden');
    },

    // 选择汉语选英文选项
    selectChineseToEnglishChoiceOption(button) {
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        const userSelection = button.getAttribute('data-option');
        const correctAnswer = currentWord.english;
        const isCorrect = userSelection === correctAnswer;
        
        if (isCorrect) {
            this.state.session.correctCount++;
        } else {
            this.state.session.incorrectCount++;
        }
        
        this.updateWordStatus(currentWord.id, isCorrect, 'chinese-to-english-choice');
        
        if (this.state.session.current) {
            this.state.session.current.completedWords++;
            this.state.session.current.correctCount = this.state.session.correctCount;
            this.state.session.current.incorrectCount = this.state.session.incorrectCount;
            this.state.session.current.currentWordIndex = this.state.session.currentIndex;
        }
        
        this.showFeedback('ctec-feedback', isCorrect, correctAnswer);
        
        const optionButtons = document.querySelectorAll('#ctec-options button');
        this.handleOptionFeedback(optionButtons, correctAnswer, button, isCorrect);
        
        // 存储答题状态（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        this.state.session.answeredWords[answerKey] = {
            isCorrect: isCorrect,
            correctAnswer: currentWord.english,
            userAnswer: userSelection,
            type: 'ctec'
        };
        
        // 为正确答案添加放大动画效果并同时播放发音
        if (isCorrect) {
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                // 同时开始播放发音和动画
                this.speakWord(currentWord.english, () => {
                    // 发音完成后，等待一段时间，然后自动跳转到下一题
                    setTimeout(() => {
                        correctButton.style.transform = 'scale(1)';
                        correctButton.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                        setTimeout(() => {
                            this.goToNextWord(this.updateChineseToEnglishChoiceUI);
                        }, 200);
                    }, 100);
                });
                
                // 立即开始动画效果
                correctButton.style.transform = 'scale(1.1)';
                correctButton.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
                correctButton.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            }
        } else {
            // 错误答案时播放发音
            this.speakWord(currentWord.english);
            document.getElementById('ctec-next-btn').disabled = false;
        }
        
        this.updateProgressAndAccuracy('ctec', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
    },

    // 前往上一个汉语选英文单词
    goToPreviousChineseToEnglishChoiceWord() {
        this.goToPreviousWord(this.updateChineseToEnglishChoiceUI);
    },

    // 前往下一个汉语选英文单词
    goToNextChineseToEnglishChoiceWord() {
        this.goToNextWord(this.updateChineseToEnglishChoiceUI);
    },

    // 复习汉语选英文错误
    reviewChineseToEnglishChoiceErrors() {
        this.reviewErrors(this.updateChineseToEnglishChoiceUI);
    },

    // 开始综合训练练习
    startComprehensiveTrainingExercise(totalQuestions, seed = null) {
        this.state.comprehensiveTrainingTotalQuestions = totalQuestions;
        this.state.comprehensiveTrainingSeed = seed;
        this.generateComprehensiveTrainingQuestions();
        
        this.resetStudyState();
        
        // 重置综合训练相关状态
        this.state.currentWordIndex = 0;
        this.state.correctCount = 0;
        this.state.incorrectCount = 0;
        this.state.trainingStartTime = new Date().getTime();
        this.state.comprehensiveTrainingErrors = [];
        
        document.getElementById('ct-start-section').classList.add('hidden');
        document.getElementById('ct-exercise-section').classList.remove('hidden');
        document.getElementById('ct-result-section').classList.add('hidden');
        
        this.updateComprehensiveTrainingUI();
    },

    // 生成综合训练问题
    generateComprehensiveTrainingQuestions() {
        this.state.comprehensiveTrainingQuestions = [];
        const modes = ['chinese-to-english', 'english-to-chinese', 'chinese-to-english-choice'];
        const totalQuestions = this.state.comprehensiveTrainingTotalQuestions;
        
        // 根据是否有种子选择随机数生成器
        const rng = this.state.comprehensiveTrainingSeed 
            ? new SeededRandom(this.state.comprehensiveTrainingSeed)
            : null;
        
        // 计算每种类型的题目数量，确保平均分配
        const baseCount = Math.floor(totalQuestions / modes.length);
        const remainder = totalQuestions % modes.length;
        
        const modeCounts = {};
        modes.forEach((mode, index) => {
            modeCounts[mode] = baseCount + (index < remainder ? 1 : 0);
        });
        
        // 生成题目列表
        const questions = [];
        Object.entries(modeCounts).forEach(([mode, count]) => {
            for (let i = 0; i < count; i++) {
                let randomIndex;
                if (rng) {
                    randomIndex = rng.nextInt(0, this.state.words.list.length - 1);
                } else {
                    randomIndex = Math.floor(Math.random() * this.state.words.list.length);
                }
                const wordId = this.state.words.list[randomIndex].id;
                questions.push({
                    mode: mode,
                    wordId: wordId
                });
            }
        });
        
        // 随机打乱题目顺序
        if (rng) {
            this.state.comprehensiveTrainingQuestions = rng.shuffle(questions);
        } else {
            this.state.comprehensiveTrainingQuestions = this.shuffleArray(questions);
        }
    },
    
    // 随机打乱数组
    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    },

    // 更新综合训练UI
    updateComprehensiveTrainingUI() {
        if (this.state.currentWordIndex >= this.state.comprehensiveTrainingQuestions.length) {
            this.showComprehensiveTrainingResult();
            return;
        }
        
        const currentQuestion = this.state.comprehensiveTrainingQuestions[this.state.currentWordIndex];
        const currentWord = this.state.words.list.find(word => word.id === currentQuestion.wordId);
        if (!currentWord) {
            console.error('找不到当前单词:', currentQuestion);
            return;
        }
        
        // 增加单词的出现次数
        this.incrementWordAppearanceCount(currentWord.id);
        
        document.getElementById('ct-question-type').textContent = this.getQuestionTypeText(currentQuestion.mode);
        
        if (currentQuestion.mode === 'chinese-to-english') {
            document.getElementById('ct-question-content').textContent = currentWord.chinese;
            document.getElementById('ct-options').classList.add('hidden');
            document.getElementById('ct-input-container').classList.remove('hidden');
            document.getElementById('ct-check-btn').classList.remove('hidden');
            document.getElementById('ct-check-btn').disabled = false; // 确保按钮处于启用状态
            document.getElementById('ct-input').value = '';
            document.getElementById('ct-input').focus(); // 自动聚焦输入框
        } else {
            document.getElementById('ct-question-content').textContent = currentQuestion.mode === 'english-to-chinese' ? currentWord.english : currentWord.chinese;
            document.getElementById('ct-options').classList.remove('hidden');
            document.getElementById('ct-input-container').classList.add('hidden');
            document.getElementById('ct-check-btn').classList.add('hidden');
            
            const options = this.generateOptions(currentWord, currentQuestion.mode === 'english-to-chinese' ? 'chinese' : 'english');
            const optionsElement = document.getElementById('ct-options');
            optionsElement.innerHTML = '';
            
            options.forEach(option => {
                const optionButton = document.createElement('button');
                optionButton.className = 'option-button';
                optionButton.textContent = option;
                optionButton.setAttribute('data-option', option);
                optionButton.addEventListener('click', () => {
                    this.selectComprehensiveTrainingOption(optionButton, currentQuestion, currentWord);
                });
                optionsElement.appendChild(optionButton);
            });
        }
        
        // 检查当前问题是否已经被回答过（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('ct-feedback').classList.add('hidden');
        
        const progress = ((this.state.currentWordIndex + 1) / this.state.comprehensiveTrainingQuestions.length) * 100;
        document.getElementById('ct-progress-value').style.width = `${progress}%`;
        document.getElementById('ct-progress-text').textContent = `${this.state.currentWordIndex + 1}/${this.state.comprehensiveTrainingQuestions.length}`;
        
        const totalAnswered = this.state.correctCount + this.state.incorrectCount;
        const accuracy = totalAnswered > 0 ? Math.round((this.state.correctCount / totalAnswered) * 100) : 0;
        document.getElementById('ct-accuracy-text').textContent = `正确率: ${accuracy}%`;
        
        document.getElementById('ct-prev-btn').disabled = this.state.currentWordIndex === 0;
        
        if (answeredStatus) {
            // 已回答过，显示为已回答状态
            if (currentQuestion.mode === 'chinese-to-english') {
                // 汉语提示拼写模式
                document.getElementById('ct-input').value = answeredStatus.correctAnswer;
                document.getElementById('ct-input').disabled = true;
                document.getElementById('ct-check-btn').disabled = true;
                document.getElementById('ct-next-btn').disabled = false;
                
                // 显示反馈
                this.showFeedback('ct-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer, answeredStatus.userAnswer);
            } else {
                // 选择题模式
                const optionButtons = document.querySelectorAll('#ct-options button');
                const correctAnswer = answeredStatus.correctAnswer;
                const userAnswer = answeredStatus.userAnswer;
                
                // 禁用所有选项按钮
                optionButtons.forEach(btn => {
                    btn.disabled = true;
                    if (btn.getAttribute('data-option') === correctAnswer) {
                        btn.classList.add('correct-option');
                        btn.style.backgroundColor = '#10b981';
                        btn.style.color = 'white';
                        btn.style.borderColor = '#059669';
                    } else if (btn.getAttribute('data-option') === userAnswer && !answeredStatus.isCorrect) {
                        btn.classList.add('incorrect-option');
                        btn.style.backgroundColor = '#ef4444';
                        btn.style.color = 'white';
                        btn.style.borderColor = '#dc2626';
                    }
                });
                
                document.getElementById('ct-next-btn').disabled = false;
                
                // 显示反馈
                this.showFeedback('ct-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer);
            }
        } else {
            // 未回答过，显示为初始状态
            document.getElementById('ct-next-btn').disabled = true;
        }
    },

    // 获取问题类型文本
    getQuestionTypeText(mode) {
        switch (mode) {
            case 'chinese-to-english': return '汉语提示拼写英文';
            case 'english-to-chinese': return '英文选汉语释义';
            case 'chinese-to-english-choice': return '汉语选英文';
            default: return '问题';
        }
    },

    // 选择综合训练选项
    selectComprehensiveTrainingOption(button, currentQuestion, currentWord) {
        const userSelection = button.getAttribute('data-option');
        const correctAnswer = currentQuestion.mode === 'english-to-chinese' ? currentWord.chinese : currentWord.english;
        const isCorrect = userSelection === correctAnswer;
        
        if (isCorrect) {
            this.state.correctCount++;
        } else {
            this.state.incorrectCount++;
            // 记录错误信息
            this.state.comprehensiveTrainingErrors.push({
                wordId: currentWord.id,
                english: currentWord.english,
                chinese: currentWord.chinese,
                mode: currentQuestion.mode,
                correctAnswer: correctAnswer,
                userAnswer: userSelection,
                timestamp: new Date().getTime()
            });
        }
        
        this.updateWordStatus(currentWord.id, isCorrect, currentQuestion.mode);
        
        const feedbackElement = document.getElementById('ct-feedback');
        feedbackElement.classList.remove('hidden');
        
        const optionButtons = document.querySelectorAll('#ct-options button');
        
        if (isCorrect) {
            feedbackElement.className = 'correct-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-check-circle text-green-500 text-xl mr-2"></i>
                    <span>正确!</span>
                </div>
            `;
            
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                correctButton.classList.add('correct-option');
                
                // 同时开始播放发音和动画
                this.speakWord(currentWord.english, () => {
                    // 发音完成后，等待一段时间，然后自动跳转到下一题
                    setTimeout(() => {
                        correctButton.style.transform = 'scale(1)';
                        correctButton.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                        setTimeout(() => {
                            this.state.currentWordIndex++;
                            this.updateComprehensiveTrainingUI();
                        }, 200);
                    }, 100);
                });
                
                // 立即开始动画效果
                correctButton.style.transform = 'scale(1.1)';
                correctButton.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
                correctButton.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            }
        } else {
            feedbackElement.className = 'incorrect-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-times-circle text-red-500 text-xl mr-2"></i>
                    <span>错误! 正确答案是: <strong>${correctAnswer}</strong></span>
                </div>
            `;
            
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                correctButton.classList.add('correct-option');
            }
            
            if (button.getAttribute('data-option') !== correctAnswer) {
                button.classList.add('incorrect-option');
            }
            
            // 播放正确答案的发音
            this.speakWord(currentWord.english);
            
            document.getElementById('ct-next-btn').disabled = false;
        }
        
        optionButtons.forEach(btn => {
            btn.disabled = true;
        });
        
        // 存储答题状态（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        this.state.session.answeredWords[answerKey] = {
            isCorrect: isCorrect,
            correctAnswer: correctAnswer,
            userAnswer: userSelection,
            type: 'ct'
        };
        
        if (!isCorrect) {
            document.getElementById('ct-next-btn').disabled = false;
        }
    },

    // 检查综合训练答案
    checkComprehensiveTrainingAnswer() {
        const currentQuestion = this.state.comprehensiveTrainingQuestions[this.state.currentWordIndex];
        const currentWord = this.state.words.list.find(word => word.id === currentQuestion.wordId);
        if (!currentWord) {
            console.error('找不到当前单词:', currentQuestion);
            return;
        }
        
        const userInput = document.getElementById('ct-input').value.trim().toLowerCase();
        const correctAnswer = currentWord.english.toLowerCase();
        const isCorrect = userInput === correctAnswer;
        
        if (isCorrect) {
            this.state.correctCount++;
        } else {
            this.state.incorrectCount++;
            // 记录错误信息
            this.state.comprehensiveTrainingErrors.push({
                wordId: currentWord.id,
                english: currentWord.english,
                chinese: currentWord.chinese,
                mode: currentQuestion.mode,
                correctAnswer: correctAnswer,
                userAnswer: userInput,
                timestamp: new Date().getTime()
            });
        }
        
        this.updateWordStatus(currentWord.id, isCorrect, currentQuestion.mode);
        
        const feedbackElement = document.getElementById('ct-feedback');
        feedbackElement.classList.remove('hidden');
        
        if (isCorrect) {
            feedbackElement.className = 'correct-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-check-circle text-green-500 text-xl mr-2"></i>
                    <span>正确!</span>
                </div>
            `;
            
            // 为输入框添加放大动画效果
            const inputElement = document.getElementById('ct-input');
            
            // 同时开始播放发音和动画
            this.speakWord(currentWord.english, () => {
                // 发音完成后，等待一段时间，然后自动跳转到下一题
                setTimeout(() => {
                    inputElement.style.transform = 'scale(1)';
                    inputElement.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                    setTimeout(() => {
                        this.goToNextComprehensiveTrainingQuestion();
                    }, 300);
                }, 200);
            });
            
            // 立即开始动画效果
            inputElement.style.transform = 'scale(1.05)';
            inputElement.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
            inputElement.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        } else {
            feedbackElement.className = 'incorrect-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-times-circle text-red-500 text-xl mr-2"></i>
                    <span>错误! 正确答案是: <strong>${currentWord.english}</strong></span>
                </div>
            `;
            
            // 播放正确答案的发音
            this.speakWord(currentWord.english);
        }
        
        document.getElementById('ct-check-btn').disabled = true;
        document.getElementById('ct-next-btn').disabled = false;
        
        // 存储答题状态（使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(currentWord.id);
        this.state.session.answeredWords[answerKey] = {
            isCorrect: isCorrect,
            correctAnswer: currentWord.english,
            userAnswer: userInput,
            type: 'ct'
        };
    },

    // 前往上一个综合训练问题
    goToPreviousComprehensiveTrainingQuestion() {
        if (this.state.currentWordIndex > 0) {
            this.state.currentWordIndex--;
            this.updateComprehensiveTrainingUI();
        }
    },

    // 前往下一个综合训练问题
    goToNextComprehensiveTrainingQuestion() {
        this.state.currentWordIndex++;
        this.updateComprehensiveTrainingUI();
    },

    // 显示综合训练结果
    showComprehensiveTrainingResult() {
        const totalQuestions = this.state.comprehensiveTrainingQuestions.length;
        const score = Math.round((this.state.correctCount / totalQuestions) * 100);
        
        // 计算训练时长
        const endTime = new Date().getTime();
        const duration = endTime - this.state.trainingStartTime;
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        const formattedDuration = `${minutes}分${seconds}秒`;
        
        document.getElementById('ct-exercise-section').classList.add('hidden');
        document.getElementById('ct-result-section').classList.remove('hidden');
        
        document.getElementById('ct-total-count').textContent = totalQuestions;
        document.getElementById('ct-correct-count').textContent = this.state.correctCount;
        document.getElementById('ct-score').textContent = score;
        
        const cteCount = this.state.comprehensiveTrainingQuestions.filter(q => q.mode === 'chinese-to-english').length;
        const etcCount = this.state.comprehensiveTrainingQuestions.filter(q => q.mode === 'english-to-chinese').length;
        const ctecCount = this.state.comprehensiveTrainingQuestions.filter(q => q.mode === 'chinese-to-english-choice').length;
        
        document.getElementById('ct-cte-count').textContent = cteCount;
        document.getElementById('ct-etc-count').textContent = etcCount;
        document.getElementById('ct-ctec-count').textContent = ctecCount;
        
        // 计算错误类型分布
        const errorDistribution = this.calculateErrorDistribution();
        
        // 显示训练时长
        this.showTrainingDuration(formattedDuration);
        
        // 延迟显示详细统计和图表，确保DOM已完全更新
        setTimeout(() => {
            this.showDetailedStatistics(errorDistribution);
        }, 100);
    },

    // 计算错误类型分布
    calculateErrorDistribution() {
        const errors = this.state.comprehensiveTrainingErrors || [];
        const distribution = {
            'chinese-to-english': 0,
            'english-to-chinese': 0,
            'chinese-to-english-choice': 0
        };
        
        errors.forEach(error => {
            if (distribution[error.mode] !== undefined) {
                distribution[error.mode]++;
            }
        });
        
        return distribution;
    },

    // 显示训练时长
    showTrainingDuration(duration) {
        const durationElement = document.getElementById('ct-duration');
        if (durationElement) {
            durationElement.textContent = duration;
        }
    },

    // 显示详细统计
    showDetailedStatistics(errorDistribution) {
        const errorRateElement = document.getElementById('ct-error-rate');
        if (errorRateElement) {
            const totalQuestions = this.state.comprehensiveTrainingQuestions.length;
            const errorRate = totalQuestions > 0 
                ? Math.round((this.state.incorrectCount / totalQuestions) * 100) 
                : 0;
            errorRateElement.textContent = `${errorRate}%`;
        }
        
        // 计算并显示平均答题时间
        const avgTimeElement = document.getElementById('ct-avg-time');
        if (avgTimeElement) {
            const totalQuestions = this.state.comprehensiveTrainingQuestions.length;
            const duration = new Date().getTime() - this.state.trainingStartTime;
            const avgTime = totalQuestions > 0 
                ? Math.round(duration / totalQuestions / 1000) 
                : 0;
            avgTimeElement.textContent = `${avgTime}秒`;
        }
        
        // 显示错误类型分布
        this.showErrorDistribution(errorDistribution);
    },

    // 显示错误类型分布
    showErrorDistribution(errorDistribution) {
        const cteErrorsElement = document.getElementById('ct-cte-errors');
        const etcErrorsElement = document.getElementById('ct-etc-errors');
        const ctecErrorsElement = document.getElementById('ct-ctec-errors');
        
        if (cteErrorsElement) {
            cteErrorsElement.textContent = errorDistribution['chinese-to-english'];
        }
        if (etcErrorsElement) {
            etcErrorsElement.textContent = errorDistribution['english-to-chinese'];
        }
        if (ctecErrorsElement) {
            ctecErrorsElement.textContent = errorDistribution['chinese-to-english-choice'];
        }
        
        // 渲染图表
        this.renderCharts(errorDistribution);
    },

    // 渲染图表
    renderCharts(errorDistribution) {
        const totalQuestions = this.state.comprehensiveTrainingQuestions.length;
        const correctCount = this.state.correctCount;
        const incorrectCount = this.state.incorrectCount;
        
        console.log('开始渲染图表:', { correctCount, incorrectCount, errorDistribution });
        
        // 渲染正确率饼图
        this.renderAccuracyChart(correctCount, incorrectCount);
        
        // 渲染错误类型分布柱状图
        this.renderErrorDistributionChart(errorDistribution);
    },

    // 渲染正确率饼图
    renderAccuracyChart(correctCount, incorrectCount) {
        console.log('渲染正确率饼图:', correctCount, incorrectCount);
        
        // 检查Chart是否可用
        if (typeof Chart === 'undefined') {
            console.error('Chart.js未加载，等待加载...');
            // 延迟重试
            setTimeout(() => {
                this.renderAccuracyChart(correctCount, incorrectCount);
            }, 500);
            return;
        }
        
        const canvas = document.getElementById('ct-accuracy-chart');
        if (!canvas) {
            console.error('找不到ct-accuracy-chart元素');
            return;
        }
        const ctx = canvas.getContext('2d');
        
        // 销毁已存在的图表
        if (this.accuracyChartInstance) {
            this.accuracyChartInstance.destroy();
        }
        
        console.log('Chart对象:', typeof Chart);
        
        this.accuracyChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['正确', '错误'],
                datasets: [{
                    data: [correctCount, incorrectCount],
                    backgroundColor: ['#10b981', '#ef4444'],
                    borderColor: ['#059669', '#dc2626'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return `${context.label}: ${context.raw} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    },

    // 渲染错误类型分布柱状图
    renderErrorDistributionChart(errorDistribution) {
        console.log('渲染错误类型分布柱状图:', errorDistribution);
        
        // 检查Chart是否可用
        if (typeof Chart === 'undefined') {
            console.error('Chart.js未加载，等待加载...');
            // 延迟重试
            setTimeout(() => {
                this.renderErrorDistributionChart(errorDistribution);
            }, 500);
            return;
        }
        
        const canvas = document.getElementById('ct-error-chart');
        if (!canvas) {
            console.error('找不到ct-error-chart元素');
            return;
        }
        const ctx = canvas.getContext('2d');
        
        // 销毁已存在的图表
        if (this.errorChartInstance) {
            this.errorChartInstance.destroy();
        }
        
        const labels = {
            'chinese-to-english': '汉语提示拼写',
            'english-to-chinese': '英文选汉语',
            'chinese-to-english-choice': '汉语选英文'
        };
        
        this.errorChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(errorDistribution).map(key => labels[key]),
                datasets: [{
                    label: '错误数量',
                    data: Object.values(errorDistribution),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
                    borderColor: ['#2563eb', '#059669', '#d97706'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    },

    // 复习综合训练错误
    reviewComprehensiveTrainingErrors() {
        const errors = this.state.comprehensiveTrainingErrors || [];
        
        if (errors.length === 0) {
            alert('本次训练没有错误单词');
            return;
        }
        
        const errorListSection = document.getElementById('ct-error-list-section');
        const errorWordsContainer = document.getElementById('ct-error-words-container');
        
        errorListSection.classList.remove('hidden');
        errorWordsContainer.innerHTML = '';
        
        const modeLabels = {
            'chinese-to-english': '汉语提示拼写',
            'english-to-chinese': '英文选汉语',
            'chinese-to-english-choice': '汉语选英文'
        };
        
        errors.forEach((error, index) => {
            const errorItem = document.createElement('div');
            errorItem.className = 'bg-white rounded-lg p-4 shadow-sm';
            
            const modeLabel = modeLabels[error.mode] || error.mode;
            
            errorItem.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="inline-flex items-center justify-center w-6 h-6 bg-red-100 text-red-600 rounded-full text-sm font-bold">${index + 1}</span>
                            <span class="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">${modeLabel}</span>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-gray-600 mb-1">英文</p>
                                <p class="text-lg font-bold text-gray-800">${error.english}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-600 mb-1">中文</p>
                                <p class="text-lg font-bold text-gray-800">${error.chinese}</p>
                            </div>
                        </div>
                        <div class="mt-2">
                            <p class="text-sm text-gray-600">正确答案: <span class="font-bold text-green-600">${error.correctAnswer}</span></p>
                            <p class="text-sm text-gray-600">你的答案: <span class="font-bold text-red-600">${error.userAnswer || '未作答'}</span></p>
                        </div>
                    </div>
                </div>
            `;
            
            errorWordsContainer.appendChild(errorItem);
        });
        
        // 滚动到错误列表
        errorListSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // 重新练习错误单词
    retryComprehensiveTrainingErrors() {
        const errors = this.state.comprehensiveTrainingErrors || [];
        
        if (errors.length === 0) {
            alert('没有错误单词可以练习');
            return;
        }
        
        // 从错误单词中提取唯一的单词
        const uniqueWords = [];
        const seenWordIds = new Set();
        
        errors.forEach(error => {
            if (!seenWordIds.has(error.wordId)) {
                seenWordIds.add(error.wordId);
                uniqueWords.push({
                    id: error.wordId,
                    english: error.english,
                    chinese: error.chinese
                });
            }
        });
        
        if (uniqueWords.length === 0) {
            alert('没有错误单词可以练习');
            return;
        }
        
        // 创建新的训练题目
        const retryQuestions = [];
        const modes = ['chinese-to-english', 'english-to-chinese', 'chinese-to-english-choice'];
        
        uniqueWords.forEach(word => {
            const mode = modes[Math.floor(Math.random() * modes.length)];
            retryQuestions.push({
                word: word,
                mode: mode
            });
        });
        
        // 重新开始训练
        this.state.comprehensiveTrainingQuestions = retryQuestions;
        this.state.currentQuestionIndex = 0;
        this.state.correctCount = 0;
        this.state.incorrectCount = 0;
        this.state.comprehensiveTrainingErrors = [];
        this.state.trainingStartTime = new Date().getTime();
        
        // 显示练习界面
        document.getElementById('ct-result-section').classList.add('hidden');
        document.getElementById('ct-error-list-section').classList.add('hidden');
        document.getElementById('ct-exercise-section').classList.remove('hidden');
        
        // 显示第一题
        this.displayComprehensiveTrainingQuestion();
    },

    // 显示好友对战模态框
    showFriendBattleModal() {
        const modal = document.getElementById('friend-battle-modal');
        modal.classList.remove('hidden');
        
        // 清空输入框并聚焦
        const input = document.getElementById('room-number-input');
        input.value = '';
        input.focus();
    },

    // 隐藏好友对战模态框
    hideFriendBattleModal() {
        const modal = document.getElementById('friend-battle-modal');
        modal.classList.add('hidden');
    },

    // 开始好友对战
    startFriendBattle() {
        const input = document.getElementById('room-number-input');
        const roomNumber = input.value.trim();
        
        // 验证房间号
        if (!roomNumber) {
            alert('请输入房间号');
            return;
        }
        
        // 验证房间号格式（只允许数字）
        if (!/^\d+$/.test(roomNumber)) {
            alert('房间号只能包含数字');
            return;
        }
        
        // 隐藏模态框
        this.hideFriendBattleModal();
        
        // 开始好友对战（固定10题，使用房间号作为随机种子）
        this.startComprehensiveTrainingExercise(10, roomNumber);
    },

    // 处理忘记答案
    handleForgotAnswer(type) {
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        const wordId = currentWord.id;
        const correctAnswer = type === 'etc' ? currentWord.chinese : currentWord.english;
        const feedbackSelector = type === 'etc' ? '#etc-feedback' : (type === 'ctec' ? '#ctec-feedback' : '#cte-feedback');
        const nextBtnSelector = type === 'etc' ? '#etc-next-btn' : (type === 'ctec' ? '#ctec-next-btn' : '#cte-next-btn');
        const forgotBtnSelector = type === 'etc' ? '#etc-forgot-btn' : (type === 'ctec' ? '#ctec-forgot-btn' : '#cte-forgot-btn');
        const checkBtnSelector = type === 'cte' ? '#cte-check-btn' : null;
        
        // 处理选择题模式
        if (type === 'etc' || type === 'ctec') {
            const optionsSelector = type === 'etc' ? '#etc-options' : '#ctec-options';
            const optionButtons = document.querySelectorAll(optionsSelector + ' button');
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            
            if (correctButton) {
                correctButton.classList.add('correct-option');
                correctButton.style.backgroundColor = '#10b981';
                correctButton.style.color = 'white';
                correctButton.style.borderColor = '#059669';
            }
            
            optionButtons.forEach(btn => {
                btn.disabled = true;
            });
        } 
        // 处理输入模式（汉语提示拼写）
        else if (type === 'cte') {
            const inputElement = document.getElementById('cte-english-input');
            inputElement.value = currentWord.english;
            inputElement.disabled = true;
            
            if (checkBtnSelector) {
                document.getElementById(checkBtnSelector.replace('#', '')).disabled = true;
            }
        }
        
        // 根据type参数确定mode
        let mode;
        switch(type) {
            case 'cte':
                mode = 'chinese-to-english';
                break;
            case 'etc':
                mode = 'english-to-chinese';
                break;
            case 'ctec':
                mode = 'chinese-to-english-choice';
                break;
            default:
                mode = 'chinese-to-english'; // 默认值
        }
        
        this.updateWordStatus(wordId, false, mode);
        this.state.session.incorrectCount++;
        
        // 存储答题状态（标记为忘记，使用复合键：word.id + appearanceCount）
        const answerKey = this.getAnswerKey(wordId);
        this.state.session.answeredWords[answerKey] = {
            isCorrect: false,
            correctAnswer: correctAnswer,
            userAnswer: null,
            type: type,
            isForgot: true
        };
        
        const feedbackElement = document.getElementById(feedbackSelector.replace('#', ''));
        feedbackElement.classList.remove('hidden');
        feedbackElement.className = 'correct-feedback mb-6';
        feedbackElement.innerHTML = `
            <div class="flex items-center">
                <i class="fa fa-check-circle text-green-500 text-xl mr-2"></i>
                <span>正确答案是: <strong>${correctAnswer}</strong></span>
            </div>
        `;
        
        document.getElementById(nextBtnSelector.replace('#', '')).disabled = false;
        document.getElementById(forgotBtnSelector.replace('#', '')).disabled = true;
        
        const totalAnswered = this.state.session.correctCount + this.state.session.incorrectCount;
        const accuracy = Math.round((this.state.session.correctCount / totalAnswered) * 100);
        const accuracySelector = type === 'etc' ? '#etc-accuracy-text' : (type === 'ctec' ? '#ctec-accuracy-text' : '#cte-accuracy-text');
        document.getElementById(accuracySelector.replace('#', '')).textContent = `正确率: ${accuracy}%`;
        
        // 播放单词的英文发音
        this.speakWord(currentWord.english);
    },

    // 复习错误单词
    reviewErrorWords() {
        const errorWords = this.state.words.list.filter(word => word.isInErrorList);
        
        if (errorWords.length === 0) {
            alert('没有错误单词需要复习');
            return;
        }
        
        this.state.session.words = errorWords.map(word => ({
            id: word.id,
            english: word.english,
            chinese: word.chinese
        }));
        
        this.resetStudyState();
        this.startChineseToEnglishMode();
    },

    // 复习所有错误单词
    reviewAllWords() {
        // 只包含错误单词（标记为 isInErrorList 的单词）
        const errorWords = this.state.words.list
            .filter(word => word.isInErrorList);
        
        if (errorWords.length === 0) {
            alert('暂无错误单词需要练习！');
            return;
        }
        
        this.state.session.words = errorWords.map(word => ({
            id: word.id,
            english: word.english,
            chinese: word.chinese
        }));
        
        this.state.session.mode = 'chinese-to-english';
        this.resetStudyState();
        
        this.state.session.current = {
            mode: 'chinese-to-english',
            totalWords: this.state.session.words.length,
            completedWords: 0,
            correctCount: 0,
            incorrectCount: 0,
            currentWordIndex: 0,
            startTime: new Date().toISOString(),
            endTime: null
        };
        
        this.showPage('chinese-to-english-page');
        this.updateNavigationState('chinese-to-english-page');
        this.updateChineseToEnglishUI();
    },

    // 显示全部单词列表模态框
    showAllWordsModal() {
        const modal = document.getElementById('all-words-modal');
        modal.classList.remove('hidden');
        
        // 渲染单词列表
        this.renderAllWordsList();
    },

    // 隐藏全部单词列表模态框
    hideAllWordsModal() {
        const modal = document.getElementById('all-words-modal');
        modal.classList.add('hidden');
    },

    // 渲染全部单词列表
    renderAllWordsList(filterText = '') {
        const container = document.getElementById('all-words-container');
        const countElement = document.getElementById('all-words-count');
        
        let words = this.state.words.list;
        
        // 如果有搜索文本，进行过滤
        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            words = words.filter(word => 
                word.english.toLowerCase().includes(lowerFilter) ||
                word.chinese.includes(filterText)
            );
        }
        
        // 更新单词数量
        countElement.textContent = words.length;
        
        // 清空容器
        container.innerHTML = '';
        
        // 渲染单词卡片
        words.forEach(word => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow';
            
            const statusClass = word.isStudied 
                ? (word.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
                : 'bg-gray-200 text-gray-600';
            
            const statusText = word.isStudied 
                ? (word.isCorrect ? '已掌握' : '需复习')
                : '未学习';
            
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="text-lg font-semibold text-gray-800">${word.english}</span>
                    <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${statusText}</span>
                </div>
                <p class="text-gray-600">${word.chinese}</p>
            `;
            
            container.appendChild(card);
        });
        
        // 如果没有单词，显示提示
        if (words.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-8 text-gray-500">
                    <i class="fa fa-search text-4xl mb-4"></i>
                    <p>${filterText ? '未找到匹配的单词' : '暂无单词数据'}</p>
                </div>
            `;
        }
    },

    // 搜索全部单词
    searchAllWords(e) {
        const filterText = e.target.value.trim();
        this.renderAllWordsList(filterText);
    },

    // 显示导出错题模态框
    showExportErrorWordsModal() {
        const modal = document.getElementById('export-error-words-modal');
        modal.classList.remove('hidden');
    },

    // 隐藏导出错题模态框
    hideExportErrorWordsModal() {
        const modal = document.getElementById('export-error-words-modal');
        modal.classList.add('hidden');
    },

    // 显示导入错题模态框
    showImportErrorWordsModal() {
        const modal = document.getElementById('import-error-words-modal');
        modal.classList.remove('hidden');
        
        // 清空文件输入
        document.getElementById('import-file-input').value = '';
    },

    // 隐藏导入错题模态框
    hideImportErrorWordsModal() {
        const modal = document.getElementById('import-error-words-modal');
        modal.classList.add('hidden');
    },

    // 导出错题
    exportErrorWords() {
        const selectedFormat = document.querySelector('input[name="export-format"]:checked').value;
        
        // 获取错误单词
        const errorWords = this.state.words.list
            .filter(word => word.isInErrorList)
            .map(word => ({
                id: word.id,
                english: word.english,
                chinese: word.chinese,
                errorCount: word.errorCount || 1,
                lastErrorTime: word.lastErrorTime || new Date().toISOString()
            }));
        
        if (errorWords.length === 0) {
            alert('暂无错误单词可导出！');
            return;
        }
        
        switch (selectedFormat) {
            case 'json':
                this.exportAsJSON(errorWords);
                break;
            case 'word':
                this.exportAsWord(errorWords);
                break;
            case 'excel':
                this.exportAsExcel(errorWords);
                break;
        }
        
        this.hideExportErrorWordsModal();
    },

    // 以JSON格式导出
    exportAsJSON(words) {
        const data = {
            words: words,
            exportDate: new Date().toISOString(),
            count: words.length
        };
        
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `error-words-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`成功导出${words.length}个错误单词到JSON文件！`);
    },

    // 以Word格式导出
    exportAsWord(words) {
        // 创建HTML内容，使用UTF-8编码
        let htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>错误单词列表</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #333; }
        table { border-collapse: collapse; width: 100%; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .summary { margin-bottom: 20px; padding: 10px; background-color: #f0f0f0; }
    </style>
</head>
<body>
    <h1>错误单词列表</h1>
    <div class="summary">
        <p>导出日期: ${new Date().toLocaleString()}</p>
        <p>错误单词数量: ${words.length}</p>
    </div>
    <table>
        <tr>
            <th>序号</th>
            <th>英文单词</th>
            <th>中文释义</th>
            <th>错误次数</th>
            <th>最后错误时间</th>
        </tr>
`;
        
        words.forEach((word, index) => {
            htmlContent += `
        <tr>
            <td>${index + 1}</td>
            <td>${word.english}</td>
            <td>${word.chinese}</td>
            <td>${word.errorCount}</td>
            <td>${new Date(word.lastErrorTime).toLocaleString()}</td>
        </tr>`;
        });
        
        htmlContent += `
    </table>
</body>
</html>
`;
        
        // 创建Blob，使用正确的MIME类型
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `error-words-${timestamp}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`成功导出${words.length}个错误单词到HTML文件！您可以在Microsoft Word、Google Docs或LibreOffice中打开此文件。`);
    },
    exportAsExcel(words) {
        // 创建CSV内容，添加UTF-8 BOM以确保Excel正确识别编码
        let csvContent = '\ufeff序号,英文单词,中文释义,错误次数,最后错误时间\n';
        
        words.forEach((word, index) => {
            csvContent += `${index + 1},${word.english},${word.chinese},${word.errorCount},${new Date(word.lastErrorTime).toLocaleString()}\n`;
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `error-words-${timestamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`成功导出${words.length}个错误单词到CSV文件（可在Excel中打开）！`);
    },

    // 导入错题
    importErrorWords() {
        const fileInput = document.getElementById('import-file-input');
        
        if (!fileInput.files.length) {
            alert('请选择要导入的JSON文件！');
            return;
        }
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // 验证数据格式
                if (!data.words || !Array.isArray(data.words)) {
                    throw new Error('JSON文件格式不正确，缺少words数组！');
                }
                
                // 导入单词
                this.processImportedWords(data.words);
                this.hideImportErrorWordsModal();
            } catch (error) {
                alert(`导入失败：${error.message}`);
            }
        };
        
        reader.onerror = () => {
            alert('文件读取失败，请重试！');
        };
        
        reader.readAsText(file);
    },

    // 处理导入的单词
    processImportedWords(importedWords) {
        let importedCount = 0;
        
        importedWords.forEach(importedWord => {
            // 查找是否存在相同的单词（基于英文和中文的组合，而不是ID）
            const existingWord = this.state.words.list.find(w => 
                w.english === importedWord.english && w.chinese === importedWord.chinese
            );
            
            if (existingWord) {
                // 直接使用合并数据的逻辑
                existingWord.isStudied = true;
                existingWord.isCorrect = false;
                existingWord.errorCount = Math.max(existingWord.errorCount || 0, importedWord.errorCount || 1);
                // 使用较晚的错误时间
                const existingTime = existingWord.lastErrorTime ? new Date(existingWord.lastErrorTime).getTime() : 0;
                const importedTime = importedWord.lastErrorTime ? new Date(importedWord.lastErrorTime).getTime() : 0;
                existingWord.lastErrorTime = existingTime > importedTime ? existingWord.lastErrorTime : importedWord.lastErrorTime;
                importedCount++;
            } else {
                // 为新单词生成唯一ID
                const newId = Math.max(...this.state.words.list.map(w => w.id), 0) + 1;
                
                // 添加新单词
                const newWord = {
                    id: newId,
                    english: importedWord.english,
                    chinese: importedWord.chinese,
                    isStudied: true,
                    isCorrect: false,
                    errorCount: importedWord.errorCount || 1,
                    lastErrorTime: importedWord.lastErrorTime || new Date().toISOString(),
                    studyCount: 0,
                    lastStudied: null,
                    lastError: null
                };
                this.state.words.list.push(newWord);
                importedCount++;
            }
        });
        
        // 更新错误单词列表
        this.updateErrorWordsList();
        
        let message = `成功导入${importedCount}个错误单词！`;
        alert(message);
    },

    // 更新单词状态
    updateWordStatus(wordId, isCorrect, mode) {
        const word = this.state.words.list.find(w => w.id === wordId);
        if (word) {
            word.isStudied = true;
            
            // 只有当单词之前不在错误列表中时，才更新 isCorrect 状态
            // 如果单词已经在错误列表中（isCorrect 为 false），则保持错误状态
            if (!word.isInErrorList) {
                word.isCorrect = isCorrect;
            }
            
            word.studyCount = (word.studyCount || 0) + 1;
            word.lastStudied = new Date().toISOString();
            
            if (!isCorrect) {
                word.errorCount = (word.errorCount || 0) + 1;
                word.lastError = new Date().toISOString();
                word.lastErrorTime = word.lastError; // 保持兼容性
                
                // 标记单词在错误列表中
                word.isInErrorList = true;
                
                // 记录错误的题目类型
                if (!word.errorModes) {
                    word.errorModes = {};
                }
                word.errorModes[mode] = (word.errorModes[mode] || 0) + 1;
                
                // 将错误单词添加到错误队列中（综合训练模式除外）
                if (this.state.session.mode !== 'comprehensive') {
                    this.state.session.errorQueue.push(word);
                }
            }
        }
    },

    // ==================== 帮助模态框 ====================
    // 绑定帮助模态框事件
    bindHelpModalEvents() {
        // 帮助链接点击事件
        const helpLink = document.getElementById('help-link');
        if (helpLink) {
            helpLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.openHelpModal();
            });
        }
        
        // 上传须知中的帮助链接点击事件
        const uploadHelpLink = document.getElementById('upload-help-link');
        if (uploadHelpLink) {
            uploadHelpLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.openHelpModal();
            });
        }
        
        // 关闭帮助模态框按钮点击事件
        const closeHelpModalBtn = document.getElementById('close-help-modal');
        if (closeHelpModalBtn) {
            closeHelpModalBtn.addEventListener('click', () => {
                this.closeHelpModal();
            });
        }
        
        // 点击模态框外部关闭
        const helpModal = document.getElementById('help-modal');
        if (helpModal) {
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) {
                    this.closeHelpModal();
                }
            });
        }
    },

    // 打开帮助模态框
    openHelpModal() {
        const helpModal = document.getElementById('help-modal');
        const helpContent = document.getElementById('help-content');
        
        if (helpModal && helpContent) {
            // 显示模态框
            helpModal.classList.remove('hidden');
            
            // 加载markdown内容
            this.loadMarkdownContent('JSON_FORMAT.md', helpContent);
        }
    },

    // 关闭帮助模态框
    closeHelpModal() {
        const helpModal = document.getElementById('help-modal');
        if (helpModal) {
            helpModal.classList.add('hidden');
        }
    },

    // 加载markdown内容
    loadMarkdownContent(filePath, contentElement) {
        fetch(filePath, {
            cache: 'no-cache' // 禁用缓存，确保每次获取最新内容
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('无法加载帮助文档');
                }
                return response.text();
            })
            .then(markdown => {
                // 解析markdown为HTML
                const html = this.parseMarkdown(markdown);
                // 显示解析后的内容
                contentElement.innerHTML = html;
            })
            .catch(error => {
                console.error('加载帮助文档失败:', error);
                contentElement.innerHTML = `
                    <div class="text-center py-8">
                        <i class="fa fa-exclamation-circle text-4xl text-danger mb-4"></i>
                        <h3 class="text-xl font-semibold text-gray-800 mb-2">加载帮助文档失败</h3>
                        <p class="text-gray-600">请稍后再试或检查文件是否存在</p>
                    </div>
                `;
            });
    },

    // 简单的markdown解析器
    parseMarkdown(markdown) {
        // 替换标题
        markdown = markdown.replace(/^#{6}\s(.+)$/gm, '<h6 class="text-lg font-semibold mb-2">$1</h6>');
        markdown = markdown.replace(/^#{5}\s(.+)$/gm, '<h5 class="text-xl font-semibold mb-2">$1</h5>');
        markdown = markdown.replace(/^#{4}\s(.+)$/gm, '<h4 class="text-xl font-semibold mb-3">$1</h4>');
        markdown = markdown.replace(/^#{3}\s(.+)$/gm, '<h3 class="text-2xl font-semibold mb-3">$1</h3>');
        markdown = markdown.replace(/^#{2}\s(.+)$/gm, '<h2 class="text-2xl font-bold mb-4">$1</h2>');
        markdown = markdown.replace(/^#{1}\s(.+)$/gm, '<h1 class="text-3xl font-bold mb-4">$1</h1>');
        
        // 替换代码块
        markdown = markdown.replace(/```([\s\S]*?)```/gm, '<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4"><code>$1</code></pre>');
        
        // 替换行内代码
        markdown = markdown.replace(/`([^`]+)`/gm, '<code class="bg-gray-100 px-1 py-0.5 rounded">$1</code>');
        
        // 替换加粗文本
        markdown = markdown.replace(/\*\*(.+?)\*\*/gm, '<strong class="font-bold">$1</strong>');
        
        // 处理无序列表
        markdown = markdown.replace(/(^-\s.+$(?:\n-\s.+$)*)/gm, function(match) {
            // 处理每个列表项
            let listItems = match.replace(/^-\s(.+)$/gm, '<li class="list-disc pl-5 mb-1">$1</li>');
            // 包裹在ul标签中
            return '<ul class="mb-4">' + listItems + '</ul>';
        });
        
        // 处理有序列表
        markdown = markdown.replace(/(^\d+\s*\.\s.+$(?:\n\d+\s*\.\s.+$)*)/gm, function(match) {
            // 处理每个列表项
            let listItems = match.replace(/^(\d+)\s*\.\s(.+)$/gm, '<li class="list-decimal pl-5 mb-1">$2</li>');
            // 包裹在ol标签中
            return '<ol class="mb-4">' + listItems + '</ol>';
        });
        
        // 替换段落（排除列表和代码块）
        markdown = markdown.replace(/^(?!#)(?!\s*```)(?!<ul|<ol)([\s\S]*?)(?=^$|^#|^\s*```|<ul|<ol)/gm, function(match) {
            if (match.trim()) {
                return '<p class="mb-4">' + match.trim() + '</p>';
            }
            return match;
        });
        
        return markdown;
    }
};

// 初始化应用
WordTester.init();
