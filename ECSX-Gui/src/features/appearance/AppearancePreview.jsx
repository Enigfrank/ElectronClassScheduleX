import React, { useState } from 'react';
import { Box, Flex, FormLabel, Heading, Select, Text } from '@chakra-ui/react';
import { previewVariables } from './appearanceStyle.js';
import './appearance.css';

/**
 * 使用同一草稿演示三个原生区域；演示模式和背景始终只存在于组件本地。
 * @param {{styleValue: {backgroundColor: string, blurSigma: number, opacity: number}, enabled: boolean,
 * globalEnabled: boolean, hasInvalidDraft?: boolean}} props 模拟参数
 * @returns {React.ReactElement} 不访问 IPC 的 CSS 模拟演示
 */
export default function AppearancePreview({ styleValue, enabled, globalEnabled, hasInvalidDraft = false }) {
  const [globalMode, setGlobalMode] = useState('glass');
  const [miniMode, setMiniMode] = useState('glass');
  const [background, setBackground] = useState('light');
  const globalGlass = globalMode === 'current' ? globalEnabled : globalMode === 'glass';
  const miniGlass = miniMode === 'current' ? enabled : miniMode === 'glass';

  return (
    <Box className="appearance-preview" as="section" aria-label="液态玻璃模拟演示">
      <style>{previewVariables(styleValue)}</style>
      <Heading as="h3" className="appearance-subheading">可识别度模拟演示</Heading>
      <Text className="appearance-muted">仅演示设置：默认模拟玻璃，以下模式和背景不改变真实开关。可切换“跟随真实开关”或“模拟原版半透明黑底”对照。</Text>
      <Flex className="appearance-preview-controls">
        <Box className="appearance-preview-control">
          <FormLabel htmlFor="appearance-preview-global" className="appearance-label">主课表演示模式</FormLabel>
          <Select id="appearance-preview-global" aria-label="主课表演示模式" className="appearance-input"
            value={globalMode} onChange={event => setGlobalMode(event.target.value)}>
            <option value="current">跟随真实开关</option><option value="glass">模拟玻璃</option><option value="plain">模拟原版半透明黑底</option>
          </Select>
        </Box>
        <Box className="appearance-preview-control">
          <FormLabel htmlFor="appearance-preview-mini" className="appearance-label">迷你倒计时演示模式</FormLabel>
          <Select id="appearance-preview-mini" aria-label="迷你倒计时演示模式" className="appearance-input"
            value={miniMode} onChange={event => setMiniMode(event.target.value)}>
            <option value="current">跟随真实开关</option><option value="glass">模拟玻璃</option><option value="plain">模拟原版半透明黑底</option>
          </Select>
        </Box>
        <Box className="appearance-preview-control">
          <FormLabel htmlFor="appearance-preview-background" className="appearance-label">演示背景</FormLabel>
          <Select id="appearance-preview-background" aria-label="演示背景" className="appearance-input"
            value={background} onChange={event => setBackground(event.target.value)}>
            <option value="light">浅色桌面</option><option value="contrast">深浅对照</option><option value="detail">文字与图块</option>
          </Select>
        </Box>
      </Flex>
      <Box className="appearance-preview-scene" data-background={background}>
        <Box className="appearance-preview-backdrop" aria-hidden="true">
          <span>桌面文档 ABC 123</span><span>窗口内容 · 课程计划</span><span>阅读背景细节</span>
        </Box>
        <Box className="appearance-preview-sample">
          <Text className="appearance-preview-caption">主课表、侧栏与课程倒计时 · 模拟 · {globalGlass ? '玻璃' : '原版半透明黑底'}</Text>
          <Flex className="appearance-preview-schedule"
            data-region="globalContainer" data-glass={Boolean(globalGlass)}>
            <Box className={`appearance-preview-surface appearance-preview-sidebar${globalGlass ? ' is-glass' : ''}`}>
              <Text as="span">124 天</Text>
            </Box>
            <Box className={`appearance-preview-surface appearance-preview-course${globalGlass ? ' is-glass' : ''}`}>
              <Text as="span">语</Text><Text as="span" className="appearance-preview-current-class">数</Text><Text as="span">英</Text>
            </Box>
            <Box className={`appearance-preview-surface appearance-preview-countdown${globalGlass ? ' is-glass' : ''}`}>
              <Text as="span" className="appearance-preview-current-class">数学</Text><Text as="span">08:24</Text>
            </Box>
          </Flex>
        </Box>
        <Flex className="appearance-preview-mini-row">
          <Box className="appearance-preview-sample">
            <Text className="appearance-preview-caption">迷你倒计时 · 模拟 · {miniGlass ? '玻璃' : '原版半透明黑底'}</Text>
            <Box className={`appearance-preview-surface appearance-preview-mini${miniGlass ? ' is-glass' : ''}`}
              data-region="miniCountdown" data-glass={Boolean(miniGlass)}>
              <Text as="span" className="appearance-preview-current-class">数学</Text><Text as="span">08:24</Text>
            </Box>
          </Box>
          <Box className="appearance-preview-sample">
            <Text className="appearance-preview-caption">下节课提示 · 模拟 · 跟随迷你模式</Text>
            <Box className={`appearance-preview-surface appearance-preview-hint${miniGlass ? ' is-glass' : ''}`}
              data-region="nextClassHint" data-glass={Boolean(miniGlass)}>
              <Text as="span">下节: 语文</Text>
            </Box>
          </Box>
        </Flex>
      </Box>
      <Text className="appearance-muted">本区使用本地 CSS 模拟染色、透明与背景模糊；原生玻璃会受系统合成与实际桌面背景影响，效果可能不同。</Text>
      <Text className="appearance-muted">原版黑底按内置课表参考不透明度 45% 演示，实际以课表配置为准；课程强调色、边框与文字阴影沿用原界面。</Text>
      {hasInvalidDraft && <Text role="status" className="appearance-muted">存在无效草稿：对应字段暂用已保存值演示，修正后才能保存。</Text>}
    </Box>
  );
}
