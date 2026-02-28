/**
 * OOBE交互逻辑脚本
 * 处理步骤切换、配置保存和IPC通信
 */

// OOBE状态管理
const OobeState = {
    currentStep: 1,
    totalSteps: 3,
    assignmentConfig: {
        enabled: false,
        serverUrl: '',
        clientName: ''
    }
};

// DOM元素引用
const Elements = {
    steps: document.querySelectorAll('.step'),
    stepLines: document.querySelectorAll('.step-line'),
    stepContents: document.querySelectorAll('.step-content'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnOpenConfigFolder: document.getElementById('btnOpenConfigFolder'),
    assignmentToggle: document.getElementById('assignmentToggle'),
    assignmentConfigForm: document.getElementById('assignmentConfigForm'),
    serverUrl: document.getElementById('serverUrl'),
    clientName: document.getElementById('clientName')
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

    // 作业功能开关
    if (Elements.assignmentToggle) {
        Elements.assignmentToggle.addEventListener('change', toggleAssignmentConfig);
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
        Elements.btnPrev.style.display = 'none';
    } else {
        Elements.btnPrev.style.display = 'inline-flex';
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
        // 如果是第二步，保存作业配置
        if (OobeState.currentStep === 2) {
            await saveAssignmentConfig();
        }

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
 * 切换作业功能配置显示
 */
function toggleAssignmentConfig() {
    const isEnabled = Elements.assignmentToggle.checked;
    OobeState.assignmentConfig.enabled = isEnabled;

    if (isEnabled) {
        Elements.assignmentConfigForm.style.display = 'block';
        Elements.assignmentConfigForm.style.animation = 'fadeIn 0.3s ease';
    } else {
        Elements.assignmentConfigForm.style.display = 'none';
    }
}

/**
 * 保存作业配置
 */
async function saveAssignmentConfig() {
    if (!OobeState.assignmentConfig.enabled) {
        // 如果未启用，保存禁用状态
        const { ipcRenderer } = require('electron');
        await ipcRenderer.invoke('oobe-save-assignment-config', {
            enabled: false
        });
        return;
    }

    // 获取输入值
    const serverUrl = Elements.serverUrl.value.trim();
    const clientName = Elements.clientName.value.trim();

    // 验证输入
    if (serverUrl && clientName) {
        OobeState.assignmentConfig.serverUrl = serverUrl;
        OobeState.assignmentConfig.clientName = clientName;

        const { ipcRenderer } = require('electron');
        try {
            const result = await ipcRenderer.invoke('oobe-save-assignment-config', {
                enabled: true,
                serverUrl: serverUrl,
                clientName: clientName
            });

            if (!result.success) {
                console.warn('保存作业配置失败:', result.error);
            }
        } catch (error) {
            console.error('保存作业配置时出错:', error);
        }
    }
}

/**
 * 完成OOBE
 */
async function completeOobe() {
    const { ipcRenderer } = require('electron');

    // 保存第二步的配置（如果还没保存）
    if (OobeState.currentStep === 2) {
        await saveAssignmentConfig();
    }

    // 发送完成事件
    ipcRenderer.send('oobe-complete');
}

/**
 * 验证当前步骤
 * @returns {boolean} 验证是否通过
 */
function validateCurrentStep() {
    switch (OobeState.currentStep) {
        case 2:
            // 如果启用了作业功能，验证输入
            if (OobeState.assignmentConfig.enabled) {
                const serverUrl = Elements.serverUrl.value.trim();
                const clientName = Elements.clientName.value.trim();

                if (!serverUrl || !clientName) {
                    showError('请填写完整的服务器地址和客户端名称,或关闭作业功能');
                    return false;
                }
            }
            return true;
        default:
            return true;
    }
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
    errorEl.style.display = 'block';

    // 3秒后自动隐藏
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, 3000);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 添加错误提示样式
const errorStyle = document.createElement('style');
errorStyle.textContent = `
    .error-message {
        background: linear-gradient(135deg, #ffebee 0%, #ffcdd2 100%);
        color: #c62828;
        padding: 12px 16px;
        border-radius: 6px;
        margin-bottom: 16px;
        font-size: 14px;
        border: 1px solid #ef9a9a;
        animation: fadeIn 0.3s ease;
    }
`;
document.head.appendChild(errorStyle);
