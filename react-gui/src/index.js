import React from 'react';
import ReactDOM from 'react-dom/client';
import GUI from './GUI.jsx';
import './GUI.css';

// 创建根元素
const rootElement = document.getElementById('root');
if (!rootElement) {
  const rootDiv = document.createElement('div');
  rootDiv.id = 'root';
  document.body.appendChild(rootDiv);
}

// 渲染 React 应用
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<GUI />);