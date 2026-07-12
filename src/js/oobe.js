/**
 * OOBE 交互逻辑。
 * 负责步骤切换以及首次运行相关 IPC 通信。
 */

const OobeState = {
    currentStep: 1,
    totalSteps: 2
};

const Elements = {
    steps: document.querySelectorAll('.step'),
    stepLines: document.querySelectorAll('.step-line'),
    stepContents: document.querySelectorAll('.step-content'),
    currentStepText: document.getElementById('currentStepText'),
    btnPrev: document.getElementById('btnPrev'),
    btnNext: document.getElementById('btnNext'),
    btnOpenConfigFolder: document.getElementById('btnOpenConfigFolder')
};

/**
 * 初始化首次使用引导。
 */
function init() {
    bindEvents();
    updateUI(false);
}

/**
 * 绑定引导页按钮事件。
 */
function bindEvents() {
    Elements.btnPrev.addEventListener('click', goToPrevStep);
    Elements.btnNext.addEventListener('click', goToNextStep);
    Elements.btnOpenConfigFolder.addEventListener('click', openConfigFolder);
}

/**
 * 同步步骤、内容和导航按钮状态。
 * @param {boolean} focusHeading 是否将焦点移动到当前步骤标题
 */
function updateUI(focusHeading) {
    updateStepIndicator();
    updateStepContent(focusHeading);
    updateNavigationButtons();
    Elements.currentStepText.textContent = String(OobeState.currentStep);
}

/**
 * 更新侧栏步骤状态和无障碍标记。
 */
function updateStepIndicator() {
    Elements.steps.forEach((step, index) => {
        const stepNumber = index + 1;
        const isCurrent = stepNumber === OobeState.currentStep;

        step.classList.toggle('active', isCurrent);
        step.classList.toggle('completed', stepNumber < OobeState.currentStep);

        if (isCurrent) {
            step.setAttribute('aria-current', 'step');
        } else {
            step.removeAttribute('aria-current');
        }
    });

    Elements.stepLines.forEach((line, index) => {
        line.classList.toggle('active', index < OobeState.currentStep - 1);
    });
}

/**
 * 显示当前步骤内容并隐藏其他步骤。
 * @param {boolean} focusHeading 是否聚焦当前步骤标题
 */
function updateStepContent(focusHeading) {
    Elements.stepContents.forEach((content, index) => {
        const isCurrent = index + 1 === OobeState.currentStep;
        content.hidden = !isCurrent;

        if (isCurrent && focusHeading) {
            content.querySelector('.step-title')?.focus({ preventScroll: true });
        }
    });
}

/**
 * 更新上一步和下一步按钮。
 */
function updateNavigationButtons() {
    Elements.btnPrev.classList.toggle('is-hidden', OobeState.currentStep === 1);
    Elements.btnNext.textContent = OobeState.currentStep === OobeState.totalSteps
        ? '完成并重启'
        : '下一步';
}

/**
 * 返回上一个引导步骤。
 */
function goToPrevStep() {
    if (OobeState.currentStep <= 1) return;

    OobeState.currentStep -= 1;
    updateUI(true);
}

/**
 * 进入下一个步骤或完成首次使用引导。
 */
function goToNextStep() {
    if (OobeState.currentStep < OobeState.totalSteps) {
        OobeState.currentStep += 1;
        updateUI(true);
        return;
    }

    completeOobe();
}

/**
 * 请求主进程打开本地课表配置文件夹。
 */
function openConfigFolder() {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('oobe-open-config-folder');
}

/**
 * 保存首次运行完成状态并请求应用自动重启。
 */
function completeOobe() {
    if (Elements.btnNext.disabled) return;

    Elements.btnNext.disabled = true;
    Elements.btnNext.textContent = '正在重启...';

    const { ipcRenderer } = require('electron');
    ipcRenderer.send('oobe-complete');
}

document.addEventListener('DOMContentLoaded', init);
