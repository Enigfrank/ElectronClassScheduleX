/**
 * OOBE交互逻辑脚本
 * 处理步骤切换、配置保存和IPC通信
 */

// OOBE状态管理
const OobeState = {
    currentStep: 1,
    totalSteps: 2
};

// DOM元素引用
const Elements = {
    steps: document.querySelectorAll('.step'),
    stepLines: document.querySelectorAll('.step-line'),
    stepContents: document.querySelectorAll('.step-content'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnOpenConfigFolder: document.getElementById('btnOpenConfigFolder')
};

/**
 * 初始化OOBE
 */
function init() {
    bindEvents();
    updateUI();
}

/**
 * 绑定事件监听器
 */
function bindEvents() {
    // 导航按钮
    Elements.btnPrev.addEventListener('click', goToPrevStep);
    Elements.btnNext.addEventListener('click', goToNextStep);

    // 打开配置文件夹
    if (Elements.btnOpenConfigFolder) {
        Elements.btnOpenConfigFolder.addEventListener('click', openConfigFolder);
    }

}

/**
 * 更新UI状态
 */
function updateUI() {
    updateStepIndicator();
    updateStepContent();
    updateNavigationButtons();
}

/**
 * 更新步骤指示器
 */
function updateStepIndicator() {
    Elements.steps.forEach((step, index) => {
        const stepNum = index + 1;
        step.classList.remove('active', 'completed');

        if (stepNum === OobeState.currentStep) {
            step.classList.add('active');
        } else if (stepNum < OobeState.currentStep) {
            step.classList.add('completed');
        }
    });

    // 更新步骤线
    Elements.stepLines.forEach((line, index) => {
        line.classList.remove('active');
        if (index < OobeState.currentStep - 1) {
            line.classList.add('active');
        }
    });
}

/**
 * 更新步骤内容显示
 */
function updateStepContent() {
    Elements.stepContents.forEach((content, index) => {
        content.classList.remove('active');
        if (index + 1 === OobeState.currentStep) {
            content.classList.add('active');
        }
    });
}

/**
 * 更新导航按钮
 */
function updateNavigationButtons() {
    // 上一步按钮
    if (OobeState.currentStep === 1) {
        Elements.btnPrev.classList.add('is-hidden');
    } else {
        Elements.btnPrev.classList.remove('is-hidden');
    }

    // 下一步/完成按钮
    if (OobeState.currentStep === OobeState.totalSteps) {
        Elements.btnNext.textContent = '开始使用';
        Elements.btnNext.classList.add('btn-finish');
    } else {
        Elements.btnNext.textContent = '下一步';
        Elements.btnNext.classList.remove('btn-finish');
    }
}

/**
 * 跳转到上一步
 */
function goToPrevStep() {
    if (OobeState.currentStep > 1) {
        OobeState.currentStep--;
        updateUI();
    }
}

/**
 * 跳转到下一步
 */
async function goToNextStep() {
    if (OobeState.currentStep < OobeState.totalSteps) {
        OobeState.currentStep++;
        updateUI();
    } else {
        // 完成OOBE
        await completeOobe();
    }
}

/**
 * 打开配置文件夹
 */
function openConfigFolder() {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('oobe-open-config-folder');
}

/**
 * 完成OOBE
 */
async function completeOobe() {
    const { ipcRenderer } = require('electron');

    // 发送完成事件
    ipcRenderer.send('oobe-complete');
}

/**
 * 验证当前步骤
 * @returns {boolean} 验证是否通过
 */
function validateCurrentStep() {
    return true;
}

/**
 * 显示错误信息
 * @param {string} message - 错误信息
 */
function showError(message) {
    // 创建错误提示元素
    let errorEl = document.querySelector('.error-message');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        document.querySelector('.content-area').prepend(errorEl);
    }

    errorEl.textContent = message;
    errorEl.classList.add('is-visible');

    // 3秒后自动隐藏
    setTimeout(() => {
        errorEl.classList.remove('is-visible');
    }, 3000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
