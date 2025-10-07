const { execSync } = require('child_process');
const path = require('path');

console.log('正在构建 React GUI 组件...');

try {
  // 进入 react-gui 目录
  process.chdir(path.join(__dirname, 'react-gui'));
  
  // 运行构建命令
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('React GUI 组件构建完成！');
  console.log('构建文件位于: dist/react-gui.bundle.js');
  console.log('');
  console.log('使用方法:');
  console.log('1. 在 Electron 中使用 GUI-react.html 替代 GUI.html');
  console.log('2. 或者直接打开 GUI-react.html 查看效果');
} catch (error) {
  console.error('构建失败:', error.message);
  process.exit(1);
}