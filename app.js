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
const Wordskr = {
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
            answeredWords: {}, // 存储已回答单词的状态
            isReviewMode: false // 是否是复习模式（用于错误单词重复练习）
        },
        
        // 综合训练
        comprehensive: {
            questions: [],
            totalQuestions: 0,
            seed: null,
            currentIndex: 0,
            correctCount: 0,
            incorrectCount: 0,
            startTime: null,
            errors: [],
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
        this.bindAdvancedTrainingEvents();
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
                    this.state.words.list = data.map((item, index) => {
                        const englishList = item.en || item.english || (Array.isArray(item.word) ? item.word : [item.word]);
                        const chineseObj = item.cn || item.chinese || {};
                        
                        const englishArray = Array.isArray(englishList) ? englishList : [englishList];
                        const primaryEnglish = englishArray[0] ? englishArray[0].trim() : '';
                        
                        // 创建临时单词对象以使用getMergedChineseText函数
                        const tempWord = {
                            chineseObj: chineseObj
                        };
                        const chineseText = this.getMergedChineseText(tempWord);
                        
                        return {
                            id: index + 1,
                            english: primaryEnglish,
                            englishList: englishArray.map(e => e.trim()),
                            chinese: chineseText,
                            chineseObj: chineseObj,
                            like: Array.isArray(item.like) ? item.like : [],
                            note: item.note || '',
                            isStudied: false,
                            isCorrect: null,
                            studyCount: 0,
                            errorCount: 0,
                            lastStudied: null,
                            lastError: null
                        };
                    }).filter(word => word.english && word.chinese);
                    
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
            
            const englishList = item.en || item.english || (Array.isArray(item.word) ? item.word : [item.word]);
            const chineseObj = item.cn || item.chinese || {};
            
            if (!englishList || englishList.length === 0 || !chineseObj || Object.keys(chineseObj).length === 0) {
                continue;
            }
            
            const englishArray = Array.isArray(englishList) ? englishList : [englishList];
            const primaryEnglish = englishArray[0].trim();
            
            words.push({
                id: i + 1,
                english: primaryEnglish,
                englishList: englishArray.map(e => e.trim()),
                chinese: '', // 不设置chinese字段，让getMergedChineseText函数处理chineseObj
                chineseObj: chineseObj,
                like: Array.isArray(item.like) ? item.like : [],
                note: item.note || '',
                isStudied: false,
                isCorrect: null,
                studyCount: 0,
                errorCount: 0,
                lastStudied: null,
                lastError: null
            });
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
        
        // 清除localStorage中的答案数据
        this.clearAnswerStorage();
    },

    // 保存答案到localStorage
    saveAnswerToStorage(mode, wordId, answerData) {
        const storageKey = `wordskr_${mode}_answers`;
        const answers = JSON.parse(localStorage.getItem(storageKey) || '{}');
        const answerKey = this.getAnswerKey(wordId);
        answers[answerKey] = answerData;
        localStorage.setItem(storageKey, JSON.stringify(answers));
    },

    // 从localStorage加载答案
    loadAnswersFromStorage(mode) {
        const storageKey = `wordskr_${mode}_answers`;
        const answers = JSON.parse(localStorage.getItem(storageKey) || '{}');
        return answers;
    },

    // 清除localStorage中的答案数据
    clearAnswerStorage(mode = null) {
        if (mode) {
            localStorage.removeItem(`wordskr_${mode}_answers`);
        } else {
            // 清除所有模式的答案数据
            const modes = ['cte', 'etc', 'ctec', 'comprehensive'];
            modes.forEach(m => localStorage.removeItem(`wordskr_${m}_answers`));
        }
    },

    // ==================== 模式模块 ====================

    // 开始汉语提示拼写模式
    startChineseToEnglishMode() {
        this.state.session.mode = 'chinese-to-english';
        this.state.session.isReviewMode = false; // 正常学习模式
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
        this.state.session.isReviewMode = false; // 正常学习模式
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
        this.state.session.isReviewMode = false; // 正常学习模式
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
        this.state.session.isReviewMode = false; // 正常学习模式
        this.showPage('comprehensive-training-page');
        this.updateNavigationState('comprehensive-training-page');
        
        // 重置综合训练状态
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
        
        document.getElementById('ct-start-section').classList.remove('hidden');
        document.getElementById('ct-exercise-section').classList.add('hidden');
        document.getElementById('ct-result-section').classList.add('hidden');
    },

    // 开始进阶训练模式
    startAdvancedTrainingMode() {
        this.showPage('advanced-training-page');
        this.updateNavigationState('advanced-training-page');
        this.startAdvancedTraining();
    },

    // 开始进阶训练
    startAdvancedTraining() {
        // 显示模式选择页面
        document.getElementById('at-mode-selection').classList.remove('hidden');
        document.getElementById('at-exercise-section').classList.add('hidden');
        document.getElementById('at-completed').classList.add('hidden');
    },

    // 开始例句训练
    startExampleTraining() {
        // 初始化会话状态
        this.state.session = {
            current: null,
            mode: 'advanced-training',
            currentIndex: 0,
            correctCount: 0,
            incorrectCount: 0,
            errorQueue: [],
            questionsAnswered: 0,
            answeredWords: {},
            isReviewMode: false,
            currentModule: 'example'
        };

        // 加载对应模块的问题
        this.loadAdvancedTrainingQuestions();
        
        // 更新UI
        this.updateAdvancedTrainingUI();
    },

    // 开始释义挑选训练
    startMeaningTraining() {
        // 初始化会话状态
        this.state.session = {
            current: null,
            mode: 'advanced-training',
            currentIndex: 0,
            correctCount: 0,
            incorrectCount: 0,
            errorQueue: [],
            questionsAnswered: 0,
            answeredWords: {},
            isReviewMode: false,
            currentModule: 'meaning'
        };

        // 加载对应模块的问题
        this.loadAdvancedTrainingQuestions();
        
        // 更新UI
        this.updateAdvancedTrainingUI();
    },

    // 加载进阶训练问题
    loadAdvancedTrainingQuestions() {
        if (this.state.session.currentModule === 'example') {
            // 为每个例句创建一个问题
            const questions = [];
            
            this.state.words.list.forEach(word => {
                const chineseMeanings = word.chineseObj || {};
                for (const meaning in chineseMeanings) {
                    const examples = chineseMeanings[meaning];
                    if (examples && examples.length > 0) {
                        examples.forEach(example => {
                            questions.push({
                                word: word,
                                meaning: meaning,
                                example: example
                            });
                        });
                    }
                }
            });

            if (questions.length === 0) {
                // 没有有例句的单词，显示提示
                alert('当前词书中没有包含例句的单词，请添加带例句的单词后再进行进阶训练。');
                this.showPage('mode-page');
                this.updateNavigationState('mode-page');
                return;
            }

            // 打乱问题顺序
            this.state.session.questions = this.shuffleArray([...questions]);
        } else if (this.state.session.currentModule === 'meaning') {
            // 为每个单词创建一个问题
            const questions = [];
            
            this.state.words.list.forEach(word => {
                const chineseMeanings = word.chineseObj || {};
                const meanings = Object.keys(chineseMeanings);
                if (meanings.length > 0) {
                    questions.push({
                        word: word,
                        meanings: meanings
                    });
                }
            });

            if (questions.length === 0) {
                // 没有单词，显示提示
                alert('当前词书中没有单词，请添加单词后再进行进阶训练。');
                this.showPage('mode-page');
                this.updateNavigationState('mode-page');
                return;
            }

            // 打乱问题顺序
            this.state.session.questions = this.shuffleArray([...questions]);
        }
        
        // 重置当前索引
        this.state.session.currentIndex = 0;
        this.state.session.correctCount = 0;
        this.state.session.incorrectCount = 0;
        this.state.session.errorQueue = [];
        this.state.session.questionsAnswered = 0;
        this.state.session.answeredWords = {};
    },

    // 更新进阶训练UI
    updateAdvancedTrainingUI() {
        // 检查是否已完成所有问题
        if (this.state.session.questions && this.state.session.currentIndex >= this.state.session.questions.length) {
            this.showCompletedPage('at', this.state.session.questions.length, this.state.session.correctCount, this.state.session.incorrectCount);
            return;
        }

        // 显示训练练习部分，隐藏模式选择和完成页面
        document.getElementById('at-mode-selection').classList.add('hidden');
        document.getElementById('at-exercise-section').classList.remove('hidden');
        document.getElementById('at-completed').classList.add('hidden');

        // 显示/隐藏对应模块
        if (this.state.session.currentModule === 'example') {
            document.getElementById('at-example-module').classList.remove('hidden');
            document.getElementById('at-meaning-module').classList.add('hidden');
            this.updateExampleModuleUI();
        } else if (this.state.session.currentModule === 'meaning') {
            document.getElementById('at-example-module').classList.add('hidden');
            document.getElementById('at-meaning-module').classList.remove('hidden');
            this.updateMeaningModuleUI();
        }

        document.getElementById('at-word-card').classList.remove('hidden');
    },

    // 更新例句训练模块UI
    updateExampleModuleUI() {
        const currentQuestion = this.state.session.questions[this.state.session.currentIndex];
        const currentWord = currentQuestion.word;
        const selectedMeaning = currentQuestion.meaning;
        const exampleSentence = currentQuestion.example;

        document.getElementById('at-target-word').textContent = currentWord.english;
        document.getElementById('at-example-sentence').textContent = exampleSentence;

        // 生成选项
        const options = this.generateAdvancedTrainingOptions(currentWord, selectedMeaning);
        this.generateOptionButtons(options, 'at-example-options', this.selectAdvancedTrainingOption);

        // 自动朗读例句
        this.speakWord(exampleSentence);

        // 检查当前问题是否已经被回答过
        const answerKey = `${currentWord.id}_${selectedMeaning}_${exampleSentence}`;
        const answeredStatus = this.state.session.answeredWords[answerKey];

        document.getElementById('at-feedback').classList.add('hidden');

        this.updateProgressAndAccuracy('at', this.state.session.currentIndex, this.state.session.questions.length, this.state.session.correctCount, this.state.session.incorrectCount);

        document.getElementById('at-prev-btn').disabled = this.state.session.currentIndex === 0;

        if (answeredStatus) {
            // 已回答过，显示为已回答状态（锁定答案区域）
            const optionButtons = document.querySelectorAll('#at-example-options button');
            const correctAnswer = answeredStatus.correctAnswer;
            const userAnswer = answeredStatus.userAnswer;

            // 禁用所有选项按钮
            optionButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.7';
                if (btn.getAttribute('data-option') === correctAnswer) {
                    btn.classList.add('correct-option');
                    btn.style.backgroundColor = '#10b981';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#059669';
                    btn.style.opacity = '1';
                } else if (btn.getAttribute('data-option') === userAnswer && !answeredStatus.isCorrect) {
                    btn.classList.add('incorrect-option');
                    btn.style.backgroundColor = '#ef4444';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#dc2626';
                    btn.style.opacity = '1';
                }
            });

            document.getElementById('at-next-btn').disabled = false;

            // 显示反馈
            this.showFeedback('at-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer);
        } else {
            // 未回答过，显示为初始状态（允许用户作答）
            document.getElementById('at-next-btn').disabled = true;
        }
    },

    // 更新释义挑选模块UI
    updateMeaningModuleUI() {
        const currentQuestion = this.state.session.questions[this.state.session.currentIndex];
        const currentWord = currentQuestion.word;
        const correctMeanings = currentQuestion.meanings;

        document.getElementById('at-meaning-word').textContent = currentWord.english;

        // 生成选项
        const options = this.generateMeaningTrainingOptions(currentWord, correctMeanings);
        this.generateMeaningOptionButtons(options, 'at-meaning-options');

        // 检查当前问题是否已经被回答过
        const answerKey = `${currentWord.id}_meaning`;
        const answeredStatus = this.state.session.answeredWords[answerKey];

        document.getElementById('at-feedback').classList.add('hidden');

        this.updateProgressAndAccuracy('at', this.state.session.currentIndex, this.state.session.questions.length, this.state.session.correctCount, this.state.session.incorrectCount);

        document.getElementById('at-prev-btn').disabled = this.state.session.currentIndex === 0;

        // 禁用提交按钮
        const submitBtn = document.getElementById('at-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
        }

        if (answeredStatus) {
            // 已回答过，显示为已回答状态（锁定答案区域）
            const optionButtons = document.querySelectorAll('#at-meaning-options button');
            const correctAnswers = answeredStatus.correctAnswer;
            const userAnswers = answeredStatus.userAnswer;

            // 禁用所有选项按钮
            optionButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.7';
                const optionValue = btn.getAttribute('data-option');
                if (correctAnswers.includes(optionValue)) {
                    btn.classList.add('correct-option');
                    btn.style.backgroundColor = '#10b981';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#059669';
                    btn.style.opacity = '1';
                } else if (userAnswers.includes(optionValue)) {
                    btn.classList.add('incorrect-option');
                    btn.style.backgroundColor = '#ef4444';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#dc2626';
                    btn.style.opacity = '1';
                }
            });

            document.getElementById('at-next-btn').disabled = false;

            // 显示反馈
            this.showMeaningFeedback('at-feedback', answeredStatus.isCorrect, correctAnswers);
        } else {
            // 未回答过，显示为初始状态（允许用户作答）
            document.getElementById('at-next-btn').disabled = true;
        }
    },

    // 生成进阶训练选项
    generateAdvancedTrainingOptions(currentWord, correctMeaning) {
        const correctAnswer = correctMeaning;
        
        // 收集该单词的所有释义
        const wordMeanings = Object.keys(currentWord.chineseObj || {});
        
        // 优先从该单词的不同释义中选取
        let options = [correctAnswer];
        
        // 添加该单词的其他释义
        for (const meaning of wordMeanings) {
            if (meaning !== correctAnswer && options.length < 4) {
                options.push(meaning);
            }
        }
        
        // 如果不足四个，从其他单词的释义中补充
        if (options.length < 4) {
            const otherWords = this.state.words.list.filter(word => word.id !== currentWord.id);
            
            for (const word of otherWords) {
                const otherMeanings = Object.keys(word.chineseObj || {});
                for (const meaning of otherMeanings) {
                    if (!options.includes(meaning) && options.length < 4) {
                        options.push(meaning);
                    }
                }
                if (options.length >= 4) break;
            }
        }
        
        // 如果仍然不足，使用占位选项
        while (options.length < 4) {
            options.push(`选项 ${options.length + 1}`);
        }
        
        // 随机打乱选项顺序
        return this.shuffleArray(options);
    },

    // 生成释义挑选模式选项
    generateMeaningTrainingOptions(currentWord, correctMeanings) {
        const options = [...correctMeanings];
        
        // 从其他单词中获取干扰选项
        const otherWords = this.state.words.list.filter(word => word.id !== currentWord.id);
        
        // 打乱其他单词顺序
        const shuffledOtherWords = this.shuffleArray([...otherWords]);
        
        // 从其他单词中选择干扰选项，确保选项总数为9个
        for (const word of shuffledOtherWords) {
            if (options.length >= 9) break;
            
            const chineseMeanings = word.chineseObj || {};
            const meanings = Object.keys(chineseMeanings);
            
            for (const meaning of meanings) {
                if (options.length >= 9) break;
                if (!options.includes(meaning)) {
                    options.push(meaning);
                }
            }
        }
        
        // 如果选项不足9个，使用默认选项填充
        while (options.length < 9) {
            const defaultOptions = [
                'v. 跑', 'n. 猫', 'adj. 大的', 'adv. 快速地',
                'v. 吃', 'n. 狗', 'adj. 小的', 'adv. 缓慢地',
                'v. 看', 'n. 鸟', 'adj. 高的', 'adv. 大声地'
            ];
            for (const option of defaultOptions) {
                if (!options.includes(option) && options.length < 9) {
                    options.push(option);
                }
            }
            if (options.length >= 9) break;
        }
        
        // 随机打乱选项顺序
        return this.shuffleArray(options);
    },

    // 选择进阶训练选项
    selectAdvancedTrainingOption(button) {
        const currentQuestion = this.state.session.questions[this.state.session.currentIndex];
        const currentWord = currentQuestion.word;
        const correctAnswer = currentQuestion.meaning;
        const userSelection = button.getAttribute('data-option');
        
        const isCorrect = userSelection === correctAnswer;

        if (isCorrect) {
            this.state.session.correctCount++;
        } else {
            this.state.session.incorrectCount++;
        }

        this.updateWordStatus(currentWord.id, isCorrect, 'advanced-training');

        if (this.state.session.current) {
            this.state.session.current.completedWords++;
            this.state.session.current.correctCount = this.state.session.correctCount;
            this.state.session.current.incorrectCount = this.state.session.incorrectCount;
            this.state.session.current.currentWordIndex = this.state.session.currentIndex;
        }

        this.showFeedback('at-feedback', isCorrect, correctAnswer);

        const optionButtons = document.querySelectorAll('#at-example-options button');
        this.handleOptionFeedback(optionButtons, correctAnswer, button, isCorrect);

        // 立即锁定所有选项按钮，防止用户修改答案
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';
            btn.style.opacity = '0.7';
        });

        // 存储答题状态
        const answerKey = `${currentWord.id}_${correctAnswer}_${currentQuestion.example}`;
        const answerData = {
            isCorrect: isCorrect,
            correctAnswer: correctAnswer,
            userAnswer: userSelection,
            type: 'at'
        };
        this.state.session.answeredWords[answerKey] = answerData;

        // 保存到localStorage实现数据持久化
        this.saveAnswerToStorage('at', answerKey, answerData);

        if (isCorrect) {
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                correctButton.style.transform = 'scale(1.05)';
                correctButton.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
                correctButton.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            }
            
            setTimeout(() => {
                if (correctButton) {
                    correctButton.style.transform = 'scale(1)';
                    correctButton.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                }
                setTimeout(() => {
                    this.goToNextAdvancedTrainingWord();
                }, 300);
            }, 200);
        }

        document.getElementById('at-next-btn').disabled = false;
    },

    // 选择释义挑选模式选项
    // 提交释义挑选模式答案
    submitMeaningTrainingAnswer() {
        const currentQuestion = this.state.session.questions[this.state.session.currentIndex];
        const currentWord = currentQuestion.word;
        const correctAnswers = currentQuestion.meanings;
        
        // 获取用户选择的所有选项
        const optionButtons = document.querySelectorAll('#at-meaning-options button');
        const userSelections = Array.from(optionButtons)
            .filter(btn => btn.getAttribute('data-selected') === 'true')
            .map(btn => btn.getAttribute('data-option'));
        
        // 检查是否完全正确：所有正确答案都被选中，且没有选中错误答案
        const isCorrect = 
            correctAnswers.every(answer => userSelections.includes(answer)) &&
            userSelections.every(selection => correctAnswers.includes(selection));

        if (isCorrect) {
            this.state.session.correctCount++;
        } else {
            this.state.session.incorrectCount++;
        }

        this.updateWordStatus(currentWord.id, isCorrect, 'advanced-training');

        if (this.state.session.current) {
            this.state.session.current.completedWords++;
            this.state.session.current.correctCount = this.state.session.correctCount;
            this.state.session.current.incorrectCount = this.state.session.incorrectCount;
            this.state.session.current.currentWordIndex = this.state.session.currentIndex;
        }

        this.showMeaningFeedback('at-feedback', isCorrect, correctAnswers);

        // 立即锁定所有选项按钮，防止用户修改答案
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';
            btn.style.opacity = '0.7';
            const optionValue = btn.getAttribute('data-option');
            if (correctAnswers.includes(optionValue)) {
                btn.classList.add('correct-option');
                btn.style.backgroundColor = '#10b981';
                btn.style.color = 'white';
                btn.style.borderColor = '#059669';
                btn.style.opacity = '1';
            } else if (userSelections.includes(optionValue)) {
                btn.classList.add('incorrect-option');
                btn.style.backgroundColor = '#ef4444';
                btn.style.color = 'white';
                btn.style.borderColor = '#dc2626';
                btn.style.opacity = '1';
            }
        });

        // 存储答题状态
        const answerKey = `${currentWord.id}_meaning`;
        const answerData = {
            isCorrect: isCorrect,
            correctAnswer: correctAnswers,
            userAnswer: userSelections,
            type: 'at'
        };
        this.state.session.answeredWords[answerKey] = answerData;

        // 保存到localStorage实现数据持久化
        this.saveAnswerToStorage('at', answerKey, answerData);

        // 禁用提交按钮
        const submitBtn = document.getElementById('at-submit-btn');
        if (submitBtn) {
            submitBtn.disabled = true;
        }

        if (isCorrect) {
            setTimeout(() => {
                this.goToNextAdvancedTrainingWord();
            }, 1000);
        }

        document.getElementById('at-next-btn').disabled = false;
    },

    // 前往上一个进阶训练单词
    goToPreviousAdvancedTrainingWord() {
        if (this.state.session.currentIndex > 0) {
            this.state.session.currentIndex--;
            this.updateAdvancedTrainingUI();
        }
    },

    // 前往下一个进阶训练单词
    goToNextAdvancedTrainingWord() {
        // 增加已回答问题数量
        this.state.session.questionsAnswered++;
        
        // 每回答2-3道题后，检查是否有错误单词需要重复出现（综合训练模式除外）
        if (this.state.session.mode !== 'comprehensive' && 
            this.state.session.errorQueue.length > 0) {
            
            // 随机选择2或3作为间隔数
            const interval = Math.random() < 0.5 ? 2 : 3;
            
            // 检查是否达到间隔条件
            if (this.state.session.questionsAnswered % interval === 0) {
                // 从错误队列中取出第一个错误单词
                const errorWord = this.state.session.errorQueue.shift();
                
                // 为错误单词创建一个问题
                const chineseMeanings = errorWord.chineseObj || {};
                let selectedMeaning = null;
                let exampleSentence = '';
                
                const meaningsWithExamples = Object.keys(chineseMeanings).filter(meaning => {
                    return chineseMeanings[meaning] && chineseMeanings[meaning].length > 0;
                });

                if (meaningsWithExamples.length > 0) {
                    selectedMeaning = meaningsWithExamples[Math.floor(Math.random() * meaningsWithExamples.length)];
                    const examples = chineseMeanings[selectedMeaning];
                    exampleSentence = examples[Math.floor(Math.random() * examples.length)];
                }
                
                if (selectedMeaning && exampleSentence) {
                    // 将错误问题插入到当前问题列表的下一个位置
                    this.state.session.questions.splice(this.state.session.currentIndex + 1, 0, {
                        word: errorWord,
                        meaning: selectedMeaning,
                        example: exampleSentence
                    });
                }
            }
        }
        
        this.state.session.currentIndex++;
        this.updateAdvancedTrainingUI();
    },

    // 复习进阶训练错误
    reviewAdvancedTrainingErrors() {
        // 收集所有错误问题
        const errorQuestions = [];
        
        this.state.session.questions.forEach(question => {
            const answerKey = `${question.word.id}_${question.meaning}_${question.example}`;
            const answerData = this.state.session.answeredWords[answerKey];
            if (answerData && !answerData.isCorrect) {
                errorQuestions.push(question);
            }
        });
        
        if (errorQuestions.length === 0) {
            alert('没有错误题目需要复习');
            return;
        }
        
        this.state.session.questions = [...errorQuestions];
        this.resetStudyState();
        this.updateAdvancedTrainingUI();
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
                englishList: selectedWord.englishList,
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
        
        // 在复习模式下，不清除localStorage中的答案记录，也不加载它们
        // 这样可以保留用户的答题历史，但不会在UI中自动显示答案
        if (!this.state.session.isReviewMode) {
            // 从localStorage加载已保存的答案（仅在非复习模式下）
            if (this.state.session.mode) {
                this.state.session.answeredWords = this.loadAnswersFromStorage(this.state.session.mode);
            } else {
                this.state.session.answeredWords = {};
            }
        } else {
            // 在复习模式下，清空当前会话的答案记录，但不删除localStorage中的数据
            this.state.session.answeredWords = {};
        }
        
        // 隐藏所有反馈信息div
        const feedbackDivs = [
            'cte-feedback',
            'etc-feedback',
            'ctec-feedback',
            'ct-feedback',
            'at-feedback'
        ];
        
        feedbackDivs.forEach(divId => {
            const div = document.getElementById(divId);
            if (div) {
                div.classList.add('hidden');
            }
        });
    },

    // 生成答题状态的唯一键（使用 word.id 作为键）
    getAnswerKey(wordId) {
        return `${wordId}`;
    },

    // 获取合并的中文文本
    getMergedChineseText(word) {
        if (!word) return '';
        
        // 如果已经有合并好的中文文本，直接返回
        if (word.chinese && word.chinese.trim() !== '') {
            return word.chinese;
        }
        
        // 否则从chineseObj中生成
        if (word.chineseObj && typeof word.chineseObj === 'object') {
            const chineseKeys = Object.keys(word.chineseObj).map(key => key.trim());
            
            // 按词性分组
            const posGroups = {};
            
            chineseKeys.forEach(key => {
                // 尝试提取词性（如adj. n. v.等）
                const posMatch = key.match(/^([a-z]+\.)\s*(.+)$/);
                if (posMatch) {
                    const pos = posMatch[1];
                    const meaning = posMatch[2];
                    
                    if (!posGroups[pos]) {
                        posGroups[pos] = [];
                    }
                    posGroups[pos].push(meaning);
                } else {
                    // 没有词性的情况
                    if (!posGroups['']) {
                        posGroups[''] = [];
                    }
                    posGroups[''].push(key);
                }
            });
            
            // 构建结果
            const result = [];
            
            // 先处理有词性的
            Object.entries(posGroups)
                .sort(([posA], [posB]) => {
                    if (posA === '') return 1;
                    if (posB === '') return -1;
                    return posA.localeCompare(posB);
                })
                .forEach(([pos, meanings]) => {
                    if (pos) {
                        result.push(`${pos} ${meanings.join('; ')}`);
                    } else {
                        result.push(meanings.join('; '));
                    }
                });
            
            return result.join('\n');
        }
        
        return '';
    },

    // 获取英文显示文本
    getEnglishDisplay(word) {
        if (!word) return '';
        
        // 如果有多个英文形式，返回第一个
        if (word.englishList && word.englishList.length > 0) {
            return word.englishList[0];
        }
        
        // 否则返回单个英文形式
        return word.english || '';
    },

    // ==================== UI 模块 ====================

    // 显示指定页面
    showPage(pageId) {
        // 取消任何正在进行的语音播放
        if ('speechSynthesis' in window) {
            speechSynthesis.cancel();
        }
        
        document.querySelectorAll('.page-section').forEach(page => {
            page.classList.add('hidden');
        });
        
        // 隐藏所有反馈信息div
        const feedbackDivs = [
            'cte-feedback',
            'etc-feedback',
            'ctec-feedback',
            'ct-feedback',
            'at-feedback'
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
            dropArea.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    fileInput.click();
                }
            });
            
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
                elementId: 'advanced-training-btn',
                eventType: 'click',
                callback: this.startAdvancedTrainingMode
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

    // 绑定进阶训练模式事件
    bindAdvancedTrainingEvents() {
        this.bindEventsToElements([
            {
                elementId: 'exit-at-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            },
            {
                elementId: 'at-prev-btn',
                eventType: 'click',
                callback: this.goToPreviousAdvancedTrainingWord
            },
            {
                elementId: 'at-next-btn',
                eventType: 'click',
                callback: this.goToNextAdvancedTrainingWord
            },
            {
                elementId: 'at-review-btn',
                eventType: 'click',
                callback: this.reviewAdvancedTrainingErrors
            },
            {
                elementId: 'at-back-to-mode-btn',
                eventType: 'click',
                callback: () => {
                    this.showPage('mode-page');
                    this.updateNavigationState('mode-page');
                }
            },
            {
                elementId: 'at-example-mode-btn',
                eventType: 'click',
                callback: () => {
                    // 开始例句训练
                    this.startExampleTraining();
                }
            },
            {
                elementId: 'at-meaning-mode-btn',
                eventType: 'click',
                callback: () => {
                    // 开始释义挑选训练
                    this.startMeaningTraining();
                }
            },
            {
                elementId: 'at-submit-btn',
                eventType: 'click',
                callback: this.submitMeaningTrainingAnswer
            }
        ]);
    },

    // 绑定统计页事件
    bindStatsPageEvents() {
        this.bindEventsToElements([
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
        
        errorWordsList.innerHTML = errorWords.map(word => {
            const englishDisplay = this.getEnglishDisplay(word);
            
            const chineseText = this.getMergedChineseText(word);
            
            return `
            <li class="py-2 flex justify-between items-center" data-word-id="${word.id}">
                <div class="flex-1">
                    <span class="font-medium">${englishDisplay}</span>
                    <div class="text-gray-600 ml-2">${chineseText.replace(/\n/g, '<br>')}</div>
                </div>
                <button class="delete-error-word-btn text-red-500 hover:text-red-700 ml-4 px-2 py-1 rounded hover:bg-red-50 transition-colors" data-word-id="${word.id}" title="从错误列表中删除">
                    <i class="fa fa-trash"></i>
                </button>
            </li>
            `;
        }).join('');
        
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
        
        // 每回答2-3道题后，检查是否有错误单词需要重复出现（综合训练模式除外）
        if (this.state.session.mode !== 'comprehensive' && 
            this.state.session.errorQueue.length > 0) {
            
            // 随机选择2或3作为间隔数
            const interval = Math.random() < 0.5 ? 2 : 3;
            
            // 检查是否达到间隔条件
            if (this.state.session.questionsAnswered % interval === 0) {
                // 从错误队列中取出第一个错误单词
                const errorWord = this.state.session.errorQueue.shift();
                
                // 将错误单词插入到当前单词列表的下一个位置
                // 添加一个标志标记这是重复练习，以便UI不显示之前的答案
                this.state.session.words.splice(this.state.session.currentIndex + 1, 0, {
                    id: errorWord.id,
                    english: errorWord.english,
                    englishList: errorWord.englishList,
                    chinese: errorWord.chinese,
                    isRepeat: true // 标记这是重复练习
                });
            }
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
            optionButton.innerHTML = option.replace(/\n/g, '<br>');
            optionButton.setAttribute('data-option', option);
            optionButton.addEventListener('click', () => {
                callback.call(this, optionButton);
            });
            optionsElement.appendChild(optionButton);
        });
    },

    // 生成释义挑选模式选项按钮（支持多选）
    generateMeaningOptionButtons(options, containerId, callback) {
        const optionsElement = document.getElementById(containerId);
        optionsElement.innerHTML = '';
        
        options.forEach(option => {
            const optionButton = document.createElement('button');
            optionButton.className = 'option-button';
            optionButton.innerHTML = option.replace(/\n/g, '<br>');
            optionButton.setAttribute('data-option', option);
            optionButton.setAttribute('data-selected', 'false');
            optionButton.addEventListener('click', () => {
                // 切换选中状态
                const isSelected = optionButton.getAttribute('data-selected') === 'true';
                optionButton.setAttribute('data-selected', (!isSelected).toString());
                
                // 更新按钮样式
                if (!isSelected) {
                    optionButton.classList.add('selected-option');
                    optionButton.style.backgroundColor = '#e0e7ff';
                    optionButton.style.borderColor = '#6366f1';
                } else {
                    optionButton.classList.remove('selected-option');
                    optionButton.style.backgroundColor = '';
                    optionButton.style.borderColor = '';
                }
                
                // 检查是否有选项被选中，启用提交按钮
                const selectedOptions = Array.from(optionsElement.querySelectorAll('button'))
                    .filter(btn => btn.getAttribute('data-selected') === 'true');
                const submitBtn = document.getElementById('at-submit-btn');
                if (submitBtn) {
                    submitBtn.disabled = selectedOptions.length === 0;
                }
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

    // 显示释义挑选模式反馈
    showMeaningFeedback(elementId, isCorrect, correctAnswers) {
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
                    <span>错误! 正确答案是: <strong>${correctAnswers.join('、')}</strong></span>
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
            let correctButton = Array.from(optionButtons).find(btn => 
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
        document.getElementById('cte-chinese-meaning').innerHTML = this.getMergedChineseText(currentWord).replace(/\n/g, '<br>');
        document.getElementById('cte-english-input').value = '';
        
        // 检查当前单词是否已经被回答过
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('cte-feedback').classList.add('hidden');
        
        this.updateProgressAndAccuracy('cte', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        document.getElementById('cte-prev-btn').disabled = this.state.session.currentIndex === 0;
        
        // 判断是否是重复练习
        const isRepeat = currentWord.isRepeat === true;
        
        if (answeredStatus && !isRepeat) {
            // 已回答过且不是重复练习，显示为已回答状态（锁定答案区域）
            const inputElement = document.getElementById('cte-english-input');
            inputElement.value = answeredStatus.correctAnswer;
            inputElement.disabled = true;
            inputElement.style.backgroundColor = '#f3f4f6';
            inputElement.style.cursor = 'not-allowed';
            inputElement.style.opacity = '0.7';
            document.getElementById('cte-check-btn').disabled = true;
            document.getElementById('cte-forgot-btn').disabled = true;
            document.getElementById('cte-next-btn').disabled = false;
            
            // 显示反馈
            this.showFeedback('cte-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer, answeredStatus.userAnswer);
        } else {
            // 未回答过，或者是重复练习，显示为初始状态（允许用户作答）
            const inputElement = document.getElementById('cte-english-input');
            inputElement.value = '';
            inputElement.disabled = false;
            inputElement.style.backgroundColor = '';
            inputElement.style.cursor = '';
            inputElement.style.opacity = '';
            document.getElementById('cte-check-btn').disabled = false;
            document.getElementById('cte-forgot-btn').disabled = false;
            document.getElementById('cte-next-btn').disabled = true;
        }
        
        document.getElementById('cte-word-card').classList.remove('hidden');
        document.getElementById('cte-completed').classList.add('hidden');
        
        if (!answeredStatus || isRepeat) {
            document.getElementById('cte-english-input').focus();
        }
    },

    // 检查汉语提示拼写答案
    checkChineseToEnglishAnswer() {
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        const userInput = document.getElementById('cte-english-input').value.trim().toLowerCase();
        
        const englishList = currentWord.englishList || [currentWord.english];
        const validEnglishList = englishList
            .map(item => typeof item === 'string' ? item : '')
            .filter(item => item.trim() !== '');
        
        const isCorrect = validEnglishList.some(answer => answer.toLowerCase() === userInput);
        
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
        
        const displayAnswer = validEnglishList[0];
        this.showFeedback('cte-feedback', isCorrect, displayAnswer, userInput);
        
        const inputElement = document.getElementById('cte-english-input');
        inputElement.disabled = true;
        inputElement.style.backgroundColor = '#f3f4f6';
        inputElement.style.cursor = 'not-allowed';
        inputElement.style.opacity = '0.7';
        
        document.getElementById('cte-check-btn').disabled = true;
        document.getElementById('cte-forgot-btn').disabled = true;
        document.getElementById('cte-next-btn').disabled = false;
        
        const answerKey = this.getAnswerKey(currentWord.id);
        const answerData = {
            isCorrect: isCorrect,
            correctAnswer: displayAnswer,
            correctAnswers: validEnglishList,
            userAnswer: userInput,
            type: 'cte'
        };
        this.state.session.answeredWords[answerKey] = answerData;
        this.saveAnswerToStorage('cte', currentWord.id, answerData);
        
        this.updateProgressAndAccuracy('cte', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        if (isCorrect) {
            this.speakWord(displayAnswer, () => {
                setTimeout(() => {
                    inputElement.style.transform = 'scale(1)';
                    inputElement.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                    setTimeout(() => {
                        this.goToNextChineseToEnglishWord();
                    }, 300);
                }, 200);
            });
            
            inputElement.style.transform = 'scale(1.05)';
            inputElement.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
            inputElement.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        } else {
            this.speakWord(displayAnswer);
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
        const englishDisplay = this.getEnglishDisplay(currentWord);
        document.getElementById('etc-english-word').textContent = englishDisplay;
        
        const options = this.generateOptions(currentWord, 'chinese');
        this.generateOptionButtons(options, 'etc-options', this.selectEnglishToChineseOption);
        
        // 检查当前单词是否已经被回答过
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('etc-feedback').classList.add('hidden');
        
        this.updateProgressAndAccuracy('etc', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        document.getElementById('etc-prev-btn').disabled = this.state.session.currentIndex === 0;
        
        // 判断是否是重复练习
        const isRepeat = currentWord.isRepeat === true;
        
        if (answeredStatus && !isRepeat) {
            // 已回答过且不是重复练习，显示为已回答状态（锁定答案区域）
            const optionButtons = document.querySelectorAll('#etc-options button');
            const correctAnswer = answeredStatus.correctAnswer;
            const userAnswer = answeredStatus.userAnswer;
            
            // 禁用所有选项按钮
            optionButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.7';
                if (btn.getAttribute('data-option') === correctAnswer) {
                    btn.classList.add('correct-option');
                    btn.style.backgroundColor = '#10b981';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#059669';
                    btn.style.opacity = '1';
                } else if (btn.getAttribute('data-option') === userAnswer && !answeredStatus.isCorrect) {
                    btn.classList.add('incorrect-option');
                    btn.style.backgroundColor = '#ef4444';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#dc2626';
                    btn.style.opacity = '1';
                }
            });
            
            document.getElementById('etc-next-btn').disabled = false;
            
            // 显示反馈
            this.showFeedback('etc-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer);
        } else {
            // 未回答过，或者是重复练习，显示为初始状态（允许用户作答）
            document.getElementById('etc-next-btn').disabled = true;
        }
        
        document.getElementById('etc-word-card').classList.remove('hidden');
        document.getElementById('etc-completed').classList.add('hidden');
    },

    // 生成选项
    generateOptions(currentWord, type) {
        const correctAnswer = type === 'chinese' ? this.getMergedChineseText(currentWord) : this.getEnglishDisplay(currentWord);
        
        // 获取相似词列表
        const similarWords = currentWord.like || [];
        
        // 将相似词转换为选项格式
        let similarOptions = [];
        if (similarWords.length > 0) {
            if (type === 'chinese') {
                // 中文模式：需要将相似词转换为中文释义
                similarOptions = similarWords
                    .filter(word => word && word.trim() !== '')
                    .map(word => {
                        const similarWord = this.state.words.list.find(w => 
                            (w.englishList && w.englishList.includes(word.trim())) || 
                            w.english === word.trim()
                        );
                        return similarWord ? this.getMergedChineseText(similarWord) : '';
                    })
                    .filter(text => text && text.trim() !== '');
            } else {
                // 英文模式：直接使用英文单词
                similarOptions = similarWords
                    .filter(word => word && word.trim() !== '')
                    .map(word => word.trim());
            }
        }
        
        // 收集所有非相似词选项
        let allOtherOptions;
        if (type === 'chinese') {
            allOtherOptions = this.state.words.list
                .filter(word => {
                    const wordChinese = this.getMergedChineseText(word);
                    const correctChinese = this.getMergedChineseText(currentWord);
                    return wordChinese !== correctChinese && wordChinese.trim() !== '';
                })
                .map(word => this.getMergedChineseText(word));
        } else {
            const currentEnglishDisplay = this.getEnglishDisplay(currentWord);
            allOtherOptions = this.state.words.list
                .filter(word => {
                    const wordEnglishDisplay = this.getEnglishDisplay(word);
                    return wordEnglishDisplay !== currentEnglishDisplay && wordEnglishDisplay.trim() !== '';
                })
                .map(word => this.getEnglishDisplay(word));
        }
        
        // 去重：移除与相似词重复的非相似词
        const uniqueOtherOptions = allOtherOptions.filter(option => 
            !similarOptions.includes(option)
        );
        
        // 随机打乱相似词和非相似词
        similarOptions.sort(() => Math.random() - 0.5);
        uniqueOtherOptions.sort(() => Math.random() - 0.5);
        
        // 确定相似词选项数量（50%-75%，即2-3个）
        let similarCount;
        if (similarOptions.length >= 3) {
            similarCount = Math.random() < 0.5 ? 2 : 3;
        } else if (similarOptions.length === 2) {
            similarCount = 2;
        } else if (similarOptions.length === 1) {
            similarCount = 1;
        } else {
            similarCount = 0;
        }
        
        // 确保至少包含1个非相似词
        const otherCount = 3 - similarCount;
        
        // 选择相似词选项
        const selectedSimilarOptions = similarOptions.slice(0, similarCount);
        
        // 选择非相似词选项
        let selectedOtherOptions = [];
        if (uniqueOtherOptions.length >= otherCount) {
            selectedOtherOptions = uniqueOtherOptions.slice(0, otherCount);
        } else {
            // 如果非相似词不足，使用相似词补充
            const remainingSimilarOptions = similarOptions.slice(similarCount);
            selectedOtherOptions = [...uniqueOtherOptions, ...remainingSimilarOptions.slice(0, otherCount - uniqueOtherOptions.length)];
        }
        
        // 如果仍然不足，生成占位选项
        if (selectedOtherOptions.length < otherCount) {
            const placeholderCount = otherCount - selectedOtherOptions.length;
            for (let i = 0; i < placeholderCount; i++) {
                if (type === 'chinese') {
                    selectedOtherOptions.push(`选项 ${i + 1}`);
                } else {
                    selectedOtherOptions.push(`Option ${i + 1}`);
                }
            }
        }
        
        // 合并所有选项并去重
        let allWrongOptions = [...selectedSimilarOptions, ...selectedOtherOptions];
        allWrongOptions = [...new Set(allWrongOptions)];
        
        // 确保总共有3个错误选项
        while (allWrongOptions.length < 3) {
            const placeholderIndex = allWrongOptions.length + 1;
            if (type === 'chinese') {
                allWrongOptions.push(`选项 ${placeholderIndex}`);
            } else {
                allWrongOptions.push(`Option ${placeholderIndex}`);
            }
        }
        
        // 只取前3个错误选项
        const wrongOptions = allWrongOptions.slice(0, 3);
        
        // 合并正确答案并随机打乱
        const options = [correctAnswer, ...wrongOptions].sort(() => Math.random() - 0.5);
        
        return options;
    },

    // 选择英文选汉语选项
    selectEnglishToChineseOption(button) {
        const currentWord = this.state.session.words[this.state.session.currentIndex];
        const userSelection = button.getAttribute('data-option');
        const correctAnswer = this.getMergedChineseText(currentWord);
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
        
        // 立即锁定所有选项按钮，防止用户修改答案
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';
            btn.style.opacity = '0.7';
        });
        
        // 存储答题状态
        const answerKey = this.getAnswerKey(currentWord.id);
        const answerData = {
            isCorrect: isCorrect,
            correctAnswer: this.getMergedChineseText(currentWord),
            userAnswer: userSelection,
            type: 'etc'
        };
        this.state.session.answeredWords[answerKey] = answerData;
        
        // 保存到localStorage实现数据持久化
        this.saveAnswerToStorage('etc', currentWord.id, answerData);
        
        const englishList = currentWord.englishList || [currentWord.english];
        const displayAnswer = englishList[0];
        
        if (isCorrect) {
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === correctAnswer
            );
            if (correctButton) {
                correctButton.style.transform = 'scale(1.1)';
                correctButton.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
                correctButton.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            }
        }
        
        this.speakWord(displayAnswer, () => {
            if (isCorrect) {
                let correctButton = Array.from(optionButtons).find(btn => 
                    btn.getAttribute('data-option') === correctAnswer
                );
                if (correctButton) {
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
        document.getElementById('ctec-chinese-meaning').innerHTML = this.getMergedChineseText(currentWord).replace(/\n/g, '<br>');
        
        const options = this.generateOptions(currentWord, 'english');
        this.generateOptionButtons(options, 'ctec-options', this.selectChineseToEnglishChoiceOption);
        
        // 检查当前单词是否已经被回答过
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('ctec-feedback').classList.add('hidden');
        
        this.updateProgressAndAccuracy('ctec', this.state.session.currentIndex, this.state.session.words.length, this.state.session.correctCount, this.state.session.incorrectCount);
        
        document.getElementById('ctec-prev-btn').disabled = this.state.session.currentIndex === 0;
        
        // 判断是否是重复练习
        const isRepeat = currentWord.isRepeat === true;
        
        if (answeredStatus && !isRepeat) {
            // 已回答过且不是重复练习，显示为已回答状态（锁定答案区域）
            const optionButtons = document.querySelectorAll('#ctec-options button');
            const correctAnswer = answeredStatus.correctAnswer;
            const userAnswer = answeredStatus.userAnswer;
            
            // 禁用所有选项按钮
            optionButtons.forEach(btn => {
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.7';
                if (btn.getAttribute('data-option') === correctAnswer) {
                    btn.classList.add('correct-option');
                    btn.style.backgroundColor = '#10b981';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#059669';
                    btn.style.opacity = '1';
                } else if (btn.getAttribute('data-option') === userAnswer && !answeredStatus.isCorrect) {
                    btn.classList.add('incorrect-option');
                    btn.style.backgroundColor = '#ef4444';
                    btn.style.color = 'white';
                    btn.style.borderColor = '#dc2626';
                    btn.style.opacity = '1';
                }
            });
            
            document.getElementById('ctec-next-btn').disabled = false;
            document.getElementById('ctec-forgot-btn').disabled = true;
            
            // 显示反馈
            this.showFeedback('ctec-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer);
        } else {
            // 未回答过，或者是重复练习，显示为初始状态（允许用户作答）
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
        
        const englishList = currentWord.englishList || [currentWord.english];
        const validEnglishList = englishList
            .map(item => typeof item === 'string' ? item : '')
            .filter(item => item.trim() !== '');
        
        const isCorrect = validEnglishList.includes(userSelection);
        
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
        
        const displayAnswer = validEnglishList[0];
        this.showFeedback('ctec-feedback', isCorrect, displayAnswer);
        
        const optionButtons = document.querySelectorAll('#ctec-options button');
        this.handleOptionFeedback(optionButtons, displayAnswer, button, isCorrect);
        
        optionButtons.forEach(btn => {
            btn.disabled = true;
            btn.style.cursor = 'not-allowed';
            btn.style.opacity = '0.7';
        });
        
        const answerKey = this.getAnswerKey(currentWord.id);
        const answerData = {
            isCorrect: isCorrect,
            correctAnswer: displayAnswer,
            correctAnswers: validEnglishList,
            userAnswer: userSelection,
            type: 'ctec'
        };
        this.state.session.answeredWords[answerKey] = answerData;
        this.saveAnswerToStorage('ctec', currentWord.id, answerData);
        
        if (isCorrect) {
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === displayAnswer
            );
            if (correctButton) {
                this.speakWord(displayAnswer, () => {
                    setTimeout(() => {
                        correctButton.style.transform = 'scale(1)';
                        correctButton.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                        setTimeout(() => {
                            this.goToNextWord(this.updateChineseToEnglishChoiceUI);
                        }, 200);
                    }, 100);
                });
                
                correctButton.style.transform = 'scale(1.1)';
                correctButton.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
                correctButton.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            }
        } else {
            this.speakWord(displayAnswer);
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
        this.state.comprehensive.totalQuestions = totalQuestions;
        this.state.comprehensive.seed = seed;
        this.generateComprehensiveTrainingQuestions();
        
        this.resetStudyState();
        
        // 重置综合训练相关状态
        this.state.comprehensive.currentIndex = 0;
        this.state.comprehensive.correctCount = 0;
        this.state.comprehensive.incorrectCount = 0;
        this.state.comprehensive.startTime = new Date().getTime();
        this.state.comprehensive.errors = [];
        
        // 从localStorage加载已保存的答案
        this.state.session.answeredWords = this.loadAnswersFromStorage('comprehensive');
        
        document.getElementById('ct-start-section').classList.add('hidden');
        document.getElementById('ct-exercise-section').classList.remove('hidden');
        document.getElementById('ct-result-section').classList.add('hidden');
        
        this.updateComprehensiveTrainingUI();
    },

    // 生成综合训练问题
    generateComprehensiveTrainingQuestions() {
        this.state.comprehensive.questions = [];
        const modes = ['chinese-to-english', 'english-to-chinese', 'chinese-to-english-choice'];
        const totalQuestions = this.state.comprehensive.totalQuestions;
        
        // 根据是否有种子选择随机数生成器
        const rng = this.state.comprehensive.seed 
            ? new SeededRandom(this.state.comprehensive.seed)
            : null;
        
        // 计算每种类型的题目数量，确保平均分配
        const baseCount = Math.floor(totalQuestions / modes.length);
        const remainder = totalQuestions % modes.length;
        
        const modeCounts = {};
        modes.forEach((mode, index) => {
            modeCounts[mode] = baseCount + (index < remainder ? 1 : 0);
        });
        
        // 生成题目列表，确保单词级别的去重
        const questions = [];
        const usedWordIds = new Set(); // 用于跟踪已使用的单词ID
        
        Object.entries(modeCounts).forEach(([mode, count]) => {
            for (let i = 0; i < count; i++) {
                let randomIndex;
                let wordId;
                let attempts = 0;
                const maxAttempts = this.state.words.list.length * 2; // 防止无限循环
                
                // 尝试找到一个未被使用的单词
                do {
                    if (rng) {
                        randomIndex = rng.nextInt(0, this.state.words.list.length - 1);
                    } else {
                        randomIndex = Math.floor(Math.random() * this.state.words.list.length);
                    }
                    wordId = this.state.words.list[randomIndex].id;
                    attempts++;
                } while (usedWordIds.has(wordId) && attempts < maxAttempts);
                
                // 标记该单词为已使用
                usedWordIds.add(wordId);
                
                questions.push({
                    mode: mode,
                    wordId: wordId
                });
            }
        });
        
        // 随机打乱题目顺序
        if (rng) {
            this.state.comprehensive.questions = rng.shuffle(questions);
        } else {
            this.state.comprehensive.questions = this.shuffleArray(questions);
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
        if (this.state.comprehensive.currentIndex >= this.state.comprehensive.questions.length) {
            this.showComprehensiveTrainingResult();
            return;
        }
        
        const currentQuestion = this.state.comprehensive.questions[this.state.comprehensive.currentIndex];
        const currentWord = this.state.words.list.find(word => word.id === currentQuestion.wordId);
        if (!currentWord) {
            console.error('找不到当前单词:', currentQuestion);
            return;
        }
        
        document.getElementById('ct-question-type').textContent = this.getQuestionTypeText(currentQuestion.mode);
        
        if (currentQuestion.mode === 'chinese-to-english') {
            document.getElementById('ct-question-content').innerHTML = this.getMergedChineseText(currentWord).replace(/\n/g, '<br>');
            document.getElementById('ct-options').classList.add('hidden');
            document.getElementById('ct-input-container').classList.remove('hidden');
            document.getElementById('ct-check-btn').classList.remove('hidden');
            document.getElementById('ct-check-btn').disabled = false;
            
            // 重置输入框状态
            const inputElement = document.getElementById('ct-input');
            inputElement.value = '';
            inputElement.disabled = false;
            inputElement.style.backgroundColor = '';
            inputElement.style.cursor = '';
            inputElement.style.opacity = '';
            inputElement.focus();
        } else {
            if (currentQuestion.mode === 'english-to-chinese') {
                const englishDisplay = this.getEnglishDisplay(currentWord);
                document.getElementById('ct-question-content').textContent = englishDisplay;
            } else {
                document.getElementById('ct-question-content').innerHTML = this.getMergedChineseText(currentWord).replace(/\n/g, '<br>');
            }
            document.getElementById('ct-options').classList.remove('hidden');
            document.getElementById('ct-input-container').classList.add('hidden');
            document.getElementById('ct-check-btn').classList.add('hidden');
            
            const options = this.generateOptions(currentWord, currentQuestion.mode === 'english-to-chinese' ? 'chinese' : 'english');
            const optionsElement = document.getElementById('ct-options');
            optionsElement.innerHTML = '';
            
            options.forEach(option => {
                const optionButton = document.createElement('button');
                optionButton.className = 'option-button';
                optionButton.innerHTML = option.replace(/\n/g, '<br>');
                optionButton.setAttribute('data-option', option);
                optionButton.addEventListener('click', () => {
                    this.selectComprehensiveTrainingOption(optionButton, currentQuestion, currentWord);
                });
                optionsElement.appendChild(optionButton);
            });
        }
        
        // 检查当前问题是否已经被回答过
        const answerKey = this.getAnswerKey(currentWord.id);
        const answeredStatus = this.state.session.answeredWords[answerKey];
        
        document.getElementById('ct-feedback').classList.add('hidden');
        
        const progress = ((this.state.comprehensive.currentIndex + 1) / this.state.comprehensive.questions.length) * 100;
        document.getElementById('ct-progress-value').style.width = `${progress}%`;
        document.getElementById('ct-progress-text').textContent = `${this.state.comprehensive.currentIndex + 1}/${this.state.comprehensive.questions.length}`;
        
        const totalAnswered = this.state.comprehensive.correctCount + this.state.comprehensive.incorrectCount;
        const accuracy = totalAnswered > 0 ? Math.round((this.state.comprehensive.correctCount / totalAnswered) * 100) : 0;
        document.getElementById('ct-accuracy-text').textContent = `正确率: ${accuracy}%`;
        
        document.getElementById('ct-prev-btn').disabled = this.state.comprehensive.currentIndex === 0;
        
        // 判断是否是重复练习
        const isRepeat = currentQuestion.isRepeat === true;
        
        if (answeredStatus && !isRepeat) {
            // 已回答过且不是重复练习，显示为已回答状态（锁定答案区域）
            if (currentQuestion.mode === 'chinese-to-english') {
                // 汉语提示拼写模式
                const inputElement = document.getElementById('ct-input');
                inputElement.value = answeredStatus.correctAnswer;
                inputElement.disabled = true;
                inputElement.style.backgroundColor = '#f3f4f6';
                inputElement.style.cursor = 'not-allowed';
                inputElement.style.opacity = '0.7';
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
                    btn.style.cursor = 'not-allowed';
                    btn.style.opacity = '0.7';
                    if (btn.getAttribute('data-option') === correctAnswer) {
                        btn.classList.add('correct-option');
                        btn.style.backgroundColor = '#10b981';
                        btn.style.color = 'white';
                        btn.style.borderColor = '#059669';
                        btn.style.opacity = '1';
                    } else if (btn.getAttribute('data-option') === userAnswer && !answeredStatus.isCorrect) {
                        btn.classList.add('incorrect-option');
                        btn.style.backgroundColor = '#ef4444';
                        btn.style.color = 'white';
                        btn.style.borderColor = '#dc2626';
                        btn.style.opacity = '1';
                    }
                });
                
                document.getElementById('ct-next-btn').disabled = false;
                
                // 显示反馈
                this.showFeedback('ct-feedback', answeredStatus.isCorrect, answeredStatus.correctAnswer);
            }
        } else {
            // 未回答过，或者是重复练习，显示为初始状态（允许用户作答）
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
        
        let correctAnswers;
        if (currentQuestion.mode === 'english-to-chinese') {
            correctAnswers = [this.getMergedChineseText(currentWord)];
        } else {
            const englishList = currentWord.englishList || [currentWord.english];
            correctAnswers = englishList
                .map(item => typeof item === 'string' ? item : '')
                .filter(item => item.trim() !== '');
        }
        
        const isCorrect = correctAnswers.includes(userSelection);
        
        if (isCorrect) {
            this.state.comprehensive.correctCount++;
        } else {
            this.state.comprehensive.incorrectCount++;
            this.state.comprehensive.errors.push({
                wordId: currentWord.id,
                english: currentWord.english,
                englishList: currentWord.englishList,
                chinese: currentWord.chinese,
                mode: currentQuestion.mode,
                correctAnswer: correctAnswers[0],
                userAnswer: userSelection,
                timestamp: new Date().getTime()
            });
        }
        
        this.updateWordStatus(currentWord.id, isCorrect, currentQuestion.mode);
        
        const feedbackElement = document.getElementById('ct-feedback');
        feedbackElement.classList.remove('hidden');
        
        const optionButtons = document.querySelectorAll('#ct-options button');
        const displayAnswer = correctAnswers[0];
        
        // 确定朗读文本：总是朗读英文单词，不朗读中文释义
        let speakText;
        if (currentQuestion.mode === 'english-to-chinese') {
            // 英文选汉语题型：朗读英文单词
            const englishList = currentWord.englishList || [currentWord.english];
            speakText = englishList[0];
        } else {
            // 汉语选英文题型：朗读英文答案
            speakText = displayAnswer;
        }
        
        if (isCorrect) {
            feedbackElement.className = 'correct-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-check-circle text-green-500 text-xl mr-2"></i>
                    <span>正确!</span>
                </div>
            `;
            
            const correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === displayAnswer
            );
            if (correctButton) {
                correctButton.classList.add('correct-option');
                
                this.speakWord(speakText, () => {
                    setTimeout(() => {
                        correctButton.style.transform = 'scale(1)';
                        correctButton.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                        setTimeout(() => {
                            this.state.comprehensive.currentIndex++;
                            this.updateComprehensiveTrainingUI();
                        }, 200);
                    }, 100);
                });
                
                correctButton.style.transform = 'scale(1.1)';
                correctButton.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
                correctButton.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
            }
        } else {
            feedbackElement.className = 'incorrect-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-times-circle text-red-500 text-xl mr-2"></i>
                    <span>错误! 正确答案是: <strong>${displayAnswer}</strong></span>
                </div>
            `;
            
            let correctButton = Array.from(optionButtons).find(btn => 
                btn.getAttribute('data-option') === displayAnswer
            );
            if (correctButton) {
                correctButton.classList.add('correct-option');
            }
            
            if (button.getAttribute('data-option') !== displayAnswer) {
                button.classList.add('incorrect-option');
            }
            
            this.speakWord(speakText);
            
            document.getElementById('ct-next-btn').disabled = false;
        }
        
        optionButtons.forEach(btn => {
            btn.disabled = true;
        });
        
        // 存储答题状态
        const answerKey = this.getAnswerKey(currentWord.id);
        const answerData = {
            isCorrect: isCorrect,
            correctAnswer: displayAnswer,
            correctAnswers: correctAnswers,
            userAnswer: userSelection,
            type: 'comprehensive',
            mode: currentQuestion.mode
        };
        this.state.session.answeredWords[answerKey] = answerData;
        
        this.saveAnswerToStorage('comprehensive', currentWord.id, answerData);
        
        if (!isCorrect) {
            document.getElementById('ct-next-btn').disabled = false;
        }
    },

    // 检查综合训练答案
    checkComprehensiveTrainingAnswer() {
        const currentQuestion = this.state.comprehensive.questions[this.state.comprehensive.currentIndex];
        const currentWord = this.state.words.list.find(word => word.id === currentQuestion.wordId);
        if (!currentWord) {
            console.error('找不到当前单词:', currentQuestion);
            return;
        }
        
        const userInput = document.getElementById('ct-input').value.trim().toLowerCase();
        
        const englishList = currentWord.englishList || [currentWord.english];
        const validEnglishList = englishList
            .map(item => typeof item === 'string' ? item : '')
            .filter(item => item.trim() !== '');
        
        const isCorrect = validEnglishList.some(answer => answer.toLowerCase() === userInput);
        
        if (isCorrect) {
            this.state.comprehensive.correctCount++;
        } else {
            this.state.comprehensive.incorrectCount++;
            this.state.comprehensive.errors.push({
                wordId: currentWord.id,
                english: currentWord.english,
                chinese: currentWord.chinese,
                mode: currentQuestion.mode,
                correctAnswer: validEnglishList[0],
                userAnswer: userInput,
                timestamp: new Date().getTime()
            });
        }
        
        this.updateWordStatus(currentWord.id, isCorrect, currentQuestion.mode);
        
        const feedbackElement = document.getElementById('ct-feedback');
        feedbackElement.classList.remove('hidden');
        
        const displayAnswer = validEnglishList[0];
        
        const inputElement = document.getElementById('ct-input');
        
        if (isCorrect) {
            feedbackElement.className = 'correct-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-check-circle text-green-500 text-xl mr-2"></i>
                    <span>正确!</span>
                </div>
            `;
            
            this.speakWord(displayAnswer, () => {
                setTimeout(() => {
                    inputElement.style.transform = 'scale(1)';
                    inputElement.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                    setTimeout(() => {
                        this.goToNextComprehensiveTrainingQuestion();
                    }, 300);
                }, 200);
            });
            
            inputElement.style.transform = 'scale(1.05)';
            inputElement.style.boxShadow = '0 8px 16px rgba(16, 185, 129, 0.4)';
            inputElement.style.transition = 'transform 0.3s ease, box-shadow 0.3s ease';
        } else {
            feedbackElement.className = 'incorrect-feedback mb-6';
            feedbackElement.innerHTML = `
                <div class="flex items-center">
                    <i class="fa fa-times-circle text-red-500 text-xl mr-2"></i>
                    <span>错误! 正确答案是: <strong>${displayAnswer}</strong></span>
                </div>
            `;
            
            this.speakWord(displayAnswer);
        }
        
        document.getElementById('ct-check-btn').disabled = true;
        document.getElementById('ct-next-btn').disabled = false;
        
        inputElement.disabled = true;
        inputElement.style.backgroundColor = '#f3f4f6';
        inputElement.style.cursor = 'not-allowed';
        inputElement.style.opacity = '0.7';
        
        const answerKey = this.getAnswerKey(currentWord.id);
        const answerData = {
            isCorrect: isCorrect,
            correctAnswer: displayAnswer,
            correctAnswers: validEnglishList,
            userAnswer: userInput,
            type: 'comprehensive',
            mode: currentQuestion.mode
        };
        this.state.session.answeredWords[answerKey] = answerData;
        
        this.saveAnswerToStorage('comprehensive', currentWord.id, answerData);
    },

    // 前往上一个综合训练问题
    goToPreviousComprehensiveTrainingQuestion() {
        if (this.state.comprehensive.currentIndex > 0) {
            this.state.comprehensive.currentIndex--;
            this.updateComprehensiveTrainingUI();
        }
    },

    // 前往下一个综合训练问题
    goToNextComprehensiveTrainingQuestion() {
        this.state.comprehensive.currentIndex++;
        this.updateComprehensiveTrainingUI();
    },

    // 显示综合训练结果
    showComprehensiveTrainingResult() {
        const totalQuestions = this.state.comprehensive.questions.length;
        const correctCount = this.state.comprehensive.correctCount;
        const score = Math.round((correctCount / totalQuestions) * 100);
        
        // 计算训练时长
        const endTime = new Date().getTime();
        const duration = endTime - this.state.comprehensive.startTime;
        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        const formattedDuration = `${minutes}分${seconds}秒`;
        
        document.getElementById('ct-exercise-section').classList.add('hidden');
        document.getElementById('ct-result-section').classList.remove('hidden');
        
        document.getElementById('ct-total-count').textContent = totalQuestions;
        document.getElementById('ct-correct-count').textContent = correctCount;
        document.getElementById('ct-score').textContent = score;
        
        const cteCount = this.state.comprehensive.questions.filter(q => q.mode === 'chinese-to-english').length;
        const etcCount = this.state.comprehensive.questions.filter(q => q.mode === 'english-to-chinese').length;
        const ctecCount = this.state.comprehensive.questions.filter(q => q.mode === 'chinese-to-english-choice').length;
        
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
        const errors = this.state.comprehensive.errors || [];
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
            const totalQuestions = this.state.comprehensive.questions.length;
            const incorrectCount = this.state.comprehensive.incorrectCount;
            const errorRate = totalQuestions > 0 
                ? Math.round((incorrectCount / totalQuestions) * 100) 
                : 0;
            errorRateElement.textContent = `${errorRate}%`;
        }
        
        // 计算并显示平均答题时间
        const avgTimeElement = document.getElementById('ct-avg-time');
        if (avgTimeElement) {
            const totalQuestions = this.state.comprehensive.questions.length;
            const startTime = this.state.comprehensive.startTime;
            const duration = startTime ? new Date().getTime() - startTime : 0;
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
        const totalQuestions = this.state.comprehensive.questions.length;
        const correctCount = this.state.comprehensive.correctCount;
        const incorrectCount = this.state.comprehensive.incorrectCount;
        
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
        const errors = this.state.comprehensive.errors || [];
        
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
            const word = this.state.words.list.find(w => w.id === error.wordId);
            const chineseText = word ? this.getMergedChineseText(word) : '';
            
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
                                <p class="text-lg font-bold text-gray-800">${this.getEnglishDisplay(error)}</p>
                            </div>
                            <div>
                                <p class="text-sm text-gray-600 mb-1">中文</p>
                                <p class="text-lg font-bold text-gray-800">${chineseText.replace(/\n/g, '<br>')}</p>
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
        const errors = this.state.comprehensive.errors || [];
        
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
                    englishList: error.englishList,
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
                wordId: word.id,
                mode: mode
            });
        });
        
        // 重新开始训练
        this.state.comprehensive.questions = retryQuestions;
        this.state.comprehensive.currentIndex = 0;
        this.state.comprehensive.correctCount = 0;
        this.state.comprehensive.incorrectCount = 0;
        this.state.comprehensive.errors = [];
        this.state.comprehensive.startTime = new Date().getTime();
        
        // 显示练习界面
        document.getElementById('ct-result-section').classList.add('hidden');
        document.getElementById('ct-error-list-section').classList.add('hidden');
        document.getElementById('ct-exercise-section').classList.remove('hidden');
        
        // 显示第一题
        this.updateComprehensiveTrainingUI();
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
        const correctAnswer = type === 'etc' ? this.getMergedChineseText(currentWord) : currentWord.english;
        const feedbackSelector = type === 'etc' ? '#etc-feedback' : (type === 'ctec' ? '#ctec-feedback' : '#cte-feedback');
        const nextBtnSelector = type === 'etc' ? '#etc-next-btn' : (type === 'ctec' ? '#ctec-next-btn' : '#cte-next-btn');
        const forgotBtnSelector = type === 'etc' ? '#etc-forgot-btn' : (type === 'ctec' ? '#ctec-forgot-btn' : '#cte-forgot-btn');
        const checkBtnSelector = type === 'cte' ? '#cte-check-btn' : null;
        
        // 确定朗读文本：总是朗读英文单词，不朗读中文释义
        const englishList = currentWord.englishList || [currentWord.english];
        const speakText = englishList[0];
        
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
            const englishDisplay = this.getEnglishDisplay(currentWord);
            inputElement.value = englishDisplay;
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
        
        // 存储答题状态（标记为忘记）
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
        
        this.speakWord(speakText);
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
            englishList: word.englishList,
            chinese: word.chinese
        }));
        
        // 设置为复习模式
        this.state.session.isReviewMode = true;
        
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
            englishList: word.englishList,
            chinese: word.chinese
        }));
        
        // 设置为复习模式
        this.state.session.isReviewMode = true;
        
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
        
        if (filterText) {
            const lowerFilter = filterText.toLowerCase();
            words = words.filter(word => {
                const englishList = word.englishList || [word.english];
                const englishText = englishList
                    .map(item => typeof item === 'string' ? item : '')
                    .join(', ')
                    .toLowerCase();
                const chineseText = this.getMergedChineseText(word);
                return englishText.includes(lowerFilter) || chineseText.includes(filterText);
            });
        }
        
        countElement.textContent = words.length;
        
        container.innerHTML = '';
        
        words.forEach(word => {
            const card = document.createElement('div');
            card.className = 'bg-gray-50 rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow';
            
            const statusClass = word.isStudied 
                ? (word.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')
                : 'bg-gray-200 text-gray-600';
            
            const statusText = word.isStudied 
                ? (word.isCorrect ? '已掌握' : '需复习')
                : '未学习';
            
            const englishDisplay = this.getEnglishDisplay(word);
            
            const chineseText = this.getMergedChineseText(word);
            
            card.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="text-lg font-semibold text-gray-800">${englishDisplay}</span>
                    <span class="text-xs px-2 py-1 rounded-full ${statusClass}">${statusText}</span>
                </div>
                <div class="text-gray-600">${chineseText.replace(/\n/g, '<br>')}</div>
            `;
            
            container.appendChild(card);
        });
        
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

    // 导出错题
    exportErrorWords() {
        const selectedFormat = document.querySelector('input[name="export-format"]:checked').value;
        
        // 获取错误单词
        const errorWords = this.state.words.list
            .filter(word => word.isInErrorList)
            .map(word => ({
                id: word.id,
                english: word.english,
                englishList: word.englishList,
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
            const englishDisplay = this.getEnglishDisplay(word);
            
            const chineseText = this.getMergedChineseText(word);
            
            htmlContent += `
        <tr>
            <td>${index + 1}</td>
            <td>${englishDisplay}</td>
            <td>${chineseText.replace(/\n/g, '<br>')}</td>
            <td>${word.errorCount}</td>
            <td>${new Date(word.lastErrorTime).toLocaleString()}</td>
        </tr>`;
        });
        
        htmlContent += `
    </table>
</body>
</html>
`;
        
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
        let csvContent = '\ufeff序号,英文单词,中文释义,错误次数,最后错误时间\n';
        
        words.forEach((word, index) => {
            const englishDisplay = this.getEnglishDisplay(word);
            
            const chineseText = this.getMergedChineseText(word);
            
            csvContent += `${index + 1},${englishDisplay},${chineseText},${word.errorCount},${new Date(word.lastErrorTime).toLocaleString()}\n`;
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
            } else if (this.state.session.isReviewMode && word.isInErrorList) {
                // 在复习模式下，如果回答正确，将单词从错误列表中移除
                word.isInErrorList = false;
                word.isCorrect = true;
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

        // 导入/导出统计按钮点击事件
        const importExportStatsBtn = document.getElementById('import-export-stats-btn');
        if (importExportStatsBtn) {
            importExportStatsBtn.addEventListener('click', () => {
                this.showImportExportStatsModal();
            });
        }

        // 关闭导入/导出统计模态框按钮点击事件
        const closeImportExportStatsModalBtn = document.getElementById('close-import-export-stats-modal');
        if (closeImportExportStatsModalBtn) {
            closeImportExportStatsModalBtn.addEventListener('click', () => {
                this.hideImportExportStatsModal();
            });
        }

        // 点击导入/导出统计模态框外部关闭
        const importExportStatsModal = document.getElementById('import-export-stats-modal');
        if (importExportStatsModal) {
            importExportStatsModal.addEventListener('click', (e) => {
                if (e.target === importExportStatsModal) {
                    this.hideImportExportStatsModal();
                }
            });
        }

        // 导出统计按钮点击事件
        const exportStatsBtn = document.getElementById('export-stats-btn');
        if (exportStatsBtn) {
            exportStatsBtn.addEventListener('click', () => {
                this.exportStats();
            });
        }

        // 导入统计按钮点击事件
        const importStatsBtn = document.getElementById('import-stats-btn');
        if (importStatsBtn) {
            importStatsBtn.addEventListener('click', () => {
                const statsFileInput = document.getElementById('stats-file-input');
                if (statsFileInput) {
                    statsFileInput.click();
                }
            });
        }

        // 导入统计文件输入事件
        const statsFileInput = document.getElementById('stats-file-input');
        if (statsFileInput) {
            statsFileInput.addEventListener('change', () => {
                this.importStats();
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
            this.loadMarkdownContent('README.md', helpContent);
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
        
        // 替换图片
        markdown = markdown.replace(/!\[([^\]]+)\]\(([^)]+)\)/gm, '<img src="$2" alt="$1" class="max-w-full h-auto my-4 rounded-lg shadow-sm">');
        
        // 替换链接
        markdown = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/gm, '<a href="$2" class="text-primary hover:underline">$1</a>');
        
        // 替换分割线
        markdown = markdown.replace(/^-{3,}$|^\*{3,}$|^_{3,}$/gm, '<hr class="border-gray-200 my-6">');        
        // 替换代码块
        markdown = markdown.replace(/```([\s\S]*?)```/gm, '<pre class="bg-gray-100 p-4 rounded-lg overflow-x-auto mb-4"><code>$1</code></pre>');
        
        // 替换行内代码
        markdown = markdown.replace(/`([^`]+)`/gm, '<code class="bg-gray-100 px-1 py-0.5 rounded">$1</code>');
        
        // 替换加粗文本
        markdown = markdown.replace(/\*\*(.+?)\*\*/gm, '<strong class="font-bold">$1</strong>');
        
        // 处理表格
        markdown = markdown.replace(/(\|.*\|\n)+/gm, function(table) {
            // 分割表格行
            const rows = table.trim().split('\n');
            if (rows.length < 2) return table;
            
            let html = '<div class="overflow-x-auto mb-4"><table class="min-w-full border-collapse border border-gray-200 rounded-lg">';
            
            // 处理表头
            const headerRow = rows[0];
            const headerCells = headerRow.split('|').map(cell => cell.trim()).filter(cell => cell);
            html += '<thead class="bg-gray-50"><tr>';
            headerCells.forEach(cell => {
                html += '<th class="border border-gray-200 px-4 py-2 text-left font-semibold">' + cell + '</th>';
            });
            html += '</tr></thead>';
            
            // 跳过分隔行
            let startRow = 1;
            if (rows[1].includes('---')) startRow = 2;
            
            // 处理数据行
            html += '<tbody>';
            for (let i = startRow; i < rows.length; i++) {
                const dataRow = rows[i];
                const dataCells = dataRow.split('|').map(cell => cell.trim()).filter(cell => cell);
                if (dataCells.length > 0) {
                    html += '<tr>';
                    dataCells.forEach(cell => {
                        html += '<td class="border border-gray-200 px-4 py-2">' + cell + '</td>';
                    });
                    html += '</tr>';
                }
            }
            html += '</tbody></table></div>';
            
            return html;
        });
        
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
        markdown = markdown.replace(/^(?!#)(?!\s*```)(?!<ul|<ol|<table|<img|<hr)([\s\S]*?)(?=^$|^#|^\s*```|<ul|<ol|<table|<img|<hr)/gm, function(match) {
            if (match.trim()) {
                return '<p class="mb-4">' + match.trim() + '</p>';
            }
            return match;
        });
        
        return markdown;
    },

    // ==================== 导入/导出统计功能 ====================

    // 显示导入/导出统计模态框
    showImportExportStatsModal() {
        document.getElementById('import-export-stats-modal').classList.remove('hidden');
        this.resetImportExportStatsStatus();
    },

    // 隐藏导入/导出统计模态框
    hideImportExportStatsModal() {
        document.getElementById('import-export-stats-modal').classList.add('hidden');
    },

    // 重置导入/导出状态显示
    resetImportExportStatsStatus() {
        const statusDiv = document.getElementById('stats-import-export-status');
        statusDiv.classList.add('hidden');
        
        const loadingSpinner = document.getElementById('stats-loading-spinner');
        loadingSpinner.classList.remove('hidden');
        
        const successIcon = document.getElementById('stats-success-icon');
        successIcon.classList.add('scale-0', 'opacity-0');
        successIcon.classList.remove('scale-100', 'opacity-100');
        
        const statusMessage = document.getElementById('stats-status-message');
        statusMessage.textContent = '';
    },

    // 显示导入/导出状态
    showImportExportStatsStatus(message, isSuccess = true) {
        const statusDiv = document.getElementById('stats-import-export-status');
        statusDiv.classList.remove('hidden');
        
        const loadingSpinner = document.getElementById('stats-loading-spinner');
        loadingSpinner.classList.add('hidden');
        
        const successIcon = document.getElementById('stats-success-icon');
        const statusMessage = document.getElementById('stats-status-message');
        
        if (isSuccess) {
            successIcon.classList.remove('scale-0', 'opacity-0');
            successIcon.classList.add('scale-100', 'opacity-100');
            successIcon.querySelector('i').classList.remove('fa-times', 'text-red-500');
            successIcon.querySelector('i').classList.add('fa-check', 'text-green-500');
            successIcon.querySelector('.rounded-full').classList.remove('bg-red-100');
            successIcon.querySelector('.rounded-full').classList.add('bg-green-100');
        } else {
            successIcon.classList.remove('scale-0', 'opacity-0');
            successIcon.classList.add('scale-100', 'opacity-100');
            successIcon.querySelector('i').classList.remove('fa-check', 'text-green-500');
            successIcon.querySelector('i').classList.add('fa-times', 'text-red-500');
            successIcon.querySelector('.rounded-full').classList.remove('bg-green-100');
            successIcon.querySelector('.rounded-full').classList.add('bg-red-100');
        }
        
        statusMessage.textContent = message;
    },

    // 导出统计数据
    exportStats() {
        try {
            const statsData = {
                exportDate: new Date().toISOString(),
                summary: {
                    totalWords: this.state.words.list.length,
                    masteredWords: this.state.words.list.filter(w => w.isCorrect).length,
                    needPracticeWords: this.state.words.list.filter(w => w.isStudied && !w.isCorrect).length,
                    errorWords: this.state.words.list.filter(w => w.isInErrorList).length
                },
                words: this.state.words.list.map(word => ({
                    id: word.id,
                    english: word.english,
                    englishList: word.englishList,
                    chinese: word.chinese,
                    status: this.getWordStatus(word),
                    isStudied: word.isStudied || false,
                    isCorrect: word.isCorrect || false,
                    isInErrorList: word.isInErrorList || false,
                    studyCount: word.studyCount || 0,
                    errorCount: word.errorCount || 0,
                    lastStudied: word.lastStudied || null,
                    lastError: word.lastError || null,
                    lastErrorTime: word.lastErrorTime || null
                }))
            };
            
            const jsonString = JSON.stringify(statsData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.download = `word-stats-${timestamp}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showImportExportStatsStatus(
                `成功导出统计数据！\n总单词数：${statsData.summary.totalWords}\n已掌握：${statsData.summary.masteredWords}\n待巩固：${statsData.summary.needPracticeWords}\n错误单词：${statsData.summary.errorWords}`,
                true
            );
        } catch (error) {
            console.error('导出统计数据失败:', error);
            this.showImportExportStatsStatus(
                `导出失败：${error.message}`,
                false
            );
        }
    },

    // 获取合并后的中文释义
    getMergedChineseText(word) {
        let chineseObj = null;
        
        if (word.chineseObj && typeof word.chineseObj === 'object') {
            chineseObj = word.chineseObj;
        } else if (word.chinese && typeof word.chinese === 'object') {
            chineseObj = word.chinese;
        } else if (typeof word.chinese === 'string' && word.chinese.trim() !== '') {
            return word.chinese;
        } else {
            return '';
        }
        
        const entries = Object.entries(chineseObj);
        const groupedByPos = {};
        
        entries.forEach(([meaning, examples]) => {
            const match = meaning.match(/^([a-z]+\.)\s*(.+)$/);
            if (match) {
                const pos = match[1];
                const definition = match[2];
                
                if (!groupedByPos[pos]) {
                    groupedByPos[pos] = [];
                }
                groupedByPos[pos].push(definition);
            } else {
                if (!groupedByPos['']) {
                    groupedByPos[''] = [];
                }
                groupedByPos[''].push(meaning);
            }
        });
        
        const mergedParts = Object.entries(groupedByPos)
            .sort(([posA], [posB]) => {
                if (posA === '') return 1;
                if (posB === '') return -1;
                return posA.localeCompare(posB);
            })
            .map(([pos, definitions]) => {
                if (pos) {
                    return `${pos} ${definitions.join('; ')}`;
                } else {
                    return definitions.join('; ');
                }
            });
        
        return mergedParts.join('\n');
    },

    // 安全获取英文显示文本
    getEnglishDisplay(word) {
        if (!word) {
            return '';
        }
        
        const englishList = word.englishList || [word.english];
        const validEnglishList = englishList
            .map(item => {
                if (typeof item === 'string') {
                    return item.trim();
                } else if (item && typeof item === 'object' && item.word) {
                    return item.word.trim();
                } else {
                    return '';
                }
            })
            .filter(item => item !== '');
        
        if (validEnglishList.length === 0) {
            return word.english || word.id || '';
        }
        
        return validEnglishList.length > 1 
            ? validEnglishList.join(' / ') 
            : validEnglishList[0];
    },

    // 获取单词状态
    getWordStatus(word) {
        if (!word.isStudied) {
            return '未学习';
        } else if (word.isCorrect) {
            return '已掌握';
        } else if (word.isInErrorList) {
            return '错误单词';
        } else {
            return '学习中';
        }
    },

    // 导入统计数据
    importStats() {
        const fileInput = document.getElementById('stats-file-input');
        
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
                
                if (!data.summary) {
                    throw new Error('JSON文件格式不正确，缺少summary对象！');
                }
                
                // 处理导入的数据
                this.processImportedStats(data);
            } catch (error) {
                console.error('导入统计数据失败:', error);
                this.showImportExportStatsStatus(
                    `导入失败：${error.message}`,
                    false
                );
            }
        };
        
        reader.onerror = () => {
            this.showImportExportStatsStatus(
                '文件读取失败，请重试！',
                false
            );
        };
        
        reader.readAsText(file);
    },

    // 处理导入的统计数据
    processImportedStats(data) {
        let updatedCount = 0;
        let addedCount = 0;
        let skippedCount = 0;
        
        data.words.forEach(importedWord => {
            // 查找是否存在相同的单词（基于英文和中文的组合）
            const existingWord = this.state.words.list.find(w => 
                w.english === importedWord.english && w.chinese === importedWord.chinese
            );
            
            if (existingWord) {
                // 更新现有单词的统计数据
                existingWord.isStudied = importedWord.isStudied !== undefined ? importedWord.isStudied : existingWord.isStudied;
                existingWord.isCorrect = importedWord.isCorrect !== undefined ? importedWord.isCorrect : existingWord.isCorrect;
                existingWord.isInErrorList = importedWord.isInErrorList !== undefined ? importedWord.isInErrorList : existingWord.isInErrorList;
                
                // 合并学习次数（取最大值）
                existingWord.studyCount = Math.max(existingWord.studyCount || 0, importedWord.studyCount || 0);
                
                // 合并错误次数（取最大值）
                existingWord.errorCount = Math.max(existingWord.errorCount || 0, importedWord.errorCount || 0);
                
                // 使用较晚的学习时间
                if (importedWord.lastStudied) {
                    const existingTime = existingWord.lastStudied ? new Date(existingWord.lastStudied).getTime() : 0;
                    const importedTime = new Date(importedWord.lastStudied).getTime();
                    existingWord.lastStudied = existingTime > importedTime ? existingWord.lastStudied : importedWord.lastStudied;
                }
                
                // 使用较晚的错误时间
                if (importedWord.lastError) {
                    const existingTime = existingWord.lastError ? new Date(existingWord.lastError).getTime() : 0;
                    const importedTime = new Date(importedWord.lastError).getTime();
                    existingWord.lastError = existingTime > importedTime ? existingWord.lastError : importedWord.lastError;
                }
                
                // 保持 lastErrorTime 的兼容性
                existingWord.lastErrorTime = existingWord.lastError;
                
                updatedCount++;
            } else {
                // 为新单词生成唯一ID
                const newId = Math.max(...this.state.words.list.map(w => w.id), 0) + 1;
                
                // 添加新单词
                const newWord = {
                    id: newId,
                    english: importedWord.english,
                    englishList: importedWord.englishList,
                    chinese: importedWord.chinese,
                    isStudied: importedWord.isStudied || false,
                    isCorrect: importedWord.isCorrect || false,
                    isInErrorList: importedWord.isInErrorList || false,
                    studyCount: importedWord.studyCount || 0,
                    errorCount: importedWord.errorCount || 0,
                    lastStudied: importedWord.lastStudied || null,
                    lastError: importedWord.lastError || null,
                    lastErrorTime: importedWord.lastError || null
                };
                this.state.words.list.push(newWord);
                addedCount++;
            }
        });
        
        // 更新错误单词列表
        this.updateErrorWordsList();
        
        // 更新统计显示
        this.updateStatsPage();
        
        // 显示成功消息
        const message = `成功导入统计数据！\n更新单词：${updatedCount}\n新增单词：${addedCount}`;
        this.showImportExportStatsStatus(message, true);
    }
};

// 初始化应用
Wordskr.init();
