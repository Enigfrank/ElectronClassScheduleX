import React from 'react';
import { Box, FormControl, FormHelperText, Input, SimpleGrid, Text } from '@chakra-ui/react';
import CommitSlider from '../../components/CommitSlider.jsx';
import { getStyleFieldComment } from './configParser.mjs';
import { commitStyleSliderValue, getStyleSliders } from './styleSliderHelpers.mjs';

/**
 * 保留样式精确输入，并为可识别的数值补充松手后提交的滑块。
 * @param {{styleKey: string, value: string, onChange: (value: string) => void, mutedTextColor: string}} props 字段属性
 * @returns {React.ReactElement} 样式字段及滑块
 */
export function StyleFieldControl({ styleKey, value, onChange, mutedTextColor }) {
  const sliders = getStyleSliders(styleKey, value);

  /** 仅在操作结束且 CSS 值改变时通知编辑器更新配置。 */
  function handleCommit(index, nextValue) {
    const nextText = commitStyleSliderValue(styleKey, value, index, nextValue);
    if (nextText !== value) onChange(nextText);
  }

  return (
    <SimpleGrid columns={[1, 2]} gap={3}>
      <Input value={styleKey} isReadOnly />
      <FormControl minW={0}>
        <Input aria-label={`${styleKey} 的值`} value={value} onChange={(event) => onChange(event.target.value)} />
        <FormHelperText color={mutedTextColor} fontSize="xs">{getStyleFieldComment(styleKey)}</FormHelperText>
        {sliders.map(({ index, label, value: sliderValue, min, max, step }) => (
          <Box key={index} mt={3}>
            {label && <Text fontSize="xs" color={mutedTextColor}>{label}</Text>}
            <CommitSlider
              ariaLabel={`${styleKey} 的${label}滑块`}
              value={sliderValue}
              min={min}
              max={max}
              step={step}
              onCommit={(nextValue) => handleCommit(index, nextValue)}
            />
          </Box>
        ))}
      </FormControl>
    </SimpleGrid>
  );
}
