const { execSync } = require('child_process');
const path = require('path');

console.log('正在构建 React GUI 组件...');

try {
  
  // 运行构建命令
  execSync('npm run build', { stdio: 'inherit' });
  
  console.log('React GUI 组件构建完成！');
  console.log('构建文件位于: dist/react-gui.bundle.js');
} catch (error) {
  console.error('构建失败:', error.message);
  process.exit(1);
}